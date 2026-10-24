import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseEnvironment, isFirebaseConfigured } from './config/firebase';
import { logout } from './services/auth.service';
import { getPlatformBusinesses, getPlatformTenantAdmins, getPlatformUsers, isPlatformAdmin, type PlatformTenantAdmin } from './services/business.service';
import './platform-admin.css';

type Section = 'overview' | 'businesses' | 'subscriptions' | 'users' | 'billing' | 'inventory' | 'reports' | 'settings' | 'notifications' | 'audit';
type BusinessStatus = 'Active' | 'Suspended' | 'Trial' | 'Unknown';
type SubscriptionStatus = 'Trial' | 'Active' | 'Pending' | 'Overdue' | 'Cancelled' | 'Expired' | 'Suspended';

interface Business {
  id: string;
  name: string;
  owner: string;
  ownerEmail?: string;
  plan: string;
  status: BusinessStatus;
  users: number | null;
  created: string;
  revenue: number;
  products: number;
  sales: number;
  isFirestoreRecord?: boolean;
}

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  business: string;
  status: 'Active' | 'Suspended';
  lastActive: string;
}

interface Subscription {
  id: string;
  business: string;
  plan: string;
  amount: number;
  cycle: string;
  nextBilling: string;
  status: SubscriptionStatus;
}

interface SubscriptionPlan {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  userLimit: number;
  branchLimit: number;
  productLimit: number;
  features: string[];
  renewalPolicy: 'Auto-renew' | 'Manual';
  active: boolean;
}

interface PlatformNotification {
  title: string;
  detail: string;
  time: string;
  icon: string;
  color: string;
  read: boolean;
}

interface Invoice {
  id: string;
  business: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Pending' | 'Overdue' | 'Failed' | 'Refunded';
}

const root = document.querySelector<HTMLElement>('#platform-admin-root') ?? (() => {
  throw new Error('Platform admin root is missing.');
})();
let currentCurrency = 'KES';

const icons: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  billing: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h4"/>',
  inventory: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  chart: '<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.6a8 8 0 0 1-1.6.9l-.3 1.9h-2.8l-.3-1.9a8 8 0 0 1-1.6-.9l-1.8.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.8.6a8 8 0 0 1 1.6-.9l.3-1.9h2.8l.3 1.9a8 8 0 0 1 1.6.9l1.8-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.8Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  audit: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  filter: '<path d="M4 5h16M7 10h10M10 15h4M11 20h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  trend: '<path d="m4 15 5-5 4 3 7-8M14 5h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
};

interface AuditEntry {
  date: string;
  event: string;
  actor: string;
  details: string;
  result: string;
}

function icon(name: string): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] ?? icons.business}</svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function currency(amount: number): string {
  if (currentCurrency === 'KES') return `KSh ${amount.toLocaleString('en-KE')}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currentCurrency, maximumFractionDigits: 0 }).format(amount);
}

const businesses: Business[] = [
  { id: 'b-101', name: 'FreshMart Grocery', owner: 'John Mwangi', plan: 'Pro Monthly', status: 'Active', users: 12, created: 'Oct 12, 2026', revenue: 125400, products: 1842, sales: 1243 },
  { id: 'b-102', name: 'TechStore Electronics', owner: 'Sarah Wanjiku', plan: 'Business Monthly', status: 'Active', users: 8, created: 'Oct 10, 2026', revenue: 98200, products: 923, sales: 864 },
  { id: 'b-103', name: 'QuickShop Ltd', owner: 'David Ochieng', plan: 'Pro Annual', status: 'Active', users: 15, created: 'Oct 8, 2026', revenue: 76800, products: 2471, sales: 1877 },
  { id: 'b-104', name: 'City Market', owner: 'Grace Wanjiru', plan: 'Starter Monthly', status: 'Suspended', users: 5, created: 'Oct 5, 2026', revenue: 54300, products: 621, sales: 334 },
  { id: 'b-105', name: 'BlueStore', owner: 'Peter Kamau', plan: 'Business Monthly', status: 'Trial', users: 7, created: 'Oct 3, 2026', revenue: 32100, products: 144, sales: 93 },
  { id: 'b-106', name: 'Mwangaza Hardware', owner: 'Alice Njeri', plan: 'Starter Monthly', status: 'Active', users: 4, created: 'Sep 28, 2026', revenue: 20500, products: 530, sales: 210 },
  { id: 'b-107', name: 'GreenBasket Naivasha', owner: 'Omar Hassan', plan: 'Business Monthly', status: 'Active', users: 6, created: 'Sep 22, 2026', revenue: 41800, products: 811, sales: 418 },
  { id: 'b-108', name: 'Nairobi Office Supplies', owner: 'Faith Mutua', plan: 'Starter Monthly', status: 'Active', users: 3, created: 'Sep 17, 2026', revenue: 17400, products: 268, sales: 125 },
];
const users: PlatformUser[] = [
  { id: 'u-2101', name: 'John Mwangi', email: 'john@freshmart.co.ke', role: 'Business owner', business: 'FreshMart Grocery', status: 'Active', lastActive: '12 min ago' },
  { id: 'u-2102', name: 'Sarah Wanjiku', email: 'sarah@techstore.co.ke', role: 'Business owner', business: 'TechStore Electronics', status: 'Active', lastActive: '38 min ago' },
  { id: 'u-2103', name: 'Admin User', email: 'admin@mandela.co.ke', role: 'Platform admin', business: 'Platform', status: 'Active', lastActive: 'Now' },
  { id: 'u-2104', name: 'David Ochieng', email: 'david@quickshop.co.ke', role: 'Business owner', business: 'QuickShop Ltd', status: 'Active', lastActive: '1 hour ago' },
  { id: 'u-2105', name: 'Grace Wanjiru', email: 'grace@citymarket.co.ke', role: 'Business owner', business: 'City Market', status: 'Suspended', lastActive: '3 days ago' },
  { id: 'u-2106', name: 'Alice Njeri', email: 'alice@mwangazahardware.co.ke', role: 'Business owner', business: 'Mwangaza Hardware', status: 'Active', lastActive: '2 hours ago' },
  { id: 'u-2107', name: 'Omar Hassan', email: 'omar@greenbasket.co.ke', role: 'Business owner', business: 'GreenBasket Naivasha', status: 'Active', lastActive: '3 hours ago' },
  { id: 'u-2108', name: 'Faith Mutua', email: 'faith@nairobi-office.co.ke', role: 'Business owner', business: 'Nairobi Office Supplies', status: 'Active', lastActive: 'Yesterday' },
];
const subscriptions: Subscription[] = [
  { id: 'SUB-3401', business: 'FreshMart Grocery', plan: 'Pro', amount: 9999, cycle: 'Monthly', nextBilling: 'Nov 12, 2026', status: 'Active' },
  { id: 'SUB-3402', business: 'TechStore Electronics', plan: 'Business', amount: 4999, cycle: 'Monthly', nextBilling: 'Nov 10, 2026', status: 'Active' },
  { id: 'SUB-3403', business: 'QuickShop Ltd', plan: 'Pro', amount: 99990, cycle: 'Annually', nextBilling: 'Oct 8, 2027', status: 'Active' },
  { id: 'SUB-3404', business: 'City Market', plan: 'Starter', amount: 1999, cycle: 'Monthly', nextBilling: 'Past due', status: 'Overdue' },
  { id: 'SUB-3405', business: 'BlueStore', plan: 'Business', amount: 4999, cycle: 'Monthly', nextBilling: 'Trial ends Oct 31', status: 'Pending' },
  { id: 'SUB-3406', business: 'Mwangaza Hardware', plan: 'Starter', amount: 1999, cycle: 'Monthly', nextBilling: 'Nov 28, 2026', status: 'Active' },
  { id: 'SUB-3407', business: 'GreenBasket Naivasha', plan: 'Business', amount: 4999, cycle: 'Monthly', nextBilling: 'Nov 22, 2026', status: 'Active' },
  { id: 'SUB-3408', business: 'Nairobi Office Supplies', plan: 'Starter', amount: 1999, cycle: 'Monthly', nextBilling: 'Nov 17, 2026', status: 'Active' },
];
const invoices: Invoice[] = [
  { id: 'INV-2091', business: 'FreshMart Grocery', amount: 9999, date: 'Oct 28, 2026', status: 'Paid' },
  { id: 'INV-2090', business: 'QuickShop Ltd', amount: 99990, date: 'Oct 27, 2026', status: 'Paid' },
  { id: 'INV-2089', business: 'TechStore Electronics', amount: 4999, date: 'Oct 25, 2026', status: 'Paid' },
  { id: 'INV-2088', business: 'City Market', amount: 1999, date: 'Oct 20, 2026', status: 'Overdue' },
  { id: 'INV-2087', business: 'BlueStore', amount: 4999, date: 'Oct 23, 2026', status: 'Pending' },
];
const auditEntries: AuditEntry[] = [
  { date: 'Oct 28, 2026 · 14:32', event: 'New business registered', actor: 'Platform system', details: 'FreshMart Grocery', result: 'Demo' },
  { date: 'Oct 28, 2026 · 12:15', event: 'Subscription renewed', actor: 'Billing service', details: 'QuickShop Ltd Pro', result: 'Demo' },
  { date: 'Oct 28, 2026 · 10:42', event: 'Payment received', actor: 'Billing service', details: 'KSh 9,999 · FreshMart Grocery', result: 'Demo' },
  { date: 'Oct 27, 2026 · 18:07', event: 'Business suspended', actor: 'Admin User', details: 'City Market', result: 'Demo' },
  { date: 'Oct 27, 2026 · 09:21', event: 'Platform settings updated', actor: 'Admin User', details: 'Notification preferences', result: 'Demo' },
];
const platformSettings = {
  platformName: 'Mandela Generals',
  supportEmail: 'support@mandelagenerals.co.ke',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  preferences: {
    'New tenant registration': true,
    'Trial notifications': true,
    'Payment reminders': true,
    'Platform maintenance mode': false,
    'Product usage analytics': true,
  } as Record<string, boolean>,
};
const plans: SubscriptionPlan[] = [
  { name: 'Starter', description: 'Inventory essentials for small teams.', monthlyPrice: 1999, annualPrice: 19990, trialDays: 14, userLimit: 3, branchLimit: 1, productLimit: 1000, features: ['Inventory', 'Basic reports'], renewalPolicy: 'Auto-renew', active: true },
  { name: 'Business', description: 'Multi-user stock and POS management.', monthlyPrice: 4999, annualPrice: 49990, trialDays: 14, userLimit: 10, branchLimit: 5, productLimit: 10000, features: ['Inventory', 'POS', 'Multi-branch'], renewalPolicy: 'Auto-renew', active: true },
  { name: 'Pro', description: 'Advanced analytics and automation.', monthlyPrice: 9999, annualPrice: 99990, trialDays: 14, userLimit: 25, branchLimit: 20, productLimit: 50000, features: ['Inventory', 'POS', 'Analytics', 'Automation'], renewalPolicy: 'Auto-renew', active: true },
  { name: 'Enterprise', description: 'Flexible controls for larger operations.', monthlyPrice: 0, annualPrice: 0, trialDays: 30, userLimit: 100, branchLimit: 100, productLimit: 250000, features: ['Inventory', 'POS', 'Analytics', 'Priority support'], renewalPolicy: 'Manual', active: true },
];
const notifications: PlatformNotification[] = [
  { icon: 'plus', color: '', title: 'New business registered', detail: 'FreshMart Grocery', time: '2 hours ago', read: false },
  { icon: 'check', color: 'blue', title: 'Subscription renewed', detail: 'QuickShop Ltd Pro', time: '4 hours ago', read: false },
  { icon: 'card', color: 'teal', title: 'Payment received', detail: 'KSh 4,999 · TechStore Electronics', time: '6 hours ago', read: false },
  { icon: 'users', color: 'purple', title: 'User added', detail: 'Admin · BlueStore', time: '8 hours ago', read: true },
  { icon: 'close', color: 'red', title: 'Business suspended', detail: 'City Market', time: '12 hours ago', read: true },
];
const navItems: Array<{ id: Section; label: string; icon: string; group?: string }> = [
  { id: 'overview', label: 'Dashboard', icon: 'dashboard', group: 'PLATFORM' },
  { id: 'businesses', label: 'Businesses', icon: 'business' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'card' },
  { id: 'users', label: 'Users & Roles', icon: 'users' },
  { id: 'billing', label: 'Billing & Payments', icon: 'billing', group: 'OPERATIONS' },
  { id: 'inventory', label: 'Inventory & POS Overview', icon: 'inventory' },
  { id: 'reports', label: 'Reports & Analytics', icon: 'chart', group: 'MANAGE' },
  { id: 'settings', label: 'Platform Settings', icon: 'settings' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', group: 'SECURITY' },
  { id: 'audit', label: 'Audit Logs', icon: 'audit' },
];

let currentSection: Section = 'overview';
let currentUserName = 'Platform Administrator';
let toastTimer = 0;
let businessSearch = '';
let businessStatusFilter = 'All statuses';
let businessSort: { key: 'name' | 'owner' | 'plan' | 'created'; direction: 'asc' | 'desc' } = { key: 'created', direction: 'desc' };
let businessPage = 1;
const businessPageSize = 5;
let chartRange = 'Last 30 days';
let usageRange = 'Last 30 days';
let firestoreBusinesses: Business[] | null = null;
let firestoreBusinessesLoading = false;
let firestoreBusinessesError = '';
let firestoreTenantAdmins: PlatformTenantAdmin[] | null = null;
let firestoreTenantAdminsLoading = false;
let firestoreTenantAdminsError = '';

function recordActivity(title: string, detail: string, activityIcon = 'check'): void {
  notifications.unshift({ title, detail, time: 'Just now', icon: activityIcon, color: '', read: false });
  auditEntries.unshift({
    date: `${new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date())} · ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}`,
    event: title,
    actor: currentUserName,
    details: detail,
    result: 'Demo',
  });
}

function activeNotificationCount(): number {
  return notifications.filter((notification) => !notification.read).length;
}

function filteredBusinesses(useFirestore = false): Business[] {
  const records = useFirestore ? firestoreBusinesses ?? [] : businesses;
  return records.filter((business) => {
    const matchSearch = `${business.name} ${business.owner} ${business.plan}`.toLowerCase().includes(businessSearch.toLowerCase());
    return matchSearch && (businessStatusFilter === 'All statuses' || business.status === businessStatusFilter);
  }).sort((left, right) => {
    if (businessSort.key === 'created') {
      return (Date.parse(left.created) - Date.parse(right.created)) * (businessSort.direction === 'asc' ? 1 : -1);
    }
    return left[businessSort.key].localeCompare(right[businessSort.key], undefined, { numeric: true }) * (businessSort.direction === 'asc' ? 1 : -1);
  });
}

function businessPagination(useFirestore = false): string {
  const count = filteredBusinesses(useFirestore).length;
  const pageCount = Math.max(1, Math.ceil(count / businessPageSize));
  businessPage = Math.min(businessPage, pageCount);
  const first = count ? (businessPage - 1) * businessPageSize + 1 : 0;
  return `<div class="table-pagination"><span>${count ? `Showing ${first}–${Math.min(businessPage * businessPageSize, count)} of ${count} businesses` : 'No records'}</span><div><button class="secondary-button" data-action="business-page" data-source="${useFirestore ? 'firestore' : 'demo'}" data-direction="-1" ${businessPage <= 1 ? 'disabled' : ''}>Previous</button><button class="secondary-button" data-action="business-page" data-source="${useFirestore ? 'firestore' : 'demo'}" data-direction="1" ${businessPage >= pageCount ? 'disabled' : ''}>Next</button></div></div>`;
}
function shell(userName: string): string {
  return `<div class="admin-layout">
    <aside class="admin-sidebar" id="admin-sidebar">
      <a class="admin-brand" href="${import.meta.env.BASE_URL}platform-admin.html" aria-label="Mandela platform admin home">
        <span class="brand-mark">${icon('inventory')}</span><span class="brand-name">Mandela<small>SaaS Platform Admin</small></span>
      </a>
      <nav class="admin-nav" aria-label="Platform administration">
        ${navItems.map((item) => `${item.group ? `<span class="nav-caption">${item.group}</span>` : ''}<a href="#${item.id}" class="admin-nav-link${item.id === currentSection ? ' active' : ''}" aria-current="${item.id === currentSection ? 'page' : 'false'}" data-section="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.id === 'notifications' && activeNotificationCount() ? `<span class="nav-count">${activeNotificationCount()}</span>` : ''}</a>`).join('')}
      </nav>
      <div class="sidebar-note"><strong>Demo data</strong>Records and changes on this page are illustrative and reset when you reload.</div>
      <div class="sidebar-footer">Mandela Generals · v1.0.0<br>© 2026 Mandela. All rights reserved.</div>
    </aside>
    <button class="overlay" id="sidebar-overlay" aria-label="Close navigation"></button>
    <main class="admin-main">
      <header class="admin-topbar">
        <button id="mobile-menu" class="mobile-menu" aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button>
        <button id="sidebar-collapse" class="topbar-icon sidebar-collapse" aria-label="Collapse sidebar" title="Collapse sidebar">${icon('menu')}</button>
        <label class="global-search">${icon('search')}<input id="global-search-input" type="search" placeholder="Search businesses, users, plans, or anything..." aria-label="Search platform"></label>
        <span class="topbar-spacer"></span>
        <button id="notification-button" class="topbar-icon" aria-label="Open notifications">${icon('bell')}${activeNotificationCount() ? `<span class="notification-dot">${activeNotificationCount()}</span>` : ''}</button>
        <button id="user-menu" class="user-menu" aria-label="Account menu"><span class="user-avatar">${escapeHtml(userName.slice(0, 1).toUpperCase())}</span><span class="user-menu-text"><strong>${escapeHtml(userName)}</strong><span>Platform Administrator</span></span>${icon('down')}</button>
        <div id="account-menu" class="account-menu" hidden><button data-section="settings">Platform settings</button><button data-action="sign-out">${icon('logout')} Sign out</button></div>
      </header>
      <div id="admin-content" class="admin-content"></div>
    </main>
    <div id="admin-toast" class="admin-toast" role="status" aria-live="polite" hidden></div>
    <div id="admin-modal-root"></div>
  </div>`;
}

function heading(title: string, description: string, action = ''): string {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${action}</div></div>`;
}

