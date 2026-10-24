# Mandela Generals

Mandela is a multi-tenant business management application built on a legacy HTML dashboard shell, TypeScript, Vite, Firebase Authentication, and Cloud Firestore. Its current implemented scope includes account access, business setup and selection, branch-scoped product inventory for new businesses, a business-owner dashboard, opt-in existing-account onboarding with fixed business-role assignment, branch setup and assignment, and a separately gated platform-admin area.

> **Implementation status:** This is an incremental implementation, not a claim that every requirement in the product specification is complete. Branch-specific roles, legacy inventory migration, stock movement and transfer workflows, POS, invitation delivery, configurable permissions, billing, and audit logging are not fully implemented. Firestore rules must be reviewed and deployed separately; a successful frontend build does not validate deployment or live authorization.

## Start here

| Document | Contents |
| --- | --- |
| [Implementation guide](./docs/IMPLEMENTATION.md) | Implemented workflows, code locations, database interactions, validation evidence, limitations, and development documentation practices. |
| [Architecture](./docs/ARCHITECTURE.md) | Application layers, tenant hierarchy, request flows, and environment boundaries. |
| [Database guide](./docs/DATABASE.md) | Firestore collections, fields, relationships, branch schema, and migration cautions. |
| [Security guide](./docs/SECURITY.md) | Authentication, membership and branch authorization, platform-admin separation, rules deployment, and testing limitations. |
| [Implementation status and delivery checklist](./docs/IMPLEMENTATION-STATUS.md) | Consolidated capability status, tenant checklist, environment and deployment notes, and validation evidence. |
| [Platform admin guide](./docs/platform-admin-guide.md) | Platform-admin UI behavior, local access, and placeholder boundaries. |
| [Platform admin backlog](./docs/platform-admin-tasks-and-improvements.md) | Future backend, data, security, and operational work for platform administration. |
| [Software requirements specification](./docs/MANDELA-SOFTWARE-REQUIREMENTS-SPECIFICATION.md) | Product-wide requirements baseline, including future capabilities. |
| [Copilot project instructions](./.github/copilot-instructions.md) | Requires relevant Markdown documentation to be updated alongside project changes. |

## Technology

- TypeScript and modern browser JavaScript
- Vite multi-page build
- Firebase Authentication (Email/Password)
- Cloud Firestore and Firestore Security Rules
- Existing HTML/CSS dashboard templates, with custom TypeScript/CSS dashboard views
- GitHub Pages for the production static frontend; Firebase Hosting for development

## Repository layout

```text
.
├── index.html                       # Public entry and authenticated business workspace
├── signin.html / signup.html        # Authentication entry pages
├── profile.html                     # Signed-in user's profile
├── platform-admin.html              # Separate platform-admin dashboard
├── productlist.html                 # Product listing
├── addproduct.html                  # Product creation
├── editproduct.html                 # Product editing
├── product-details.html             # Product details
├── inventoryreport.html             # Inventory report
├── src/
│   ├── config/firebase.ts           # Environment-checked Firebase initialization
│   ├── main.ts                      # Business dashboard, Users & Roles, branch UI
│   ├── platform-admin.ts            # Platform-admin UI
│   ├── services/                    # Auth, business, inventory, profile, branch services
│   └── modules/inventory/           # Inventory page behavior and types
├── firestore.rules                  # Firestore authorization and validation
├── firebase.json                    # Hosting and Firestore rules configuration
└── vite.config.ts                   # Multi-page build and deployment base path
```

The old template files in `assets/` are retained for pages that still use them. This directory is not the canonical source for the new TypeScript business dashboard.

## Application pages and template boundary

`vite.config.ts` explicitly builds these HTML entry points:

| Page | Source | Current purpose |
| --- | --- | --- |
| `index.html` | `src/main.ts` | Public home, business setup/selection, business-owner dashboard and branch/member views. |
| `signin.html`, `signup.html`, `forgetpassword.html` | `src/auth-forms.ts` | Firebase Authentication UI. |
| `profile.html` | `src/profile.ts` | Current user's profile, verification controls, password reset, and membership summary. |
| `platform-admin.html` | `src/platform-admin.ts` | Separate platform-admin experience; some sections are demo-only. |
| `productlist.html`, `addproduct.html`, `editproduct.html`, `product-details.html`, `inventoryreport.html` | `src/modules/inventory/main.ts` | Tenant-scoped product inventory views. |
| `404.html` | Vite static entry | GitHub Pages tenant-route fallback. |

