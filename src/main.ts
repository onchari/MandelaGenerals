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
import {
  getBusinessDashboardSummaries,
  getBusinessTeamMembers,
  type BusinessDashboardSummary,
  type BusinessTeamMember,
} from './services/business-dashboard.service';
import {
  addExistingBusinessMember,
  getDiscoverableBusinessAccounts,
  isAssignableBusinessRole,
  updateBusinessMemberRole,
  type AssignableBusinessRole,
  type DiscoverableBusinessAccount,
} from './services/business-members.service';
import {
  createBusinessBranch,
  getAccessibleBusinessBranches,
  getBusinessBranches,
  initializeBusinessBranches,
  setMemberBranchAssignments,
  updateBusinessBranch,
  type BusinessBranch,
} from './services/branch.service';
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
  memberships: ActiveBusiness[],
): void {
  const lowStock = products.filter((product) => product.quantity <= product.reorderLevel).length;
  const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
  const costValue = products.reduce((sum, product) => sum + product.quantity * product.costPrice, 0);
  const manage = canManage(business);

  if (business.role === 'owner') {
    void renderOwnerDashboard(user, business, products, memberships);
    return;
  }

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
            ${memberships.length > 1 ? '<button type="button" id="switch-business">Switch business</button>' : ''}
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

async function renderOwnerDashboard(
  user: User,
  currentBusiness: ActiveBusiness,
  currentProducts: Product[],
  memberships: ActiveBusiness[],
  ownerView: 'dashboard' | 'users' | 'branches' = 'dashboard',
): Promise<void> {
  let summaries: BusinessDashboardSummary[];
  let teamMembers: BusinessTeamMember[] = [];
  let branches: BusinessBranch[] = [];
  let discoverableAccounts: DiscoverableBusinessAccount[] = [];
  try {
    summaries = await getBusinessDashboardSummaries(memberships);
    if (ownerView === 'users' || ownerView === 'branches') {
      teamMembers = await getBusinessTeamMembers(currentBusiness.id);
    }
    if (ownerView === 'users') {
      discoverableAccounts = await getDiscoverableBusinessAccounts();
    }
    if (ownerView === 'users' || ownerView === 'branches') {
      branches = await getBusinessBranches(currentBusiness.id);
    }
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Could not load business summaries.');
    return;
  }

  const activeMemberships = summaries.reduce((total, business) => total + business.activeMemberCount, 0);
  const totalUnits = currentProducts.reduce((total, product) => total + product.quantity, 0);
  const lowStockCount = currentProducts.filter((product) => product.quantity <= product.reorderLevel).length;
  const topProducts = [...currentProducts]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 7);
  const maxQuantity = Math.max(1, ...topProducts.map((product) => product.quantity));
  const formatDate = (value: string | null): string => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Not available'
      : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
  };
  const businessRows = summaries.map((business) => {
    const status = business.status?.trim() || 'Not set';
    const statusClass = status.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `<tr class="owner-business-row" data-business-search="${escapeHtml(`${business.name} ${business.plan ?? ''} ${status}`.toLowerCase())}">
      <td><span class="owner-business-name"><span class="owner-business-icon" aria-hidden="true">${ownerIcon('business')}</span><strong>${escapeHtml(business.name)}</strong></span></td>
      <td>${escapeHtml(business.plan ?? 'Not assigned')}</td>
      <td><span class="owner-status owner-status-${escapeHtml(statusClass)}">${escapeHtml(status)}</span></td>
      <td>${business.activeMemberCount.toLocaleString()}</td>
      <td>${escapeHtml(formatDate(business.createdAt))}</td>
      <td><button class="owner-row-link" type="button" data-dashboard-business="${escapeHtml(business.id)}">Open</button></td>
    </tr>`;
  }).join('');
  const productRows = topProducts.map((product) => {
    const width = Math.max(3, product.quantity / maxQuantity * 100);
    return `<div class="owner-stock-row"><span class="owner-stock-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span><span class="owner-stock-bar"><i style="width:${width}%"></i></span><strong>${product.quantity.toLocaleString()}</strong></div>`;
  }).join('');
  const roleTypes = [
    { name: 'Business Owner', scope: 'Business', description: 'Owns the tenant and is responsible for business administration.', access: 'Supported role: owner' },
    { name: 'Business Manager', scope: 'Business', description: 'Oversees business operations within assigned access.', access: 'Supported role: manager; admin has elevated access' },
    { name: 'Cashier / POS Operator', scope: 'Business', description: 'Handles point-of-sale operations within granted permissions.', access: 'Supported role: cashier' },
    { name: 'Inventory / Stock Controller', scope: 'Business', description: 'Manages products, stock and inventory movements.', access: 'Not yet a distinct permission role' },
    { name: 'Accountant / Finance Officer', scope: 'Business', description: 'Handles financial records and reporting when authorized.', access: 'Not yet a distinct permission role' },
    { name: 'Purchasing / Procurement Officer', scope: 'Business', description: 'Handles purchasing and supplier workflows when authorized.', access: 'Not yet a distinct permission role' },
    { name: 'Auditor / Read-Only User', scope: 'Business', description: 'Views specifically permitted records without modifying them.', access: 'Not yet a distinct permission role' },
  ];
  const permissionSections = [
    {
      title: 'Inventory and stock',
      rows: [
        { permission: 'Read products, stock items, stock movements, and types', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'Yes' },
        { permission: 'Create, update, or delete products', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Create or fully update legacy items / shoe sizes', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Decrease legacy stock as part of selling', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Limited', staff: 'No' },
        { permission: 'Create stock movement records', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'No' },
        { permission: 'Update or delete stock movement records', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Create or update inventory types', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete inventory types', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Manage wishlist and purchase budgets', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete legacy stock items / shoe sizes', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Purchase orders, receiving, transfers, stock counts, and returns', owner: 'Unavailable', admin: 'Unavailable', manager: 'Unavailable', cashier: 'Unavailable', staff: 'Unavailable' },
      ],
    },
    {
      title: 'POS, sales, customers, and cash',
      rows: [
        { permission: 'Read and create sales', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'No' },
        { permission: 'Update sales while business day is unlocked', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete sales', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Process sales returns / refunds', owner: 'Unavailable', admin: 'Unavailable', manager: 'Unavailable', cashier: 'Unavailable', staff: 'Unavailable' },
        { permission: 'Read, create, or update customer records', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'No' },
        { permission: 'Delete customer records', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read and create customer transactions', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'No' },
        { permission: 'Update customer transactions', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete customer transactions', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read and create cash transactions', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Update or delete cash transactions', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read and create finance entries; update limited to void fields', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete finance entries', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Create or update expenses', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete expenses', owner: 'Yes', admin: 'Yes', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read business days', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'Yes' },
        { permission: 'Create business days (OPEN only)', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'No' },
        { permission: 'Close or update an unlocked business day', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Lock a business day', owner: 'Yes', admin: 'Yes', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Delete business days', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
      ],
    },
    {
      title: 'Finance and staff records',
      rows: [
        { permission: 'Read, create, or update employee records', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'No', staff: 'No' },
        { permission: 'Delete employee records', owner: 'Yes', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read, create, or update payroll records', owner: 'Yes', admin: 'Yes', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Delete payroll records', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
      ],
    },
    {
      title: 'Users, roles, businesses, and branches',
      rows: [
        { permission: 'Read business details and membership roster', owner: 'Yes', admin: 'Yes', manager: 'Yes', cashier: 'Yes', staff: 'Yes' },
        { permission: 'Add an existing account as branch-scoped staff', owner: 'Yes', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Change roles, deactivate, or remove members', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read invite records', owner: 'Yes', admin: 'Yes', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Create, update, or delete invitations', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read another member’s private profile / email', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Update business name or claim an unset slug', owner: 'Yes', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Delete a business', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Access data in another business without membership', owner: 'No', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Create, update, and assign branch access', owner: 'Yes', admin: 'No', manager: 'No', cashier: 'No', staff: 'No' },
        { permission: 'Read branch records and branch-tagged data', owner: 'Yes', admin: 'Assigned branches', manager: 'Assigned branches', cashier: 'Assigned branches', staff: 'Assigned branches' },
      ],
    },
  ];
  const permissionValue = (value: string): string => {
    const className = value === 'Yes' ? 'allowed' : value === 'No' ? 'denied' : value === 'Unavailable' ? 'unavailable' : 'restricted';
    return `<span class="owner-permission owner-permission-${className}">${escapeHtml(value)}</span>`;
  };
  const permissionMatrix = permissionSections.map((section) => `
    <tr class="owner-permission-section"><th colspan="6" scope="colgroup">${escapeHtml(section.title)}</th></tr>
    ${section.rows.map((row) => `<tr>
      <th scope="row">${escapeHtml(row.permission)}</th>
      <td>${permissionValue(row.owner)}</td><td>${permissionValue(row.admin)}</td>
      <td>${permissionValue(row.manager)}</td><td>${permissionValue(row.cashier)}</td>
      <td>${permissionValue(row.staff)}</td>
    </tr>`).join('')}`).join('');
  const recommendedMatrices: Array<{ title: string; headers: string[]; rows: string[][] }> = [
    {
      title: 'Recommended role defaults',
      headers: ['Module', 'Owner', 'Business admin', 'Branch manager', 'Cashier', 'Stock clerk', 'Accountant', 'Auditor'],
      rows: [
        ['Business profile', 'F', 'F', 'S', '—', '—', 'V', 'V'],
        ['Branch management', 'F', 'F', 'S', '—', '—', 'V', 'V'],
        ['Users and roles', 'F', 'S', 'S', '—', '—', '—', 'V'],
        ['Products and categories', 'F', 'F', 'S', 'S', 'S', 'V', 'V'],
        ['Stock movements', 'F', 'F', 'S', 'S', 'S', 'V', 'V'],
        ['Purchase orders', 'F', 'F', 'S', '—', 'S', 'V', 'V'],
        ['Goods receiving', 'F', 'F', 'S', '—', 'S', 'V', 'V'],
        ['Sales and POS', 'F', 'F', 'S', 'S', '—', 'V', 'V'],
        ['Discounts and price overrides', 'F', 'F', 'A/S', 'Limited', '—', 'V', 'V'],
        ['Returns and refunds', 'F', 'F', 'A/S', 'Limited', '—', 'V', 'V'],
        ['Customers', 'F', 'F', 'S', 'S', '—', 'S', 'V'],
        ['Suppliers', 'F', 'F', 'S', '—', 'S', 'S', 'V'],
        ['Expenses and bills', 'F', 'F', 'S', '—', '—', 'S', 'V'],
        ['Cash reconciliation', 'F', 'F', 'S', 'Own shift', '—', 'S', 'V'],
        ['Payroll', 'F', 'Restricted', '—', '—', '—', 'S', 'Restricted'],
        ['Financial reports', 'F', 'F', 'S', '—', '—', 'F', 'V'],
        ['Custom fields', 'F', 'F', 'Limited', '—', '—', '—', 'V'],
        ['Audit logs', 'F', 'S', 'Limited', 'Own activity', 'Own activity', 'S', 'V'],
        ['Subscription and billing', 'F', 'Limited', '—', '—', '—', 'V', 'V'],
        ['Platform-wide settings', 'Platform role only', '—', '—', '—', '—', '—', '—'],
      ],
    },
    {
      title: 'Recommended inventory actions',
      headers: ['Action', 'Inventory manager', 'Stock clerk', 'Branch manager', 'Cashier', 'Stock auditor'],
      rows: [
        ['View products', 'Yes', 'Yes', 'Yes', 'POS selection', 'Yes'],
        ['Create products', 'Yes', 'Optional', 'Optional', 'No', 'No'],
        ['Edit product descriptions', 'Yes', 'Limited', 'Limited', 'No', 'No'],
        ['Change cost price', 'Yes, restricted', 'No', 'Optional', 'No', 'View if authorized'],
        ['Change selling price', 'Yes, policy-bound', 'No', 'Limited', 'No by default', 'View'],
        ['Manage categories and units', 'Yes', 'No', 'Optional', 'No', 'View'],
        ['Manage barcodes and SKUs', 'Yes', 'Limited', 'Optional', 'No', 'View'],
        ['Set reorder levels', 'Yes', 'No', 'Optional', 'No', 'View'],
        ['View stock by branch', 'Authorized branches', 'Assigned branches', 'Managed branches', 'Current branch', 'Authorized branches'],
        ['Transfer stock', 'Initiate', 'Initiate if allowed', 'Approve or initiate', 'No', 'No'],
        ['Approve stock transfers', 'Within limits', 'No', 'Yes, within scope', 'No', 'No'],
        ['Receive stock', 'Yes', 'Yes', 'Yes', 'No', 'No'],
        ['Issue or dispatch stock', 'Yes', 'Yes', 'Yes', 'No', 'No'],
        ['Record damaged or expired stock', 'Yes', 'Report or limited', 'Approve if required', 'No', 'Verify'],
        ['Perform stock counts', 'Yes', 'Yes', 'Yes', 'No', 'Yes'],
        ['Submit stock adjustments', 'Yes', 'Yes', 'Yes', 'No', 'Optional'],
        ['Approve stock adjustments', 'Separate approver', 'No', 'Yes within limits', 'No', 'Verify'],
        ['Delete posted stock movements', 'No direct deletion', 'No', 'No direct deletion', 'No', 'No'],
        ['View stock valuation', 'Authorized', 'Optional', 'Optional', 'No', 'Authorized'],
        ['Export inventory data', 'Yes', 'Optional', 'Yes within scope', 'No', 'Yes if authorized'],
      ],
    },
    {
      title: 'Recommended POS and sales actions',
      headers: ['Action', 'Cashier', 'Senior cashier', 'Supervisor', 'Branch manager', 'Accountant'],
      rows: [
        ['Open POS', 'Yes', 'Yes', 'Yes', 'Yes', 'Optional'],
        ['Create draft / complete sale', 'Yes', 'Yes', 'Yes', 'Yes', 'No'],
        ['Accept permitted payment types', 'Yes', 'Yes', 'Yes', 'Yes', 'View'],
        ['Apply standard discount', 'Within limit', 'Within limit', 'Higher limit', 'Configured limit', 'No'],
        ['Override price', 'No by default', 'Limited', 'Within limit', 'Within limit', 'No'],
        ['Sell below cost', 'No', 'No by default', 'Exceptional approval', 'Exceptional approval', 'No'],
        ['Suspend and resume sale', 'Own sale', 'Authorized sales', 'Yes', 'Yes', 'No'],
        ['Cancel unposted sale', 'Own sale', 'Yes', 'Yes', 'Yes', 'No'],
        ['Void completed sale', 'No by default', 'Limited', 'Approve', 'Approve within policy', 'View'],
        ['Process return', 'Limited', 'Yes', 'Yes', 'Yes', 'View'],
        ['Approve refund', 'No by default', 'Limited', 'Within limit', 'Within limit', 'Reconcile'],
        ['Open cash drawer', 'Authorized events only', 'Yes', 'Yes', 'Yes', 'No'],
        ['Open shift / close own shift', 'Yes', 'Yes', 'Yes', 'Yes', 'No'],
        ['Reopen closed shift', 'No', 'No by default', 'Restricted', 'Restricted', 'No'],
        ['View own shift totals', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
        ["View other cashiers' totals", 'No by default', 'Limited', 'Branch scope', 'Branch scope', 'Authorized'],
        ['Apply manual payment correction', 'No by default', 'Limited', 'Restricted', 'Restricted', 'Restricted'],
        ['Print or reprint receipt', 'Permitted sales', 'Yes', 'Yes', 'Yes', 'View / print'],
        ['View business-wide profit', 'No', 'No', 'Optional', 'Restricted', 'If authorized'],
        ['Export customer sales history', 'No by default', 'Limited', 'Limited', 'Authorized', 'Authorized'],
      ],
    },
    {
      title: 'Recommended finance, purchasing, and approvals',
      headers: ['Action', 'Procurement officer', 'Purchasing approver', 'Accountant', 'Finance manager', 'Business owner'],
      rows: [
        ['Create purchase order', 'Yes', 'Yes', 'Optional', 'Yes', 'Yes'],
        ['Submit purchase order', 'Yes', 'Yes', 'Optional', 'Yes', 'Yes'],
        ['Approve purchase order', 'No by default', 'Within limit', 'No by default', 'Within limit', 'Within limit'],
        ['Receive ordered goods', 'Optional', 'Optional', 'No', 'Optional', 'Yes'],
        ['Record supplier invoice', 'Optional', 'Optional', 'Yes', 'Yes', 'Yes'],
        ['Record supplier payment', 'No by default', 'No by default', 'Limited', 'Yes', 'Yes'],
        ['Record business expense', 'Optional', 'Optional', 'Yes', 'Yes', 'Yes'],
        ['Approve expenses', 'No by default', 'Within limit', 'No by default', 'Within limit', 'Within limit'],
        ['Record owner cash injection', 'No', 'No', 'Yes', 'Yes', 'Yes'],
        ['Record owner withdrawal', 'No', 'No', 'Prepare only', 'Approve if authorized', 'Yes'],
        ['Process payroll', 'No', 'No', 'Limited', 'Yes', 'Yes'],
        ['Approve payroll', 'No', 'No by default', 'No by default', 'Within policy', 'Yes'],
        ['View cash flow', 'Limited', 'No', 'Yes', 'Yes', 'Yes'],
        ['View profit and loss', 'No', 'No', 'Yes', 'Yes', 'Yes'],
        ['Close accounting period', 'No', 'No', 'Prepare', 'Approve', 'Approve if authorized'],
        ['Export financial reports', 'No', 'No', 'Yes', 'Yes', 'Yes'],
      ],
    },
    {
      title: 'Recommended multi-user and branch scope',
      headers: ['Scope / action', 'Example', 'Recommended enforcement'],
      rows: [
        ['Platform', 'All platform businesses', 'Platform-level authorization only; separate from tenant roles'],
        ['Business', 'One business', 'Access only to that business’s authorized data'],
        ['Branch', 'Nairobi CBD branch', 'Only assigned branch records; role may differ per branch'],
        ['Warehouse', 'Central warehouse', 'Only assigned warehouse operations'],
        ['Register / terminal', 'POS-01', 'Restrict actions to permitted register or terminal'],
        ['Own records', 'Sales created by current user', 'Limit records to their creator where policy requires'],
        ['Assigned records', 'Expenses assigned for review', 'Limit work queues to assigned records'],
        ['Department', 'Finance department', 'Grant only authorized departmental records'],
        ['Field-level', 'Cost price, margin, payroll', 'Restrict sensitive fields independently of module access'],
        ['Transaction-level', 'Refund above configured limit', 'Require additional approval above policy threshold'],
        ['Time / shift', 'Current cashier shift', 'Permit actions only during authorized shift'],
        ['Branch A / Branch B / Branch C', 'User assigned to A and B', 'View products: Yes / Yes / No; sales: Yes / Yes / No; receive stock: Yes / No / No'],
        ['Business-wide settings', 'User assigned to branches only', 'No branch assignment grants business-wide settings by itself'],
      ],
    },
  ];
  const renderRecommendedMatrix = (matrix: typeof recommendedMatrices[number]): string => `
    <details class="owner-recommendation-table">
      <summary>${escapeHtml(matrix.title)}</summary>
      <div class="owner-table-wrap">
        <table class="owner-table owner-permission-table owner-proposed-table">
          <caption class="owner-sr-only">${escapeHtml(matrix.title)} (proposed defaults, not enforced)</caption>
          <thead><tr>${matrix.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${matrix.rows.map((row) => `<tr>
            <th scope="row">${escapeHtml(row[0])}</th>
            ${row.slice(1).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </details>`;
  const proposedPlatformRoles = [
    'Platform Super Administrator', 'Platform Administrator', 'Platform Support Agent',
  ];
  const proposedBusinessRoles = [
    'Business Owner', 'Business Administrator', 'General Manager', 'Branch Manager',
    'Assistant Branch Manager', 'Supervisor / Shift Leader', 'Cashier / POS Operator',
    'Senior Cashier', 'Salesperson', 'Inventory Manager', 'Storekeeper / Stock Clerk',
    'Stock Auditor', 'Procurement Officer', 'Purchasing Approver', 'Receiving Officer',
    'Supplier Portal User', 'Accountant', 'Finance Manager', 'Accounts Receivable Clerk',
    'Accounts Payable Clerk', 'HR / Payroll Officer', 'Auditor / Read-Only User',
    'Customer Portal User', 'Custom Role',
  ];
  const permissionCodes = [
    ['Businesses', 'business.view · business.create · business.update · business.archive'],
    ['Branches', 'branch.view · branch.create · branch.update · branch.assign_users'],
    ['Users and roles', 'user.view · user.invite · user.update · user.deactivate · role.view · role.create · role.update · role.assign · permission.manage'],
    ['Products and pricing', 'product.view · product.create · product.update · product.archive · price.view_cost · price.update_selling · price.override · price.sell_below_cost'],
    ['Inventory and transfers', 'stock.view · stock.receive · stock.issue · stock.count · stock.adjust · transfer.create · transfer.submit · transfer.approve · transfer.receive'],
    ['Purchasing and suppliers', 'purchase.create · purchase.submit · purchase.approve · purchase.cancel · supplier.view · supplier.create · supplier.update · supplier.payment.record'],
    ['POS, sales, discounts, returns', 'pos.open · sale.create · sale.complete · sale.cancel · sale.void · discount.apply · discount.override · discount.approve · return.create · refund.process · refund.approve'],
    ['Cash and customers', 'cash.shift.open · cash.shift.close · cash.reconcile · cash.variance.approve · customer.view · customer.create · customer.update · customer.export'],
    ['Expenses, finance, payroll', 'expense.create · expense.submit · expense.approve · expense.post · finance.view · finance.reconcile · finance.period.close · finance.export · payroll.view · payroll.prepare · payroll.approve · payroll.export'],
    ['Reports and audit', 'report.view_sales · report.view_profit · report.view_stock · report.export · audit.view · audit.export'],
    ['Configuration and platform', 'field_config.view · field_config.create · field_config.update · field_config.disable · subscription.view · subscription.change_plan · billing.manage · settings.view · settings.update · tax.configure · receipt.configure · notification.view · notification.manage'],
  ];
  const renderRoleTemplates = (roles: string[]): string => roles.map((role) => `<span class="owner-proposed-role">${escapeHtml(role)}</span>`).join('');
  const permissionCodeRows = permissionCodes.map(([module, codes]) => `<tr><th scope="row">${escapeHtml(module)}</th><td><code>${escapeHtml(codes)}</code></td></tr>`).join('');
  const branchRows = branches.map((branch) => {
    const workspaceUrl = new URL(
      getBusinessPageUrl(currentBusiness.slug, 'productlist.html'),
      window.location.origin,
    );
    workspaceUrl.searchParams.set('branchId', branch.id);
    return `<tr>
    <td><strong>${escapeHtml(branch.name)}</strong>${branch.isPrimary ? ' <span class="owner-branch-primary">Primary</span>' : ''}${branch.managerUid === user.uid ? ' <span class="owner-branch-primary">Owner is branch manager</span>' : ''}<small class="owner-branch-id">${escapeHtml(branch.id)}</small>${branch.status === 'active' ? `<a class="owner-row-link" href="${escapeHtml(workspaceUrl.href)}">Open branch workspace</a>` : ''}</td>
    <td>${escapeHtml(branch.address || '—')}</td>
    <td><span class="owner-status owner-status-${branch.status}">${branch.status === 'active' ? 'Active' : 'Inactive'}</span></td>
    <td><form class="owner-branch-edit-form" data-branch-update="${escapeHtml(branch.id)}">
      <label class="owner-sr-only" for="branch-name-${escapeHtml(branch.id)}">Branch name</label>
      <input id="branch-name-${escapeHtml(branch.id)}" name="name" maxlength="100" value="${escapeHtml(branch.name)}" required>
      <label class="owner-sr-only" for="branch-address-${escapeHtml(branch.id)}">Branch address</label>
      <input id="branch-address-${escapeHtml(branch.id)}" name="address" maxlength="300" value="${escapeHtml(branch.address)}" placeholder="Address">
      <label class="owner-sr-only" for="branch-status-${escapeHtml(branch.id)}">Branch status</label>
      <select id="branch-status-${escapeHtml(branch.id)}" name="status"${branch.isPrimary ? ' disabled aria-describedby="primary-branch-status-note"' : ''}>
        <option value="active"${branch.status === 'active' ? ' selected' : ''}>Active</option>
        <option value="inactive"${branch.status === 'inactive' ? ' selected' : ''}>Inactive</option>
      </select>
      <label class="owner-branch-manager"><input type="checkbox" name="ownerBranchManager" value="true"${branch.managerUid === user.uid ? ' checked' : ''}><span>I'm manager</span></label>
      <button class="owner-row-link" type="submit">Save</button>
    </form></td>
  </tr>`;
  }).join('');
  const memberAssignmentRows = teamMembers.map((member) => {
    const status = member.active === true ? 'Active' : member.active === false ? 'Inactive' : 'Unknown';
    const selectedIds = new Set(member.branchIds);
    const options = branches.filter((branch) => branch.status === 'active').map((branch) =>
      `<option value="${escapeHtml(branch.id)}"${selectedIds.has(branch.id) ? ' selected' : ''}>${escapeHtml(branch.name)}</option>`,
    ).join('');
    const owner = member.role === 'owner';
    return `<tr>
      <td><span class="owner-team-user"><span class="owner-team-avatar">${escapeHtml(member.userId.slice(0, 1).toUpperCase())}</span><span><strong>Member account</strong><small title="${escapeHtml(member.userId)}">${escapeHtml(member.userId)}</small></span></span></td>
      <td>${escapeHtml(member.role)}</td>
      <td><span class="owner-status owner-status-${status.toLowerCase()}">${status}</span></td>
      <td>${owner
        ? '<span class="owner-branch-primary">All branches (owner)</span>'
        : `<form class="owner-assignment-form" data-member-assignment="${escapeHtml(member.userId)}">
          <label class="owner-sr-only" for="member-branches-${escapeHtml(member.userId)}">Assigned branches for ${escapeHtml(member.userId)}</label>
          <select id="member-branches-${escapeHtml(member.userId)}" name="branchIds" multiple size="${Math.min(Math.max(branches.filter((branch) => branch.status === 'active').length, 2), 5)}"${member.active !== true ? ' disabled' : ''}>${options}</select>
          <label class="owner-all-branches"><input type="checkbox" name="allBranches" value="true"${member.allBranches ? ' checked' : ''}${member.active !== true ? ' disabled' : ''}> All active branches</label>
          <button class="owner-row-link" type="submit"${member.active !== true ? ' disabled' : ''}>Save access</button>
        </form>`}</td>
    </tr>`;
  }).join('');
  const ownerBranchesContent = `
    <section class="owner-page-heading">
      <div><h1>Manage branches</h1><p>Set up locations for ${escapeHtml(currentBusiness.name)} and choose which branches active team members can access.</p></div>
    </section>
    <div class="owner-role-notice" role="note"><strong>Branch workspaces · parent business controls</strong><span>Branches are child workspaces created and governed by this business. Each active branch has its own inventory path and access scope. You retain owner access to every branch; assigned staff do not access sibling branches. Existing business-wide products are not automatically moved into a branch.</span></div>
    <div id="owner-branch-message" class="owner-branch-message" role="status" aria-live="polite" hidden></div>
    ${branches.length === 0 && !currentBusiness.branchIds?.length
      ? `<article class="owner-card owner-branch-card"><h2>Initialize branch access</h2><p>This existing business was created before branches were enabled. Initialize it to create its primary branch without moving or changing existing inventory or transactions.</p><button class="owner-primary-button" id="owner-branch-initialize" type="button">Create primary branch</button></article>`
      : ''}
    ${branches.length > 0 ? `
    <article class="owner-card owner-branch-card">
      <div class="owner-card-heading"><div><h2>Business branches</h2><p>${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${branches.filter((branch) => branch.status === 'active').length} active</p></div><button class="owner-row-link" id="owner-branch-refresh" type="button">Refresh</button></div>
      <p id="primary-branch-status-note" class="owner-branch-help">The primary branch cannot be deactivated. Deactivating another branch removes assigned members’ access to it.</p>
      <div class="owner-table-wrap"><table class="owner-table owner-branch-table">
        <thead><tr><th>Branch</th><th>Address</th><th>Status</th><th>Update</th></tr></thead>
        <tbody>${branchRows}</tbody>
      </table></div>
    </article>
    <article class="owner-card owner-branch-card">
      <div class="owner-card-heading"><div><h2>Add a branch</h2><p>Each branch belongs to this business tenant.</p></div></div>
      <form id="owner-branch-create-form" class="owner-branch-create-form">
        <label>Branch name<input name="name" maxlength="100" required placeholder="e.g. Westlands"></label>
        <label>Address (optional)<input name="address" maxlength="300" placeholder="Street, town, or location"></label>
        <button class="owner-primary-button" type="submit">${ownerIcon('plus')} Add branch</button>
      </form>
    </article>
    <article class="owner-card owner-branch-card">
      <div class="owner-card-heading"><div><h2>Member branch access</h2><p>Assign active business members to specific branches or grant access to all current and future active branches.</p></div></div>
      <div class="owner-table-wrap"><table class="owner-table owner-team-table owner-branch-members-table">
        <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Branch access</th></tr></thead>
        <tbody>${memberAssignmentRows || '<tr><td class="owner-empty" colspan="4">No member records found.</td></tr>'}</tbody>
      </table></div>
    </article>` : ''}
    <p class="owner-data-note">Branch workspaces remain under this parent business. Existing businesses must initialize the primary branch before additional branches can be created. Legacy business-wide products require an explicit migration and are not automatically assigned.</p>`;
  const recommendedRbacContent = `
    <details class="owner-card owner-permission-card owner-recommended-card">
      <summary class="owner-recommended-summary"><span><strong>Recommended future RBAC blueprint</strong><small>Proposed roles, inventory/POS matrices, multi-branch scoping, and permission catalogue · not enforced</small></span></summary>
      <div class="owner-recommended-content">
      <div class="owner-proposed-notice" role="note"><strong>Design reference only · no access changes</strong><span>The current permission matrix above is authoritative. This proposal does not create roles, alter memberships, enable branches, grant access, or change Firestore rules. “F” means full within assigned scope, not unlimited platform or tenant access.</span></div>
      <p class="owner-matrix-note"><strong>Role-default legend:</strong> F = full within assigned scope; S = scoped; A = approval or controlled action; V = view only; — = no default access. A recommendation such as “optional,” “limited,” or “within limit” requires explicit business policy and trusted enforcement before it can be used.</p>
      <section class="owner-proposed-roles">
        <h4>Suggested platform-level roles · managed separately, never assignable here</h4>
        <div class="owner-proposed-role-list" aria-label="Suggested platform roles">${renderRoleTemplates(proposedPlatformRoles)}</div>
        <h4>Suggested business role templates</h4>
        <div class="owner-proposed-role-list" aria-label="Suggested business role templates">${renderRoleTemplates(proposedBusinessRoles)}</div>
      </section>
      ${recommendedMatrices.map(renderRecommendedMatrix).join('')}
      <details class="owner-recommendation-table">
        <summary>Permission-code catalogue for a future role editor</summary>
        <div class="owner-table-wrap"><table class="owner-table owner-permission-table owner-proposed-table">
          <caption class="owner-sr-only">Suggested granular permission codes; not currently configured</caption>
          <thead><tr><th scope="col">Module</th><th scope="col">Suggested permission codes</th></tr></thead>
          <tbody>${permissionCodeRows}</tbody>
        </table></div>
      </details>
      <section class="owner-rbac-guardrails">
        <h4>Recommended approval flow</h4>
        <ol>
          <li>Staff creates a purchase, expense, refund, or stock-adjustment request with amount, scope, and required reason.</li>
          <li>The request is submitted and validated against policy and any monetary limit.</li>
          <li>An authorized approver approves, rejects, or returns it for changes; self-approval can be prohibited.</li>
          <li>The approved action is posted with an immutable audit event recording the actor, approver, reason, and time.</li>
        </ol>
        <p>Approval thresholds must be configured by the business; example currency limits in the source proposal are illustrative, not system defaults.</p>
      </section>
      <section class="owner-rbac-guardrails">
        <h4>Recommended safeguards before enabling these permissions</h4>
        <ul>
          <li>Enforce tenant, branch, warehouse, register, record, field, transaction, and shift scopes in trusted backend rules—not only in the UI.</li>
          <li>Keep view, create, edit, delete, submit, approve, post, void, refund, export, configure, access-management, and override permissions separate.</li>
          <li>Use approval limits and separation of duties; prevent self-approval for sensitive stock, purchase, expense, refund, and payroll actions.</li>
          <li>Require original-sale references for refunds; record reasons, amounts, actor, approver, and timestamps for refunds and voids.</li>
          <li>Use traceable reversals instead of deleting posted financial or stock records; require reasons for adjustments, damage, expiry, and write-offs.</li>
          <li>Use concurrency-safe stock updates, idempotent sales, and safe duplicate/offline synchronization where offline POS is supported.</li>
          <li>Test allowed and denied access, prompt role-change enforcement, deactivation/session revocation, and platform-versus-tenant separation.</li>
        </ul>
      </section>
      </div>
    </details>`;
  const teamRows = teamMembers.map((member) => {
    const status = member.active === true ? 'Active' : member.active === false ? 'Inactive' : 'Unknown';
    const joined = formatDate(member.joinedAt);
    const searchText = `${member.userId} ${member.role} ${status}`.toLowerCase();
    const isOwnerMember = member.role === 'owner';
    const roleOptions: AssignableBusinessRole[] = ['admin', 'manager', 'cashier', 'staff'];
    const roleControl = isOwnerMember
      ? '<strong>owner</strong>'
      : `<form class="owner-role-assignment-form" data-role-assignment="${escapeHtml(member.userId)}">
          <label class="owner-sr-only" for="member-role-${escapeHtml(member.userId)}">Business role for ${escapeHtml(member.userId)}</label>
          <select id="member-role-${escapeHtml(member.userId)}" name="role">${roleOptions.map((role) => `<option value="${role}"${member.role === role ? ' selected' : ''}>${role}</option>`).join('')}</select>
          <button class="owner-row-link" type="submit">Save role</button>
        </form>`;
    const branchAccess = isOwnerMember
      ? 'All branches (owner)'
      : member.allBranches
        ? 'All active branches'
        : member.branchIds.length
          ? member.branchIds.map((branchId) => branches.find((branch) => branch.id === branchId)?.name ?? branchId).join(', ')
          : 'Not assigned';
    return `<tr class="owner-team-row" data-team-search="${escapeHtml(searchText)}">
      <td><span class="owner-team-user"><span class="owner-team-avatar">${escapeHtml(member.userId.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(discoverableAccounts.find((account) => account.uid === member.userId)?.email || 'Member account')}</strong><small title="${escapeHtml(member.userId)}">${escapeHtml(member.userId)}</small></span></span></td>
      <td>${roleControl}</td><td><span class="owner-status owner-status-${status.toLowerCase()}">${status}</span></td><td>${escapeHtml(joined)}</td><td>${escapeHtml(branchAccess)}</td>
    </tr>`;
  }).join('');
  const availableAccounts = discoverableAccounts.filter((account) =>
    !teamMembers.some((member) => member.userId === account.uid),
  );
  const addUserOptions = availableAccounts.map((account) =>
    `<option value="${escapeHtml(account.uid)}">${escapeHtml(account.email)}</option>`,
  ).join('');
  const ownerUsersContent = `
    <section class="owner-page-heading">
      <div><h1>Users &amp; Roles</h1><p>Add registered accounts to ${escapeHtml(currentBusiness.name)}, assign a business role, and assign branch access later.</p></div>
    </section>
    <div id="owner-user-message" class="owner-branch-message" role="status" aria-live="polite" hidden></div>
    <div class="owner-role-notice" role="note"><strong>No invitations or account creation</strong><span>People must register their own Mandela account and opt in to the user picker from Profile. Adding them here creates a business membership only; it does not send email, create login credentials, or assign any branches.</span></div>
    <article class="owner-card owner-team-card">
      <div class="owner-card-heading"><div><h2>Add a registered account</h2><p>Only accounts that opted in to discovery appear here. New members start with no branch access.</p></div></div>
      <form id="owner-user-add-form" class="owner-branch-create-form">
        <label for="owner-user-email">Registered account email
          <select id="owner-user-email" name="memberId" required>
            <option value="">Select an opted-in account</option>${addUserOptions}
          </select>
        </label>
        <label for="owner-user-role">Business role
          <select id="owner-user-role" name="role" required>
            <option value="staff">Staff</option><option value="cashier">Cashier</option>
            <option value="manager">Manager</option><option value="admin">Admin</option>
          </select>
        </label>
        <button class="owner-primary-button" type="submit"${availableAccounts.length ? '' : ' disabled'}>${ownerIcon('plus')} Add user</button>
      </form>
      ${availableAccounts.length ? '' : '<p class="owner-branch-help">No discoverable accounts are available. Ask the account holder to enable account discovery in their profile, or refresh after they opt in.</p>'}
    </article>
    <section class="owner-role-summary" aria-label="Team summary">
      <article class="owner-card owner-role-summary-card"><span class="owner-kpi-icon blue">${ownerIcon('users')}</span><div><small>Member records</small><strong>${teamMembers.length.toLocaleString()}</strong></div></article>
      <article class="owner-card owner-role-summary-card"><span class="owner-kpi-icon green">${ownerIcon('check')}</span><div><small>Active access</small><strong>${teamMembers.filter((member) => member.active === true).length.toLocaleString()}</strong></div></article>
      <article class="owner-card owner-role-summary-card"><span class="owner-kpi-icon violet">${ownerIcon('settings')}</span><div><small>Business user types</small><strong>${roleTypes.length}</strong></div></article>
    </section>
    <article class="owner-card owner-role-catalog">
      <div class="owner-card-heading"><div><h2>Business user types</h2><p>User types describe a person's function; tenant roles and permissions control what they can do. Platform administration is managed separately.</p></div></div>
      <div class="owner-role-grid">${roleTypes.map((role) => `<section class="owner-role-type">
        <div class="owner-role-type-heading"><h3>${escapeHtml(role.name)}</h3><span>${escapeHtml(role.scope)}</span></div>
        <p>${escapeHtml(role.description)}</p><small>${escapeHtml(role.access)}</small>
      </section>`).join('')}</div>
    </article>
    <article class="owner-card owner-permission-card">
      <div class="owner-card-heading"><div><h2>Current permission matrix</h2><p>Inventory, POS, and multi-user access currently enforced by the tenant Firestore rules. This is not an editable role configuration.</p></div></div>
      <div class="owner-table-wrap owner-matrix-wrap"><table class="owner-table owner-permission-table">
        <caption class="owner-sr-only">Current business role permissions enforced by Firestore security rules</caption>
        <thead><tr><th scope="col">Permission</th><th scope="col">Owner</th><th scope="col">Admin</th><th scope="col">Manager</th><th scope="col">Cashier</th><th scope="col">Staff</th></tr></thead>
        <tbody>${permissionMatrix}</tbody>
      </table></div>
      <p class="owner-matrix-note"><strong>Legend:</strong> <span class="owner-permission owner-permission-allowed">Yes</span> permitted by role rules; <span class="owner-permission owner-permission-restricted">Limited</span> restricted operation; <span class="owner-permission owner-permission-denied">No</span> denied; <span class="owner-permission owner-permission-unavailable">Unavailable</span> no implemented tenant data model or rule.</p>
      <p class="owner-matrix-note"><strong>Important:</strong> <code>admin</code> has elevated access similar to owner, except owner-only controls such as changing business details and deleting employee records. All access remains subject to active business membership, data validation, and record/day-lock conditions. Newly added members have no branch access until assigned. Branch access is an additional scope for branch-tagged sales and stock movements; legacy untagged records remain tenant-wide. Branch inventory is separated for isolated-mode businesses, but POS, finance, and reports are not yet fully branch-scoped. Specialist roles above are descriptions only.</p>
    </article>
    ${recommendedRbacContent}
    <article class="owner-card owner-team-card">
      <div class="owner-card-heading"><div><h2>Current business members</h2><p>Assign fixed business roles and review branch access.</p></div><button class="owner-row-link" id="owner-team-refresh" type="button">Refresh</button></div>
      <div class="owner-table-wrap"><table class="owner-table owner-team-table"><thead><tr><th>Account</th><th>Assigned business role</th><th>Membership status</th><th>Joined</th><th>Branch access</th></tr></thead><tbody>${teamRows || '<tr><td class="owner-empty" colspan="5">No membership records found.</td></tr>'}</tbody></table></div>
    </article>
    <p class="owner-data-note">User email discovery is opt-in and available to signed-in Mandela accounts. Business roles are limited to admin, manager, cashier, and staff; owner and platform-admin cannot be assigned here. Branch assignment is managed separately.</p>`;

  setPage(ownerView === 'users'
    ? `${currentBusiness.name} users and roles`
    : ownerView === 'branches' ? `${currentBusiness.name} branches` : `${currentBusiness.name} dashboard`, `
    <div class="owner-dashboard">
      <aside class="owner-sidebar" id="owner-sidebar">
        <a href="${import.meta.env.BASE_URL}" class="owner-brand"><span class="owner-brand-mark">${ownerIcon('brand')}</span><span>Mandela<small>BUSINESS WORKSPACE</small></span></a>
        <div class="owner-role-switch"><span>${ownerIcon('business')} Business Owner</span><span aria-hidden="true">⌄</span></div>
        <nav class="owner-nav" aria-label="Business administration">
          <button class="owner-nav-link${ownerView === 'dashboard' ? ' active' : ''}" type="button" data-owner-view="dashboard">${ownerIcon('dashboard')}<span>Dashboard</span></button>
          <button class="owner-nav-link" type="button" data-owner-view="dashboard">${ownerIcon('business')}<span>My Businesses</span><b>${summaries.length}</b></button>
          <button class="owner-nav-link${ownerView === 'users' ? ' active' : ''}" type="button" data-owner-view="users">${ownerIcon('users')}<span>Users &amp; Permissions</span></button>
          <button class="owner-nav-link${ownerView === 'branches' ? ' active' : ''}" type="button" data-owner-view="branches">${ownerIcon('business')}<span>Manage Branches</span></button>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Subscriptions">${ownerIcon('card')}<span>Subscriptions</span></button>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Business settings">${ownerIcon('settings')}<span>Business Settings</span></button>
          <span class="owner-nav-label">OPERATIONS</span>
          <a class="owner-nav-link" href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'productlist.html'))}">${ownerIcon('inventory')}<span>Products &amp; Inventory</span></a>
          <a class="owner-nav-link" href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'inventoryreport.html'))}">${ownerIcon('chart')}<span>Inventory Report</span></a>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Sales and POS">${ownerIcon('sales')}<span>Sales &amp; POS</span></button>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Customers and suppliers">${ownerIcon('users')}<span>Customers &amp; Suppliers</span></button>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Expenses and finance">${ownerIcon('billing')}<span>Expenses &amp; Finance</span></button>
          <span class="owner-nav-label">REPORTS</span>
          <a class="owner-nav-link" href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'inventoryreport.html'))}">${ownerIcon('chart')}<span>Reports &amp; Analytics</span></a>
          <button class="owner-nav-link" type="button" data-dashboard-soon="Audit logs">${ownerIcon('audit')}<span>Audit Logs</span></button>
        </nav>
        <div class="owner-sidebar-bottom"><span class="owner-nav-label">ACCOUNT</span><button class="owner-nav-link" type="button" data-logout>${ownerIcon('logout')}<span>Log Out</span></button></div>
      </aside>
      <button class="owner-mobile-overlay" type="button" id="owner-mobile-overlay" aria-label="Close navigation"></button>
      <main class="owner-main" id="owner-overview">
        <header class="owner-topbar">
          <button class="owner-menu-toggle" id="owner-menu-toggle" type="button" aria-label="Open navigation">${ownerIcon('menu')}</button>
          <label class="owner-search">${ownerIcon('search')}<input id="owner-dashboard-search" type="search" placeholder="Search businesses, users, or features..." aria-label="Search dashboard"></label>
          <span class="owner-topbar-spacer"></span>
          <button type="button" class="owner-notification" data-dashboard-soon="Notifications" aria-label="Notifications">${ownerIcon('bell')}</button>
          <span class="owner-avatar">${escapeHtml(displayName(user).slice(0, 1).toUpperCase())}</span>
          <span class="owner-account"><strong>${escapeHtml(displayName(user))}</strong><small>Business Owner</small></span>
          ${memberships.length > 1 ? `<button class="owner-account-switch" id="owner-account-switch" type="button" aria-label="Switch business">⌄</button>` : ''}
        </header>
        <div class="owner-content">
          ${ownerView === 'users' ? ownerUsersContent : ownerView === 'branches' ? ownerBranchesContent : `
          <section class="owner-page-heading">
            <div><h1>Business Owner Dashboard</h1><p>Manage your businesses, users, and business operations from one place.</p></div>
            <button class="owner-primary-button" id="owner-create-business" type="button">${ownerIcon('plus')} Create New Business</button>
          </section>
          <section class="owner-kpis" aria-label="Business overview metrics">
            <article class="owner-card owner-kpi"><span class="owner-kpi-icon blue">${ownerIcon('business')}</span><div><small>My Businesses</small><strong>${summaries.length.toLocaleString()}</strong><span class="owner-kpi-note">Active memberships</span></div></article>
            <article class="owner-card owner-kpi"><span class="owner-kpi-icon violet">${ownerIcon('users')}</span><div><small>Team Memberships</small><strong>${activeMemberships.toLocaleString()}</strong><span class="owner-kpi-note">Across your businesses</span></div></article>
            <article class="owner-card owner-kpi"><span class="owner-kpi-icon green">${ownerIcon('inventory')}</span><div><small>Products in ${escapeHtml(currentBusiness.name)}</small><strong>${currentProducts.length.toLocaleString()}</strong><span class="owner-kpi-note">${totalUnits.toLocaleString()} units · ${lowStockCount.toLocaleString()} low stock</span></div></article>
            <article class="owner-card owner-kpi"><span class="owner-kpi-icon teal">${ownerIcon('card')}</span><div><small>Subscriptions &amp; Revenue</small><strong class="owner-kpi-unavailable">Not configured</strong><span class="owner-kpi-note">Billing data is not connected</span></div></article>
          </section>
          <section class="owner-primary-grid">
            <article class="owner-card owner-business-card" id="owner-businesses">
              <div class="owner-card-heading"><div><h2>Business Overview</h2><p>Your businesses and current access</p></div><a href="#owner-businesses">View All</a></div>
              <div class="owner-table-wrap"><table class="owner-table"><thead><tr><th>Business Name</th><th>Plan</th><th>Status</th><th>Users</th><th>Created</th><th></th></tr></thead><tbody>${businessRows || '<tr><td class="owner-empty" colspan="6">No businesses found.</td></tr>'}</tbody></table></div>
            </article>
            <article class="owner-card owner-stock-card">
              <div class="owner-card-heading"><div><h2>Inventory Snapshot</h2><p>${escapeHtml(currentBusiness.name)} · product quantities</p></div><a href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'inventoryreport.html'))}">Report</a></div>
              ${productRows ? `<div class="owner-stock-list">${productRows}</div>` : '<div class="owner-empty owner-chart-empty">No products yet. Add products to see inventory levels here.</div>'}
            </article>
          </section>
          <section class="owner-secondary-grid">
            <article class="owner-card owner-quick-card">
              <div class="owner-card-heading"><div><h2>Quick Actions</h2><p>Common business tasks</p></div></div>
              <div class="owner-quick-actions">
                <a class="owner-quick-action" href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'addproduct.html'))}"><span>${ownerIcon('plus')}</span><strong>Add Product</strong><small>Create an inventory item</small></a>
                <a class="owner-quick-action" href="${escapeHtml(getBusinessPageUrl(currentBusiness.slug, 'productlist.html'))}"><span>${ownerIcon('inventory')}</span><strong>Manage Inventory</strong><small>View and update products</small></a>
                <button class="owner-quick-action" type="button" data-owner-view="users"><span>${ownerIcon('users')}</span><strong>Users &amp; Roles</strong><small>View members and role types</small></button>
                <button class="owner-quick-action" type="button" data-owner-view="branches"><span>${ownerIcon('business')}</span><strong>Manage Branches</strong><small>Set up locations and access</small></button>
                <button class="owner-quick-action" type="button" id="owner-create-business-secondary"><span>${ownerIcon('business')}</span><strong>Create Business</strong><small>Set up another workspace</small></button>
              </div>
            </article>
            <article class="owner-card owner-activity-card">
              <div class="owner-card-heading"><div><h2>Recent Activity</h2><p>Business event history</p></div></div>
              <div class="owner-activity-empty">${ownerIcon('audit')}<p>Activity history will appear here when business audit logging is implemented.</p></div>
            </article>
          </section>
          <p class="owner-data-note">Live data: business memberships, team membership counts, and product inventory. Subscription, revenue, business status, and activity history are not yet connected.</p>
          `}
        </div>
      </main>
    </div>`);

  const createBusiness = (): void => renderSetup(user);
  root?.querySelectorAll<HTMLButtonElement>('[data-owner-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.ownerView;
      if (view === 'dashboard' || view === 'users' || view === 'branches') {
        void renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, view);
      }
    });
  });
  root?.querySelector<HTMLButtonElement>('#owner-create-business')?.addEventListener('click', createBusiness);
  root?.querySelector<HTMLButtonElement>('#owner-create-business-secondary')?.addEventListener('click', createBusiness);
  root?.querySelectorAll<HTMLButtonElement>('[data-dashboard-business]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = summaries.find((summary) => summary.id === button.dataset.dashboardBusiness);
      if (!selected) return;
      setSelectedBusiness(user.uid, selected.id);
      if (routeToBusiness(selected)) return;
      void renderAuthenticatedHome(user, selected.slug || undefined);
    });
  });
  root?.querySelector<HTMLButtonElement>('#owner-account-switch')?.addEventListener('click', () => {
    renderBusinessPicker(user, summaries);
  });
  root?.querySelector<HTMLButtonElement>('#owner-team-refresh')?.addEventListener('click', () => {
    void renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'users');
  });
  const showUserMessage = (message: string, isError = true): void => {
    const target = root?.querySelector<HTMLElement>('#owner-user-message');
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
    target.classList.toggle('is-error', isError);
  };
  root?.querySelector<HTMLFormElement>('#owner-user-add-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const values = new FormData(form);
    const memberId = String(values.get('memberId') ?? '');
    const role = String(values.get('role') ?? '');
    if (!isAssignableBusinessRole(role)) {
      showUserMessage('Select a supported business role.');
      return;
    }
    if (button) button.disabled = true;
    try {
      await addExistingBusinessMember(currentBusiness.id, memberId, role);
      await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'users');
    } catch (error) {
      if (button) button.disabled = false;
      showUserMessage(error instanceof Error ? error.message : 'Could not add this account.');
    }
  });
  root?.querySelectorAll<HTMLFormElement>('[data-role-assignment]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const memberId = form.dataset.roleAssignment;
      const role = form.querySelector<HTMLSelectElement>('select[name="role"]')?.value;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!memberId || !role || !isAssignableBusinessRole(role)) {
        showUserMessage('Select a supported business role.');
        return;
      }
      if (button) button.disabled = true;
      try {
        await updateBusinessMemberRole(currentBusiness.id, memberId, role);
        await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'users');
      } catch (error) {
        if (button) button.disabled = false;
        showUserMessage(error instanceof Error ? error.message : 'Could not update the business role.');
      }
    });
  });
  const showBranchMessage = (message: string): void => {
    const target = root?.querySelector<HTMLElement>('#owner-branch-message');
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
    target.classList.add('is-error');
  };
  root?.querySelector<HTMLButtonElement>('#owner-branch-initialize')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await initializeBusinessBranches(currentBusiness.id);
      await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'branches');
    } catch (error) {
      button.disabled = false;
      showBranchMessage(error instanceof Error ? error.message : 'Could not initialize the primary branch.');
    }
  });
  root?.querySelector<HTMLButtonElement>('#owner-branch-refresh')?.addEventListener('click', () => {
    void renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'branches');
  });
  root?.querySelector<HTMLFormElement>('#owner-branch-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const values = new FormData(form);
    const name = String(values.get('name') ?? '');
    const address = String(values.get('address') ?? '');
    if (button) button.disabled = true;
    try {
      await createBusinessBranch(currentBusiness.id, name, address);
      await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'branches');
    } catch (error) {
      if (button) button.disabled = false;
      showBranchMessage(error instanceof Error ? error.message : 'Could not create the branch.');
    }
  });
  root?.querySelectorAll<HTMLFormElement>('[data-branch-update]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const currentForm = event.currentTarget as HTMLFormElement;
      const branchId = currentForm.dataset.branchUpdate;
      const button = currentForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      const values = new FormData(currentForm);
      const status = currentForm.querySelector<HTMLSelectElement>('select[name="status"]')?.value;
      if (!branchId || (status !== 'active' && status !== 'inactive')) return;
      if (button) button.disabled = true;
      try {
        await updateBusinessBranch(currentBusiness.id, branchId, {
          name: String(values.get('name') ?? ''),
          address: String(values.get('address') ?? ''),
          status,
          managerUid: currentForm.querySelector<HTMLInputElement>('input[name="ownerBranchManager"]')?.checked
            ? user.uid
            : '',
        });
        await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'branches');
      } catch (error) {
        if (button) button.disabled = false;
        showBranchMessage(error instanceof Error ? error.message : 'Could not update the branch.');
      }
    });
  });
  root?.querySelectorAll<HTMLFormElement>('[data-member-assignment]').forEach((form) => {
    const selector = form.querySelector<HTMLSelectElement>('select[name="branchIds"]');
    const allBranchesToggle = form.querySelector<HTMLInputElement>('input[name="allBranches"]');
    allBranchesToggle?.addEventListener('change', () => {
      if (selector) selector.disabled = allBranchesToggle.checked;
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const memberId = form.dataset.memberAssignment;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!memberId) return;
      const branchIds = [...(selector?.selectedOptions ?? [])].map((option) => option.value);
      if (button) button.disabled = true;
      try {
        await setMemberBranchAssignments(
          currentBusiness.id,
          memberId,
          branchIds,
          allBranchesToggle?.checked === true,
        );
        await renderOwnerDashboard(user, currentBusiness, currentProducts, memberships, 'branches');
      } catch (error) {
        if (button) button.disabled = false;
        showBranchMessage(error instanceof Error ? error.message : 'Could not save branch access.');
      }
    });
  });
  root?.querySelector<HTMLInputElement>('#owner-dashboard-search')?.addEventListener('input', (event) => {
    const term = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    root?.querySelectorAll<HTMLElement>('.owner-business-row').forEach((row) => {
      row.hidden = !row.dataset.businessSearch?.includes(term);
    });
    root?.querySelectorAll<HTMLElement>('.owner-team-row').forEach((row) => {
      row.hidden = !row.dataset.teamSearch?.includes(term);
    });
    root?.querySelectorAll<HTMLElement>('[data-dashboard-soon]').forEach((button) => {
      button.hidden = Boolean(term) &&
        !button.textContent?.toLowerCase().includes(term) &&
        !`business users features ${currentBusiness.name}`.includes(term);
    });
  });
  root?.querySelectorAll<HTMLButtonElement>('[data-dashboard-soon]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.hidden) window.alert(`${button.dataset.dashboardSoon} is not available yet.`);
    });
  });
  root?.querySelector<HTMLButtonElement>('#owner-menu-toggle')?.addEventListener('click', () => {
    root?.querySelector('#owner-sidebar')?.classList.add('open');
    root?.querySelector('#owner-mobile-overlay')?.classList.add('visible');
  });
  root?.querySelector<HTMLButtonElement>('#owner-mobile-overlay')?.addEventListener('click', () => {
    root?.querySelector('#owner-sidebar')?.classList.remove('open');
    root?.querySelector('#owner-mobile-overlay')?.classList.remove('visible');
  });
  bindLogout();
}

function ownerIcon(name: string): string {
  const paths: Record<string, string> = {
    brand: '<path d="M3 5.5 8 3l5 2.5v5L8 13 3 10.5zM13 10.5 18 8l3 1.5v5L16 17l-3-2.5zM3 13.5 8 11l5 2.5v5L8 21l-5-2.5z"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    business: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V4h6v3M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.6a8 8 0 0 1-1.6.9l-.3 1.9h-2.8l-.3-1.9a8 8 0 0 1-1.6-.9l-1.8.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.8.6a8 8 0 0 1 1.6-.9l.3-1.9h2.8l.3 1.9a8 8 0 0 1 1.6.9l1.8-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.8Z"/>',
    inventory: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    chart: '<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',
    sales: '<path d="M3 4h2l2.2 11h10.9l2-8H6"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    billing: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    audit: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.business}</svg>`;
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
  const userName = appShell?.querySelector<HTMLElement>('#template-user-name');
  if (userName) userName.textContent = displayName(user);
  bindLogout();
  let loadingStep = 'checking account access';
  try {
    if (await isPlatformAdmin(user.uid)) {
      const adminUrl = new URL(`${import.meta.env.BASE_URL}platform-admin.html`, window.location.origin);
      window.location.replace(adminUrl.href);
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
    const branches = await getAccessibleBusinessBranches(
      business.id,
      business.role,
      business.branchIds,
      business.allBranches,
    );
    const branchProducts = await Promise.all(branches.map((branch) =>
      getProducts(business.id, branch.id),
    ));
    const products = branchProducts.flat();
    renderDashboard(user, business, products, businesses);
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
