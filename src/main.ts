import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config/firebase';
import {
  createBusiness,
  getBusinessPageUrl,
  getBusinessUrl,
  getBusinessUrlSuggestions,
  getTenantSlugFromLocation,
  getSelectedBusiness,
  getUserBusinesses,
  isBusinessSlugAvailable,
  suggestBusinessSlug,
  setSelectedBusiness,
  type ActiveBusiness,
} from './services/business.service';
import { logout } from './services/auth.service';
import { getProducts } from './modules/inventory/service';
import type { Product } from './modules/inventory/types';
import './home.css';

const publicRoot = document.querySelector<HTMLElement>('#app-root');
const dashboardRoot = document.querySelector<HTMLElement>('#dashboard-root');
const appShell = document.querySelector<HTMLElement>('#app-shell');
let root: HTMLElement | null = publicRoot;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function setPage(title: string, html: string): void {
  document.title = `${title} | Mandela Generals`;
  root = document.body.classList.contains('authenticated') ? dashboardRoot : publicRoot;
  if (root) root.innerHTML = html;
}

function renderHome(): void {
  setPage('Business workspace', `
    <section class="home-page">
      <header class="home-nav">
        <a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a>
        <nav aria-label="Account">
          <a class="home-link" href="${import.meta.env.BASE_URL}signin.html">Log in</a>
          <a class="home-button home-button-small" href="${import.meta.env.BASE_URL}signup.html">Create account</a>
        </nav>
      </header>
      <section class="home-hero">
        <div class="home-hero-copy">
          <p class="home-eyebrow">One workspace for your business</p>
          <h1>Run your business from one clear dashboard.</h1>
          <p class="home-intro">Manage products, stock levels, and inventory reports in a workspace scoped to your business.</p>
          <div class="home-hero-actions">
            <a class="home-button" href="${import.meta.env.BASE_URL}signup.html">Get started</a>
            <a class="home-secondary-button" href="${import.meta.env.BASE_URL}signin.html">Log in to your workspace</a>
          </div>
        </div>
        <div class="home-preview" aria-label="Inventory dashboard preview">
          <div class="home-preview-top"><span></span><span></span><span></span><b>Business dashboard</b></div>
          <div class="home-preview-content">
            <p>Inventory overview</p>
            <div class="home-preview-stats"><span><b>Products</b><strong>—</strong></span><span><b>Stock status</b><strong>Live</strong></span></div>
            <div class="home-preview-row"></div><div class="home-preview-row short"></div><div class="home-preview-row"></div>
          </div>
        </div>
      </section>
      <footer class="home-footer">Secure business workspaces · Role-based access · Inventory visibility</footer>
    </section>`);
}

function displayName(user: User): string {
  return user.displayName?.trim() || user.email || 'Business user';
}

function canManage(business: ActiveBusiness): boolean {
  return ['owner', 'admin', 'manager'].includes(business.role);
}

