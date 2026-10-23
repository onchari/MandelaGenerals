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

### Development and production environments

- Development uses the separate Firebase project `mandelagenerals-dev`; production uses `mandelageneralshop`.
- The Dev Firebase project and web app have been created. Its SDK configuration is stored locally in ignored `.env.development`; `.env.development.example` is the shareable template.
- Create `.env.production` from `.env.production.example` for local production builds. Do not commit actual environment files.
- `npm run dev` and `npm run build:dev` use development mode; `npm run build` is the production GitHub Pages build. Development mode blocks Firebase initialization if configured with the production project ID.
- The Firebase CLI defaults to the development project. Use `npm run deploy:dev` only after development Firestore and Authentication are initialized.
- Production GitHub Actions variables must use the `mandelageneralshop` Firebase web-app configuration. The production workflow rejects a different project ID or auth domain.
- Dev Firestore region is approved as `europe-west6`, matching Production. Database creation was blocked because the Cloud Firestore API is not enabled on the new project. Enable that API, create the default Standard database in `europe-west6`, deploy the reviewed rules, and enable Email/Password authentication in Dev.

### Tenant addresses

- The Vite development app and Dev Firebase Hosting use root paths, such as `http://localhost:{port}/b/{slug}/`; this keeps Firebase Auth persistence during tenant routing.
- GitHub Pages uses `https://onchari.github.io/MandelaGenerals/b/{slug}/`; GitHub Pages does not provide wildcard subdomains for this project site. The built `404.html` loads the app at that path.
- A custom `{slug}.your-domain` address is not claimed to be available. It requires a domain the owner controls, wildcard DNS, and hosting configured for tenant routing.
- The slug claim reserves a name in this Firebase project, not a domain name. An availability check is advisory; the atomic create-only claim is authoritative.
- Existing businesses without a slug keep working through active membership lookup. An owner is prompted to choose an available slug before the tenant workspace opens; other members are told to ask the owner to claim its address.

### Platform administrator access

- Platform-admin authorization uses a manually provisioned Firestore document: `platformAdmins/{firebaseAuthUid}` with `enabled: true` and `role: "platformAdmin"`.
- Create or revoke that document only through Firebase Console or a trusted administrative process. Client-side create/update/delete are denied by Firestore rules.
- To grant access, publish the rules, then in the `mandelageneralshop` Firestore console create `platformAdmins/{UID}` using the platform administrator's Firebase Authentication UID and fields `enabled: true` and `role: "platformAdmin"`. Set `enabled: false` or delete the record to revoke it.
- Platform administrators can read the platform's business and user profile documents. They do not automatically gain membership in business subcollections or access to inventory operations.
- The platform overview includes an explicit one-time-safe action to create the shared `Demo` tenant (`demo`) and add existing Firestore user profiles with no membership documents as `staff`. The running platform admin owns the tenant. Those users share Demo's business data; user accounts without a Firestore profile are not discoverable by this client-only migration.
- The migration can only run after publishing the updated rules. It refuses to reuse `demo` if that slug belongs to a different business or owner.
- The platform overview, businesses list, and users list are wired to Firestore. Plans/subscriptions, platform settings, and audit/activity menu entries are placeholders until their data models and workflows are defined.
- Publish the updated Firestore rules before provisioning or testing this role.

### Login-to-tenant routing

- On successful login from a tenant page, return directly to that tenant path. Otherwise resolve active memberships and route a sole membership to its tenant path; update same-origin routes in place so the user sees one landing page. When multiple memberships exist, require the user to choose one.
- Selecting or creating a business records the selected business locally for navigation, but membership documents and Firestore rules remain the authorization source.
- A user with no membership at the main app URL sees business setup and becomes the owner/member when the business is created. Opening a tenant URL without membership shows an unavailable message; it does not silently attach the account.
- An owner of a legacy business with no slug can choose and claim its tenant address; the atomic claim updates the business, unique slug record, and owner's membership index. Existing members resolve the slug from the business record.
- Existing registered users with no membership can be assigned to the shared Demo tenant by a platform admin from the overview. They are added as staff and routed to the Demo tenant on their next app load.
- Tenant routing on local development and GitHub Pages uses same-origin paths and retains Firebase Auth persistence.

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
