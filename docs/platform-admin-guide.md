# Mandela Platform Admin

The platform-admin page is a responsive, vanilla TypeScript/HTML/CSS admin template served by Vite at `platform-admin.html`. It reuses the existing Firebase Authentication setup and requires an enabled `platformAdmins/{uid}` record before rendering.

## Run locally

1. Configure the development Firebase web-app settings in the ignored `.env.development` file, following `.env.development.example`.
2. Start Vite with `npm run dev`.
3. Open the printed local URL and navigate to `/MandelaGenerals/platform-admin.html` (use the configured base path if it differs).
4. Sign in with an account whose Firestore platform-admin record has `enabled: true` and `role: "platformAdmin"`.

The **Businesses** module reads business documents directly from Firestore using server reads and resolves owner names/emails from user documents. It shows the selected Vite Firebase environment and provides live search, status filtering when a status field exists, sorting, pagination, and a read-only profile. Current business documents do not store subscription, account-status, membership-count, or usage fields, so the UI labels those values as unavailable rather than inventing them.

The **Users & Roles** module reads tenant membership records for the `owner` and `admin` roles from Firestore, then joins them with user and business records. It shows one row per tenant membership, including active/inactive membership status; a person who administers multiple businesses appears once for each business. This directory is read-only. Platform administrator accounts are managed separately and are not inferred from tenant roles.

Use `npm run dev` to connect to the configured development project (`mandelagenerals-dev`). Production builds intentionally use the separate production Firebase project, as enforced by `src/config/firebase.ts`.

The dashboard, subscriptions, billing, reports, notifications, and audit modules use illustrative Kenyan sample records. In-page edits, notifications, settings, and audit entries are held in memory and reset on refresh. No subscription is charged, invoice is issued, invitation is sent, or tenant data changed by those demo interactions. Authentication and admin-role verification are real; dashboard and operational figures are not live.

## Modules

- **Dashboard:** sample tenant/subscription KPIs, illustrative recurring-revenue chart, business status, activity, quick actions, and recent demo records.
- **Businesses:** live, read-only Firestore business records with owner lookups and search, available-status filter, sorting, pagination, refresh, and profile details. Create/edit/suspend workflows require server-side APIs and are not performed from this list.
- **Subscriptions and plans:** plan and subscription editing flows, pricing, cycle, trial, limits, and status examples.
- **Users & roles:** live, read-only tenant owner/admin membership directory; platform-admin accounts are separate.
- **Billing & payments:** sample Mandela SaaS invoices, collection totals, outstanding balances, and CSV export. Tenant sales are presented separately.
- **Inventory & POS overview:** aggregated sample usage only; it is not a tenant inventory or cashier workspace.
- **Reports & analytics:** illustrative platform metrics and CSV export.
- **Notifications and audit logs:** session-only notification/read states and an append-only in-memory demo activity list.
- **Platform settings:** editable-looking placeholders for branding, regional defaults, preferences, security, and integrations.

## Suggested backend contract

All routes below are a future API design, not implemented endpoints. Require authenticated platform-admin authorization server-side on every route. Validate inputs, scope tenant records, use idempotency for billing operations, and write immutable audit events on the server.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/platform/dashboard?period=30d` | Dashboard KPIs and chart series |
| `GET`, `POST` | `/api/platform/businesses` | Search/list and register tenants |
| `GET`, `PATCH` | `/api/platform/businesses/{businessId}` | Tenant profile and controlled status changes |
| `GET` | `/api/platform/businesses/{businessId}/activity` | Tenant-specific administrative history |
| `GET`, `POST` | `/api/platform/plans` | List and create subscription plans |
| `GET`, `PATCH` | `/api/platform/plans/{planId}` | View, edit, or deactivate a plan |
| `GET`, `PATCH` | `/api/platform/subscriptions` and `/api/platform/subscriptions/{subscriptionId}` | Subscription search and authorized plan/status workflows |
| `GET` | `/api/platform/users` | Search platform and tenant accounts |
| `POST` | `/api/platform/invitations` | Send a scoped, server-issued invitation |
| `GET` | `/api/platform/invoices` | Invoice and payment ledger |
| `GET` | `/api/platform/invoices/{invoiceId}/document` | Authorized invoice document |
| `GET` | `/api/platform/reports/{reportName}` | Filtered platform reporting data |
| `GET` | `/api/platform/notifications` | Administrator notifications |
| `PATCH` | `/api/platform/notifications/{notificationId}` | Mark a notification read |
| `GET` | `/api/platform/audit-events` | Filtered, append-only audit history |
| `GET`, `PATCH` | `/api/platform/settings` | Read and update validated global settings |
| `GET` | `/api/platform/usage/summary` | Aggregated, tenant-safe inventory/POS metrics |

## Suggested data models

- **Business:** `id`, `name`, `slug`, `ownerId`, `status`, `createdAt`, `subscriptionId`, `region`.
- **SubscriptionPlan:** `id`, `name`, `description`, `monthlyPrice`, `annualPrice`, `currency`, `trialDays`, `limits`, `features`, `active`.
- **Subscription:** `id`, `businessId`, `planId`, `status`, `billingCycle`, `currentPeriodStart`, `currentPeriodEnd`, `nextBillingAt`.
- **Invoice/Payment:** invoice `id`, `businessId`, `subscriptionId`, `amount`, `currency`, `status`, `issuedAt`, `dueAt`; payment `id`, `invoiceId`, provider reference, status, and server-verified timestamps.
- **PlatformUser:** `id`, `email`, `displayName`, platform role/permissions, account status, and last-access metadata. Tenant roles and memberships belong to separately scoped tenant records.
- **Notification:** `id`, `recipientId`, `type`, `resourceRef`, `createdAt`, `readAt`.
- **AuditEvent:** `id`, `actorId`, `action`, `resourceType`, `resourceId`, `occurredAt`, `outcome`, and structured metadata; written server-side and not editable through the normal admin UI.
- **PlatformSettings:** versioned branding, locale, currency, timezone, notification, session, and integration configuration. Store secrets only in backend secret storage.

The browser UI is not a security boundary. The backend must enforce authentication, least privilege, tenant isolation, input validation, billing-provider verification, and audit retention regardless of which controls are visible in the page.