function renderSetup(user: User): void {
  setPage('Create a business', `
    <section class="workspace-page">
      <header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a><span>Signed in as ${escapeHtml(displayName(user))}</span></header>
      <div class="workspace-card workspace-narrow">
        <p class="home-eyebrow">Your first workspace</p>
        <h1>Create your business</h1>
        <p class="workspace-description">Your products and inventory will be private to your business and its authorized members.</p>
        <form id="business-form" class="workspace-form">
          <label for="business-name">Business name</label>
          <input id="business-name" name="name" maxlength="100" autocomplete="organization" required>
          <label for="business-slug">Choose your business address</label>
          <input id="business-slug" name="slug" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocapitalize="none" spellcheck="false" required>
          <p class="slug-status" id="slug-status" aria-live="polite">Use lowercase letters, numbers, and single hyphens.</p>
          <div class="slug-suggestions">
            <span>Local testing: <code id="local-slug-preview"></code></span>
            <span>GitHub Pages: <code id="github-slug-preview"></code></span>
            <span>Local sign-in may need to be repeated on the business subdomain because browser sessions are separated by origin.</span>
            <span>GitHub Pages uses a path, not subdomains. A custom domain requires a domain and wildcard DNS you control.</span>
          </div>
          <p id="workspace-error" class="workspace-error" role="alert" hidden></p>
          <button class="home-button" type="submit">Create business</button>
        </form>
        <button class="workspace-logout" type="button" data-logout>Log out</button>
      </div>
    </section>`);

  const form = root?.querySelector<HTMLFormElement>('#business-form');
  const nameInput = form?.elements.namedItem('name') as HTMLInputElement | null;
  const slugInput = form?.elements.namedItem('slug') as HTMLInputElement | null;
  const slugStatus = root?.querySelector<HTMLElement>('#slug-status');
  const localPreview = root?.querySelector<HTMLElement>('#local-slug-preview');
  const githubPreview = root?.querySelector<HTMLElement>('#github-slug-preview');
  let slugWasEdited = false;
  let checkVersion = 0;
  let availabilityTimer: number | undefined;

  const previewSlug = (): string => slugInput?.value.trim().toLowerCase() || 'your-name';
  const updatePreview = (): void => {
    const suggestions = getBusinessUrlSuggestions(previewSlug());
    if (localPreview) localPreview.textContent = suggestions.local;
    if (githubPreview) githubPreview.textContent = suggestions.githubPages;
  };
  const checkAvailability = async (): Promise<void> => {
    const version = ++checkVersion;
    const slug = previewSlug();
    if (!slugInput || !slugStatus) return;
    if (!slugInput.validity.valid) {
      slugStatus.textContent = 'Use 1–48 lowercase letters, numbers, and single hyphens.';
      slugStatus.className = 'slug-status slug-error';
      return;
    }
    slugStatus.textContent = 'Checking address…';
    slugStatus.className = 'slug-status';
    try {
      const available = await isBusinessSlugAvailable(slug);
      if (version !== checkVersion) return;
      slugStatus.textContent = available ? 'Address is available.' : 'That address is already taken.';
      slugStatus.className = available ? 'slug-status slug-available' : 'slug-status slug-error';
    } catch (error) {
      if (version !== checkVersion) return;
      slugStatus.textContent = error instanceof Error ? error.message : 'Could not check address availability.';
      slugStatus.className = 'slug-status slug-error';
    }
  };
  const scheduleAvailabilityCheck = (): void => {
    checkVersion++;
    if (availabilityTimer !== undefined) window.clearTimeout(availabilityTimer);
    availabilityTimer = window.setTimeout(() => void checkAvailability(), 300);
  };

  nameInput?.addEventListener('input', () => {
    if (!slugWasEdited && slugInput) slugInput.value = suggestBusinessSlug(nameInput.value);
    updatePreview();
    scheduleAvailabilityCheck();
  });
  slugInput?.addEventListener('input', () => {
    slugWasEdited = true;
    updatePreview();
    scheduleAvailabilityCheck();
  });
  updatePreview();

  root?.querySelector<HTMLFormElement>('#business-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const error = root?.querySelector<HTMLElement>('#workspace-error');
    const name = new FormData(form).get('name')?.toString() ?? '';
    if (button) button.disabled = true;
    if (error) error.hidden = true;
    try {
      const slug = new FormData(form).get('slug')?.toString() ?? '';
      const business = await createBusiness(name, slug);
      setSelectedBusiness(user.uid, business.id);
      await renderAuthenticatedHome(user, business.slug);
    } catch (reason) {
      if (error) {
        error.textContent = reason instanceof Error ? reason.message : 'Could not create the business.';
        error.hidden = false;
      }
      if (button) button.disabled = false;
    }
  });
  bindLogout();
}

function renderBusinessPicker(user: User, businesses: ActiveBusiness[]): void {
  setPage('Select a business', `
    <section class="workspace-page">
      <header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a><span>Signed in as ${escapeHtml(displayName(user))}</span></header>
      <div class="workspace-card workspace-narrow">
        <p class="home-eyebrow">Your workspaces</p>
        <h1>Choose a business</h1>
        <p class="workspace-description">You’ll only see businesses where your membership is active.</p>
        <div class="business-options">
          ${businesses.map((business) => `
            <button class="business-option" type="button" data-business="${escapeHtml(business.id)}">
              <span><strong>${escapeHtml(business.name)}</strong><small>${escapeHtml(business.role)}</small></span>
              <span aria-hidden="true">→</span>
            </button>`).join('')}
        </div>
        <button class="workspace-logout" type="button" data-logout>Log out</button>
      </div>
    </section>`);

  root?.querySelectorAll<HTMLButtonElement>('[data-business]').forEach((button) => {
    button.addEventListener('click', () => {
      const businessId = button.dataset.business;
      const business = businesses.find((candidate) => candidate.id === businessId);
      if (!business) return;
      setSelectedBusiness(user.uid, business.id);
      window.location.assign(business.slug ? getBusinessUrl(business.slug) : import.meta.env.BASE_URL);
    });
  });
  bindLogout();
}