The repository contains many more HTML files for the original dashboard template (for example POS, sales, purchasing, customers, suppliers, reports, settings, and UI components). They are not listed as Vite build inputs and must not be assumed to be tenant-aware production features simply because the template pages exist. The `firestore.rules` file includes rule coverage for several operational collection paths, but rule coverage alone does not mean a corresponding application workflow is implemented.

## Requirements

- Node.js compatible with the installed Vite version
- npm
- Firebase CLI for Firebase Hosting or Firestore rules deployment
- Firebase web-app configuration for the selected environment

Install dependencies from the repository root:

```bash
npm install
```

Create `.env.development` from `.env.development.example` and supply the development Firebase web-app values. For a local production build, create `.env.production` from `.env.production.example`. These files are ignored and must not be committed. `VITE_*` web configuration is public frontend configuration—not a place for service-account keys or other secrets.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite in development mode using `.env.development`. |
| `npm run build:dev` | Type-check and build for the development environment. |
| `npm run deploy:dev` | Build and deploy Hosting to the Firebase CLI `development` alias; does not deploy rules. |
| `npm run build` | Type-check and build the production frontend for GitHub Pages. |
| `npm run preview` | Preview the production build locally. |
| `npm run preview:dev` | Preview the development build locally. |
| `npm run deploy:rules:all` | Deploy Firestore rules to both configured Dev and Production project IDs. Review the rules and intended targets before running. |

The app and Firebase project are selected by Vite mode and configuration, not the Git branch. `src/config/firebase.ts` rejects a Firebase project ID that does not match the expected environment. Development uses `mandelagenerals-dev`; production uses `mandelageneralshop`. Never test development work against production data.

## Run locally

1. Configure `.env.development` with the development Firebase web-app configuration.
2. Ensure Firebase Authentication Email/Password and Cloud Firestore are enabled for that project.
3. Run `npm run dev`.
4. Open the printed local URL. Use a test account and test business.

New accounts can register and create a business. To try the separately gated platform-admin page, the account must already have a trusted `platformAdmins/{uid}` document in the selected Firebase project. Do not grant this role from client code.

## Environments and deployment

- Development Firebase project: `mandelagenerals-dev`
- Production Firebase project: `mandelageneralshop`
- Development Hosting: `https://mandelagenerals-dev.web.app`
- Production GitHub Pages: `https://onchari.github.io/MandelaGenerals/`

Production builds are intended for GitHub Actions/GitHub Pages. Configure the repository's production `VITE_FIREBASE_*` variables in GitHub Actions. Tenant workspaces use path-based URLs (`/b/{slug}/`); GitHub Pages does not provide wildcard subdomains for this project site.

Firestore rules are separate from frontend hosting deployments. Publishing `firestore.rules` replaces the active rules for the targeted Firebase project. Back up and review the active rules, validate against the intended environment, and deploy Dev before Production. Deployment history is not evidence of current live rules; check the Firebase project directly.

## Current limitations

- Branch-scoped product quantities exist for isolated-mode businesses, but there is no stock ledger, stock transfer, or branch-level inventory report.
- A business owner can add an existing account from an email dropdown after the account holder opts into discovery in Profile, assign a supported business role, and assign branches later. The flow does not create Auth accounts or send invitation/account email. The profile email directory is visible to signed-in Mandela accounts and capped at 100 results per query.
- Branch management creates and edits branches, assigns access to existing business members, and supports an owner-only branch-manager designation. It does not send invitations or change the owner's role.
- Existing businesses require explicit branch initialization. Existing product, sales, or movement records are not migrated automatically.
- Current membership roles are fixed to the implemented role set. The proposed detailed RBAC matrix is design guidance and does not enforce custom permissions.
- POS, purchasing, returns/refunds, subscriptions/billing, and immutable audit logging are incomplete or unavailable.
- Many legacy root HTML pages remain template/sample pages and are not part of the configured Vite multi-page build.
- The platform-admin dashboard contains both live read-only directories and demo/session-only sections. See its guide.
- There is no automated test script configured in `package.json`. The production build runs TypeScript checking before Vite.

## Development documentation practice

When a feature changes, inspect the current source, rules, configuration, and relevant tests before editing documentation. Update this README when setup, commands, or product scope change; update the implementation, architecture, database, security, and status guides when their subject changes. Record tests actually run and their actual results. Do not claim a rule set is secure, deployed, or tested against Firebase without corresponding evidence.

## Project references

- Repository: [onchari/MandelaGenerals](https://github.com/onchari/MandelaGenerals)
- Production site: [Mandela Generals](https://onchari.github.io/MandelaGenerals/)
