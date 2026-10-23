import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../../config/firebase';
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
} from '../../services/business.service';
import { addProduct, deleteProduct, getProduct, getProducts, updateProduct } from './service';
import type { InventoryPage, Product, ProductInput } from './types';
import '../../environment-switcher';
import './inventory.css';

const content = document.querySelector<HTMLElement>('.page-wrapper .content');
const pageByPath: Record<string, InventoryPage> = {
  'productlist.html': 'list',
  'addproduct.html': 'add',
  'editproduct.html': 'edit',
  'product-details.html': 'details',
  'inventoryreport.html': 'report',
};
const page = pageByPath[window.location.pathname.split('/').pop() ?? ''] ?? 'list';
let activeBusiness: ActiveBusiness | null = null;
let currentUser: User | null = null;
let products: Product[] = [];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function showMessage(message: string, isError = true): void {
  const target = content?.querySelector<HTMLElement>('[data-message]');
  if (!target) return;
  target.textContent = message;
  target.className = isError ? 'inventory-error' : 'inventory-success';
  target.hidden = false;
}

function displayName(user: User): string {
  return user.displayName?.trim() || user.email || 'your account';
}

function pageHref(pageName: string, productId?: string): string {
  const slug = activeBusiness ? activeBusiness.slug : getTenantSlugFromLocation();
  const href = slug
    ? getBusinessPageUrl(slug, pageName)
    : new URL(pageName, window.location.origin + import.meta.env.BASE_URL).href;
  const url = new URL(href, window.location.origin);
  if (productId) url.searchParams.set('id', productId);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.href;
}

function canManageInventory(): boolean {
  return activeBusiness !== null &&
    ['owner', 'admin', 'manager'].includes(activeBusiness.role);
}

