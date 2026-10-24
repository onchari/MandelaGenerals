# Architecture

## Scope

Mandela is currently a browser-rendered, multi-page TypeScript application that uses Firebase Authentication and Cloud Firestore directly from the client. Firestore Security Rules are the authorization boundary for client Firestore operations. There is no general-purpose application API or Cloud Functions service in the current repository.

## Current tenant hierarchy

```text
Firebase Auth identity (users/{uid})
└── Business membership(s)
    └── Business / tenant (businesses/{businessId})
        ├── Branches (branches/{branchId}; child workspace)
        │   ├── Workspace metadata (settings/workspace)
        │   └── Branch-scoped products (products/{productId}; isolated mode)
        ├── Members (members/{uid})
        ├── Legacy business-level products (legacy businesses only)
        ├── Sales and stock movements (where supported)
        └── Other business-scoped records
```

- A business is the tenant boundary, not an individual branch.
- One Firebase identity can have memberships in several independent businesses.
- Each branch belongs to exactly one business.
- A user's membership role and active state determine business-level access.
- `branchIds` and `allBranches` provide an additional branch scope for branch-aware records.
- The business owner is special: owner authorization grants access to every branch, independent of the stored branch assignment fields.
- `managerUid` on a branch is currently a designation, not an authorization role.

## Target branch model

The intended direction is for a branch to behave as an isolated child workspace with tenant-like operational characteristics, while being created, owned, and governed by its parent business. A branch is not an independently registered top-level business: the parent remains responsible for creating it, setting its lifecycle, and retaining oversight across branches.

In that model, each branch should have its own operational records and settings, including branch inventory and stock movements, sales/POS, purchases, and branch-scoped staff access and reporting. A user's Firebase Auth identity can be reused, but branch membership and permissions must be explicit. The parent owner retains cross-branch administration; branch staff should not gain access to sibling branches by default. Shared business-level definitions or consolidated reporting must be explicit rather than accidental.

New businesses are marked `branchWorkspaceMode: "isolated"` and store inventory under each branch. Branch selection is explicit in inventory links, and Firestore rules deny access to the legacy business-level products collection for those businesses. The branch's `settings/workspace` document records its parent business, branch ID, and inventory scope. This is a partial implementation: membership is still represented by the parent business member and its branch assignment, roles are inherited from that membership, and branch-specific POS, purchasing, finance, reports, and editable settings are not implemented.

Existing businesses are not silently migrated. Their branch-level products can be created under child branch paths, but older business-level products remain in the legacy collection and are not shown in branch inventory. A reviewed migration is required before such businesses can be switched to isolated mode.

## Application components

### Browser pages

Vite explicitly builds `index.html`, `404.html`, sign-in/sign-up/password-reset pages, profile, platform admin, and five inventory pages. The repository contains many additional legacy dashboard HTML pages (POS, sales, purchase, supplier, customer, settings, and component demos); these are not configured as Vite inputs and are not proof of implemented business workflows. The legacy dashboard HTML/CSS assets remain in the repository, while the current business/platform dashboards render through TypeScript modules.

### Services and UI

- `src/main.ts` handles the public entry, authenticated business workspace, owner dashboard, Users & Roles view, branch-management view, business routing, and event bindings.
- `src/platform-admin.ts` handles the separate platform-admin UI.
- `src/auth-forms.ts` binds login, registration, and password-reset forms; `src/profile.ts` handles self-profile, account security, and account-discovery consent.
- `src/modules/inventory/` implements inventory page behavior.
- `src/services/` wraps Firebase operations for authentication, profile, opt-in business-account discovery and membership/role management, business setup/selection, inventory, dashboard summaries, and branch management. `src/environment-indicator.ts` surfaces the selected Firebase environment.
- `src/config/firebase.ts` initializes Firebase only if required environment values exist and the configured project matches the Vite mode.

### Data and authorization

The client reads/writes Firestore with Firebase SDK. `firestore.rules` validates document shapes and relationships, checks authentication and business membership, and limits sensitive actions. Local selected-business state is not an authorization input.