function renderDashboard(
  user: User,
  business: ActiveBusiness,
  products: Product[],
  hasMultipleBusinesses: boolean,
): void {
  const lowStock = products.filter((product) => product.quantity <= product.reorderLevel).length;
  const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
  const costValue = products.reduce((sum, product) => sum + product.quantity * product.costPrice, 0);
  const manage = canManage(business);

  setPage(business.name, `
    <section class="workspace-page">
      <header class="workspace-header">
        <a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a>
        <div class="workspace-user"><span>${escapeHtml(displayName(user))}</span><button class="workspace-logout" type="button" data-logout>Log out</button></div>
      </header>
      <div class="dashboard-wrap">
        <div class="dashboard-heading">
          <div><p class="home-eyebrow">${escapeHtml(business.role)} workspace</p><h1>${escapeHtml(business.name)}</h1><p class="workspace-description">Your business dashboard and inventory overview.</p></div>
          <div class="dashboard-actions">
            <a class="home-secondary-button" href="${escapeHtml(getBusinessPageUrl(business.slug, 'productlist.html'))}">Manage products</a>
            ${manage ? `<a class="home-button" href="${escapeHtml(getBusinessPageUrl(business.slug, 'addproduct.html'))}">Add product</a>` : ''}
          </div>
          ${business.slug ? `<p class="dashboard-tenant-url">Business URL: <a href="${escapeHtml(getBusinessUrl(business.slug))}">${escapeHtml(getBusinessUrl(business.slug))}</a></p>` : ''}
        </div>
        <section class="dashboard-stats" aria-label="Inventory summary">
          <article class="dashboard-stat"><span>Products</span><strong>${products.length.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Units in stock</span><strong>${totalUnits.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Low-stock products</span><strong>${lowStock.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Inventory cost value</span><strong>${costValue.toLocaleString()}</strong><small>minor currency units</small></article>
        </section>
        <section class="dashboard-lower">
          <article class="workspace-card">
            <div class="card-heading"><div><h2>Products</h2><p>Your latest inventory records</p></div><a href="${escapeHtml(getBusinessPageUrl(business.slug, 'productlist.html'))}">View all</a></div>
            ${products.length ? `<ul class="dashboard-product-list">${products.slice(0, 5).map((product) => `
              <li><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || 'No SKU')}</small></span><span class="${product.quantity <= product.reorderLevel ? 'stock-low' : 'stock-ok'}">${product.quantity.toLocaleString()} units</span></li>`).join('')}</ul>` : '<p class="workspace-empty">No products yet. Add your first product to start tracking inventory.</p>'}
          </article>
          <aside class="workspace-card dashboard-shortcuts">
            <h2>Workspace</h2>
            <p>Signed in as ${escapeHtml(displayName(user))}</p>
            ${manage ? `<a href="${escapeHtml(getBusinessPageUrl(business.slug, 'addproduct.html'))}">Add a product <span>→</span></a>` : ''}
            <a href="${escapeHtml(getBusinessPageUrl(business.slug, 'productlist.html'))}">Browse products <span>→</span></a>
            <a href="${escapeHtml(getBusinessPageUrl(business.slug, 'inventoryreport.html'))}">Inventory report <span>→</span></a>
            ${hasMultipleBusinesses ? '<button type="button" id="switch-business">Switch business</button>' : ''}
          </aside>
        </section>
      </div>
    </section>`);

  root?.querySelector<HTMLButtonElement>('#switch-business')?.addEventListener('click', async () => {
    try {
      const businesses = await getUserBusinesses(user.uid);
      if (businesses.length > 1) renderBusinessPicker(user, businesses);
    } catch (error) {
      renderError(error instanceof Error ? error.message : 'Could not load your businesses.');
    }
  });
  bindLogout();
}