function renderShell(title: string, subtitle: string, body: string): void {
  if (!content) return;
  content.innerHTML = `
    <section class="inventory-module">
      <header class="inventory-heading">
        <div><h2>${escapeHtml(title)}</h2><p>${subtitle}</p></div>
        <nav class="inventory-actions" aria-label="Inventory">
          ${activeBusiness ? '<button class="btn btn-outline-secondary" id="switch-business" type="button">Switch business</button>' : ''}
          <a class="btn btn-primary" href="${pageHref('productlist.html')}">Products</a>
          ${canManageInventory() ? `<a class="btn btn-primary" href="${pageHref('addproduct.html')}">Add product</a>` : ''}
          <a class="btn btn-primary" href="${pageHref('inventoryreport.html')}">Inventory report</a>
        </nav>
      </header>
      <div data-message role="status" hidden></div>
      ${body}
    </section>`;

  content.querySelector<HTMLButtonElement>('#switch-business')?.addEventListener('click', async () => {
    if (!currentUser) return;
    try {
      const businesses = await getUserBusinesses(currentUser.uid);
      if (businesses.length > 1) {
        activeBusiness = null;
        renderBusinessSelection(currentUser, businesses);
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Could not load your businesses.');
    }
  });
}

function renderBusinessSetup(user: User): void {
  renderShell('Set up your business', `Signed in as ${escapeHtml(displayName(user))}`, `
    <div class="inventory-card">
      <h3>Create your business workspace</h3>
      <p class="inventory-muted">Your inventory will be stored in this business and accessible to its authorized members.</p>
      <form class="inventory-form" id="business-form">
        <div class="inventory-field-full">
          <label for="business-name">Business name</label>
          <input class="form-control" id="business-name" name="name" maxlength="100" required>
        </div>
        <div class="inventory-field-full">
          <label for="business-slug">Choose your business address</label>
          <input class="form-control" id="business-slug" name="slug" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocapitalize="none" spellcheck="false" required>
          <small class="inventory-muted" id="slug-status" aria-live="polite">Use lowercase letters, numbers, and single hyphens.</small>
          <small class="inventory-muted">Local testing: <code id="local-slug-preview"></code></small>
          <small class="inventory-muted">GitHub Pages: <code id="github-slug-preview"></code></small>
          <small class="inventory-muted">Local tenant links use a path on this host so your signed-in session remains active.</small>
          <small class="inventory-muted">GitHub Pages uses a path, not subdomains. A custom domain requires a domain and wildcard DNS you control.</small>
        </div>
        <div class="inventory-form-actions">
          <button class="btn btn-primary" type="submit">Create business</button>
        </div>
      </form>
    </div>`);

  const setupForm = content?.querySelector<HTMLFormElement>('#business-form');
  const nameInput = setupForm?.elements.namedItem('name') as HTMLInputElement | null;
  const slugInput = setupForm?.elements.namedItem('slug') as HTMLInputElement | null;
  const slugStatus = content?.querySelector<HTMLElement>('#slug-status');
  const localPreview = content?.querySelector<HTMLElement>('#local-slug-preview');
  const githubPreview = content?.querySelector<HTMLElement>('#github-slug-preview');
  let slugWasEdited = false;
  let checkVersion = 0;
  let availabilityTimer: number | undefined;
  const updateSlugPreview = (): void => {
    const slug = slugInput?.value.trim().toLowerCase() || 'your-name';
    const suggestions = getBusinessUrlSuggestions(slug);
    if (localPreview) localPreview.textContent = suggestions.local;
    if (githubPreview) githubPreview.textContent = suggestions.githubPages;
  };
  const checkSlug = async (): Promise<void> => {
    const version = ++checkVersion;
    if (!slugInput || !slugStatus) return;
    const slug = slugInput.value.trim().toLowerCase();
    if (!slugInput.validity.valid) {
      slugStatus.textContent = 'Use 1–48 lowercase letters, numbers, and single hyphens.';
      return;
    }
    slugStatus.textContent = 'Checking address…';
    try {
      const available = await isBusinessSlugAvailable(slug);
      if (version !== checkVersion) return;
      slugStatus.textContent = available ? 'Address is available.' : 'That address is already taken.';
    } catch (error) {
      if (version !== checkVersion) return;
      slugStatus.textContent = error instanceof Error ? error.message : 'Could not check address availability.';
    }
  };
  const scheduleSlugCheck = (): void => {
    checkVersion++;
    if (availabilityTimer !== undefined) window.clearTimeout(availabilityTimer);
    availabilityTimer = window.setTimeout(() => void checkSlug(), 300);
  };
  nameInput?.addEventListener('input', () => {
    if (!slugWasEdited && slugInput) slugInput.value = suggestBusinessSlug(nameInput.value);
    updateSlugPreview();
    scheduleSlugCheck();
  });
  slugInput?.addEventListener('input', () => {
    slugWasEdited = true;
    updateSlugPreview();
    scheduleSlugCheck();
  });
  updateSlugPreview();

  setupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      activeBusiness = await createBusiness(
        new FormData(form).get('name')?.toString() ?? '',
        new FormData(form).get('slug')?.toString() ?? '',
      );
      setSelectedBusiness(user.uid, activeBusiness.id);
      await loadInventory(user);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Could not create the business.');
      if (button) button.disabled = false;
    }
  });
}

