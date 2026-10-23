import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config/firebase';
import {
  createBusiness,
  getBusinessPageUrl,
  getBusinessUrl,
  getBusinessUrlSuggestions,
  getPlatformBusinesses,
  getPlatformUsers,
  assignExistingUsersToDemoTenant,
  claimBusinessSlug,
  getTenantSlugFromLocation,
  getSelectedBusiness,
  getUserBusinesses,
  isPlatformAdmin,
  isBusinessSlugAvailable,
  suggestBusinessSlug,
  setSelectedBusiness,
  type ActiveBusiness,
} from './services/business.service';
import { logout } from './services/auth.service';
import { getProducts } from './modules/inventory/service';
import type { Product } from './modules/inventory/types';
import './environment-indicator';
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
  const tenantSlug = getTenantSlugFromLocation();
  const signInUrl = new URL(`${import.meta.env.BASE_URL}signin.html`, window.location.origin);
  const signUpUrl = new URL(`${import.meta.env.BASE_URL}signup.html`, window.location.origin);
  if (tenantSlug) {
    signInUrl.searchParams.set('tenant', tenantSlug);
    signUpUrl.searchParams.set('tenant', tenantSlug);
  }
  setPage('Business workspace', `
    <section class="home-page">
      <header class="home-nav">
        <a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a>
        <nav aria-label="Account">
          <a class="home-link" href="${escapeHtml(signInUrl.pathname + signInUrl.search)}">Log in</a>
          <a class="home-button home-button-small" href="${escapeHtml(signUpUrl.pathname + signUpUrl.search)}">Create account</a>
        </nav>
      </header>
      <section class="home-hero">
        <div class="home-hero-copy">
          <p class="home-eyebrow">One workspace for your business</p>
          <h1>Run your business from one clear dashboard.</h1>
          <p class="home-intro">Manage products, stock levels, and inventory reports in a workspace scoped to your business.</p>
          <div class="home-hero-actions">
            <a class="home-button" href="${escapeHtml(signUpUrl.pathname + signUpUrl.search)}">Get started</a>
            <a class="home-secondary-button" href="${escapeHtml(signInUrl.pathname + signInUrl.search)}">Log in to your workspace</a>
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

function routeToBusiness(business: ActiveBusiness): boolean {
  if (!business.slug) return false;
  const target = new URL(getBusinessUrl(business.slug), window.location.href);
  if (
    target.origin === window.location.origin &&
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  ) {
    return false;
  }
  if (target.origin === window.location.origin) {
    window.history.replaceState(window.history.state, '', target.href);
    return false;
  }
  window.location.assign(target.href);
  return true;
}

function renderSetup(user: User, existingBusiness?: ActiveBusiness): void {
  document.body.classList.add('business-setup');
  const claimingAddress = Boolean(existingBusiness);
  setPage(claimingAddress ? 'Choose a tenant address' : 'Create a business', `
    <section class="workspace-page">
      <header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a><span>Signed in as ${escapeHtml(displayName(user))}</span></header>
      <div class="workspace-card workspace-narrow">
        <p class="home-eyebrow">${claimingAddress ? 'Complete your tenant setup' : 'Your first workspace'}</p>
        <h1>${claimingAddress ? 'Choose a tenant address' : 'Create your business'}</h1>
        <p class="workspace-description">${claimingAddress
          ? `Your existing business, ${escapeHtml(existingBusiness?.name ?? '')}, is ready. Choose an available tenant address to finish setup.`
          : 'Your products and inventory will be private to your business and its authorized members.'}</p>
        <form id="business-form" class="workspace-form">
          ${claimingAddress ? '' : '<label for="business-name">Business name</label><input id="business-name" name="name" maxlength="100" autocomplete="organization" required>'}
          <label for="business-slug">Choose your tenant address</label>
          <input id="business-slug" name="slug" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocapitalize="none" spellcheck="false" required>
          <p class="slug-status" id="slug-status" aria-live="polite">Use lowercase letters, numbers, and single hyphens.</p>
          <div class="slug-suggestions">
            <span>Local testing: <code id="local-slug-preview"></code></span>
            <span>GitHub Pages: <code id="github-slug-preview"></code></span>
            <span>Local tenant links use a path on this host so your signed-in session remains active.</span>
            <span>GitHub Pages tenant links use a query parameter so refreshing works. A custom domain requires a domain and wildcard DNS you control.</span>
          </div>
          <p id="workspace-error" class="workspace-error" role="alert" hidden></p>
          <button class="home-button" type="submit">${claimingAddress ? 'Claim tenant address' : 'Create business'}</button>
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
  if (existingBusiness && slugInput) slugInput.value = suggestBusinessSlug(existingBusiness.name);
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
  if (existingBusiness) scheduleAvailabilityCheck();

  root?.querySelector<HTMLFormElement>('#business-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const error = root?.querySelector<HTMLElement>('#workspace-error');
    const name = existingBusiness?.name ?? new FormData(form).get('name')?.toString() ?? '';
    if (button) button.disabled = true;
    if (error) error.hidden = true;
    try {
      const slug = new FormData(form).get('slug')?.toString() ?? '';
      const business = existingBusiness
        ? { ...existingBusiness, slug: await claimBusinessSlug(user.uid, existingBusiness.id, slug) }
        : await createBusiness(name, slug);
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

function consumeBusinessSetupRequest(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get('setup') !== 'business') return false;

  url.searchParams.delete('setup');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
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
      if (routeToBusiness(business)) return;
      void renderAuthenticatedHome(user, business.slug || undefined);
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

function bindProfileMenu(): void {
  appShell?.querySelectorAll<HTMLButtonElement>('[data-profile-menu-trigger]').forEach((trigger) => {
    const menu = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!menu || trigger.dataset.profileMenuBound === 'true') return;

    const closeMenu = (): void => {
      menu.classList.remove('show');
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.dataset.profileMenuBound = 'true';
    trigger.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('show');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (event.target instanceof Node && !trigger.contains(event.target) && !menu.contains(event.target)) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  });
}

function bindSidebarMenus(): void {
  const sidebarMenu = appShell?.querySelector<HTMLElement>('#sidebar-menu');
  if (sidebarMenu && sidebarMenu.dataset.nativeMenusBound !== 'true') {
    sidebarMenu.dataset.nativeMenusBound = 'true';
    sidebarMenu.querySelectorAll<HTMLAnchorElement>('li.submenu > a').forEach((link, index) => {
      const submenu = link.nextElementSibling;
      if (!(submenu instanceof HTMLUListElement)) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = link.className;
      button.innerHTML = link.innerHTML;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', `sidebar-submenu-${index}`);
      submenu.id = `sidebar-submenu-${index}`;
      link.replaceWith(button);
    });

    sidebarMenu.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('li.submenu > button[aria-controls]');
      if (!button || !sidebarMenu.contains(button)) return;

      const submenu = document.getElementById(button.getAttribute('aria-controls') ?? '');
      if (!(submenu instanceof HTMLUListElement)) return;

      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.classList.toggle('subdrop', expanded);
      button.setAttribute('aria-expanded', String(expanded));
    }, true);
  }

  let overlay = document.querySelector<HTMLElement>('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.append(overlay);
  }
  if (overlay.dataset.nativeToggleBound !== 'true') {
    overlay.dataset.nativeToggleBound = 'true';
    overlay.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      overlay?.classList.remove('opened');
      appShell?.classList.remove('slide-nav');
    }, true);
  }

  const sidebarToggle = appShell?.querySelector<HTMLAnchorElement>('#toggle_btn');
  if (sidebarToggle && sidebarToggle.dataset.nativeToggleBound !== 'true') {
    sidebarToggle.dataset.nativeToggleBound = 'true';
    sidebarToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.body.classList.toggle('mini-sidebar');
    }, true);
  }

  const mobileToggle = appShell?.querySelector<HTMLAnchorElement>('#mobile_btn');
  if (mobileToggle && mobileToggle.dataset.nativeToggleBound !== 'true') {
    mobileToggle.dataset.nativeToggleBound = 'true';
    mobileToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const isOpen = appShell?.classList.toggle('slide-nav') ?? false;
      overlay.classList.toggle('opened', isOpen);
    }, true);
  }
}

