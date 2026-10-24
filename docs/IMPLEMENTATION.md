# Implementation guide

This document describes behavior evidenced in the current source tree. Product proposals in the SRS and role blueprint are not treated as implemented behavior.

## How to maintain this guide

For each code change, inspect the current implementation, related Firestore rules, configuration, and available validation. Update this guide when module behavior or its implementation evidence changes. Update [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [SECURITY.md](./SECURITY.md), and [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) when their scope changes. Record the exact commands run and avoid claiming an external deployment or security guarantee without direct evidence.

## 1. Authentication and profile

### Purpose and workflow

Users register and sign in with Firebase Authentication. The app resolves their business memberships after authentication and routes them to a tenant, business picker, or setup flow. Users may edit their own display name and phone number and opt into business-account discovery on the profile page; password-reset and email-verification operations are part of the account workflow where exposed by the UI.

### Implementation

- `src/auth-forms.ts` wires the signup, sign-in, and password-reset pages.
- `src/services/auth.service.ts` wraps Firebase Authentication operations.
- `src/services/profile.service.ts` reads and saves the signed-in user's profile and keeps the Firebase Auth display name synchronized with Firestore.
- `src/profile.ts` renders and binds profile editing, email-verification status/send/refresh, password reset, and membership summary controls.
- Opting into discovery creates a separate `businessUserDirectory/{uid}` document containing the account email, display name, and consent flag. Opting out deletes that directory record.
- `src/types/user.ts` defines lifecycle metadata defaults.
- `src/main.ts` handles authenticated routing and app/dashboard rendering.
- `firestore.rules` limits profile reads to the user or platform-admin role and limits a user profile update to their own profile fields.

New profiles initialize `accountStatus: "active"`, `invitationStatus: "not_invited"`, and `emailVerificationStatus: "not_required"` with null invitation metadata. The profile page can send/refresh Firebase email verification, but Firestore `emailVerificationStatus` is a default field and is not synchronized as a verification-enforcement policy. Invitation metadata does not send invitations.

### Status and known limitations

Self-service auth, profile updates, email-verification controls, password reset, and opt-in directory controls are implemented in source. User invitations, suspension enforcement throughout every workflow, and business-owner access to another user's private profile are not implemented. Account lifecycle metadata alone does not provision business membership.

## 2. Multi-tenant businesses and business selection

### Purpose and workflow

One Firebase login may belong to multiple businesses. A user creates a business when no active membership exists, opens a single active membership directly, or chooses among multiple businesses. A tenant slug provides a same-origin workspace route; selection is navigation state, not authorization.

### Implementation and data flow

- `src/services/business.service.ts` provides membership lookup, business setup, slug claim, and selected-business helpers.
- `createBusiness` writes the business, primary branch, slug claim, owner member, and owner membership index in one Firestore batch.
- `getUserBusinesses` reads the signed-in user's membership index and validates its role and optional branch metadata.
- `src/main.ts` provides setup, business selection, owner portfolio, and tenant routing.
- `firestore.rules` validates the related create-only slug claim and owner bootstrap writes with post-batch `getAfter()` checks.

New tenant data is stored under `businesses/{businessId}` and its subcollections. Existing businesses without branch metadata can be initialized explicitly from the owner dashboard; no existing stock or transaction is moved by initialization.

### Security and status

Firestore membership is authoritative; local selected-business state only controls navigation. Tenant bootstrap and slug claim are implemented locally. Live rules deployment and cross-tenant integration testing are not confirmed.

## 3. Inventory

### Purpose and workflow

The inventory pages support product listing, creation, editing, details, and reporting in the selected branch workspace.

### Implementation

- `src/modules/inventory/main.ts` connects the inventory pages to the service layer.
- `src/modules/inventory/service.ts` implements the page-facing product operations.
- `src/modules/inventory/types.ts` defines `Product` and its input shape.
- `src/services/inventory.service.ts` contains a separate tenant-scoped product-service implementation that is not imported by the current dashboard or inventory-page entry modules; the active inventory page operations use `src/modules/inventory/service.ts`.
- `addproduct.html`, `productlist.html`, `editproduct.html`, `product-details.html`, and `inventoryreport.html` are Vite entry pages.
- New businesses use `businesses/{businessId}/branches/{branchId}/products/{productId}`. A branch selector is shown in inventory navigation, and links preserve the selected branch ID.
- New business bootstrap sets `branchWorkspaceMode: "isolated"` and creates `branches/main/settings/workspace`. Branch creation and legacy branch initialization also create the corresponding workspace metadata.
- Existing businesses without the isolated mode remain compatible with business-level product records. Those legacy products are not shown or migrated into branch inventory; the inventory UI warns that their quantities are unassigned.

Firestore rules validate product fields and authorize branch product access through parent business membership, active branch assignment, and role. For isolated-mode businesses, the old business-level product path is denied. See [DATABASE.md](./DATABASE.md) and [SECURITY.md](./SECURITY.md) for the current schema and limits.

### Status and known limitations

Product CRUD pages and branch-scoped reads/writes exist for isolated-mode businesses. Browser end-to-end workflows, concurrency behavior, branch sibling-denial tests, and migration from legacy inventory records have not been verified. Branch quantities are independent product fields, but there is no auditable stock adjustment ledger or transfer workflow.

## 4. Owner dashboard, users, and branches

### Purpose and workflow

The owner dashboard presents portfolio-level business/member summaries and a selected-business inventory snapshot. In Users & Permissions, an active business owner can choose an opted-in existing account from an email dropdown, add it with a fixed business role, and later assign its branch access from Manage Branches. The owner can also change the role of an existing non-owner member. Branch management allows the active owner to initialize legacy branch metadata, create/update branches, assign current members, and designate the owner as a branch manager for a location.

### Implementation

- `src/main.ts` implements dashboard view rendering, navigation, forms, and event handlers.
- `src/services/business-dashboard.service.ts` loads business summaries and membership roster records.
- `src/services/business-members.service.ts` reads opted-in accounts and creates memberships plus their user indexes atomically with no branch access; it also updates supported roles on both membership records.
- `src/services/branch.service.ts` implements owner-checked branch setup, CRUD, and branch assignment for existing members.
- `src/profile.ts` and `src/services/profile.service.ts` provide the account holder's opt-in/opt-out control for the email picker.
- `src/home.css` provides owner dashboard and branch-management styles.
- `firestore.rules` validates discovery records, restricts membership creation and role changes to the active owner, requires the selected account to be discoverable, mirrors membership/index updates, and limits branch management and assignment to the active owner.
- [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) is the consolidated status tracker, tenant foundation checklist, and deployment-readiness record.

The add-user picker can list up to 100 opted-in directory entries for any signed-in Mandela account. The displayed email identifies the account; the selected UID is used to create an active membership with one of `admin`, `manager`, `cashier`, or `staff`, plus a matching user membership index. New members begin with `branchIds: []` and `allBranches: false`. The directory email is matched exactly to the existing profile email in Firestore rules; the app does not use a global lookup of private profile emails. The flow does not create an Authentication account or send an invitation or other email. The member can be assigned branches later in Manage Branches. `owner` and platform-admin roles are not assignable from this page.

The branch `managerUid` is a designation only. The current UI allows the owner to designate themselves; it does not change their owner role or access to other branches, and it does not grant a separate manager permission set.

### Status and known limitations

Branch setup and assignment UI and owner-managed account/role controls are implemented locally. New businesses have parent-created branch workspaces and isolated branch product collections; owner dashboard branch links open the selected workspace. Existing branch assignments are not inferred, and no legacy records are migrated. Independent branch roles/memberships, transfers, branch-specific POS, finance/reporting workflows, configurable settings, and audit history remain incomplete. The Firestore rules have not been Emulator-validated or confirmed deployed.

## 5. Platform administration

### Purpose and workflow

Platform administration is a separate access domain from business-owner controls. The platform page checks a trusted `platformAdmins/{uid}` role marker. Businesses and tenant owner/admin records are available as live read-only directories; other platform panels are illustrative or session-only.

### Implementation

- `platform-admin.html`, `src/platform-admin.ts`, and `src/platform-admin.css` implement the page.
- `src/services/business.service.ts` exposes platform directory reads and the guarded Demo-tenant initialization flow.
- `firestore.rules` denies client writes to platform-admin role markers and separately grants platform-admin reads where defined.
- [platform-admin-guide.md](./platform-admin-guide.md) documents each module's live versus simulated behavior.

### Status and known limitations

Platform role checks and selected read-only directories are implemented. Subscriptions, payments, global settings, server-backed audit events, tenant suspend/restore actions, and a trusted platform API are not implemented by the demo page.

## 6. Environments and build

- `src/config/firebase.ts` selects expected Firebase project IDs by Vite mode and rejects mismatches.
- `vite.config.ts` configures the GitHub Pages base path and multi-page build.
- `firebase.json` points Firestore deployment to `firestore.rules` and configures Firebase Hosting.
- `.env.development.example` and `.env.production.example` document environment variable names. Actual environment files are local and ignored.
- `.github/workflows/deploy.yml` installs dependencies, validates required production Firebase variables and project/auth-domain IDs, builds the production site, and deploys the artifact to GitHub Pages on `main` or manual dispatch.
- `.firebaserc` maps `default` and `development` to `mandelagenerals-dev`, and `production` to `mandelageneralshop`.

Current project IDs are `mandelagenerals-dev` for development and `mandelageneralshop` for production. Hosting and Firestore rules are separate deployments; building or deploying the frontend does not publish rules.

## 7. Legacy dashboard template

The root contains numerous HTML pages and `assets/` from the original dashboard template. Only the entries listed in `vite.config.ts` are included in the configured Vite build. The remaining pages (including POS, sales, purchasing, suppliers, customers, expenses, and settings templates) are not evidence of live tenant workflows. Firestore rules include some corresponding collection paths, but those rules do not wire the legacy pages to tenant-scoped data.

## Validation evidence

Validation for the current user/role and branch workflow:

| Command/check | Result | Scope |
| --- | --- | --- |
| `npm run build` | Passed | TypeScript no-emit check and Vite production build completed; Vite emitted existing warnings about legacy non-module script tags in template HTML. |
| `git diff --check` | Passed | No patch whitespace errors. |
| Firestore Emulator | Not run successfully | A prior attempt was blocked because Java was unavailable in the environment; the current member/directory rules need emulator validation. |
| Rules deployment | Not performed | Local source changes do not establish deployed state. |
| Authenticated browser workflow | Not verified | Requires a configured Firebase project and authorized test account. |

The repository's `package.json` does not define an automated test script. Re-run validation against the current worktree before relying on these historical results.