For owner onboarding, the account holder opts in to a separate `businessUserDirectory/{uid}` record from Profile. A signed-in owner selects a listed account by email; the client uses the selected UID to atomically create a fixed-role business membership and membership index with no branch assignments. The owner assigns branches later. No invitation or account-creation email is sent.

## Main workflows

### Registration and business setup

1. User creates or signs in to a Firebase Auth account.
2. App loads active user business membership indexes.
3. If none exist, user can create a business; if one exists, it opens; if several exist, user chooses.
4. Business creation commits the tenant, primary `main` branch, unique slug claim, owner membership, and owner membership index atomically.
5. Firestore rules validate the related writes with post-write document checks.
6. New businesses set `branchWorkspaceMode: "isolated"` and initialize the primary branch workspace metadata in the same batch.

### Tenant routing

Tenant routes use same-origin paths such as `/b/{slug}/`. This is compatible with local development and the GitHub Pages project site. The slug helps route to a tenant; Firestore membership rules still determine access.

### Branch management

1. Owner loads branches and membership roster for the selected business.
2. Legacy businesses can explicitly create a primary `main` branch and set owner branch metadata.
3. Owner can create/edit branches, designate themselves as a branch manager, and assign active members.
4. An existing account can be added by Firebase Auth UID as `staff` with selected branch scope.
5. Membership and the per-user membership index are written together; isolated-workspace membership metadata is mirrored for new businesses.
6. The owner opens an active branch workspace; inventory links carry its branch ID.
7. Product CRUD operates at `businesses/{businessId}/branches/{branchId}/products`; rules validate the parent membership, branch assignment, active branch, and fixed role.
8. New branch creation initializes an immutable workspace metadata record in the same batch.

The current product quantity is branch-scoped for isolated-mode businesses. This does not yet imply a stock movement ledger or branch-specific operations in every module.

### Remaining branch workspace lifecycle

1. The parent business owner creates and configures a branch.
2. The application creates the branch's operational workspace within the parent business boundary.
3. The owner explicitly assigns branch staff and branch-scoped permissions.
4. Branch operations use only that branch's records unless a parent-level owner action explicitly spans branches.
5. The parent owner can administer and consolidate across its branches; branch members cannot access sibling workspaces by default.

Independent branch roles/memberships, configurable workspace settings, POS, purchasing, finance, reporting, audit history, migration from existing tenant-wide products, and end-to-end authorization tests remain to be implemented. Do not treat the partial inventory scope as completion of those features.

### Platform administration

Platform admin status is separate from business roles and is read from a protected `platformAdmins/{uid}` document. Platform admins have only the reads explicitly granted by rules and are not automatically members of business tenants.

## Environment and delivery

| Environment | Firebase project | Frontend delivery |
| --- | --- | --- |
| Development | `mandelagenerals-dev` | Local Vite and Firebase Hosting |
| Production | `mandelageneralshop` | GitHub Pages via production build workflow |

Firestore rules deploy independently from Hosting. Production and Dev identities, tenants, and data are distinct Firebase-project data. Production build values are not selected by Git branch alone; Vite mode and corresponding environment values determine the project.

The GitHub Actions workflow at `.github/workflows/deploy.yml` validates the production project ID and Firebase auth domain before building and deploying GitHub Pages. `.firebaserc` configures Firebase CLI aliases. `firebase.json` configures Firestore rules deployment and Firebase Hosting rewrites. The `npm run deploy:dev` command deploys Hosting only; `npm run deploy:rules:all` targets rules for both projects.

## Current architectural boundaries

- No trusted general API or Cloud Functions workflow is implemented; account discovery and fixed role changes are client operations constrained by Firestore rules.
- No invitation sender or Firebase Auth account-provisioning workflow exists.
- No branch stock ledger, transfer workflow, branch-specific POS context, branch-specific memberships/roles, or universal branch-aware reporting layer exists.
- Billing and subscription processing are not connected.
- Audit/event history is not implemented as a trusted append-only service.
- The current rules need Emulator or controlled project validation before rollout; source inspection alone is not a deployment or security test.
