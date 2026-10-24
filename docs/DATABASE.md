# Database guide

Cloud Firestore is the current persistent data store. This guide describes fields evidenced in the application services and `firestore.rules`; it is not a promise that every optional field exists on every legacy document.

## Identity and membership

### `users/{uid}`

Represents a Firebase Auth user's application profile.

| Field | Meaning |
| --- | --- |
| `displayName` | User's display name. |
| `email` | Profile email copied from Firebase Auth at profile creation; private to the user/platform-admin read path. |
| `createdAt` | Firestore timestamp for profile creation. |
| `phoneNumber` | Optional user-editable phone number. |
| `accountStatus` | Lifecycle field; new profiles default to `active`. |
| `invitationStatus` | Lifecycle placeholder; defaults to `not_invited`. |
| `emailVerificationStatus` | Lifecycle placeholder; defaults to `not_required`. |
| `invitedAt`, `invitedBy`, `invitationExpiresAt` | Invitation metadata placeholders initialized to `null`. |

Lifecycle fields do not currently implement tenant invitations or account suspension enforcement.

### `businessUserDirectory/{uid}`

Separate, user-controlled directory record used by the business account picker:

```text
email: string
displayName: string
discoverable: true
updatedAt: timestamp
```

The owner of the account creates/updates the record by opting in on Profile and removes it by opting out. The email must exactly match that account's `users/{uid}.email` profile value. Signed-in Mandela accounts can list discoverable entries with a Firestore query limit of at most 100; pagination is not implemented. This consent record does not add the account to a business.

### `users/{uid}/businessMemberships/{businessId}`

User-facing index of a person's active/inactive business memberships. Current application data includes `businessName`, optional `slug`, `role`, `active`, `joinedAt`, and optional `branchIds` / `allBranches`. The tenant member document is the authorization source; this index is mirrored for account routing and business selection.

## Tenants

### `businesses/{businessId}`

| Field | Meaning |
| --- | --- |
| `name` | Tenant/business name. |
| `slug` | Tenant route identifier. |
| `ownerId` | Firebase Auth UID of the business owner. |
| `createdAt` | Firestore timestamp. |
| `primaryBranchId` | Optional branch identifier; new branch-enabled businesses use `"main"`. Its absence identifies a legacy tenant for compatibility checks. |
| `branchWorkspaceMode` | New businesses use `"isolated"` to require branch-scoped products. Existing businesses without this field remain on the legacy business-product path until an explicit migration. |
| `status`, `plan`, `planName` | Optional fields read by dashboards if present; not required by the current business create rule. |

### `businesses/{businessId}/members/{uid}`

Current membership shape:

```text
role: "owner" | "admin" | "manager" | "cashier" | "staff"
active: boolean
joinedAt: timestamp
branchIds?: string[]
allBranches?: boolean
```

Owners can read/manage tenant membership under the specific rule conditions. New owner-added accounts must have an active profile and opt-in directory record; the owner chooses `admin`, `manager`, `cashier`, or `staff`. Both the tenant member and user membership index are created atomically, initially with `branchIds: []` and `allBranches: false`. Owners can later assign branch access and update a non-owner member's supported role. Owner and platform-admin roles cannot be assigned through this workflow. User invitations and arbitrary custom role assignment are not enabled.

## Branches

### `businesses/{businessId}/branches/{branchId}`

```text
name: string
address?: string
status: "active" | "inactive"
createdAt: timestamp
isPrimary: boolean
managerUid?: string
```

`managerUid` may currently be set to the business owner's UID as a branch-manager designation. It does not by itself grant manager permissions. `main` is the default primary branch ID for newly created or explicitly initialized tenants.

Branch IDs are only meaningful within their parent business. Never accept a branch ID from another tenant as if it were globally valid.

### `businesses/{businessId}/branches/{branchId}/settings/workspace`

New branch workspaces are initialized with immutable metadata:

```text
parentBusinessId: string
branchId: string
inventoryMode: "branch_scoped"
createdAt: timestamp
```

Firestore rules ensure the document belongs to the matching parent business and branch. It is a workspace marker, not a full configurable settings model.

### Branch-scoped products

For businesses with `branchWorkspaceMode: "isolated"`, products are stored at:

`businesses/{businessId}/branches/{branchId}/products/{productId}`

The product fields remain `name`, `sku`, `quantity`, `reorderLevel`, `costPrice`, `sellingPrice`, and `createdAt`; quantities are independent per branch. Rules validate both the branch and the parent business membership. The old `businesses/{businessId}/products` path remains available only to businesses without isolated mode, for compatibility. Existing products are never copied automatically.

### Remaining target branch workspace data

The selected direction is for a branch to be an isolated child workspace created and governed by its parent business. Preserve the parent path as the top-level tenant boundary, and scope operational records by branch beneath it. A future schema could use paths such as:

