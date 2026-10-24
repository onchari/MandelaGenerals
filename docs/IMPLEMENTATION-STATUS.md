# Implementation status and delivery checklist

This is the canonical progress tracker for Mandela Generals. It combines the former implementation-status tracker, multi-tenant foundation checklist, and historical implementation notes. It distinguishes source-code presence from test and deployment evidence: a feature is not live merely because code or local Firestore rules exist.

Use [IMPLEMENTATION.md](./IMPLEMENTATION.md) for detailed workflows and code locations, [ARCHITECTURE.md](./ARCHITECTURE.md) for system structure, [DATABASE.md](./DATABASE.md) for Firestore data, and [SECURITY.md](./SECURITY.md) for authorization and deployment cautions.

**Legend:** Complete = implemented in source for the stated scope; Partial = some workflow exists but requirements remain; Pending = not implemented; Blocked / unverified = requires an external prerequisite or direct evidence.

## Current implementation status

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| Firebase Auth email/password account flows | Partial | Firebase Auth service and auth pages exist. Validate full browser workflows in each Firebase project. |
| User profile and account security | Partial | Own profile read/save, email-verification send/refresh, password reset, and lifecycle defaults exist. Verification-state synchronization and invitation/account lifecycle enforcement are incomplete. |
| Multi-tenant business bootstrap | Complete in source; deployment unverified | Business, slug claim, primary branch, owner member, and user membership index are written atomically. Verify rules in an emulator or Dev. |
| Business switching and tenant routes | Partial | Active membership lookup and path-based tenant routing exist. Complete cross-tenant browser tests remain. |
| Inventory product pages | Partial | Tenant-scoped product CRUD pages and rules exist. Browser regression, legacy data migration, and audit history remain. |
| Business-owner dashboard | Partial | Portfolio/member summary and inventory snapshot exist. Billing, subscriptions, and audit activity are not connected. |
| Users & Roles | Partial; source workflow implemented, rules unverified | Active owners can add an opted-in existing account from the email picker, choose a supported business role, and update non-owner member roles. New members start without branch access. No Auth account creation, invitation email, custom permissions, or rules-emulator validation. |
| Branch setup and assignments | Complete in source; deployment unverified | Owner UI can initialize/create/update branches, assign existing business members after onboarding from Users & Permissions, and designate the owner as branch manager. Does not migrate records or send invitations. |
| Isolated branch child workspaces | Partial | New businesses have an isolated-mode marker, workspace metadata, branch selection, branch-scoped products, and Firestore path guards. Branch-specific roles/memberships and most other modules remain incomplete. |
| Branch-aware stock and POS | Partial | Product quantities are independent per branch for new isolated-mode businesses. Stock movement ledgers, transfers, and branch POS workflows are absent. |
| Platform-admin role gate | Partial | Protected role-marker check and explicit rules exist. Provisioning remains manual/trusted. |
| Platform-admin directories | Partial | Business and tenant owner/admin directories are live read-only. Other panels are demo/session-only. |
| Legacy template pages | Not implemented as tenant workflows | Many older root HTML pages remain in the repository; only entries in `vite.config.ts` are part of the configured Vite build. Rule paths do not prove UI/service integration. |
| Plans, subscriptions, billing | Pending | No production billing integration or trusted subscription backend. |
| Audit logging | Pending | No trusted immutable server-side audit-event workflow. |

## Tenant foundation checklist

### Entry, dashboard, and permissions