function renderError(message: string): void {
  setPage('Workspace unavailable', `
    <section class="workspace-page"><header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a></header>
    <div class="workspace-card workspace-narrow"><h1>Could not load your workspace</h1><p class="workspace-error">${escapeHtml(message)}</p><button class="home-secondary-button" id="workspace-retry" type="button">Try again</button></div></section>`);
  root?.querySelector<HTMLButtonElement>('#workspace-retry')?.addEventListener('click', () => window.location.reload());
}

function bindLogout(): void {
  root?.querySelectorAll<HTMLButtonElement>('[data-logout]').forEach((button) => {
    if (button.dataset.logoutBound === 'true') return;
    button.dataset.logoutBound = 'true';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await logout();
      } catch (error) {
        button.disabled = false;
        renderError(error instanceof Error ? error.message : 'Could not log out.');
      }
    });
  });
  appShell?.querySelectorAll<HTMLAnchorElement>('[data-logout]').forEach((link) => {
    if (link.dataset.logoutBound === 'true') return;
    link.dataset.logoutBound = 'true';
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      link.classList.add('disabled');
      try {
        await logout();
      } catch (error) {
        link.classList.remove('disabled');
        renderError(error instanceof Error ? error.message : 'Could not log out.');
      }
    });
  });
}

function showBusinessTemplate(user: User, business: ActiveBusiness): void {
  const userName = appShell?.querySelector<HTMLElement>('#template-user-name');
  const userRole = appShell?.querySelector<HTMLElement>('#template-user-role');
  if (userName) userName.textContent = displayName(user);
  if (userRole) userRole.textContent = business.role;

  appShell?.querySelectorAll<HTMLAnchorElement>('#sidebar-menu a[href], .header a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const pageName = url.pathname.split('/').pop();
    if (!pageName?.endsWith('.html')) return;
    link.href = getBusinessPageUrl(business.slug, pageName);
  });
  bindLogout();
}

async function renderAuthenticatedHome(user: User, preferredSlug?: string): Promise<void> {
  setPage('Loading workspace', '<section class="workspace-page"><div class="home-loading">Loading your business workspace…</div></section>');
  const userName = appShell?.querySelector<HTMLElement>('#template-user-name');
  if (userName) userName.textContent = displayName(user);
  bindLogout();
  try {
    const businesses = await getUserBusinesses(user.uid);
    if (businesses.length === 0) {
      renderSetup(user);
      return;
    }
    const requestedSlug = preferredSlug ?? getTenantSlugFromLocation();
    const business = requestedSlug
      ? businesses.find((membership) => membership.slug === requestedSlug) ?? null
      : getSelectedBusiness(user.uid, businesses);
    if (!business) {
      if (requestedSlug) {
        setPage('Business unavailable', `
          <section class="workspace-page"><header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a></header>
          <div class="workspace-card workspace-narrow"><h1>Business unavailable</h1><p class="workspace-description">This account does not have an active membership for this business.</p><a class="home-secondary-button" href="${import.meta.env.BASE_URL}">Choose another business</a></div></section>`);
        return;
      }
      renderBusinessPicker(user, businesses);
      return;
    }
    setSelectedBusiness(user.uid, business.id);
    showBusinessTemplate(user, business);
    const products = await getProducts(business.id);
    renderDashboard(user, business, products, businesses.length > 1);
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'An unexpected error occurred.');
  }
}

if (root) {
  if (!isFirebaseConfigured || !auth) {
    document.body.classList.remove('authenticated');
    if (appShell) appShell.hidden = true;
    renderHome();
  } else {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        document.body.classList.add('authenticated');
        if (appShell) appShell.hidden = false;
        root = dashboardRoot;
        void renderAuthenticatedHome(user);
      } else {
        document.body.classList.remove('authenticated');
        if (appShell) appShell.hidden = true;
        root = publicRoot;
        renderHome();
      }
    }, (error) => renderError(error.message));
  }
}
