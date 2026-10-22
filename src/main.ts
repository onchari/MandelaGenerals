import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config/firebase';
import {
  createBusiness,
  getSelectedBusiness,
  getUserBusinesses,
  setSelectedBusiness,
  type ActiveBusiness,
} from './services/business.service';
import { logout } from './services/auth.service';
import { getProducts } from './modules/inventory/service';
import type { Product } from './modules/inventory/types';
import './home.css';

const root = document.querySelector<HTMLElement>('#app-root');

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
  if (root) root.innerHTML = html;
}

function renderHome(): void {
  setPage('Business workspace', `
    <section class="home-page">
      <header class="home-nav">
        <a class="home-brand" href="index.html">Mandela Generals</a>
        <nav aria-label="Account">
          <a class="home-link" href="signin.html">Log in</a>
          <a class="home-button home-button-small" href="signup.html">Create account</a>
        </nav>
      </header>
      <section class="home-hero">
        <div class="home-hero-copy">
          <p class="home-eyebrow">One workspace for your business</p>
          <h1>Run your business from one clear dashboard.</h1>
          <p class="home-intro">Manage products, stock levels, and inventory reports in a workspace scoped to your business.</p>
          <div class="home-hero-actions">
            <a class="home-button" href="signup.html">Get started</a>
            <a class="home-secondary-button" href="signin.html">Log in to your workspace</a>
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
      <header class="workspace-header"><a class="home-brand" href="index.html">Mandela Generals</a><span>Signed in as ${escapeHtml(displayName(user))}</span></header>
      <div class="workspace-card workspace-narrow">
        <p class="home-eyebrow">Your first workspace</p>
        <h1>Create your business</h1>
        <p class="workspace-description">Your products and inventory will be private to your business and its authorized members.</p>
        <form id="business-form" class="workspace-form">
          <label for="business-name">Business name</label>
          <input id="business-name" name="name" maxlength="100" autocomplete="organization" required>
          <p id="workspace-error" class="workspace-error" role="alert" hidden></p>
          <button class="home-button" type="submit">Create business</button>
        </form>
        <button class="workspace-logout" type="button" data-logout>Log out</button>
      </div>
    </section>`);

  root?.querySelector<HTMLFormElement>('#business-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const error = root?.querySelector<HTMLElement>('#workspace-error');
    const name = new FormData(form).get('name')?.toString() ?? '';
    if (button) button.disabled = true;
    if (error) error.hidden = true;
    try {
      const business = await createBusiness(name);
      setSelectedBusiness(user.uid, business.id);
      await renderAuthenticatedHome(user);
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
      <header class="workspace-header"><a class="home-brand" href="index.html">Mandela Generals</a><span>Signed in as ${escapeHtml(displayName(user))}</span></header>
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
      if (!businessId || !businesses.some((business) => business.id === businessId)) return;
      setSelectedBusiness(user.uid, businessId);
      void renderAuthenticatedHome(user);
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
        <a class="home-brand" href="index.html">Mandela Generals</a>
        <div class="workspace-user"><span>${escapeHtml(displayName(user))}</span><button class="workspace-logout" type="button" data-logout>Log out</button></div>
      </header>
      <div class="dashboard-wrap">
        <div class="dashboard-heading">
          <div><p class="home-eyebrow">${escapeHtml(business.role)} workspace</p><h1>${escapeHtml(business.name)}</h1><p class="workspace-description">Your business dashboard and inventory overview.</p></div>
          <div class="dashboard-actions">
            <a class="home-secondary-button" href="productlist.html">Manage products</a>
            ${manage ? '<a class="home-button" href="addproduct.html">Add product</a>' : ''}
          </div>
        </div>
        <section class="dashboard-stats" aria-label="Inventory summary">
          <article class="dashboard-stat"><span>Products</span><strong>${products.length.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Units in stock</span><strong>${totalUnits.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Low-stock products</span><strong>${lowStock.toLocaleString()}</strong></article>
          <article class="dashboard-stat"><span>Inventory cost value</span><strong>${costValue.toLocaleString()}</strong><small>minor currency units</small></article>
        </section>
        <section class="dashboard-lower">
          <article class="workspace-card">
            <div class="card-heading"><div><h2>Products</h2><p>Your latest inventory records</p></div><a href="productlist.html">View all</a></div>
            ${products.length ? `<ul class="dashboard-product-list">${products.slice(0, 5).map((product) => `
              <li><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || 'No SKU')}</small></span><span class="${product.quantity <= product.reorderLevel ? 'stock-low' : 'stock-ok'}">${product.quantity.toLocaleString()} units</span></li>`).join('')}</ul>` : '<p class="workspace-empty">No products yet. Add your first product to start tracking inventory.</p>'}
          </article>
          <aside class="workspace-card dashboard-shortcuts">
            <h2>Workspace</h2>
            <p>Signed in as ${escapeHtml(displayName(user))}</p>
            ${manage ? '<a href="addproduct.html">Add a product <span>→</span></a>' : ''}
            <a href="productlist.html">Browse products <span>→</span></a>
            <a href="inventoryreport.html">Inventory report <span>→</span></a>
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
    <section class="workspace-page"><header class="workspace-header"><a class="home-brand" href="index.html">Mandela Generals</a></header>
    <div class="workspace-card workspace-narrow"><h1>Could not load your workspace</h1><p class="workspace-error">${escapeHtml(message)}</p><button class="home-secondary-button" id="workspace-retry" type="button">Try again</button></div></section>`);
  root?.querySelector<HTMLButtonElement>('#workspace-retry')?.addEventListener('click', () => window.location.reload());
}

function bindLogout(): void {
  root?.querySelectorAll<HTMLButtonElement>('[data-logout]').forEach((button) => {
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
}

async function renderAuthenticatedHome(user: User): Promise<void> {
  setPage('Loading workspace', '<section class="workspace-page"><div class="home-loading">Loading your business workspace…</div></section>');
  try {
    const businesses = await getUserBusinesses(user.uid);
    if (businesses.length === 0) {
      renderSetup(user);
      return;
    }
    const business = getSelectedBusiness(user.uid, businesses);
    if (!business) {
      renderBusinessPicker(user, businesses);
      return;
    }
    const products = await getProducts(business.id);
    renderDashboard(user, business, products, businesses.length > 1);
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'An unexpected error occurred.');
  }
}

if (root) {
  if (!isFirebaseConfigured || !auth) {
    renderHome();
  } else {
    onAuthStateChanged(auth, (user) => {
      if (user) void renderAuthenticatedHome(user);
      else renderHome();
    }, (error) => renderError(error.message));
  }
}