- [x] Make the app root a public home page with sign-up and log-in calls to action.
- [x] Route authenticated users from sign-up/log-in callbacks to the app root.
- [x] Show business setup, a business picker, or the selected business dashboard based on active memberships.
- [x] Show business-scoped product totals, low-stock count, recent products, and role-appropriate inventory actions.
- [x] Include required entry, authentication, and inventory pages in the Vite production build.
- [x] Show the chosen slug's local and GitHub Pages URL suggestions before business creation.
- [x] Retain the tenant slug across dashboard-to-inventory navigation and provide a GitHub Pages `404.html` fallback for tenant dashboard paths.
- [x] Add the business-owner portfolio dashboard with business/member summaries, inventory snapshot, switching, and links to implemented workflows.
- [x] Identify subscription/revenue and activity data as not configured rather than showing sample values.
- [x] Add a Users & Permissions view with live tenant membership records, a standard user-type catalog, status, and role capability notes.
- [x] Let active business owners add existing registered accounts from an email picker after account-holder opt-in, assign a supported business role, and create the matching member/index records atomically without email or account creation.
- [x] Start added members with no branch access and provide separate owner assignment of branches later.
- [x] Allow owner updates to a non-owner member's supported fixed business role while preventing assignment of owner or platform-admin.
- [x] Display a read-only, grouped inventory, POS, finance, staff, and multi-user permission matrix based on current Firestore rules, including elevated `admin` behavior and branch scope.
- [x] Present proposed future RBAC defaults, detailed inventory/POS matrices, branch scopes, permission codes, and safeguards as design-only content; this does not change authorization.
- [x] Add self-service profile details and email-verification controls.
- [ ] Add email invitations or account provisioning only if a trusted workflow is selected; neither exists in the current Spark-compatible flow.
- [ ] Implement custom permissions and validate the fixed role-management rules in the Firestore Emulator.

### Step 1 — Secure tenant and branch foundation

- [x] Use `products` as the implemented inventory collection/schema; keep legacy data migration separate.
- [x] Implement Spark-compatible atomic client business creation constrained by Firestore `getAfter()` checks.
- [x] Atomically create the business, primary branch, unique slug claim, owner membership, and user membership index.
- [x] Keep slug claims create-only so simultaneous attempts to reserve a slug cannot both succeed.
- [x] Prevent direct client writes that create arbitrary businesses, memberships, or roles.
- [x] Restrict user profile and membership-index reads and enforce business access through active membership and role checks in Firestore rules.
- [x] Keep business selection separate from authorization; selected-business state is for navigation only.
- [x] Initialize new user profiles with default account, invitation, and email-verification lifecycle fields. Invitation delivery and verification enforcement remain deferred.
- [x] Create `businesses/{businessId}/branches/{branchId}` and an active `main` branch for new businesses and newly initialized Demo tenants.
- [x] Maintain owner-managed `branchIds` and explicit `allBranches` assignments on business membership records and user membership indexes.
- [x] Restrict branch reads to the owner or active members assigned to that branch; restrict branch creation and updates to the active owner and deny deletion.
- [x] Enforce branch assignment on branch-tagged sales and stock movements; require branch IDs for new tenants while preserving untagged legacy records.
- [x] Provide an owner-only branch UI to initialize legacy businesses, create/update branches, and assign active business members; account onboarding and role assignment happen separately in Users & Permissions.
- [x] Allow the owner to designate themselves as a branch manager without changing owner status or all-branch access.
- [x] Keep the owner authorized for all branches independently of member assignment fields.
- [x] Mark new businesses for isolated branch workspaces and initialize primary-branch workspace metadata.
- [x] Create branch workspace metadata atomically when adding or initializing branches.
- [x] Scope inventory CRUD, branch selection, navigation, and Firestore rules to the selected branch for isolated-mode businesses.
- [x] Preserve legacy business-level product paths only for businesses without isolated mode and warn that those products are not migrated into branch inventory.
- [ ] Design and test a migration for existing businesses; do not infer branch assignments or split existing tenant-wide inventory and transactions automatically.
- [ ] Back up active Firestore rules and confirm the target project before deployment.
- [ ] Deploy reviewed rules to Dev, validate business creation and inventory, then explicitly promote to Production.
- [ ] Publish the site and verify tenant routes on GitHub Pages.