function metricCard(label: string, value: string, foot: string, color: string, iconName: string, muted = false): string {
  return `<article class="card stat-card"><span class="stat-icon ${color}">${icon(iconName)}</span><div class="stat-copy"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="stat-foot${muted ? ' muted' : ''}">${muted ? '' : icon('trend')}${foot}</span></div></article>`;
}

function statusPill(status: string): string {
  const statusClass = status.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `<span class="status-pill status-${statusClass}">${escapeHtml(status)}</span>`;
}

function businessRows(useFirestore = false): string {
  const filtered = filteredBusinesses(useFirestore);
  const pageCount = Math.max(1, Math.ceil(filtered.length / businessPageSize));
  businessPage = Math.min(businessPage, pageCount);
  const visible = filtered.slice((businessPage - 1) * businessPageSize, businessPage * businessPageSize);
  const rows = visible.map((business) => `<tr>
    <td><span class="business-cell"><span class="business-mark">${icon('business')}</span><span class="business-name">${escapeHtml(business.name)}</span></span></td>
    <td>${escapeHtml(business.owner)}</td><td>${escapeHtml(business.plan)}</td><td>${statusPill(business.status)}</td>
    <td>${business.users === null ? '—' : business.users}</td><td>${escapeHtml(business.created)}</td><td><div class="row-actions"><button class="row-action" data-action="${useFirestore ? 'firestore-business-details' : 'business-details'}" data-id="${escapeHtml(business.id)}" aria-label="View ${escapeHtml(business.name)}">${icon('more')}</button>${useFirestore ? '' : `<button class="row-action" data-action="business-menu" data-id="${escapeHtml(business.id)}" aria-label="${business.status === 'Suspended' ? 'Reactivate' : 'Suspend'} ${escapeHtml(business.name)}">${icon(business.status === 'Suspended' ? 'check' : 'close')}</button>`}</div></td>
  </tr>`).join('');
  return rows || '<tr><td colspan="7" class="empty-state">No businesses match these filters.</td></tr>';
}

function businessTable(useFirestore = false): string {
  const records = useFirestore ? firestoreBusinesses ?? [] : businesses;
  const emptyMessage = useFirestore
    ? `No businesses are registered in the ${firebaseEnvironment} Firestore project.`
    : 'No businesses match these filters.';
  return `<article class="card table-card">
    <div class="card-heading"><div><h2>${useFirestore ? 'Registered businesses' : 'Recent Businesses'}</h2><p>${useFirestore ? `Live records from the ${firebaseEnvironment} Firestore project.` : 'Demonstration tenant records.'}</p></div><div class="table-tools">
      <input id="business-search" type="search" placeholder="Search businesses..." value="${escapeHtml(businessSearch)}" aria-label="Search businesses">
      <select id="business-status-filter" aria-label="Filter by business status"><option>All statuses</option>${(useFirestore ? ['Active', 'Suspended', 'Trial', 'Unknown'] : ['Active', 'Suspended', 'Trial']).map((status) => `<option${businessStatusFilter === status ? ' selected' : ''}>${status}</option>`).join('')}</select>
      ${useFirestore ? `<span class="firestore-source-badge">${firebaseEnvironment === 'development' ? 'Development' : 'Production'} Firestore · read only</span>` : `<button class="primary-button" data-action="add-business">${icon('plus')} Add Business</button>`}
    </div></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th><button class="sort-button" data-sort-business="name">Business Name</button></th><th><button class="sort-button" data-sort-business="owner">Owner</button></th><th><button class="sort-button" data-sort-business="plan">Plan</button></th><th>Status</th><th>Users</th><th><button class="sort-button" data-sort-business="created">Created</button></th><th>Actions</th></tr></thead><tbody id="business-rows">${useFirestore && !records.length ? `<tr><td colspan="7" class="empty-state">${emptyMessage}</td></tr>` : businessRows(useFirestore)}</tbody></table></div>
    ${businessPagination(useFirestore)}
  </article>`;
}

