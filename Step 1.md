# Multi-tenant implementation checklist

## Target flow

1. App entry shows a public home page; a visitor chooses sign up or log in.
2. After authentication, the user sees only businesses where they have an active membership.
3. A user with no membership can create a business.
4. The owner chooses a tenant slug; the app suggests one from the business name and checks whether it is available.
5. Business creation writes the business, unique slug claim, owner membership, and user's membership index in one Firestore batch.
6. Firestore rules allow this bootstrap batch only when the signed-in user is the owner across all four writes; the browser cannot create arbitrary memberships or assign roles.
7. The user selects a business. The selection is for navigation only; Firestore rules authorize every data operation independently.
8. The user lands on that business's dashboard; owners/admins/managers can manage inventory according to the chosen product schema.
9. Members get only the role permissions defined for that business.

### Entry and dashboard

- [x] Make the app root a public home page with sign-up and log-in calls to action.
- [x] Route authenticated users from sign-up/log-in callbacks to the app root.
- [x] Show business setup, a business picker, or that business's inventory dashboard based on active memberships.
- [x] Show business-scoped product totals, low-stock count, recent products, and role-appropriate inventory actions.
- [x] Include all required entry, auth, and inventory pages in the Vite production build.
- [x] Show the chosen slug's local and GitHub Pages URL suggestions before business creation.
- [x] Retain the tenant slug across dashboard-to-inventory navigation.
- [x] Add a GitHub Pages `404.html` app fallback for tenant dashboard paths.

## Checklist

### Step 1 — Secure tenant foundation

- [x] Confirm the canonical inventory collection/schema and whether existing Firebase data must be preserved. The implementation uses `products`; legacy data migration is explicitly separate.
- [x] Implement Spark-compatible atomic client business creation constrained by Firestore `getAfter()` checks.
- [x] Atomically create the business, unique slug claim, owner membership, and user membership index in one batch.
- [x] Keep the slug claim create-only so simultaneous attempts to reserve the same slug cannot both succeed.
- [x] Remove direct client writes that create business or membership/role records.
- [x] Add Firestore rules that allow users to read only their own profile and membership index, and allow business data access only through active membership and role checks.
- [x] Keep business selection separate from authorization; the selected business is stored locally and data access is still checked against membership in Firestore rules.
- [x] Type-check and build the app; review Firestore rules locally. Cloud Functions are not used for the Spark-compatible flow.
- [ ] Back up the active Firestore rules and confirm the live project is `mandelageneralshop`.
- [ ] Deploy the reviewed Firestore rules to `mandelageneralshop`, then verify business creation and inventory using a clearly named demo business/product.
- [ ] Publish the site and verify `/MandelaGenerals/b/{slug}/` on GitHub Pages.

### Tenant addresses

- Local development uses `http://{slug}.localhost:{port}/MandelaGenerals/`. Sign in separately on the tenant host if needed because browser authentication persistence is origin-scoped.
- GitHub Pages uses `https://onchari.github.io/MandelaGenerals/b/{slug}/`; GitHub Pages does not provide wildcard subdomains for this project site. The built `404.html` loads the app at that path.
- A custom `{slug}.your-domain` address is not claimed to be available. It requires a domain the owner controls, wildcard DNS, and hosting configured for tenant routing.
- The slug claim reserves a name in this Firebase project, not a domain name. An availability check is advisory; the atomic create-only claim is authoritative.
- Existing businesses without a slug keep working through the legacy active-business membership fallback, but do not receive a tenant URL automatically.

### Platform administrator access

- Platform-admin authorization uses a manually provisioned Firestore document: `platformAdmins/{firebaseAuthUid}` with `enabled: true` and `role: "platformAdmin"`.
- Create or revoke that document only through Firebase Console or a trusted administrative process. Client-side create/update/delete are denied by Firestore rules.
- To grant access, publish the rules, then in the `mandelageneralshop` Firestore console create `platformAdmins/{UID}` using the platform administrator's Firebase Authentication UID and fields `enabled: true` and `role: "platformAdmin"`. Set `enabled: false` or delete the record to revoke it.
- Platform administrators can read the platform's business and user profile documents. They do not automatically gain membership in business subcollections or access to inventory operations.
- The platform overview, businesses list, and users list are wired to Firestore. Plans/subscriptions, platform settings, and audit/activity menu entries are placeholders until their data models and workflows are defined.
- Publish the updated Firestore rules before provisioning or testing this role.

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

The source implementation now uses `businesses/{businessId}/products` with `quantity`, `costPrice`, and `sellingPrice`; the Spark-compatible atomic bootstrap and role-based rules are implemented locally. New businesses also reserve a user-chosen slug in the same atomic batch. The supplied rules for legacy collections (`items`, `shoe_sizes`, sales, business days, finance, customers, and sync metadata) have been retained alongside the products rules. No existing data is migrated or deleted.

The rules have not been deployed or exercised against Firebase. The user chose to use the existing project `mandelageneralshop`. Spark supports Firebase Authentication and Firestore rules; this implementation does not require Cloud Functions or Blaze. Back up the active rules first: publishing replaces the project's active Firestore rules. The supplied legacy collection rules have been retained in the local file.

From the repository root, deploy only the Firestore rules:

```powershell
firebase deploy --only firestore:rules --project mandelageneralshop
```

This does not deploy Hosting. Confirm the CLI targets `mandelageneralshop` before approving deployment. Do not deploy broad/open rules as a workaround.