### Step 2 — Memberships and business selection

- [x] Load the signed-in user's business memberships.
- [x] Automatically open the sole business, show setup when there are none, and show a selector when there are multiple.
- [x] Allow switching the selected business; membership remains the authorization source.
- [x] Reload active membership records before opening a workspace to handle revoked memberships and stale selections.
- [ ] Add authorized member invitations and role changes through trusted backend operations.

### Step 3 — Inventory

- [x] Align inventory collection names and document fields with the selected `products` schema.
- [x] Enforce role permissions for product create, read, update, and delete.
- [ ] Verify search, details, edit, low-stock report, and empty states in an authorized browser session.
- [ ] Add stock-change audit history when inventory is adjusted by sales or purchases.

### Step 4 — Other business workflows

- [ ] Apply selected-business and membership checks to sales, purchases, expenses, customers, and reports.
- [ ] Record stock movements transactionally with relevant sales/purchase operations.
- [ ] Keep business data isolated across tenants.
- [ ] Implement branch-level stock balances, transfers/receiving, and branch-scoped POS workflows.
- [ ] Implement independent branch roles/memberships, configurable settings, branch-scoped sales/purchasing/finance/reports, and audit history beneath the parent business.
- [ ] Test sibling-branch denial, parent-owner oversight, inactive branches, revoked access, and legacy migration in the Firestore emulator or controlled Dev project.

### Step 5 — Validation and rollout

- [ ] Test owner, manager, cashier/staff, inactive member, and non-member access.
- [ ] Test that cross-business reads and writes are denied.
- [ ] Validate business creation and inventory flows in the selected live project using clearly labeled demo data.
- [ ] Back up existing data and active rules before any live schema migration.
- [ ] Deploy reviewed rules to Dev, smoke-test, and promote to Production only after validation.

## Data and access facts

- A business is the tenant boundary; one owner account can have memberships in multiple businesses.
- New businesses set `primaryBranchId: "main"` and create an active `branches/main` record during bootstrap.
- Branch IDs are tenant-local. Branches cannot be used to reference another business.
- `businesses/{businessId}/members/{uid}.branchIds` and `.allBranches` are authoritative branch assignments. Matching fields on `users/{uid}/businessMemberships/{businessId}` are mirrored for client lookup consistency.
- Owners can access every branch. Other active members can access only assigned active branches, unless explicitly assigned `allBranches: true`.
- `managerUid` can designate the business owner as manager of a particular branch; it does not change the owner's role or restrict access to other branches.
- Product records still have a single business-wide quantity. Branch-level inventory balances and automatic legacy data migration are not implemented.
- The chosen target is for branches to have isolated, tenant-like operational workspaces while remaining child locations created and governed by the parent business. This target is not implemented; see the target design in [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), and [SECURITY.md](./SECURITY.md).
- New user profiles default to `accountStatus: active`, `invitationStatus: not_invited`, and `emailVerificationStatus: not_required`; invitation metadata is initialized to `null`. These are schema defaults, not invitation, verification, suspension, or membership enforcement.
- Platform-admin access uses a manually provisioned `platformAdmins/{firebaseAuthUid}` document with `enabled: true` and `role: "platformAdmin"`. Client-side creation/update/deletion is denied. Platform admins do not automatically gain membership in tenant subcollections or access to inventory operations.
- The platform overview's Demo action is an explicit operation that creates/initializes a shared `demo` tenant and assigns eligible existing user profiles without membership documents as staff. It does not enumerate Firebase Auth accounts lacking Firestore profiles.
- The `finances` and other legacy/template collection paths in Firestore rules do not establish an implemented product workflow.

## Environments and tenant addresses