function renderBusinessSelection(user: User, businesses: ActiveBusiness[]): void {
  renderShell('Select a business', `Signed in as ${escapeHtml(displayName(user))}`, `
    <div class="inventory-card">
      <h3>Choose a business workspace</h3>
      <p class="inventory-muted">Your access is determined by your active membership in each business.</p>
      <form class="inventory-form" id="business-selection-form">
        <div class="inventory-field-full">
          <label for="business-selection">Business</label>
          <select class="form-control" id="business-selection" name="businessId" required>
            ${businesses.map((business) => `<option value="${escapeHtml(business.id)}">${escapeHtml(business.name)} (${escapeHtml(business.role)})</option>`).join('')}
          </select>
        </div>
        <div class="inventory-form-actions">
          <button class="btn btn-primary" type="submit">Open business</button>
        </div>
      </form>
    </div>`);

  content?.querySelector<HTMLFormElement>('#business-selection-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const businessId = new FormData(event.currentTarget as HTMLFormElement).get('businessId')?.toString();
    const business = businesses.find((candidate) => candidate.id === businessId);
    if (!business) {
      showMessage('Select a business where you have an active membership.');
      return;
    }
    setSelectedBusiness(user.uid, business.id);
    activeBusiness = business;
    const pageName = window.location.pathname.split('/').pop() || 'productlist.html';
    window.location.assign(pageHref(pageName));
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function statusFor(product: Product): string {
  return product.quantity <= product.reorderLevel
    ? '<span class="badge bg-warning">Low stock</span>'
    : '<span class="badge bg-success">In stock</span>';
}

function productRows(rows: Product[]): string {
  if (rows.length === 0) {
    return '<tr><td colspan="7" class="text-center inventory-muted">No products match this view.</td></tr>';
  }

  const managementActions = canManageInventory();
  return rows.map((product) => `
    <tr>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.sku || '—')}</td>
      <td>${formatAmount(product.quantity)}</td>
      <td>${formatAmount(product.reorderLevel)}</td>
      <td>${formatAmount(product.costPrice)}</td>
      <td>${statusFor(product)}</td>
      <td>
        <a class="btn btn-sm btn-outline-primary" href="${pageHref('product-details.html', product.id)}">View</a>
        ${managementActions ? `<a class="btn btn-sm btn-outline-secondary" href="${pageHref('editproduct.html', product.id)}">Edit</a>
        <button class="btn btn-sm btn-outline-danger" type="button" data-delete="${escapeHtml(product.id)}">Delete</button>` : ''}
      </td>
    </tr>`).join('');
}

function bindProductTable(initialRows: Product[], lowStockOnly = false): void {
  const search = content?.querySelector<HTMLInputElement>('#inventory-search');
  const filter = content?.querySelector<HTMLSelectElement>('#stock-filter');
  const body = content?.querySelector<HTMLElement>('#product-rows');
  const refresh = (): void => {
    const searchText = search?.value.trim().toLocaleLowerCase() ?? '';
    const lowOnly = lowStockOnly || filter?.value === 'low';
    const visible = initialRows.filter((product) => {
      const matchesSearch = `${product.name} ${product.sku}`.toLocaleLowerCase().includes(searchText);
      return matchesSearch && (!lowOnly || product.quantity <= product.reorderLevel);
    });
    if (body) body.innerHTML = productRows(visible);
    body?.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const productId = button.dataset.delete;
        const product = initialRows.find((item) => item.id === productId);
        if (!productId || !product || !window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
        button.disabled = true;
        try {
          await deleteProduct(activeBusiness!.id, productId);
          await loadInventory(currentUser ?? undefined);
        } catch (error) {
          showMessage(error instanceof Error ? error.message : 'Could not delete the product.');
          button.disabled = false;
        }
      });
    });
  };
  search?.addEventListener('input', refresh);
  filter?.addEventListener('change', refresh);
  refresh();
}

function renderProductList(lowStockOnly = false): void {
  const lowStockCount = products.filter((product) => product.quantity <= product.reorderLevel).length;
  const totalUnits = products.reduce((total, product) => total + product.quantity, 0);
  const title = lowStockOnly ? 'Low stock report' : 'Product inventory';
  renderShell(title, `Business: ${escapeHtml(activeBusiness!.name)}`, `
    <div class="inventory-stats">
      <article class="inventory-card inventory-stat"><span>Products</span><strong>${products.length}</strong></article>
      <article class="inventory-card inventory-stat"><span>Total units in stock</span><strong>${formatAmount(totalUnits)}</strong></article>
      <article class="inventory-card inventory-stat"><span>Products at/below reorder level</span><strong>${lowStockCount}</strong></article>
      <article class="inventory-card inventory-stat"><span>Inventory cost value (minor units)</span><strong>${formatAmount(products.reduce((total, item) => total + item.quantity * item.costPrice, 0))}</strong></article>
    </div>
    <div class="inventory-card">
      <div class="inventory-toolbar">
        <input class="form-control inventory-search" id="inventory-search" type="search" placeholder="Search product name or SKU" aria-label="Search products">
        ${lowStockOnly ? '' : `<select class="form-control" id="stock-filter" aria-label="Filter stock"><option value="all">All stock</option><option value="low">Low stock only</option></select>`}
        ${canManageInventory() ? `<a class="btn btn-primary" href="${pageHref('addproduct.html')}">Add product</a>` : ''}
      </div>
      <div class="inventory-table-wrap">
        <table class="table inventory-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Reorder level</th><th>Cost (minor units)</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="product-rows"></tbody>
        </table>
      </div>
    </div>`);
  bindProductTable(products, lowStockOnly);
}