function chartCard(): string {
  return `<article class="card"><div class="card-heading"><div><h2>Subscription Revenue Trend</h2><p>Mandela SaaS billing · illustrative data</p></div><select class="date-select" id="chart-range" aria-label="Revenue chart range">${['Last 30 days', 'Last 7 days', 'Last 12 months'].map((range) => `<option${chartRange === range ? ' selected' : ''}>${range}</option>`).join('')}</select></div><div class="chart-wrap"><canvas id="revenue-chart" role="img" aria-label="Illustrative subscription revenue trend chart"></canvas></div></article>`;
}

function statusCard(): string {
  const total = businesses.length;
  const counts = {
    Active: businesses.filter((business) => business.status === 'Active').length,
    Suspended: businesses.filter((business) => business.status === 'Suspended').length,
    Trial: businesses.filter((business) => business.status === 'Trial').length,
  };
  const activeDegrees = total ? counts.Active / total * 100 : 0;
  const suspendedDegrees = total ? activeDegrees + counts.Suspended / total * 100 : 0;
  return `<article class="card"><div class="card-heading"><div><h2>Business Status</h2><p>Current sample tenant distribution</p></div></div><div class="status-card-body"><div class="donut" role="img" aria-label="${counts.Active} active, ${counts.Suspended} suspended, ${counts.Trial} trial" style="background:conic-gradient(#12b982 0 ${activeDegrees}%, #f5a623 ${activeDegrees}% ${suspendedDegrees}%, #3187f8 ${suspendedDegrees}% 100%)"><div class="donut-inner"><strong>${total}</strong><span>Businesses</span></div></div><div class="legend">${(['Active', 'Suspended', 'Trial'] as const).map((status) => `<div class="legend-row"><i class="legend-dot${status === 'Suspended' ? ' amber' : status === 'Trial' ? ' blue' : ''}"></i><span>${status}</span><strong>${counts[status]} (${total ? (counts[status] / total * 100).toFixed(1) : '0.0'}%)</strong></div>`).join('')}</div></div></article>`;
}

function activityCard(): string {
  return `<article class="card activity-card"><div class="card-heading"><h2>Recent Platform Activity</h2><button class="small-link" data-section="audit">View all ${icon('arrow')}</button></div><div class="activity-list">${notifications.slice(0, 5).map((activity) => `<div class="activity-row"><span class="activity-icon ${activity.color}">${icon(activity.icon)}</span><div class="activity-copy"><strong>${escapeHtml(activity.title)}</strong><span>${escapeHtml(activity.detail)}</span></div><span class="activity-time">${escapeHtml(activity.time)}</span></div>`).join('')}</div></article>`;
}

function miniLists(): string {
  const topBusinesses = [...businesses].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const plansSummary = plans.map((plan) => ({ ...plan, count: subscriptions.filter((subscription) => subscription.plan === plan.name).length }));
  const transactions = [...invoices].sort((left, right) => Date.parse(right.date) - Date.parse(left.date)).slice(0, 4);
  return `<div class="lower-grid">
    <article class="card"><div class="card-heading"><div><h2>Top Businesses by Sales Value</h2><p>Tenant sales activity, not Mandela subscription revenue</p></div><button class="small-link" data-section="reports">View all ${icon('arrow')}</button></div><div class="mini-list">${topBusinesses.map((business) => `<div class="mini-row"><span class="mini-row-name">${escapeHtml(business.name)}</span><span class="mini-bar"><span style="width:${Math.max(12, business.revenue / 1300)}%"></span></span><span class="mini-row-value">${currency(business.revenue)}</span></div>`).join('')}</div></article>
    <article class="card"><div class="card-heading"><h2>Subscription Plans</h2><button class="small-link" data-section="subscriptions">View all ${icon('arrow')}</button></div><div class="mini-list">${plansSummary.map((plan) => `<div class="plan-row"><span class="plan-icon">${escapeHtml(plan.name.slice(0,1))}</span><strong>${escapeHtml(plan.name)}</strong><small>${plan.monthlyPrice ? `${currency(plan.monthlyPrice)} / month` : 'Custom pricing'}</small><span>${plan.count}</span></div>`).join('')}</div></article>
    <article class="card"><div class="card-heading"><h2>Recent Transactions</h2><button class="small-link" data-section="billing">View all ${icon('arrow')}</button></div><div class="mini-list">${transactions.map((transaction) => `<div class="transaction-row"><strong>${currency(transaction.amount)}</strong><span>${escapeHtml(transaction.business)}<small class="muted-cell"> · ${escapeHtml(transaction.date)}</small></span>${statusPill(transaction.status)}</div>`).join('')}</div></article>
  </div>`;
}

function quickActionsCard(): string {
  return `<article class="card quick-actions-card"><div class="card-heading"><h2>Quick Actions</h2></div><div class="quick-actions-list">
    <button class="quick-action" data-action="add-business"><span class="quick-action-icon blue">${icon('plus')}</span><span><strong>Register New Business</strong><small>Add a new tenant to the platform</small></span></button>
    <button class="quick-action" data-section="subscriptions"><span class="quick-action-icon cyan">${icon('card')}</span><span><strong>Manage Subscriptions</strong><small>View and update subscription plans</small></span></button>
    <button class="quick-action" data-section="billing"><span class="quick-action-icon green">${icon('billing')}</span><span><strong>View Invoices</strong><small>Review sample billing activity</small></span></button>
    <button class="quick-action" data-section="settings"><span class="quick-action-icon navy">${icon('settings')}</span><span><strong>System Settings</strong><small>Configure platform-wide settings</small></span></button>
  </div></article>`;
}

function overview(): string {
  const activeBusinesses = businesses.filter((business) => business.status === 'Active').length;
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'Active').length;
  const mrr = subscriptions.filter((subscription) => subscription.status === 'Active')
    .reduce((total, subscription) => total + (subscription.cycle === 'Annually' ? subscription.amount / 12 : subscription.amount), 0);
  const collected = invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);
  const outstanding = invoices.filter((invoice) => invoice.status === 'Pending' || invoice.status === 'Overdue')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  return `${heading('Platform Dashboard', 'Overview of your SaaS platform, businesses, subscriptions and revenue.', `<select class="date-select" id="dashboard-range" aria-label="Dashboard date range">${['Last 30 days', 'Last 7 days', 'Last 12 months'].map((range) => `<option${chartRange === range ? ' selected' : ''}>${range}</option>`).join('')}</select>`)}
    <div class="sample-data-note">Demonstration data · Tenant sales are separate from Mandela SaaS subscription revenue.</div>
    <div class="overview-layout">
      <div class="overview-primary">
        <section class="stats-grid" aria-label="Platform metrics">
          ${metricCard('Total Businesses', String(businesses.length), `${activeBusinesses} active`, 'blue', 'business', true)}
          ${metricCard('Active Subscriptions', String(activeSubscriptions), `${subscriptions.filter((subscription) => subscription.status === 'Pending').length} trial / pending`, 'green', 'card', true)}
          ${metricCard('Total Users', String(users.length), 'Sample platform accounts', 'purple', 'users', true)}
          ${metricCard('Monthly Recurring Revenue', currency(mrr), 'Normalized subscription value', 'teal', 'billing', true)}
          ${metricCard('Outstanding Payments', currency(outstanding), 'SaaS invoices only', 'orange', 'clock', true)}
        </section>
        <section class="overview-chart-grid">${chartCard()}${statusCard()}</section>
        ${businessTable()}${miniLists()}
      </div>
      <aside class="overview-rail">${activityCard()}${quickActionsCard()}</aside>
    </div>
    <p class="dashboard-footnote">Collected demo invoices: ${currency(collected)} · Suspended businesses: ${businesses.filter((business) => business.status === 'Suspended').length} · Renewals due in the next 30 days: ${subscriptions.filter((subscription) => subscription.status === 'Active' && subscription.nextBilling.includes('Nov')).length}</p>`;
}

function businessesSection(): string {
  if (firestoreBusinessesLoading) {
    return `${heading('Businesses', 'Registered business tenants from Firestore.')}<div class="card business-load-state" role="status" aria-live="polite"><span class="loading-mark" aria-hidden="true"></span><p>Loading businesses from ${firebaseEnvironment} Firestore…</p></div>`;
  }
  if (firestoreBusinessesError) {
    return `${heading('Businesses', 'Registered business tenants from Firestore.')}<div class="card business-load-state" role="alert"><strong>Could not load Firestore businesses.</strong><p>${escapeHtml(firestoreBusinessesError)}</p><button class="primary-button" data-action="retry-business-load">Retry</button></div>`;
  }
  if (!firestoreBusinesses) {
    return `${heading('Businesses', 'Registered business tenants from Firestore.')}<div class="card business-load-state"><p>Business records have not been loaded yet.</p><button class="primary-button" data-action="retry-business-load">Load businesses</button></div>`;
  }
  return `${heading('Businesses', 'Browse live tenant records and account details.', `<button class="secondary-button" data-action="refresh-businesses">${icon('trend')} Refresh</button>`)}${businessTable(true)}`;
}

async function loadFirestoreBusinesses(): Promise<void> {
  if (firestoreBusinessesLoading) return;
  firestoreBusinessesLoading = true;
  firestoreBusinessesError = '';
  renderSection();
  try {
    const [platformBusinesses, platformUsers] = await Promise.all([
      getPlatformBusinesses(),
      getPlatformUsers(),
    ]);
    const usersById = new Map(platformUsers.map((user) => [user.id, user]));
    firestoreBusinesses = platformBusinesses.map((business) => {
      const owner = usersById.get(business.ownerId);
      const createdDate = business.createdAt ? new Date(business.createdAt) : null;
      const rawStatus = business.status?.toLowerCase();
      const status: BusinessStatus = rawStatus === 'active'
        ? 'Active'
        : rawStatus === 'suspended'
          ? 'Suspended'
          : rawStatus === 'trial'
            ? 'Trial'
            : 'Unknown';
      return {
        id: business.id,
        name: business.name,
        owner: owner?.displayName || 'Unknown owner',
        ownerEmail: owner?.email || '',
        plan: business.plan || 'Not assigned',
        status,
        users: null,
        created: createdDate && !Number.isNaN(createdDate.getTime())
          ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(createdDate)
          : 'Unknown',
        revenue: 0,
        products: 0,
        sales: 0,
        isFirestoreRecord: true,
      };
    });
  } catch (error) {
    firestoreBusinessesError = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while loading business records.';
  } finally {
    firestoreBusinessesLoading = false;
    renderSection();
  }
}

