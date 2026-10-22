# DOne

## Overview
This document records what has already been implemented in the current app and what should still be done next.

## What has been done

### Authentication and user setup
The auth logic is implemented in [src/services/auth.service.ts](src/services/auth.service.ts).

Covered functionality:
- User registration with Firebase email/password signup
- Updating the Firebase profile display name
- Writing a user record to Firestore with `displayName`, `email`, and `createdAt`
- User login with email and password
- Password reset email sending
- Logout support

### Business and inventory base setup
Additional implementation work has been added in:
- [src/services/business.service.ts](src/services/business.service.ts)
- [src/modules/inventory/main.ts](src/modules/inventory/main.ts)
- [src/modules/inventory/service.ts](src/modules/inventory/service.ts)
- [src/modules/inventory/types.ts](src/modules/inventory/types.ts)

Covered functionality:
- Business creation with a generated ID
- Linking a user to an active business
- Reading the active business for a signed-in user
- Inventory product CRUD operations (add, list, fetch, update, delete)
- Inventory product form and reporting views
- Business setup flow if a user has no active business

### Code quality / validation
- The project compiles successfully with the existing TypeScript + Vite setup.
- Build validation command used: `npm run build`

## What should be done next

### 1. Browser workflow validation
The app has been opened locally and the safe, unauthenticated checks have been completed. The full end-to-end flow still needs an authorized test session:
- sign up or log in
- create a business
- add a product
- view product list
- update product details
- delete a product
- confirm inventory report/filtering works

#### Validation performed
- `npm run build` passed successfully.
- The local Vite app loaded and the product-list page rendered.
- The product-list route correctly showed “Sign in required” without an authenticated user.
- Submitting the sign-in form empty displayed “Please enter both email and password.”
- Firebase configuration keys are present in the local environment; their values were not displayed.
- Signed in with the authorized browser session; the inventory module displayed the business setup form.
- Attempted to create a clearly named validation business after explicit approval. Firestore rejected the batch with “Missing or insufficient permissions,” so no business or product CRUD flow was completed.
- Added the existing `firestore.rules` file to the Firebase CLI configuration in [firebase.json](firebase.json), so a future Firebase deployment can include those rules.
- Attempted to deploy only Firestore rules to the configured project `mandelageneralshop`. Deployment could not authenticate: the Firebase CLI has a saved account but cannot access projects or perform the deploy. No remote rules were changed.
- After the user manually published the rules, retried business creation in the signed-in browser. Firestore still returned “Missing or insufficient permissions”; the business setup form remains visible. No product workflow was attempted because no active business was created.

#### Validation blocked
The browser create-business request is still denied after the user manually published the rules. Confirm that the rules were published to the `mandelageneralshop` project's Firestore database (default database), and inspect Firestore Rules simulator/monitoring for the denied batch writes to `/businesses/{id}`, `/businesses/{id}/members/{uid}`, or `/users/{uid}`. The exact denied write must be identified before changing rules. After correcting the actual cause, retry business setup and finish product add, list, edit, delete, and report/filter validation using test data.

### 2. Business selection and multi-tenant logic
The app should support more complete business handling:
- selecting an active business when a user belongs to multiple business workspaces
- showing the current business clearly in the UI
- handling missing or invalid `activeBusinessId` safely
- preventing a user from creating or editing data without a selected business

### 3. Inventory UX improvements
The current module should be polished with:
- better empty-state messaging
- navigation consistency between pages
- clearer validation errors for product form fields
- confirmation for destructive actions
- refresh behavior after product updates and deletions

### 4. Security and data integrity checks
Before production use, the app should verify:
- only authorized users can modify a business
- business documents and product records are protected by Firestore rules
- data input is validated strictly on both client and server side
- no sensitive auth or business data is exposed in the front-end UI

### 5. Expansion into sales, purchases, and reporting
The next functional area should be to connect the app ecosystem beyond inventory:
- sales management
- purchases and suppliers
- stock movement tracking
- purchase/sales reports
- reconciliation and accounting workflows

## Notes
- The service relies on the shared Firebase configuration in [src/config/firebase.ts](src/config/firebase.ts).
- Firebase readiness is enforced via `assertFirebaseReady()` before each action.
- The `users` Firestore document includes metadata such as `displayName`, `email`, and `createdAt`.
- The current code provides a solid base, but the app still needs full product/business workflow verification and deeper business-logic completion.