```text
businesses/{businessId}/branches/{branchId}
businesses/{businessId}/branches/{branchId}/members/{uid}
businesses/{businessId}/branches/{branchId}/products/{productId}
businesses/{businessId}/branches/{branchId}/sales/{saleId}
businesses/{businessId}/branches/{branchId}/stockMoves/{movementId}
businesses/{businessId}/branches/{branchId}/settings/{settingId}
```

Branch-scoped members/roles, sales, stock movements, purchases, settings, and reports remain future paths, not existing schema contracts. Finalize which catalogs/settings are branch-owned versus explicitly shared before implementing those modules. User identity remains global; current membership is still stored at the parent business with `branchIds`/`allBranches`, and the role is inherited from that membership. Parent-business ownership retains cross-branch oversight. Avoid copying or moving existing business-wide records until an explicit migration and rollback plan is approved.

## Inventory and operations

### Product document fields

The product contract enforced in Firestore rules is:

```text
name: string
sku: string
quantity: integer >= 0
reorderLevel: integer >= 0
costPrice: integer >= 0
sellingPrice: integer >= 0
createdAt: timestamp
```

The `Product` TypeScript interface exposes `id` (document ID), `name`, `sku`, `quantity`, `costPrice`, `sellingPrice`, and `reorderLevel`. Under isolated mode, each branch has an independent product record and quantity. Shared product catalogs and stock movement history are not implemented.

### Branch-aware legacy operational records

The current rules include tenant subcollections such as:

- `businesses/{businessId}/sales/{saleId}`
- `businesses/{businessId}/stock_moves/{moveId}`
- `businesses/{businessId}/items/{itemId}`
- `businesses/{businessId}/shoe_sizes/{itemId}`
- `businesses/{businessId}/business_days/{dayId}`
- `businesses/{businessId}/finances/{entryId}`
- `businesses/{businessId}/expenses/{expenseId}`
- `businesses/{businessId}/cashTransactions/{transactionId}`
- `businesses/{businessId}/employees/{employeeId}`
- `businesses/{businessId}/payroll/{payrollId}`
- `businesses/{businessId}/types/{typeId}`
- `businesses/{businessId}/wishlist/{itemId}`
- `businesses/{businessId}/purchase_budgets/{budgetId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/customer_txns/{transactionId}`
- `businesses/{businessId}/invites/{inviteId}`
- `businesses/{businessId}/sync_metadata/{docId}`

Exact document schemas vary; consult the relevant Firestore rule validators and current page/service code before changing them. Several paths are retained for legacy/template compatibility and do not have a current tenant-aware UI workflow. Invite documents are readable only under the rule's administrator check and client writes are denied. Rules check `branchId` on branch-aware sales and stock movement operations. Businesses without `primaryBranchId` retain a compatibility path for untagged legacy records; those records are not automatically assigned to a branch.

## Platform and slug records

- `businessSlugs/{slug}` reserves a tenant slug. Creation is constrained to the atomic tenant bootstrap or claim flow; claims are intended to be create-only.
- `platformAdmins/{uid}` is a trusted platform-role marker with `enabled: true` and `role: "platformAdmin"`. Clients cannot create/update/delete it.
- `devTesters/{uid}` and `environmentConfig/{configId}` appear in rules for environment access/configuration controls; inspect current rules before using or modifying these records.

## Rule coverage versus application coverage

The rules also define root-level `platformAdmins`, `environmentConfig`, `devTesters`, and `businessSlugs` records. A catch-all rule denies all unmatched paths. A declared match path documents access policy only; it does not prove that a built HTML page, service, or user workflow exists. The Vite entry list is authoritative for the configured multi-page build.

## Relationships

```text
users/{uid}
  └── businessMemberships/{businessId} ── references ── businesses/{businessId}

businesses/{businessId}
  ├── members/{uid} ── matches user's membership index
  ├── branches/{branchId}
  ├── products/{productId}
  ├── sales/{saleId} ── optional branchId
  └── stock_moves/{moveId} ── optional branchId
```

This diagram omits the implemented branch `settings/workspace` and `products` subcollections for readability. Branch-scoped sales, stock movements, purchasing, finance, and reporting paths remain future work.

## Validation and migration guidance

- Firestore rules are the enforced data validation layer for client writes; TypeScript form validation improves UX but is not a security boundary.
- Keep the member document and its user membership index consistent in one batch when changing branch assignments or adding a member.
- Do not move or split existing products, stock, sales, or finance records during branch initialization without an explicitly designed migration.
- Before a migration, back up data and rules, map legacy records, plan rollback, and test both allowed and denied access.
- The repo currently has no documented required composite Firestore indexes for the described client queries; verify index errors from actual queries before adding index configuration.