function readProductForm(form: HTMLFormElement): ProductInput {
  const values = new FormData(form);
  const numberValue = (field: string): number => {
    const value = values.get(field)?.toString() ?? '';
    if (!/^\d+$/.test(value)) {
      throw new Error(`${field} must be a non-negative whole number.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${field} is too large.`);
    }
    return parsed;
  };
  return {
    name: values.get('name')?.toString() ?? '',
    sku: values.get('sku')?.toString() ?? '',
    quantity: numberValue('quantity'),
    reorderLevel: numberValue('reorderLevel'),
    costPrice: numberValue('costPrice'),
    sellingPrice: numberValue('sellingPrice'),
  };
}

function productFormMarkup(product?: Product): string {
  const field = (name: keyof ProductInput, label: string, type: string, hint?: string): string => `
    <div>
      <label for="${name}">${label}</label>
      <input class="form-control" id="${name}" name="${name}" type="${type}" value="${escapeHtml(String(product?.[name] ?? ''))}" required>
      ${hint ? `<small class="inventory-muted">${hint}</small>` : ''}
    </div>`;
  return `
    <div class="inventory-card">
      <form class="inventory-form" id="product-form">
        <div class="inventory-field-full"><label for="name">Product name</label><input class="form-control" id="name" name="name" maxlength="120" value="${escapeHtml(product?.name ?? '')}" required></div>
        ${field('sku', 'SKU (optional)', 'text')}
        ${field('quantity', 'Quantity in stock', 'number')}
        ${field('reorderLevel', 'Low-stock alert level', 'number')}
        ${field('costPrice', 'Cost price (minor units)', 'number', 'Enter whole minor currency units.')}
        ${field('sellingPrice', 'Selling price (minor units)', 'number', 'Enter whole minor currency units.')}
        <div class="inventory-form-actions inventory-actions">
          <a class="btn btn-cancel" href="${pageHref('productlist.html')}">Cancel</a>
          <button class="btn btn-primary" type="submit">${product ? 'Save changes' : 'Save product'}</button>
        </div>
      </form>
    </div>`;
}

function bindProductForm(product?: Product): void {
  content?.querySelector<HTMLFormElement>('#product-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const input = readProductForm(form);
      if (product) {
        await updateProduct(activeBusiness!.id, product.id, input);
      } else {
        await addProduct(activeBusiness!.id, input);
      }
      window.location.href = pageHref('productlist.html');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Could not save the product.');
      if (button) button.disabled = false;
    }
  });
}

function renderProductForm(product?: Product): void {
  const dashboard = activeBusiness!.slug
    ? ` · <a href="${escapeHtml(getBusinessUrl(activeBusiness!.slug))}">Dashboard</a>`
    : '';
  renderShell(product ? 'Edit product' : 'Add product', `Business: ${escapeHtml(activeBusiness!.name)}${dashboard}`, productFormMarkup(product));
  bindProductForm(product);
}

function renderDetails(product: Product | undefined): void {
  if (!product) {
    renderShell('Product not found', `Business: ${escapeHtml(activeBusiness!.name)}`, `<div class="inventory-card">This product no longer exists. <a href="${pageHref('productlist.html')}">Return to inventory</a>.</div>`);
    return;
  }
  renderShell(product.name, `Business: ${escapeHtml(activeBusiness!.name)}`, `
    <div class="inventory-card">
      <dl class="row">
        <dt class="col-sm-4">SKU</dt><dd class="col-sm-8">${escapeHtml(product.sku || '—')}</dd>
        <dt class="col-sm-4">Quantity</dt><dd class="col-sm-8">${formatAmount(product.quantity)} ${statusFor(product)}</dd>
        <dt class="col-sm-4">Reorder level</dt><dd class="col-sm-8">${formatAmount(product.reorderLevel)}</dd>
        <dt class="col-sm-4">Cost price (minor units)</dt><dd class="col-sm-8">${formatAmount(product.costPrice)}</dd>
        <dt class="col-sm-4">Selling price (minor units)</dt><dd class="col-sm-8">${formatAmount(product.sellingPrice)}</dd>
      </dl>
      ${canManageInventory() ? `<a class="btn btn-primary" href="${pageHref('editproduct.html', product.id)}">Edit product</a>` : ''}
      <a class="btn btn-cancel" href="${pageHref('productlist.html')}">Back to inventory</a>
    </div>`);
}