function subscriptionsSection(): string {
  const rows = subscriptions.map((sub) => `<tr><td>${escapeHtml(sub.id)}</td><td>${escapeHtml(sub.business)}</td><td>${escapeHtml(sub.plan)}</td><td>${currency(sub.amount)}</td><td>${escapeHtml(sub.cycle)}</td><td>${escapeHtml(sub.nextBilling)}</td><td>${statusPill(sub.status)}</td><td><button class="row-action" data-action="subscription" data-id="${escapeHtml(sub.id)}" aria-label="Manage subscription ${escapeHtml(sub.id)}">${icon('more')}</button></td></tr>`).join('');
  return `${heading('Subscriptions', 'Manage plans, billing cycles, renewals and subscription health.', `<button class="primary-button" data-action="add-plan">${icon('plus')} Create plan</button>`)}
    <p class="sample-data-note">Sample records only. Subscription changes are temporary and do not alter billing or tenant access.</p>
    <section class="stats-grid">${metricCard('Active Plans', String(plans.filter((plan) => plan.active).length), 'Available plan templates', 'blue', 'card', true)}${metricCard('Active Subscriptions', String(subscriptions.filter((sub) => sub.status === 'Active').length), 'Across sample businesses', 'green', 'check', true)}${metricCard('Trial / pending', String(subscriptions.filter((sub) => sub.status === 'Pending' || sub.status === 'Trial').length), 'Requires billing integration', 'purple', 'clock', true)}</section>
    <article class="card table-card"><div class="card-heading"><div><h2>Business subscriptions</h2><p>Plan status and upcoming billing</p></div><div class="table-tools"><input type="search" data-table-search="subscriptions" placeholder="Search subscriptions..."><select data-table-filter="subscriptions"><option>All statuses</option><option>Active</option><option>Trial</option><option>Pending</option><option>Overdue</option><option>Cancelled</option><option>Expired</option><option>Suspended</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Subscription</th><th>Business</th><th>Plan</th><th>Price</th><th>Cycle</th><th>Next billing</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></article>
    <div class="section-grid">${plans.map((plan) => {
      const count = subscriptions.filter((subscription) => subscription.plan === plan.name).length;
      return `<article class="card section-card"><div class="plan-card-heading"><h3>${escapeHtml(plan.name)}</h3>${statusPill(plan.active ? 'Active' : 'Suspended')}</div><strong class="section-stat">${plan.monthlyPrice ? `${currency(plan.monthlyPrice)} / month` : 'Custom pricing'}</strong><p>${count} sample subscriptions · ${escapeHtml(plan.description)}<br>Annual: ${plan.annualPrice ? currency(plan.annualPrice) : 'Custom'} · Trial: ${plan.trialDays} days · Users: ${plan.userLimit} · Branches: ${plan.branchLimit} · Products: ${plan.productLimit}<br>Renewal: ${plan.renewalPolicy} · Features: ${escapeHtml(plan.features.join(', '))}</p><div class="plan-card-actions"><button class="secondary-button" data-action="edit-plan" data-id="${escapeHtml(plan.name)}">Edit plan</button><button class="secondary-button" data-action="toggle-plan" data-id="${escapeHtml(plan.name)}">${plan.active ? 'Deactivate' : 'Reactivate'}</button></div></article>`;
    }).join('')}</div>`;
}

function usersSection(): string {
  const headingActions = firestoreTenantAdmins
    ? `<button class="secondary-button" data-action="refresh-tenant-admins">${icon('trend')} Refresh</button>`
    : '';
  if (firestoreTenantAdminsLoading) {
    return `${heading('Users & Roles', 'Tenant owners and administrators from Firestore.')}<div class="card business-load-state" role="status" aria-live="polite"><span class="loading-mark" aria-hidden="true"></span><p>Loading tenant administrators from ${firebaseEnvironment} Firestore…</p></div>`;
  }
  if (firestoreTenantAdminsError) {
    return `${heading('Users & Roles', 'Tenant owners and administrators from Firestore.')}<div class="card business-load-state" role="alert"><strong>Could not load tenant administrators.</strong><p>${escapeHtml(firestoreTenantAdminsError)}</p><button class="primary-button" data-action="retry-tenant-admins">Retry</button></div>`;
  }
  if (!firestoreTenantAdmins) {
    return `${heading('Users & Roles', 'Tenant owners and administrators from Firestore.')}<div class="card business-load-state"><p>Tenant administrator records have not been loaded yet.</p><button class="primary-button" data-action="retry-tenant-admins">Load administrators</button></div>`;
  }

  const tenantAdmins = firestoreTenantAdmins;
  const activeCount = tenantAdmins.filter((admin) => admin.active === true).length;
  const ownerCount = tenantAdmins.filter((admin) => admin.role === 'owner').length;
  const rows = tenantAdmins.map((admin) => {
    const name = admin.displayName || 'Unknown user';
    const membershipStatus = admin.active === true ? 'Active' : admin.active === false ? 'Inactive' : 'Unknown';
    const roleLabel = admin.role === 'owner' ? 'Tenant owner' : 'Tenant admin';
    return `<tr><td><span class="user-cell"><span class="user-avatar">${escapeHtml(name.slice(0,1))}</span>${escapeHtml(name)}</span></td><td>${escapeHtml(admin.email || 'Not available')}</td><td>${roleLabel}</td><td>${escapeHtml(admin.businessName)}</td><td>${statusPill(membershipStatus)}</td></tr>`;
  }).join('');
  return `${heading('Users & Roles', 'Tenant owners and administrators from Firestore.', headingActions)}
    <p class="sample-data-note">${firebaseEnvironment === 'development' ? 'Development' : 'Production'} Firestore · active and inactive owner/admin memberships · read only. Platform administrator accounts are managed separately.</p>
    <section class="stats-grid">${metricCard('Tenant Admins', String(tenantAdmins.length), 'Owner and admin memberships', 'blue', 'users', true)}${metricCard('Active Memberships', String(activeCount), 'Currently active tenant access', 'green', 'check', true)}${metricCard('Tenant Owners', String(ownerCount), 'Owner-role memberships', 'purple', 'business', true)}</section>
    <article class="card table-card"><div class="card-heading"><div><h2>Tenant administrators</h2><p>One row per owner/admin membership</p></div><div class="table-tools"><input type="search" data-table-search="users" placeholder="Search users or tenants..."><select data-table-filter="users"><option>All roles</option><option>Owner</option><option>Admin</option></select><select data-table-filter="users"><option>All statuses</option><option>Active</option><option>Inactive</option><option>Unknown</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>User</th><th>Email</th><th>Tenant role</th><th>Business</th><th>Membership status</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty-state">No tenant owner or admin memberships were found.</td></tr>'}</tbody></table></div></article>
    <article class="card section-card"><h3>Role-based access control</h3><p>Tenant owner/admin membership roles are read from Firestore. Platform administrator accounts are separate, and role changes require a trusted backend workflow.</p></article>`;
}

async function loadPlatformTenantAdmins(): Promise<void> {
  if (firestoreTenantAdminsLoading) return;
  firestoreTenantAdminsLoading = true;
  firestoreTenantAdminsError = '';
  renderSection();
  try {
    firestoreTenantAdmins = await getPlatformTenantAdmins();
  } catch (error) {
    firestoreTenantAdminsError = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while loading tenant administrators.';
  } finally {
    firestoreTenantAdminsLoading = false;
    renderSection();
  }
}

function billingSection(): string {
  const collected = invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);
  const outstanding = invoices.filter((invoice) => invoice.status === 'Pending' || invoice.status === 'Overdue').reduce((sum, invoice) => sum + invoice.amount, 0);
  const rows = invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.id)}</td><td>${escapeHtml(invoice.business)}</td><td>${currency(invoice.amount)}</td><td>${escapeHtml(invoice.date)}</td><td>${statusPill(invoice.status)}</td><td><button class="small-link" data-action="invoice" data-id="${escapeHtml(invoice.id)}">View invoice</button></td></tr>`).join('');
  return `${heading('Billing & Payments', 'Mandela SaaS subscription invoices and payment activity. Tenant sales are not included.', `<button class="secondary-button" data-action="export">${icon('billing')} Export report</button>`)}
    <p class="sample-data-note">Illustrative payment data only. Payment processing, invoice documents, refunds, and reconciliation require an authorized backend provider.</p>
    <section class="stats-grid">${metricCard('Collected in sample invoices', currency(collected), 'Paid subscription invoices', 'green', 'trend', true)}${metricCard('Outstanding', currency(outstanding), `${invoices.filter((invoice) => invoice.status === 'Pending' || invoice.status === 'Overdue').length} unpaid invoices`, 'orange', 'clock', true)}${metricCard('Payments received', String(invoices.filter((invoice) => invoice.status === 'Paid').length), 'Sample invoices marked paid', 'blue', 'check', true)}</section>
    <article class="card table-card"><div class="card-heading"><div><h2>Invoices & transactions</h2><p>SaaS subscription billing ledger (sample data)</p></div><div class="table-tools"><input type="search" data-table-search="billing" placeholder="Search invoices..."><select data-table-filter="billing"><option>All statuses</option><option>Paid</option><option>Pending</option><option>Overdue</option><option>Failed</option><option>Refunded</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice</th><th>Business</th><th>Amount</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function inventorySection(): string {
  const products = businesses.reduce((sum, business) => sum + business.products, 0);
  const salesCount = businesses.reduce((sum, business) => sum + business.sales, 0);
  const salesValue = businesses.reduce((sum, business) => sum + business.revenue, 0);
  const activeBusinesses = businesses.filter((business) => business.status === 'Active').length;
  const posTenants = businesses.filter((business) => business.status === 'Active' && business.sales > 0).length;
  const usageRows = businesses.map((business) => {
    const usage = business.sales < 150 ? 'Low usage' : business.status === 'Suspended' ? 'Suspended' : business.status === 'Trial' ? 'Trial' : 'Active usage';
    return `<tr><td>${escapeHtml(business.name)}</td><td>${escapeHtml(business.plan.replace(/ (Monthly|Annual)$/, ''))}</td><td>${business.products.toLocaleString('en-KE')}</td><td>${business.sales.toLocaleString('en-KE')}</td><td>${statusPill(usage)}</td></tr>`;
  }).join('');
  return `${heading('Inventory & POS Overview', 'Monitor aggregated product and point-of-sale adoption across tenants.', `<select class="date-select" id="usage-range" aria-label="Usage reporting period">${['Last 30 days', 'Last 7 days', 'Last 12 months'].map((range) => `<option${usageRange === range ? ' selected' : ''}>${range}</option>`).join('')}</select>`)}
    <p class="sample-data-note">Illustrative usage totals only. Tenant product, stock, customer, and cashier records remain inside each business workspace.</p>
    <section class="stats-grid">${metricCard('Products tracked', products.toLocaleString('en-KE'), 'Across sample tenants', 'blue', 'inventory', true)}${metricCard('Sales transactions', salesCount.toLocaleString('en-KE'), 'Sample aggregate count', 'green', 'trend', true)}${metricCard('Active POS businesses', String(posTenants), `Of ${activeBusinesses} active tenants`, 'purple', 'business', true)}</section>
    <div class="section-grid"><article class="card section-card"><h3>Inventory footprint</h3><strong class="section-stat">${products.toLocaleString('en-KE')} products</strong><p>Sample aggregate records across the listed tenants.</p></article><article class="card section-card"><h3>POS adoption</h3><strong class="section-stat">${posTenants} businesses</strong><p>Active businesses with sample POS activity.</p></article><article class="card section-card"><h3>Tenant sales value</h3><strong class="section-stat">${currency(salesValue)}</strong><p>Illustrative tenant gross sales; not Mandela subscription revenue.</p></article></div>
    <article class="card table-card"><div class="card-heading"><div><h2>Tenant usage summary</h2><p>Aggregate sample usage; no tenant-level operational data exposed.</p></div><div class="table-tools"><input type="search" data-table-search="inventory" placeholder="Search business or plan..."><select data-table-filter="inventory"><option>All usage</option><option>Low usage</option><option>Active usage</option><option>Suspended</option><option>Trial</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Business</th><th>Plan</th><th>Products</th><th>Sales transactions</th><th>Usage status</th></tr></thead><tbody>${usageRows}</tbody></table></div></article>`;
}

