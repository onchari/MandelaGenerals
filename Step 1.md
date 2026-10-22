# Multi-tenant implementation checklist

## Target flow

1. App entry shows a public home page; a visitor chooses sign up or log in.
2. After authentication, the user sees only businesses where they have an active membership.
3. A user with no membership can create a business.
4. Business creation runs in a trusted Cloud Function; the browser cannot grant itself owner status.
5. The function atomically creates the business, its owner membership, and the user's membership index.
6. The user selects a business. The selection is for navigation only; Firestore rules authorize every data operation independently.
7. The user lands on that business's dashboard; owners/admins/managers can manage inventory according to the chosen product schema.
8. Members get only the role permissions defined for that business.

### Entry and dashboard

- [x] Make the app root a public home page with sign-up and log-in calls to action.
- [x] Route authenticated users from sign-up/log-in callbacks to the app root.
- [x] Show business setup, a business picker, or that business's inventory dashboard based on active memberships.
- [x] Show business-scoped product totals, low-stock count, recent products, and role-appropriate inventory actions.
- [x] Include all required entry, auth, and inventory pages in the Vite production build.

## Checklist

### Step 1 — Secure tenant foundation

- [x] Confirm the canonical inventory collection/schema and whether existing Firebase data must be preserved. The implementation uses `products`; legacy data migration is explicitly separate.
- [x] Implement an authenticated callable Cloud Function for business creation.
- [x] Have the function atomically create the business, owner membership, and user membership index.
- [x] Remove direct client writes that create business or membership/role records.
- [x] Add Firestore rules that allow users to read only their own profile and membership index, and allow business data access only through active membership and role checks.
- [x] Keep business selection separate from authorization; the selected business is stored locally and data access is still checked against membership in Firestore rules.
- [x] Validate function and app builds; review the rules locally.
- [ ] Back up the active Firestore rules and confirm the live project is `mandelageneralshop`.
- [ ] Deploy the callable function and reviewed rules to `mandelageneralshop`, then verify business creation and inventory using a clearly named demo business/product.

### Step 2 — Memberships and business selection

- [x] Load the signed-in user's business memberships.
- [x] Automatically open the sole business, show setup when there are none, and show a selector when there are multiple.
- [x] Allow switching the selected business; membership remains the authorization source.
- [ ] Add authorized member invitations and role changes through trusted backend operations.
- [x] Handle revoked/inactive membership and stale business selection by reloading active membership records before opening a workspace.

### Step 3 — Inventory

- [x] Align inventory collection names and document fields with the selected `products` schema.
- [x] Enforce role permissions for product create, read, update, delete.
- [ ] Verify search, details, edit, low-stock report, and empty states.
- [ ] Add stock-change audit history if inventory is adjusted by sales or purchases.

### Step 4 — Other business workflows

- [ ] Apply the same selected-business and membership checks to sales, purchases, expenses, customers, and reports.
- [ ] Record stock movements transactionally with relevant sales/purchase operations.
- [ ] Keep business data isolated across tenants.

### Step 5 — Validation and rollout

- [ ] Test owner, manager, cashier/staff, inactive member, and non-member access.
- [ ] Test cross-business reads/writes are denied.
- [ ] Validate business creation and inventory flows in the selected live project using clearly labeled demo data.
- [ ] Back up existing data and active rules before any live schema migration.
- [ ] Deploy reviewed functions and rules to the selected live project, then smoke-test.

## Current blocker

The source implementation now uses `businesses/{businessId}/products` with `quantity`, `costPrice`, and `sellingPrice`; the callable function and role-based rules are implemented locally. The supplied rules for legacy collections (`items`, `shoe_sizes`, sales, business days, finance, customers, and sync metadata) have been retained alongside the products rules. No existing data is migrated or deleted.

The function and rules have not been deployed or exercised against Firebase. The user chose to use the existing project `mandelageneralshop` rather than a separate test project. Deployment requires Firebase CLI access to that project, Cloud Functions enabled, and a billing plan that supports Cloud Functions deployment. Back up the active rules first: publishing replaces the project's active Firestore rules. The supplied legacy collection rules have been retained in the local file.

From the repository root, install and build the function, then deploy only the function and Firestore rules:

```powershell
npm install --prefix functions
npm run build --prefix functions
firebase deploy --only functions,firestore:rules --project mandelageneralshop
```

This deploys only Cloud Functions and Firestore rules, not Hosting. Confirm the CLI asks for/targets `mandelageneralshop` before approving deployment. Do not deploy broad/open rules as a workaround.
