# Security and permissions

## Security model

Authentication is provided by Firebase Authentication. Client Firestore access is governed by `firestore.rules`. UI visibility, route parameters, selected-business state, and TypeScript checks are not trusted authorization controls.

For each tenant operation, rules should enforce the authenticated identity, active tenant membership, permitted role/action, and branch scope where applicable. Related tenant bootstrap and membership-index writes are validated with `getAfter()` so a batch cannot establish only one side of a relationship.

## Tenant isolation

- Tenant data is nested beneath `businesses/{businessId}`.
- Membership is checked against `businesses/{businessId}/members/{uid}`.
- User membership indexes are for self-service routing and are not the authority for tenant resource reads/writes.
- Business selection is local navigation context only.
- Cross-tenant branch identifiers do not grant access to another tenant.
- Platform-admin status is a separate identity domain and does not automatically confer tenant membership.

## Branch access

- Owners are authorized for every branch by the `isOwner` rule helper, regardless of branch assignment fields.
- Other members need an active membership and either `allBranches: true` or an assigned branch ID; the branch itself must be active.
- Owner-only branch writes include creation/update and branch assignment.
- In Users & Permissions, an active business owner can add an existing account only if it has an active profile and its owner has opted into `businessUserDirectory`. Firestore rules require the exact directory email to match the private profile email.
- The email picker is a separate opt-in directory readable by any signed-in Mandela account, not only business owners. Its queries must set a limit of at most 100; pagination is not implemented. The UI resolves the selected email to its UID and creates the tenant member plus user membership index atomically.
- New members receive one of the fixed roles `admin`, `manager`, `cashier`, or `staff`, with no branch access (`branchIds: []`, `allBranches: false`). The owner may assign branches later or update a non-owner member's fixed role. Owner and platform-admin cannot be assigned here.
- The workflow does not create an Auth user or send an invitation/account email. User-controlled directory opt-out deletes the listing but does not revoke an existing business membership.
- `managerUid` is currently just a branch designation and is not consulted by authorization helpers.
- For businesses with `primaryBranchId`, rules require branch scope for new branch-aware sales/stock-movement records; legacy untagged data remains tenant-wide for compatibility.
- Isolated-mode businesses store products beneath `businesses/{businessId}/branches/{branchId}/products`; reads require active branch access, and writes additionally require a parent business role allowed to manage inventory.
- New isolated-mode business roots deny reads/writes to `businesses/{businessId}/products`. That legacy path stays available for existing businesses without the mode marker.

### Remaining isolated branch workspace security

The current implementation isolates product records for new businesses, but the whole child-workspace model is incomplete:

- Parent-business ownership must authorize administration across its child branches without making branch staff members of sibling workspaces.
- Independent branch memberships/roles and permissions must be implemented; today access is derived from parent membership `branchIds`/`allBranches` and the inherited fixed role.
- Sales, purchasing, finance, editable settings, and reports must be scoped consistently to the same parent business and branch.
- Cross-branch sharing or consolidated views must be explicit, authorized parent-level operations.
- Parent and branch status changes must have defined effects on branch access; inactive or unauthorized branches must reject operational reads and writes.
- Bootstrap and membership changes spanning parent and branch records must be atomic and validated by Firestore rules or a trusted backend.
- Existing business-wide inventory and legacy records require a separately tested migration; do not infer branch ownership or silently copy mutable stock balances.

The current branch UI and rules do not yet provide full isolation of every module. Emulator or controlled-project tests must cover sibling-branch denial, parent-owner oversight, inactive branches, membership revocation, and cross-tenant denial before rollout.

## Roles and limitations

Current tenant role values are `owner`, `admin`, `manager`, `cashier`, and `staff`. The rules implement fixed behavior for these roles. The owner UI's current permission matrix is descriptive; it is not an editable authorization policy. Recommended future role templates and permission codes are design-only.

Business owners cannot manage platform-admin records. Client writes to `platformAdmins/{uid}` are denied; role provisioning/revocation must use a trusted administrative process.

## Profile privacy

Users can read their own profile and membership index. Platform admins have only the explicit profile/business read permissions granted in the rules. The business roster does not reveal email addresses for members who did not opt in. Opted-in email addresses are intentionally visible to signed-in Mandela accounts in the account picker. The profile page can send Firebase verification email and refresh Auth verification status; the Firestore lifecycle metadata is not an enforced requirement for tenant access.

## Legacy pages and rules

The repository contains legacy HTML templates for POS, sales, purchases, customers, suppliers, expenses, and settings. Most are not configured as Vite build entries and are not thereby secure tenant workflows. Firestore rules include several corresponding collection paths, but each UI/service integration must be verified separately. Do not treat a template page or a rules match as proof of end-to-end access control.

## Deployment safeguards

1. Confirm the Firebase project ID before any deployment.
2. Back up the active Firestore rules.
3. Review the entire `firestore.rules`, not only the changed helper.
4. Validate rules in the Firestore Emulator or a controlled development project using allowed and denied cases.
5. Deploy to Dev first; test business bootstrap, membership, branch assignments, and isolation.
6. Deploy to Production only after review and explicit approval.
7. Test the live project after deployment and record the exact project and outcome.

`firebase.json` points deployments at the local `firestore.rules`. Frontend build/Hosting deployment does not deploy Firestore rules. The npm script `deploy:rules:all` targets both `mandelagenerals-dev` and `mandelageneralshop`; inspect its target and current rules before invoking it.

## Verification status and known gaps

- The current user-directory, role-update, and membership-creation rules have not yet been validated in the Firestore Emulator.
- A prior Emulator attempt was blocked because Java was unavailable; the branch-scoped rules have not been Emulator-validated.
- The rules have not been confirmed deployed to Dev or Production.
- There is no comprehensive automated rules test suite in the repository.
- Invitations, configurable custom roles, approval workflows, immutable audit events, server-side billing, and complete account suspension enforcement are not available. Fixed owner-authorized business role assignment is client-driven and Firestore-rule-guarded, not a trusted backend workflow.
- Existing businesses and legacy untagged records need a separately planned migration and access review.

These statements describe current evidence and gaps, not a certification or guarantee of security.