function bindLogout(): void {
  bindProfileMenu();
  bindSidebarMenus();
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
  document.body.classList.remove('business-setup');
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

function showPlatformAdminTemplate(user: User): void {
  document.body.classList.remove('business-setup');
  const userName = appShell?.querySelector<HTMLElement>('#template-user-name');
  const userRole = appShell?.querySelector<HTMLElement>('#template-user-role');
  const menu = appShell?.querySelector<HTMLElement>('#sidebar-menu');
  if (userName) userName.textContent = displayName(user);
  if (userRole) userRole.textContent = 'Platform administrator';
  if (menu) {
    const basePath = import.meta.env.BASE_URL;
    const items = [
      ['overview', 'Platform Overview', 'dashboard.svg'],
      ['businesses', 'Businesses / Tenants', 'product.svg'],
      ['users', 'Users', 'users1.svg'],
      ['plans', 'Plans / Subscriptions', 'purchase1.svg'],
      ['settings', 'Platform Settings', 'settings.svg'],
      ['audit', 'Audit / Activity Logs', 'time.svg'],
    ] as const;
    menu.innerHTML = `<ul>
      <li class="sidebar-title">PLATFORM ADMIN</li>
      ${items.map(([view, label, icon]) => `
        <li class="${(new URLSearchParams(window.location.search).get('platform') || 'overview') === view ? 'active' : ''}">
          <a href="${basePath}?platform=${view}" data-platform-view="${view}">
            <img src="${basePath}assets/img/icons/${icon}" alt=""><span> ${label}</span>
          </a>
        </li>`).join('')}
    </ul>`;
    menu.querySelectorAll<HTMLAnchorElement>('[data-platform-view]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const view = link.dataset.platformView;
        if (!view) return;
        const url = new URL(import.meta.env.BASE_URL, window.location.origin);
        url.searchParams.set('platform', view);
        window.history.pushState({}, '', url);
        menu.querySelectorAll('li').forEach((item) => item.classList.remove('active'));
        link.closest('li')?.classList.add('active');
        void renderPlatformAdminPage(user);
      });
    });
  }
  bindLogout();
}