async function renderPage(): Promise<void> {
  if (!activeBusiness) {
    return;
  }
  if ((page === 'add' || page === 'edit') && !canManageInventory()) {
    renderShell('Access restricted', 'Your business role does not allow inventory changes.', '<div class="inventory-card">Contact a business owner or manager if you need access.</div>');
    return;
  }
  products = await getProducts(activeBusiness.id);
  if (page === 'list') {
    renderProductList();
    return;
  }
  if (page === 'report') {
    renderProductList(true);
    return;
  }
  if (page === 'add') {
    renderProductForm();
    return;
  }

  const productId = new URLSearchParams(window.location.search).get('id');
  if (!productId) {
    renderDetails(undefined);
    return;
  }
  const product = await getProduct(activeBusiness.id, productId) ?? undefined;
  if (page === 'edit') {
    product ? renderProductForm(product) : renderDetails(undefined);
  } else {
    renderDetails(product);
  }
}

async function loadInventory(user?: User): Promise<void> {
  if (!content) return;
  currentUser = user ?? null;
  activeBusiness = null;
  if (!isFirebaseConfigured || !auth) {
    renderShell('Firebase setup required', 'Configure Firebase before using inventory.', '<div class="inventory-card">Set the VITE_FIREBASE_* values in .env.local, then restart the development server.</div>');
    return;
  }
  if (!user) {
    renderShell('Sign in required', 'Sign in with an authorized business account to manage inventory.', `<div class="inventory-card"><a class="btn btn-primary" href="${import.meta.env.BASE_URL}signin.html">Go to sign in</a></div>`);
    return;
  }

  renderShell('Loading inventory…', `Signed in as ${escapeHtml(displayName(user))}`, '<div class="inventory-card">Connecting to Firestore…</div>');
  try {
    const businesses = await getUserBusinesses(user.uid);
    if (businesses.length === 0) {
      renderBusinessSetup(user);
      return;
    }
    const tenantSlug = getTenantSlugFromLocation();
    activeBusiness = tenantSlug
      ? businesses.find((business) => business.slug === tenantSlug) ?? null
      : getSelectedBusiness(user.uid, businesses);
    if (!activeBusiness) {
      if (tenantSlug) {
        renderShell('Business unavailable', 'You do not have an active membership for this business.', `<div class="inventory-card"><a href="${import.meta.env.BASE_URL}">Return home</a></div>`);
        return;
      }
      renderBusinessSelection(user, businesses);
      return;
    }
    setSelectedBusiness(user.uid, activeBusiness.id);
    await renderPage();
  } catch (error) {
    renderShell('Could not load inventory', `Business: ${escapeHtml(activeBusiness?.name ?? 'not selected')}`, '<div class="inventory-card"><p data-load-error></p><button class="btn btn-primary" type="button" id="inventory-retry">Try again</button></div>');
    const errorElement = content.querySelector<HTMLElement>('[data-load-error]');
    if (errorElement) errorElement.textContent = error instanceof Error ? error.message : 'An unexpected error occurred.';
    content.querySelector<HTMLButtonElement>('#inventory-retry')?.addEventListener('click', () => void loadInventory(user));
  }
}

if (content) {
  if (!isFirebaseConfigured || !auth) {
    void loadInventory();
  } else {
    onAuthStateChanged(auth, (user) => {
      activeBusiness = null;
      void loadInventory(user ?? undefined);
    }, (error) => {
      renderShell('Authentication error', 'Could not verify your sign-in status.', `<div class="inventory-card">${escapeHtml(error.message)}</div>`);
    });
  }
}