function reportsSection(): string {
  const mrr = subscriptions.filter((subscription) => subscription.status === 'Active')
    .reduce((total, subscription) => total + (subscription.cycle === 'Annually' ? subscription.amount / 12 : subscription.amount), 0);
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'Active').length;
  const posTenants = businesses.filter((business) => business.status === 'Active' && business.sales > 0).length;
  return `${heading('Reports & Analytics', 'Sample platform subscription performance, business growth and tenant usage.', `<button class="secondary-button" data-action="export">${icon('chart')} Export report</button>`)}
    <section class="stats-grid">${metricCard('Monthly recurring revenue', currency(mrr), 'Active sample plans; annualized monthly', 'teal', 'trend', true)}${metricCard('Net business growth', `+${businesses.length}`, 'Sample tenant records', 'blue', 'business', true)}${metricCard('Active subscription rate', `${subscriptions.length ? (subscriptions.filter((subscription) => subscription.status === 'Active').length / subscriptions.length * 100).toFixed(1) : '0.0'}%`, 'Of sample subscriptions', 'green', 'check', true)}</section>
    <div class="dashboard-grid">${chartCard()}${statusCard()}<article class="card section-card"><h3>Platform health</h3><strong class="section-stat">99.9%</strong><p>Sample service availability this month</p><div class="progress-track"><span style="width:99%"></span></div></article></div>
    <div class="section-grid">${[['Business records', `${businesses.length} tenants`, 'Illustrative registered tenant records', 76], ['Subscription performance', `${activeSubscriptions} active`, 'Sample active subscriptions', activeSubscriptions / Math.max(1, subscriptions.length) * 100], ['POS adoption', `${posTenants} businesses`, 'Active sample businesses with POS activity', posTenants / Math.max(1, businesses.filter((business) => business.status === 'Active').length) * 100]].map(([title, value, detail, width]) => `<article class="card section-card"><h3>${title}</h3><strong class="section-stat">${value}</strong><p>${detail}</p><div class="progress-track"><span style="width:${width}%"></span></div></article>`).join('')}</div>`;
}

function settingsSection(): string {
  const settings = [
    ['New tenant registration', 'Allow businesses to create an account and start a trial.'],
    ['Trial notifications', 'Notify platform administrators when a trial is nearing expiry.'],
    ['Payment reminders', 'Send billing reminders for upcoming and overdue invoices.'],
    ['Platform maintenance mode', 'Temporarily block tenant sign-ins during maintenance.'],
    ['Product usage analytics', 'Collect aggregated, non-sensitive platform usage metrics.'],
  ] as const;
  return `${heading('Platform Settings', 'Configure global preferences for the SaaS service.')}
    <p class="sample-data-note">These controls are illustrative only. Enforce security, authorization and configuration changes through trusted backend services.</p>
    <div class="section-grid"><article class="card section-card"><h3>Platform identity</h3><p>Branding displayed across Mandela Generals.</p><div class="form-field"><label for="platform-name">Platform name</label><input id="platform-name" name="platformName" class="field-control" value="${escapeHtml(platformSettings.platformName)}" required></div><div class="form-field"><label for="support-email">Support email</label><input id="support-email" name="supportEmail" type="email" class="field-control" value="${escapeHtml(platformSettings.supportEmail)}" required></div></article><article class="card section-card"><h3>Regional defaults</h3><p>Default formatting for platform invoices and reports.</p><div class="form-field"><label for="default-currency">Currency</label><select id="default-currency" name="currency" class="field-control"><option value="KES"${platformSettings.currency === 'KES' ? ' selected' : ''}>KES — Kenyan Shilling</option><option value="USD"${platformSettings.currency === 'USD' ? ' selected' : ''}>USD — US Dollar</option></select></div><div class="form-field"><label for="default-timezone">Timezone</label><select id="default-timezone" name="timezone" class="field-control"><option value="Africa/Nairobi"${platformSettings.timezone === 'Africa/Nairobi' ? ' selected' : ''}>Africa/Nairobi (EAT)</option><option value="UTC"${platformSettings.timezone === 'UTC' ? ' selected' : ''}>UTC</option></select></div></article><article class="card section-card"><h3>Platform preferences</h3><p>These demo switches do not change production behavior.</p><div class="settings-list">${settings.map(([label, detail]) => `<div class="setting-row"><div><strong>${label}</strong><span>${detail}</span></div><button class="switch" role="switch" aria-checked="${platformSettings.preferences[label]}" aria-label="${label}" data-action="toggle-setting"></button></div>`).join('')}</div></article></div>
    <div class="section-grid"><article class="card section-card"><h3>Security & access</h3><p>Platform administrator authentication, least-privilege permissions, session policies and recovery workflows must be configured with the identity provider and protected APIs.</p><button class="secondary-button" data-action="settings-placeholder">Security integration</button></article><article class="card section-card"><h3>API & integrations</h3><p>Payment provider, email delivery and platform API configuration are not stored in frontend code. Keep private credentials in server-side secret storage.</p><button class="secondary-button" data-action="settings-placeholder">Integration status</button></article><article class="card section-card"><h3>Service status</h3><p>Maintenance and service health require monitoring services; the dashboard does not report live availability.</p><span class="status-pill status-pending">Sample status</span></article></div>
    <div class="heading-actions"><button class="primary-button" data-action="save-settings">${icon('check')} Save settings</button></div>`;
}

function notificationsSection(): string {
  return `${heading('Notifications', 'Platform alerts and events that may require administrator attention.', `<button class="secondary-button" data-action="mark-read">${icon('check')} Mark all as read</button>`)}
    <p class="sample-data-note">Demo notifications are held in memory and reset when the page reloads.</p>
    <article class="card"><div class="activity-list">${notifications.length ? notifications.map((notification, index) => `<div class="activity-row${notification.read ? '' : ' notification-unread'}"><span class="activity-icon ${notification.color}">${icon(notification.icon)}</span><div class="activity-copy"><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.detail)} · ${escapeHtml(notification.time)}</span></div>${notification.read ? '<span class="read-label">Read</span>' : `<button class="small-link" data-action="mark-notification" data-index="${index}">Mark read</button>`}</div>`).join('') : '<p class="empty-state">You’re all caught up.</p>'}</div></article>`;
}

function auditSection(): string {
  return `${heading('Audit Logs', 'Trace platform events, administrator actions and account changes.', `<button class="secondary-button" data-action="export">${icon('audit')} Export logs</button>`)}
    <p class="sample-data-note">Illustrative, append-only event list in this page session. Production audit entries must be recorded and retained server-side.</p>
    <article class="card table-card"><div class="card-heading"><div><h2>Platform activity history</h2><p>Demo audit trail</p></div><div class="table-tools"><input type="search" data-table-search="audit" placeholder="Search activity..."><select data-table-filter="audit"><option>All events</option><option>Demo</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Date & time</th><th>Event</th><th>Actor</th><th>Details</th><th>Result</th></tr></thead><tbody>${auditEntries.map((entry) => `<tr><td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.event)}</td><td>${escapeHtml(entry.actor)}</td><td>${escapeHtml(entry.details)}</td><td>${statusPill(entry.result)}</td></tr>`).join('')}</tbody></table></div></article>
    <article class="card section-card"><h3>Audit trail scope</h3><p>This template uses sample audit entries. In production, audit records should be written by trusted server-side services, not directly from the browser.</p></article>`;
}

const sectionRenderers: Record<Section, () => string> = {
  overview, businesses: businessesSection,
  subscriptions: subscriptionsSection, users: usersSection, billing: billingSection, inventory: inventorySection, reports: reportsSection, settings: settingsSection, notifications: notificationsSection, audit: auditSection,
};

function renderChart(): void {
  const canvas = root.querySelector<HTMLCanvasElement>('#revenue-chart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const pad = { left: 28, right: 5, top: 10, bottom: 22 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const monthPoints = [17, 20, 18, 21, 19, 23, 21, 25, 24, 27, 25, 23, 28, 27, 30, 28, 31, 30, 33, 31, 34, 32, 34, 36, 35, 37, 38, 39, 40, 34];
  const points = chartRange === 'Last 7 days' ? monthPoints.slice(-7) : chartRange === 'Last 12 months'
    ? [18, 19, 21, 22, 24, 26, 25, 28, 29, 31, 33, 34]
    : monthPoints;
  const max = Math.ceil(Math.max(...points) / 10) * 10;
  context.font = '8px DM Sans, sans-serif';
  context.textBaseline = 'middle';
  for (let value = 0; value <= max; value += Math.max(1, max / 5)) {
    const y = pad.top + chartHeight * (1 - value / max);
    context.strokeStyle = '#eaf0f6';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillStyle = '#8492a7';
    context.textAlign = 'left';
    context.fillText(value === 0 ? '0' : `${Math.round(value)}K`, 1, y);
  }
  const tickCount = Math.min(6, points.length - 1);
  for (let index = 0; index <= tickCount; index += 1) {
    const x = pad.left + (chartWidth * index) / tickCount;
    context.strokeStyle = '#f0f3f7';
    context.beginPath();
    context.moveTo(x, pad.top);
    context.lineTo(x, height - pad.bottom);
    context.stroke();
    context.fillStyle = '#8492a7';
    context.textAlign = index === 6 ? 'right' : 'center';
    const label = chartRange === 'Last 12 months'
      ? ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][Math.round((points.length - 1) * index / tickCount)]
      : chartRange === 'Last 7 days'
        ? `Day ${Math.round((points.length - 1) * index / tickCount) + 1}`
        : `Day ${Math.round((points.length - 1) * index / tickCount) + 1}`;
    context.fillText(label, x, height - 8);
  }
  const coordinates = points.map((value, index) => ({
    x: pad.left + (chartWidth * index) / (points.length - 1),
    y: pad.top + chartHeight * (1 - value / max),
  }));
  const fill = context.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  fill.addColorStop(0, 'rgba(38, 126, 245, .25)');
  fill.addColorStop(1, 'rgba(38, 126, 245, .015)');
  context.beginPath();
  coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.lineTo(coordinates[coordinates.length - 1].x, height - pad.bottom);
  context.lineTo(coordinates[0].x, height - pad.bottom);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.beginPath();
  coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = '#1676f3';
  context.lineWidth = 2;
  context.stroke();
  coordinates.forEach((point, index) => {
    if (index % 4 !== 0 && index !== coordinates.length - 1) return;
    context.beginPath();
    context.arc(point.x, point.y, 2.3, 0, Math.PI * 2);
    context.fillStyle = '#1676f3';
    context.fill();
  });
}

