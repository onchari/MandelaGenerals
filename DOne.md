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
- Spark-compatible atomic business creation through a Firestore batch constrained by `getAfter()` security rules
- Atomic creation of the business, slug claim, owner membership, and user membership index
- Listing a user's active business memberships
- Persisting selected business locally for navigation, while Firestore rules remain the authorization source
- Switching between multiple active business memberships
- Inventory product CRUD operations (add, list, fetch, update, delete)
- Inventory product form and reporting views
- Business setup flow if a user has no active business
- Business-role checks in the inventory UI and Firestore rules

### App entry and business dashboard
- Replaced the app root with a public home page offering sign-up and log-in.
- After authentication, the root now shows business setup, a selector for multiple memberships, or a dashboard for the selected business.
- The business dashboard shows product count, total stock, low-stock count, inventory cost value, recent products, and role-appropriate inventory links.
- Added the required auth and inventory HTML entries to the Vite build.

### Business-selected tenant addresses
- Added an editable, name-suggested tenant slug with Firestore availability feedback to both business setup forms.
- Atomically reserve each new slug alongside its business and owner membership records; Firestore rules make the claim create-only and validate the related bootstrap writes.
- Show local-host and GitHub Pages URL suggestions. GitHub Pages uses a tenant path because it does not provide project-site wildcard subdomains.
- Preserve tenant selection in inventory links and add a `404.html` app fallback for GitHub Pages tenant dashboard paths.
- Preserve access to existing no-slug businesses through their legacy active-business membership record; they do not receive an address automatically.

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
- `npm run build --prefix functions` passed successfully.
- Firebase config JSON validation and `git diff --check` passed.
- `npm audit --omit=dev --prefix functions` passed with zero reported vulnerabilities after updating Firebase Admin/Functions dependencies.
- Firestore Emulator validation could not run because Java is not installed; no live Firebase rules or functions were changed.
- The local Vite app loaded and the product-list page rendered.
- The product-list route correctly showed “Sign in required” without an authenticated user.
- Submitting the sign-in form empty displayed “Please enter both email and password.”
- Firebase configuration keys are present in the local environment; their values were not displayed.
- Signed in with the authorized browser session; the inventory module displayed the business setup form.
- Attempted to create a clearly named validation business after explicit approval. Firestore rejected the batch with “Missing or insufficient permissions,” so no business or product CRUD flow was completed.
- Added the existing `firestore.rules` file to the Firebase CLI configuration in [firebase.json](firebase.json), so a future Firebase deployment can include those rules.
- Attempted to deploy only Firestore rules to the configured project `mandelageneralshop`. Deployment could not authenticate: the Firebase CLI has a saved account but cannot access projects or perform the deploy. No remote rules were changed.
- After the user supplied the direct-client rules matching the local rules, reloaded the signed-in browser and retried business creation as “Inventory Validation 20261022 2008.” Firestore still returned “Missing or insufficient permissions”; the business setup form remains visible. No product workflow was attempted because no active business was created.
- The implementation has since been changed to use Spark-compatible atomic business creation and the app's `products` schema. The stricter membership/role rules are local only and have not been deployed; browser workflow validation must wait until deployment.
- The Firestore rules preserve the previously shared legacy collection paths and constraints while adding the `products` schema.
- These latest tenant-address changes are local only and have not been deployed to Firebase or GitHub Pages. The slug availability query and atomic batch still need validation against the deployed rules.

#### Validation blocked
The current Firestore rules have not been deployed. Firebase CLI authentication previously failed, so business creation may still be denied until the updated rules are deployed to `mandelageneralshop`. This Spark-compatible implementation does not require Cloud Functions or Blaze. Deploy the reviewed Firestore rules, then validate business creation and product add, list, edit, delete, and report/filter behavior. See [Step 1.md](Step%201.md) for the checklist.

### 2. Business selection and multi-tenant logic
Basic membership loading, single-business auto-selection, multiple-business selection, and switching are implemented. Still needed:
- authorized member invitations and role changes through trusted backend operations
- robust handling for revoked memberships and stale selections
- consistently displaying business context across all application modules

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