async function renderPlatformAdminPage(user: User): Promise<void> {
  const view = new URLSearchParams(window.location.search).get('platform') || 'overview';
  const titles: Record<string, string> = {
    overview: 'Platform overview',
    businesses: 'Businesses / tenants',
    users: 'Platform users',
    plans: 'Plans / subscriptions',
    settings: 'Platform settings',
    audit: 'Audit / activity logs',
  };
  const title = titles[view] ?? titles.overview;
  setPage(title, '<div class="home-loading">Loading platform administration…</div>');

  try {
    if (view === 'businesses') {
      const businesses = await getPlatformBusinesses();
      setPage(title, `
        <div class="content">
          <div class="page-header">
            <div class="page-title"><h4>${title}</h4><h6>All business workspaces registered on the platform.</h6></div>
            <div class="page-btn"><span class="badge bg-primary">${businesses.length.toLocaleString()} total</span></div>
          </div>
          <div class="card"><div class="card-body"><div class="table-responsive">
            <div class="form-group"><label for="platform-business-search">Search businesses</label><input id="platform-business-search" class="form-control" type="search" placeholder="Search business, slug, owner, or ID"></div>
            <table class="table"><thead><tr><th>Business</th><th>Tenant slug</th><th>Owner UID</th><th>Business ID</th></tr></thead>
            <tbody id="platform-business-rows">${businesses.length ? businesses.map((business) => `
              <tr data-business-search="${escapeHtml(`${business.name} ${business.slug} ${business.ownerId} ${business.id}`.toLocaleLowerCase())}">
                <td>${escapeHtml(business.name)}</td>
                <td>${escapeHtml(business.slug || 'Not assigned')}</td>
                <td>${escapeHtml(business.ownerId)}</td>
                <td>${escapeHtml(business.id)}</td>
              </tr>`).join('') : '<tr><td colspan="4">No businesses have been created.</td></tr>'}</tbody>
            </table>
          </div></div></div>
          ${businesses.length ? '<p class="text-muted">This list includes every document in the platform businesses collection. Business editing, suspension, and deletion are not enabled from this view.</p>' : ''}
        </div>`);
      const search = root?.querySelector<HTMLInputElement>('#platform-business-search');
      const rows = root?.querySelectorAll<HTMLTableRowElement>('#platform-business-rows tr[data-business-search]');
      search?.addEventListener('input', () => {
        const term = search.value.trim().toLocaleLowerCase();
        rows?.forEach((row) => {
          row.hidden = !(row.dataset.businessSearch ?? '').includes(term);
        });
      });
      return;
    }

    if (view === 'users') {
      const users = await getPlatformUsers();
      setPage(title, `
        <div class="content">
          <div class="page-header"><div class="page-title"><h4>${title}</h4><h6>Registered accounts on the platform.</h6></div></div>
          <div class="card"><div class="card-body"><div class="table-responsive">
            <table class="table"><thead><tr><th>Name</th><th>Email</th><th>User ID</th></tr></thead>
            <tbody>${users.length ? users.map((platformUser) => `<tr><td>${escapeHtml(platformUser.displayName)}</td><td>${escapeHtml(platformUser.email || 'Not provided')}</td><td>${escapeHtml(platformUser.id)}</td></tr>`).join('') : '<tr><td colspan="3">No user profiles have been created.</td></tr>'}</tbody>
            </table>
          </div></div></div>
          <p class="text-muted">Account editing, suspension, and platform-admin assignment are not enabled from this view.</p>
        </div>`);
      return;
    }

    if (view !== 'overview') {
      setPage(title, `
        <div class="content">
          <div class="page-header"><div class="page-title"><h4>${title}</h4><h6>Platform administration</h6></div></div>
          <div class="card"><div class="card-body">
            <p>This section is reserved in the platform menu. Its data model and management actions have not been configured yet.</p>
          </div></div>
        </div>`);
      return;
    }

    const [businesses, users] = await Promise.all([getPlatformBusinesses(), getPlatformUsers()]);
    setPage(title, `
      <div class="content">
        <div class="page-header"><div class="page-title"><h4>Platform overview</h4><h6>Platform-wide account and tenant summary.</h6></div></div>
        <div class="row">
          <div class="col-lg-3 col-sm-6 col-12"><div class="dash-widget"><div class="dash-widgetcontent"><h5>${businesses.length.toLocaleString()}</h5><h6>Businesses / tenants</h6></div></div></div>
          <div class="col-lg-3 col-sm-6 col-12"><div class="dash-widget"><div class="dash-widgetcontent"><h5>${users.length.toLocaleString()}</h5><h6>Registered users</h6></div></div></div>
        </div>
        <div class="card"><div class="card-body">
          <h4 class="card-title">Platform controls</h4>
          <p>Use the platform menu to review businesses and accounts. Subscription plans, platform settings, and audit records are not configured yet.</p>
        </div></div>
        <div class="card"><div class="card-body">
          <h4 class="card-title">Legacy accounts without a tenant</h4>
          <p>Create or use the shared <strong>Demo</strong> tenant (slug: demo) and add existing user profiles with no business memberships as staff. These users share the Demo tenant’s data.</p>
          <p id="demo-tenant-status" role="status" aria-live="polite"></p>
          <button id="initialize-demo-tenant" class="btn btn-primary" type="button">Initialize Demo tenant</button>
        </div></div>
      </div>`);
    const initializeDemoButton = root?.querySelector<HTMLButtonElement>('#initialize-demo-tenant');
    const demoStatus = root?.querySelector<HTMLElement>('#demo-tenant-status');
    initializeDemoButton?.addEventListener('click', async () => {
      initializeDemoButton.disabled = true;
      if (demoStatus) demoStatus.textContent = 'Initializing the shared Demo tenant…';
      try {
        const assignedCount = await assignExistingUsersToDemoTenant();
        if (demoStatus) {
          demoStatus.textContent = `Demo tenant is ready. ${assignedCount} user${assignedCount === 1 ? '' : 's'} without a business membership ${assignedCount === 1 ? 'was' : 'were'} added as staff.`;
        }
      } catch (error) {
        if (demoStatus) {
          demoStatus.textContent = error instanceof Error ? error.message : 'Could not initialize the Demo tenant.';
        }
        initializeDemoButton.disabled = false;
      }
    });
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Could not load platform administration.');
  }
}