function renderSection(): void {
  const content = root.querySelector<HTMLElement>('#admin-content');
  if (!content) return;
  content.innerHTML = sectionRenderers[currentSection]();
  root.querySelectorAll<HTMLElement>('[data-section]').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === currentSection);
    item.setAttribute('aria-current', item.dataset.section === currentSection ? 'page' : 'false');
  });
  const unreadCount = activeNotificationCount();
  const notificationLink = root.querySelector<HTMLElement>('[data-section="notifications"]');
  if (notificationLink) {
    notificationLink.querySelector('.nav-count')?.remove();
    if (unreadCount) notificationLink.insertAdjacentHTML('beforeend', `<span class="nav-count">${unreadCount}</span>`);
  }
  root.querySelector('.notification-dot')?.remove();
  if (unreadCount)   root.querySelector('#notification-button')?.insertAdjacentHTML('beforeend', `<span class="notification-dot">${unreadCount}</span>`);
  const accountMenu = root.querySelector<HTMLElement>('#account-menu');
  if (accountMenu) accountMenu.hidden = true;
  requestAnimationFrame(renderChart);
}

function showToast(message: string): void {
  const toast = root.querySelector<HTMLElement>('#admin-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function openModal(
  title: string,
  fields: Array<{ label: string; name: string; type?: string; options?: string[]; value?: string; min?: number; step?: number }>,
  onSubmit: (values: FormData) => void | boolean,
): void {
  const modalRoot = root.querySelector<HTMLElement>('#admin-modal-root');
  if (!modalRoot) return;
  modalRoot.innerHTML = `<div class="modal-backdrop"><form class="admin-modal" id="admin-form" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
    <div class="modal-head"><h2 id="admin-modal-title">${escapeHtml(title)}</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>
    <div class="modal-body">${fields.map((field) => `<div class="form-field"><label for="modal-${field.name}">${escapeHtml(field.label)}</label>${field.options ? `<select id="modal-${field.name}" class="field-control" name="${field.name}" required>${field.options.map((option) => `<option${option === field.value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>` : `<input id="modal-${field.name}" class="field-control" name="${field.name}" type="${field.type ?? 'text'}" value="${escapeHtml(field.value ?? '')}"${field.min === undefined ? '' : ` min="${field.min}"`}${field.step === undefined ? '' : ` step="${field.step}"`} required>`}</div>`).join('')}</div>
    <div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">Save</button></div>
  </form></div>`;
  const form = modalRoot.querySelector<HTMLFormElement>('#admin-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (onSubmit(new FormData(form)) === false) return;
    modalRoot.innerHTML = '';
  });
  modalRoot.querySelector<HTMLElement>('input,select')?.focus();
}

function openAddBusiness(): void {
  openModal('Register a business', [
    { label: 'Business name', name: 'name' },
    { label: 'Business owner', name: 'owner' },
    { label: 'Subscription plan', name: 'plan', options: plans.filter((plan) => plan.active).flatMap((plan) => [`${plan.name} Monthly`, `${plan.name} Annual`]) },
  ], (values) => {
    const name = String(values.get('name') ?? '').trim();
    const owner = String(values.get('owner') ?? '').trim();
    if (!name || !owner || businesses.some((business) => business.name.toLowerCase() === name.toLowerCase())) {
      showToast('Enter a business name and owner. Business names must be unique.');
      return false;
    }
    const plan = String(values.get('plan'));
    businesses.unshift({ id: `b-${Date.now()}`, name, owner, plan, status: 'Trial', users: 1, created: new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date()), revenue: 0, products: 0, sales: 0 });
    const cycle = plan.endsWith('Annual') ? 'Annually' : 'Monthly';
    const selectedPlan = plans.find((item) => plan.startsWith(item.name));
    subscriptions.unshift({ id: `SUB-${Date.now()}`, business: name, plan: plan.replace(/ (Monthly|Annual)$/, ''), amount: selectedPlan?.[cycle === 'Annually' ? 'annualPrice' : 'monthlyPrice'] ?? 0, cycle, nextBilling: 'Trial period', status: 'Pending' });
    recordActivity('New demo business registered', name, 'business');
    if (currentSection === 'overview' || currentSection === 'businesses') renderSection();
    showToast(`${name} added to the local demo list. Connect a backend to persist it.`);
  });
}

function openEditBusiness(business: Business): void {
  openModal('Edit business details', [
    { label: 'Business name', name: 'name', value: business.name },
    { label: 'Business owner', name: 'owner', value: business.owner },
    { label: 'Subscription plan', name: 'plan', options: [...plans.filter((plan) => plan.active).flatMap((plan) => [`${plan.name} Monthly`, `${plan.name} Annual`]), business.plan], value: business.plan },
  ], (values) => {
    const name = String(values.get('name') ?? '').trim();
    const owner = String(values.get('owner') ?? '').trim();
    const duplicate = businesses.some((item) => item.id !== business.id && item.name.toLowerCase() === name.toLowerCase());
    if (!name || !owner || duplicate) {
      showToast('Enter valid business details. Business names must be unique.');
      return false;
    }
    const previousName = business.name;
    const selectedPlan = String(values.get('plan'));
    business.name = name;
    business.owner = owner;
    business.plan = selectedPlan;
    const subscription = subscriptions.find((item) => item.business === previousName);
    if (subscription) {
      subscription.business = name;
      subscription.plan = selectedPlan.replace(/ (Monthly|Annual)$/, '');
      subscription.cycle = selectedPlan.endsWith('Annual') ? 'Annually' : 'Monthly';
      subscription.amount = plans.find((item) => selectedPlan.startsWith(item.name))?.[subscription.cycle === 'Annually' ? 'annualPrice' : 'monthlyPrice'] ?? subscription.amount;
    }
    recordActivity('Demo business details edited', name);
    renderSection();
    showToast('Business details updated for this demo session only.');
  });
}

function openBusinessProfile(business: Business): void {
  const modalRoot = root.querySelector<HTMLElement>('#admin-modal-root');
  if (!modalRoot) return;
  const subscription = subscriptions.find((item) => item.business === business.name);
  const associatedUsers = users.filter((user) => user.business === business.name);
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="business-profile-title">
    <div class="modal-head"><h2 id="business-profile-title">${escapeHtml(business.name)} profile</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>
    <div class="modal-body">
      <div class="profile-summary-grid"><div><span>Account status</span>${statusPill(business.status)}</div><div><span>Subscription</span><strong>${escapeHtml(subscription?.plan ?? business.plan)} · ${escapeHtml(subscription?.status ?? 'Unassigned')}</strong></div><div><span>Owner</span><strong>${escapeHtml(business.owner)}</strong></div><div><span>Registered</span><strong>${escapeHtml(business.created)}</strong></div><div><span>Associated users</span><strong>${business.users} users</strong></div><div><span>Next billing</span><strong>${escapeHtml(subscription?.nextBilling ?? 'Not assigned')}</strong></div><div><span>Products / transactions</span><strong>${business.products.toLocaleString('en-KE')} / ${business.sales.toLocaleString('en-KE')}</strong></div><div><span>Tenant sales value</span><strong>${currency(business.revenue)} · sample only</strong></div></div>
      <h3 class="profile-users-heading">Business users</h3>
      <div class="profile-user-list">${associatedUsers.length ? `${associatedUsers.map((user) => `<div><span class="user-avatar">${escapeHtml(user.name.slice(0, 1))}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)} · ${escapeHtml(user.role)}</small></span></div>`).join('')}<p class="sample-data-note">Showing ${associatedUsers.length} sample account${associatedUsers.length === 1 ? '' : 's'} for this business.</p>` : '<p class="empty-state">No associated sample users.</p>'}</div>
    </div>
    <div class="modal-foot"><button class="secondary-button" data-action="business-menu" data-id="${escapeHtml(business.id)}">${business.status === 'Suspended' ? 'Reactivate' : 'Suspend'} business</button><button class="primary-button" data-action="edit-business" data-id="${escapeHtml(business.id)}">Edit details</button></div>
  </section></div>`;
  modalRoot.querySelector<HTMLElement>('.modal-close')?.focus();
}

function openFirestoreBusinessProfile(business: Business): void {
  const modalRoot = root.querySelector<HTMLElement>('#admin-modal-root');
  if (!modalRoot) return;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="business-profile-title">
    <div class="modal-head"><h2 id="business-profile-title">${escapeHtml(business.name)} profile</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>
    <div class="modal-body">
      <p class="sample-data-note">Live, read-only record from ${firebaseEnvironment} Firestore.</p>
      <div class="profile-summary-grid"><div><span>Business ID</span><strong>${escapeHtml(business.id)}</strong></div><div><span>Account status</span>${statusPill(business.status)}</div><div><span>Owner</span><strong>${escapeHtml(business.owner)}</strong></div><div><span>Owner email</span><strong>${escapeHtml(business.ownerEmail || 'Not available')}</strong></div><div><span>Subscription plan</span><strong>${escapeHtml(business.plan)}</strong></div><div><span>Registered</span><strong>${escapeHtml(business.created)}</strong></div></div>
      <p class="profile-data-note">User counts, billing, plan status, and tenant usage are not stored on this business record, so they are not inferred here.</p>
    </div>
    <div class="modal-foot"><button class="secondary-button" data-action="close-modal">Close</button></div>
  </section></div>`;
  modalRoot.querySelector<HTMLElement>('.modal-close')?.focus();
}

function openPlanModal(plan?: SubscriptionPlan): void {
  openModal(plan ? `Edit ${plan.name} plan` : 'Create subscription plan', [
    { label: 'Plan name', name: 'name', value: plan?.name },
    { label: 'Description', name: 'description', value: plan?.description },
    { label: 'Monthly price (KSh)', name: 'monthlyPrice', type: 'number', min: 0, step: 1, value: String(plan?.monthlyPrice ?? '') },
    { label: 'Annual price (KSh)', name: 'annualPrice', type: 'number', min: 0, step: 1, value: String(plan?.annualPrice ?? '') },
    { label: 'Trial duration (days)', name: 'trialDays', type: 'number', min: 0, step: 1, value: String(plan?.trialDays ?? 14) },
    { label: 'User limit', name: 'userLimit', type: 'number', min: 1, step: 1, value: String(plan?.userLimit ?? 5) },
    { label: 'Branch limit', name: 'branchLimit', type: 'number', min: 1, step: 1, value: String(plan?.branchLimit ?? 1) },
    { label: 'Product limit', name: 'productLimit', type: 'number', min: 1, step: 1, value: String(plan?.productLimit ?? 1000) },
    { label: 'Included features (comma-separated)', name: 'features', value: plan?.features.join(', ') ?? '' },
    { label: 'Renewal policy', name: 'renewalPolicy', options: ['Auto-renew', 'Manual'], value: plan?.renewalPolicy ?? 'Auto-renew' },
  ], (values) => {
    const name = String(values.get('name') ?? '').trim();
    const duplicate = plans.some((item) => item !== plan && item.name.toLowerCase() === name.toLowerCase());
    const monthlyPrice = Number(values.get('monthlyPrice'));
    const annualPrice = Number(values.get('annualPrice'));
    const trialDays = Number(values.get('trialDays'));
    const userLimit = Number(values.get('userLimit'));
    const branchLimit = Number(values.get('branchLimit'));
    const productLimit = Number(values.get('productLimit'));
    if (!name || duplicate || !Number.isFinite(monthlyPrice) || !Number.isFinite(annualPrice) || !Number.isFinite(trialDays) || !Number.isFinite(userLimit) || !Number.isFinite(branchLimit) || !Number.isFinite(productLimit)) {
      showToast('Enter valid plan details. Plan names must be unique.');
      return false;
    }
    const updated: SubscriptionPlan = {
      name,
      description: String(values.get('description') ?? '').trim(),
      monthlyPrice,
      annualPrice,
      trialDays,
      userLimit,
      branchLimit,
      productLimit,
      features: String(values.get('features') ?? '').split(',').map((feature) => feature.trim()).filter(Boolean),
      renewalPolicy: String(values.get('renewalPolicy')) === 'Manual' ? 'Manual' : 'Auto-renew',
      active: plan?.active ?? true,
    };
    if (plan) {
      const previousName = plan.name;
      Object.assign(plan, updated);
      subscriptions.forEach((subscription) => {
        if (subscription.plan === previousName) subscription.plan = name;
      });
      businesses.forEach((business) => {
        if (business.plan.startsWith(`${previousName} `)) business.plan = `${name}${business.plan.slice(previousName.length)}`;
      });
    } else {
      plans.push(updated);
    }
    recordActivity(plan ? 'Demo subscription plan edited' : 'Demo subscription plan created', name);
    renderSection();
    showToast('Plan changes are temporary demo data. Billing is not affected.');
  });
}

function rowAction(action: string, id: string): void {
  if (action === 'business-menu') {
    const business = businesses.find((item) => item.id === id);
    if (!business) return;
    const nextStatus: BusinessStatus = business.status === 'Suspended' ? 'Active' : 'Suspended';
    if (!window.confirm(`${nextStatus === 'Suspended' ? 'Suspend' : 'Reactivate'} ${business.name}? This changes demo status only.`)) return;
    business.status = nextStatus;
    recordActivity(`Demo business ${nextStatus.toLowerCase()}`, business.name, nextStatus === 'Suspended' ? 'close' : 'check');
    root.querySelector('#admin-modal-root')!.innerHTML = '';
    renderSection();
    showToast(`${business.name} ${nextStatus === 'Active' ? 'activated' : 'suspended'} in the local demo.`);
    return;
  }
  if (action === 'user') {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    openModal(`Manage ${user.name}`, [
      { label: 'Full name', name: 'name', value: user.name },
      { label: 'Email address', name: 'email', type: 'email', value: user.email },
      { label: 'Role', name: 'role', options: ['Platform admin', 'Support admin', 'Business owner', 'Manager', 'Cashier', 'Staff'], value: user.role },
      { label: 'Business scope', name: 'business', options: ['Platform', 'Unassigned', ...businesses.map((business) => business.name)], value: user.business },
      { label: 'Account status', name: 'status', options: ['Active', 'Suspended'], value: user.status },
    ], (values) => {
      const name = String(values.get('name') ?? '').trim();
      const email = String(values.get('email') ?? '').trim();
      const duplicate = users.some((item) => item.id !== user.id && item.email.toLowerCase() === email.toLowerCase());
      if (!name || !email || duplicate) {
        showToast('Enter a name and a unique email address.');
        return false;
      }
      const nextStatus = String(values.get('status'));
      if (nextStatus !== 'Active' && nextStatus !== 'Suspended') {
        showToast('Select a valid account status.');
        return false;
      }
      const activeAdmins = users.filter((item) => item.role.toLowerCase().includes('platform') && item.status === 'Active');
      if (user.role.toLowerCase().includes('platform') && user.status === 'Active' && nextStatus !== 'Active' && activeAdmins.length <= 1) {
        showToast('Keep at least one active platform administrator.');
        return false;
      }
      if (nextStatus !== user.status && !window.confirm(`${nextStatus === 'Suspended' ? 'Suspend' : 'Reactivate'} ${name}? This changes demo status only.`)) return false;
      user.name = name;
      user.email = email;
      user.role = String(values.get('role'));
      user.business = user.role.toLowerCase().includes('platform') ? 'Platform' : String(values.get('business'));
      user.status = nextStatus;
      recordActivity('Demo user account updated', `${user.email} · ${user.role}`, 'users');
      renderSection();
      showToast('Account changes are temporary demo data. Authentication permissions are not changed.');
    });
    return;
  }
  if (action === 'subscription') {
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) return;
    openModal(`Manage ${subscription.id}`, [
      { label: 'Plan', name: 'plan', options: [...plans.filter((plan) => plan.active).map((plan) => plan.name), subscription.plan], value: subscription.plan },
      { label: 'Billing cycle', name: 'cycle', options: ['Monthly', 'Annually'], value: subscription.cycle },
      { label: 'Subscription status', name: 'status', options: ['Active', 'Pending', 'Overdue', 'Cancelled', 'Expired', 'Suspended'], value: subscription.status },
    ], (values) => {
      const planName = String(values.get('plan'));
      const cycle = String(values.get('cycle'));
      const selectedPlan = plans.find((plan) => plan.name === planName);
      if (!selectedPlan) {
        showToast('Select a valid subscription plan.');
        return false;
      }
      subscription.plan = planName;
      subscription.cycle = cycle;
      subscription.amount = selectedPlan[cycle === 'Annually' ? 'annualPrice' : 'monthlyPrice'];
      const status = String(values.get('status'));
      if (!isSubscriptionStatus(status)) {
        showToast('Select a valid subscription status.');
        return false;
      }
      subscription.status = status;
      recordActivity('Demo subscription updated', `${subscription.business} · ${planName}`);
      renderSection();
      showToast('Subscription updated in the demo only. No billing action was performed.');
    });
    return;
  }
  if (action === 'toggle-plan') {
    const plan = plans.find((item) => item.name === id);
    if (!plan) return;
    const nextState = !plan.active;
    if (!window.confirm(`${nextState ? 'Reactivate' : 'Deactivate'} the ${plan.name} plan? Existing subscriptions are not changed.`)) return;
    plan.active = nextState;
    recordActivity(`Demo plan ${nextState ? 'reactivated' : 'deactivated'}`, plan.name);
    renderSection();
    showToast(`${plan.name} plan ${nextState ? 'reactivated' : 'deactivated'} in demo data.`);
    return;
  }
  showToast(`${id} opened in demo view. Backend integration is required for live updates.`);
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return ['Trial', 'Active', 'Pending', 'Overdue', 'Cancelled', 'Expired', 'Suspended'].includes(value);
}

function exportCsv(): void {
  const rows = currentSection === 'billing'
    ? [['Invoice', 'Business', 'Amount (KSh)', 'Date', 'Status'], ...invoices.map((invoice) => [invoice.id, invoice.business, String(invoice.amount), invoice.date, invoice.status])]
    : currentSection === 'audit'
      ? [['Date and time', 'Event', 'Actor', 'Details', 'Result'], ...auditEntries.map((entry) => [entry.date, entry.event, entry.actor, entry.details, entry.result])]
      : [['Business', 'Owner', 'Plan', 'Status', 'Users'], ...businesses.map((business) => [business.name, business.owner, business.plan, business.status, String(business.users)])];
  const content = rows.map((row) => row.map((cell) => {
    const safeCell = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return `"${safeCell.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  link.download = currentSection === 'billing' ? 'mandela-demo-invoices.csv' : currentSection === 'audit' ? 'mandela-demo-audit.csv' : 'mandela-demo-business-report.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  showToast('Illustrative demo report exported.');
}

function handleClick(event: Event): void {
  const clicked = event.target as HTMLElement;
  if (clicked.classList.contains('modal-backdrop')) {
    root.querySelector('#admin-modal-root')!.innerHTML = '';
    return;
  }
  const target = clicked.closest<HTMLElement>('[data-section],[data-action],[data-sort-business],#mobile-menu,#sidebar-collapse,#sidebar-overlay,#notification-button,#user-menu');
  if (!target) return;
  const sortKey = target.dataset.sortBusiness;
  if (sortKey === 'name' || sortKey === 'owner' || sortKey === 'plan' || sortKey === 'created') {
    businessSort = {
      key: sortKey,
      direction: businessSort.key === sortKey && businessSort.direction === 'asc' ? 'desc' : 'asc',
    };
    businessPage = 1;
    renderSection();
    return;
  }
  if (target.dataset.section) {
    event.preventDefault();
    currentSection = target.dataset.section as Section;
    renderSection();
    if (currentSection === 'businesses' && !firestoreBusinesses && !firestoreBusinessesError) {
      void loadFirestoreBusinesses();
    }
    if (currentSection === 'users' && !firestoreTenantAdmins && !firestoreTenantAdminsError) {
      void loadPlatformTenantAdmins();
    }
    root.querySelector('#admin-sidebar')?.classList.remove('open');
    root.querySelector('#sidebar-overlay')?.classList.remove('visible');
    root.querySelector('#mobile-menu')?.setAttribute('aria-expanded', 'false');
    return;
  }
  const action = target.dataset.action;
  if (target.id === 'mobile-menu') {
    root.querySelector('#admin-sidebar')?.classList.add('open');
    root.querySelector('#sidebar-overlay')?.classList.add('visible');
    target.setAttribute('aria-expanded', 'true');
  } else if (target.id === 'sidebar-collapse') {
    const layout = root.querySelector<HTMLElement>('.admin-layout');
    layout?.classList.toggle('sidebar-collapsed');
    const collapsed = layout?.classList.contains('sidebar-collapsed') ?? false;
    target.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    target.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  } else if (action === 'close-modal') {
    if (action === 'close-modal') root.querySelector('#admin-modal-root')!.innerHTML = '';
  } else if (target.id === 'sidebar-overlay') {
    root.querySelector('#admin-sidebar')?.classList.remove('open');
    target.classList.remove('visible');
    root.querySelector('#mobile-menu')?.setAttribute('aria-expanded', 'false');
  } else if (target.id === 'user-menu') {
    const menu = root.querySelector<HTMLElement>('#account-menu');
    if (menu) menu.hidden = !menu.hidden;
  } else if (target.id === 'notification-button') {
    currentSection = 'notifications';
    renderSection();
  } else if (action === 'sign-out') {
    void logout().catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Could not sign out.'));
  } else if (action === 'add-business') {
    openAddBusiness();
  } else if (action === 'refresh-businesses' || action === 'retry-business-load') {
    void loadFirestoreBusinesses();
  } else if (action === 'refresh-tenant-admins' || action === 'retry-tenant-admins') {
    void loadPlatformTenantAdmins();
  } else if (action === 'invite-user') {
    openModal('Invite a user', [
      { label: 'Full name', name: 'name' },
      { label: 'Email address', name: 'email', type: 'email' },
      { label: 'Role', name: 'role', options: ['Business owner', 'Platform administrator', 'Staff'] },
    ], (values) => {
      const name = String(values.get('name') ?? '').trim();
      const email = String(values.get('email') ?? '').trim();
      if (!name || !email || users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
        showToast('Enter a name and a unique email address.');
        return false;
      }
      const role = String(values.get('role'));
      users.unshift({ id: `u-${Date.now()}`, name, email, role, business: role === 'Platform administrator' ? 'Platform' : 'Unassigned', status: 'Active', lastActive: 'Invited just now' });
      recordActivity('Demo user invited', email, 'users');
      renderSection();
      showToast('Demo user added locally. Actual invitations require a trusted backend service.');
    });
  } else if (action === 'add-plan') {
    openPlanModal();
  } else if (action === 'edit-plan') {
    const plan = plans.find((item) => item.name === target.dataset.id);
    if (plan) openPlanModal(plan);
  } else if (action === 'firestore-business-details') {
    const business = firestoreBusinesses?.find((item) => item.id === target.dataset.id);
    if (business) openFirestoreBusinessProfile(business);
  } else if (action === 'business-details') {
    const business = businesses.find((item) => item.id === target.dataset.id);
    if (business) openBusinessProfile(business);
  } else if (action === 'edit-business') {
    const business = businesses.find((item) => item.id === target.dataset.id);
    if (business) openEditBusiness(business);
  } else if (action === 'business-menu' || action === 'user' || action === 'subscription' || action === 'toggle-plan') {
    rowAction(action, target.dataset.id ?? '');
  } else if (action === 'business-page') {
    businessPage += Number(target.dataset.direction);
    renderSection();
  } else if (action === 'invoice') {
    showToast(`Invoice ${target.dataset.id} is sample data; connect a billing service to view a real document.`);
  } else if (action === 'export') {
    exportCsv();
  } else if (action === 'toggle-setting') {
    const isChecked = target.getAttribute('aria-checked') === 'true';
    target.setAttribute('aria-checked', String(!isChecked));
    const settingName = target.getAttribute('aria-label');
    if (settingName && Object.hasOwn(platformSettings.preferences, settingName)) platformSettings.preferences[settingName] = !isChecked;
  } else if (action === 'save-settings') {
    const name = root.querySelector<HTMLInputElement>('#platform-name');
    const supportEmail = root.querySelector<HTMLInputElement>('#support-email');
    const currencySelect = root.querySelector<HTMLSelectElement>('#default-currency');
    const timezoneSelect = root.querySelector<HTMLSelectElement>('#default-timezone');
    if (!name?.reportValidity() || !supportEmail?.reportValidity()) return;
    platformSettings.platformName = name.value.trim();
    platformSettings.supportEmail = supportEmail.value.trim();
    if (currencySelect) {
      platformSettings.currency = currencySelect.value;
      currentCurrency = currencySelect.value;
    }
    if (timezoneSelect) platformSettings.timezone = timezoneSelect.value;
    const brand = root.querySelector<HTMLElement>('.brand-name');
    if (brand?.firstChild) brand.firstChild.textContent = `${platformSettings.platformName} `;
    recordActivity('Demo platform preferences updated', 'Branding and regional defaults');
    renderSection();
    showToast('Settings saved in memory for this page session only.');
  } else if (action === 'settings-placeholder') {
    showToast('This integration is a placeholder and requires a secured backend configuration.');
  } else if (action === 'mark-read') {
    notifications.forEach((notification) => { notification.read = true; });
    renderSection();
    showToast('All demo notifications marked as read.');
  } else if (action === 'mark-notification') {
    const notification = notifications[Number(target.dataset.index)];
    if (notification) notification.read = true;
    renderSection();
  } else if (target.id === 'chart-range') {
    chartRange = (target as HTMLSelectElement).value;
    renderChart();
  } else if (target.id === 'dashboard-range') {
    chartRange = (target as HTMLSelectElement).value;
    renderChart();
  }
}

function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === 'business-search') {
    businessSearch = target.value;
    businessPage = 1;
    const useFirestore = currentSection === 'businesses';
    const rows = root.querySelector('#business-rows');
    if (rows) rows.innerHTML = businessRows(useFirestore);
    const pagination = root.querySelector('.table-pagination');
    if (pagination) pagination.outerHTML = businessPagination(useFirestore);
  } else if (target.id === 'business-status-filter') {
    businessStatusFilter = target.value;
    businessPage = 1;
    const useFirestore = currentSection === 'businesses';
    const rows = root.querySelector('#business-rows');
    if (rows) rows.innerHTML = businessRows(useFirestore);
    const pagination = root.querySelector('.table-pagination');
    if (pagination) pagination.outerHTML = businessPagination(useFirestore);
  } else if (target.matches('[data-table-search]')) {
    const tableCard = target.closest<HTMLElement>('.table-card');
    if (tableCard) applyTableFilters(tableCard);
  } else if (target.matches('[data-table-filter]')) {
    const tableCard = target.closest<HTMLElement>('.table-card');
    if (tableCard) applyTableFilters(tableCard);
  } else if (target.id === 'chart-range') {
    chartRange = target.value;
    renderChart();
  } else if (target.id === 'usage-range') {
    usageRange = target.value;
    showToast(`${usageRange} selected. Sample usage totals are not time-series data.`);
  } else if (target.id === 'dashboard-range') {
    chartRange = target.value;
    renderChart();
  } else if (target.id === 'global-search-input' && target.value.trim()) {
    const query = target.value.trim().toLowerCase();
    if (businesses.some((business) => `${business.name} ${business.owner} ${business.plan}`.toLowerCase().includes(query))) {
      currentSection = 'businesses';
      businessSearch = target.value;
      businessPage = 1;
      renderSection();
    } else if (users.some((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))) {
      currentSection = 'users';
      renderSection();
      const search = root.querySelector<HTMLInputElement>('[data-table-search="users"]');
      if (search) {
        search.value = target.value;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (subscriptions.some((subscription) => `${subscription.id} ${subscription.business} ${subscription.plan}`.toLowerCase().includes(query)) || plans.some((plan) => plan.name.toLowerCase().includes(query))) {
      currentSection = 'subscriptions';
      renderSection();
      const search = root.querySelector<HTMLInputElement>('[data-table-search="subscriptions"]');
      if (search) {
        search.value = target.value;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (invoices.some((invoice) => `${invoice.id} ${invoice.business}`.toLowerCase().includes(query))) {
      currentSection = 'billing';
      renderSection();
      const search = root.querySelector<HTMLInputElement>('[data-table-search="billing"]');
      if (search) {
        search.value = target.value;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

  }
}

function applyTableFilters(tableCard: HTMLElement): void {
  const body = tableCard.querySelector('tbody');
  if (!body) return;
  const term = tableCard.querySelector<HTMLInputElement>('[data-table-search]')?.value.trim().toLowerCase() ?? '';
  const filters = [...tableCard.querySelectorAll<HTMLSelectElement>('[data-table-filter]')]
    .map((select) => select.value.trim().toLowerCase())
    .filter((value) => value && !value.startsWith('all '));
  let visibleCount = 0;
  body.querySelectorAll<HTMLTableRowElement>('tr:not(.table-empty-row)').forEach((row) => {
    const text = row.textContent?.toLowerCase() ?? '';
    row.hidden = !text.includes(term) || filters.some((filter) => !text.includes(filter));
    if (!row.hidden) visibleCount += 1;
  });
  let emptyRow = body.querySelector<HTMLTableRowElement>('.table-empty-row');
  if (visibleCount === 0) {
    if (!emptyRow) {
      const columnCount = tableCard.querySelectorAll('thead th').length;
      emptyRow = document.createElement('tr');
      emptyRow.className = 'table-empty-row';
      emptyRow.innerHTML = `<td class="empty-state" colspan="${columnCount}">No records match these filters.</td>`;
      body.append(emptyRow);
    }
  } else {
    emptyRow?.remove();
  }
}

function showAccessError(message: string): void {
  root.innerHTML = `<main class="admin-loading"><h1>Platform admin unavailable</h1><p>${escapeHtml(message)}</p><a class="primary-button" href="${import.meta.env.BASE_URL}signin.html">Return to sign in</a></main>`;
}

function startAdmin(user: { displayName: string | null; email: string | null }): void {
  currentUserName = user.displayName?.trim() || user.email || 'Platform Administrator';
  root.innerHTML = shell(currentUserName);
  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleInput);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      root.querySelector('#admin-modal-root')!.innerHTML = '';
      root.querySelector<HTMLElement>('#account-menu')!.hidden = true;
      root.querySelector('#admin-sidebar')?.classList.remove('open');
      root.querySelector('#sidebar-overlay')?.classList.remove('visible');
      root.querySelector('#mobile-menu')?.setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('resize', renderChart);
  renderSection();
}

const signInUrl = new URL(`${import.meta.env.BASE_URL}signin.html`, window.location.origin);
signInUrl.searchParams.set('returnTo', 'platform-admin');

if (!isFirebaseConfigured || !auth) {
  showAccessError('Firebase is not configured for this environment.');
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace(signInUrl.href);
      return;
    }
    try {
      if (!(await isPlatformAdmin(user.uid))) {
        showAccessError('This account does not have platform administrator access.');
        return;
      }
      startAdmin(user);
    } catch (error) {
      showAccessError(error instanceof Error ? error.message : 'Unable to verify platform administrator access.');
    }
  }, (error) => showAccessError(error.message));
}