- Development project: `mandelagenerals-dev`. Production project: `mandelageneralshop`. Confirm the intended project before any deployment.
- Development configuration is kept in ignored `.env.development`; `.env.development.example` is the shareable template. Local production builds use `.env.production` based on `.env.production.example`. Never commit actual environment files.
- `npm run dev` and `npm run build:dev` use development mode; `npm run build` is the production build. Development mode blocks Firebase initialization if configured with the production project ID.
- The Firebase CLI defaults to Development. Use `npm run deploy:dev` only after Development Firestore and Authentication are initialized.
- Production GitHub Actions variables must use the `mandelageneralshop` web-app configuration. The production workflow checks the project ID and auth domain before deployment.
- A prior setup note recorded `europe-west6` as the intended Dev Firestore region and a Cloud Firestore API/database-creation blocker. This is historical and must be rechecked in Firebase/Google Cloud Console; it does not establish current project readiness.
- Development and GitHub Pages tenant routes use same-origin paths (`/b/{slug}/`); GitHub Pages uses `https://onchari.github.io/MandelaGenerals/b/{slug}/`. A custom wildcard subdomain requires a controlled domain, wildcard DNS, and compatible hosting.
- The slug claim reserves a name in that Firebase project, not a domain name. The availability check is advisory; the atomic create-only claim is authoritative.
- Existing businesses without slugs can continue through active membership lookup. Owners must claim an available slug before opening the tenant workspace; members are directed to the owner.

## Validation and deployment evidence

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| TypeScript check and Vite production build | Passed | `npm run build` passed after the current account onboarding, role, and branch-management changes. Vite emitted existing legacy script-tag bundling warnings. |
| Patch whitespace | Passed | `git diff --check` passed after the current implementation changes. |
| Automated unit/integration suite | Not configured | No test script or dedicated test suite is configured in `package.json`. |
| Production GitHub Actions workflow | Configured in source | `.github/workflows/deploy.yml` builds on `main` or manual dispatch after checking production Firebase variables; no run status is asserted here. |
| Firestore Emulator rules validation | Blocked / not verified | Prior emulator startup failed because Java was unavailable. |
| Development Firestore rules deployment | Not confirmed | No deployment evidence available in this workspace history. |
| Production Firestore rules deployment | Not confirmed | Do not assume production rules match this repository. |
| Authenticated browser end-to-end tests | Pending | Requires a configured project and authorized test identities. |
| Production GitHub Pages verification | Pending | Confirm published commit, tenant route, and Production Firebase configuration. |

### Historical validation record

Earlier authorized-browser attempts to create a validation business were rejected with “Missing or insufficient permissions.” A Firebase CLI deployment attempt also failed authentication. No remote rules change was confirmed from those attempts. These are historical observations, not proof of current Firebase Console, CLI, or deployment state.

Earlier build and local UI checks were recorded, but they do not replace current emulator/rules validation or authenticated end-to-end tests. The current repository does not define a `functions` workspace; prior notes about a Functions build or Functions deployment are not current project instructions.

## Deployment safety

Rules deployment is separate from frontend build and Hosting deployment. Back up and validate rules in Development before Production; never deploy broad/open rules as a workaround. For an explicitly approved Development rules-only deployment:

```powershell
firebase deploy --only firestore:rules --project mandelagenerals-dev
```

This command deploys rules only, not Hosting. Confirm the target project before running. The package script `npm run deploy:rules:all` targets both environments and is not a substitute for staged validation.

## Documentation map

- [README.md](../README.md) is the project entry point.
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) describes implemented workflows, code locations, behavior, and evidence.
- [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), and [SECURITY.md](./SECURITY.md) cover system structure, data, and authorization.
- [platform-admin-guide.md](./platform-admin-guide.md) and [platform-admin-tasks-and-improvements.md](./platform-admin-tasks-and-improvements.md) cover the platform-admin surface and backlog.
- [MANDELA-SOFTWARE-REQUIREMENTS-SPECIFICATION.md](./MANDELA-SOFTWARE-REQUIREMENTS-SPECIFICATION.md) is a product requirements baseline, not implementation evidence.