async function renderAuthenticatedHome(user: User, preferredSlug?: string): Promise<void> {
  setPage('Loading workspace', '<section class="workspace-page"><div class="home-loading">Loading your business workspace…</div></section>');
  const userName = appShell?.querySelector<HTMLElement>('#template-user-name');
  if (userName) userName.textContent = displayName(user);
  bindLogout();
  let loadingStep = 'checking account access';
  try {
    if (await isPlatformAdmin(user.uid)) {
      showPlatformAdminTemplate(user);
      await renderPlatformAdminPage(user);
      return;
    }

    const requestedSlug = preferredSlug ?? getTenantSlugFromLocation();
    loadingStep = 'loading your business memberships';
    const businesses = await getUserBusinesses(user.uid);
    if (businesses.length === 0) {
      if (requestedSlug) {
        setPage('Business unavailable', `
          <section class="workspace-page"><header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a></header>
          <div class="workspace-card workspace-narrow"><h1>Business unavailable</h1><p class="workspace-description">This account does not have an active membership for this business. Ask the business owner to invite you, or return home to create a business.</p><a class="home-secondary-button" href="${import.meta.env.BASE_URL}">Return home</a></div></section>`);
        return;
      }
      renderSetup(user);
      return;
    }
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
    if (routeToBusiness(business)) return;
    if (!business.slug) {
      if (business.role === 'owner') {
        renderSetup(user, business);
      } else {
        setPage('Tenant address needed', `
          <section class="workspace-page"><header class="workspace-header"><a class="home-brand" href="${import.meta.env.BASE_URL}">Mandela Generals</a></header>
          <div class="workspace-card workspace-narrow"><h1>Tenant address not set</h1><p class="workspace-description">The owner of ${escapeHtml(business.name)} needs to choose and claim its tenant address before members can open its tenant workspace.</p><button class="workspace-logout" type="button" data-logout>Log out</button></div></section>`);
        bindLogout();
      }
      return;
    }
    showBusinessTemplate(user, business);
    loadingStep = 'loading business inventory';
    const products = await getProducts(business.id);
    renderDashboard(user, business, products, businesses.length > 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    renderError(`While ${loadingStep}: ${message}`);
  }
}

if (root) {
  if (!isFirebaseConfigured || !auth) {
    document.body.classList.remove('authenticated');
    if (appShell) appShell.hidden = true;
    renderHome();
  } else {
    onAuthStateChanged(auth, (user) => {
      const startBusinessSetup = consumeBusinessSetupRequest();
      if (user) {
        document.body.classList.add('authenticated');
        if (appShell) appShell.hidden = false;
        root = dashboardRoot;
        if (startBusinessSetup) {
          renderSetup(user);
        } else {
          void renderAuthenticatedHome(user);
        }
      } else {
        document.body.classList.remove('authenticated');
        document.body.classList.remove('business-setup');
        if (appShell) appShell.hidden = true;
        root = publicRoot;
        renderHome();
      }
    }, (error) => renderError(error.message));
  }
}
