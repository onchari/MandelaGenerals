# Platform Administration Tasks and Improvements

This backlog covers the Mandela Generals platform-admin experience only. It excludes tenant inventory/POS work and general application setup.

## Current state

- [x] Platform-admin page is gated by Firebase Authentication and an enabled `platformAdmins/{uid}` record.
- [x] Businesses page reads business records and owner details from the selected Firebase project.
- [x] Businesses page supports search, filtering, sorting, pagination, refresh, loading/error states, and read-only profile details.
- [x] Users & Roles lists live tenant owner/admin memberships with user/business details and membership status.
- [x] Demo-only sections are identified as illustrative and do not claim to make live operational changes.
- [ ] Administrative write actions are not yet connected to a trusted backend.
- [ ] Dashboard, subscription/billing workflows, platform-account administration, reports, notifications, and audit entries still use illustrative data.

## Priority 1 — Safe business administration

- [ ] Define and document the business lifecycle: allowed statuses, transitions, and behavior for existing records with no status.
- [ ] Define the authoritative business fields, including `status`, `updatedAt`, and `updatedBy`; keep subscription and billing state in subscription/billing records rather than assuming they belong on the business document.
- [ ] Implement authenticated server-side operations for business status changes and profile edits. Verify enabled platform-admin access on every operation, validate allowed fields and transitions, and return clear errors.
- [ ] Keep platform-admin business writes unavailable through direct browser Firestore access; grant write access only through the trusted service.
- [ ] Add suspend/reactivate controls to the Businesses page after the server operations are available. Require confirmation and a reason, show the resulting status, and prevent duplicate submissions.
- [ ] Add business profile editing only for explicitly approved fields, with validation and a clear success/failure result.
- [ ] Record each successful or rejected administrative operation in a server-written audit trail with actor, action, target, timestamp, outcome, and reason where applicable.
- [ ] Test authorization, invalid transitions, missing/legacy fields, failed requests, and concurrent updates.

**Acceptance criteria**

- A non-admin cannot perform platform business operations, even by calling the endpoint directly.
- The browser cannot bypass backend validation by writing business documents directly.
- Successful changes appear in the Businesses list after refresh and have a corresponding audit event.
- Failed changes display an actionable error and do not appear successful in the UI.

## Priority 2 — Live platform data

- [ ] Decide which platform-admin views must be live first; start with businesses and subscriptions.
- [ ] Define the subscription model and its relationship to a business, including plan, status, billing period, renewal, and cancellation state.
- [ ] Provide authenticated, server-authorized data sources for dashboard metrics, subscriptions, platform-account administration, billing, and reports. Tenant owner/admin membership listing is already live and read-only.
- [ ] Replace each demo dataset only when its live data source and error/empty/loading behavior are ready; keep demo data clearly labelled until then.
- [ ] Define safe, aggregated tenant-usage metrics before exposing them to platform admins.
- [ ] Ensure all live lists support bounded queries and appropriate filtering/pagination as data grows.

**Acceptance criteria**

- Every value shown as live comes from an identified authoritative source.
- Missing or unavailable values are shown as unavailable, not guessed or silently replaced with sample values.
- A data-source failure is visible and recoverable without presenting stale demo values as live data.

## Priority 3 — Users, subscriptions, and billing workflows

- [ ] Define platform-admin actions for user access and invitations separately from tenant membership and tenant roles.
- [ ] Implement user and invitation workflows through trusted server-side services, with explicit authorization and audit events.
- [ ] Implement plan and subscription management only after the subscription model and permitted state transitions are agreed.
- [ ] Keep payment collection, refunds, invoice issuance, and provider webhooks server-side; verify provider results before updating billing state.
- [ ] Add confirmation and clear result states for consequential actions; make retry behavior safe against duplicate operations.

## Priority 4 — Operational visibility and reliability

- [ ] Replace in-memory demo notifications with persisted, recipient-scoped platform notifications.
- [ ] Replace illustrative audit entries with immutable, server-written events and add useful filters and export controls.
- [ ] Add platform-admin tests for role gating, data loading, sorting/filtering, read-only versus writable states, and failure handling.
- [ ] Add monitoring for administrative endpoint failures and important business/subscription state changes without logging sensitive data.
- [ ] Review responsive layout, keyboard operation, accessible labels, and destructive-action confirmations across admin workflows.

## Additional recommendations

### Administrator access and production safety

- [ ] Use MFA for platform administrators and apply short-lived sessions with reauthentication for sensitive actions.
- [ ] Replace a single all-powerful admin role with least-privilege roles where practical, such as support, billing, and platform operations.
- [ ] Make the active environment conspicuous throughout the admin UI; require an extra confirmation for high-impact changes in production.
- [ ] Define an administrator onboarding/offboarding process, periodically review access, and alert on unexpected role changes.
- [ ] Consider requiring a second administrator's approval for especially high-impact actions, such as permanent deletion or major billing adjustments.

### Support, privacy, and data handling

- [ ] Prefer scoped support tools over signing in as a tenant user. If temporary tenant access is necessary, require a support reason, limit its scope and duration, clearly indicate the access mode, and audit entry and exit.
- [ ] Define which tenant data platform administrators may view, mask sensitive fields by default, and avoid exposing credentials, payment secrets, or unnecessary personal information.
- [ ] Treat exports as sensitive: authorize them server-side, limit/filter the data, record who exported what and when, and avoid exporting secrets.
- [ ] Establish retention and deletion rules for admin audit records and personal data, including how legal or operational holds are handled.

### Resilient administrative workflows

- [ ] Make retryable operations idempotent and protect concurrent edits from silently overwriting newer changes.
- [ ] For bulk actions, show a preview and affected-record count, validate each target, require confirmation, and report per-record results.
- [ ] Provide clear operational runbooks for account suspension, recovery, billing incidents, suspected compromise, and failed administrative changes.
- [ ] Add a maintenance/read-only mode for planned incidents, with explicit scope, authorized activation, and an audit record.

## Implementation order

1. Agree on business statuses, editable fields, and subscription ownership of billing data.
2. Implement and test trusted authorization, business operations, and audit recording.
3. Add suspend/reactivate controls and then approved profile editing.
4. Replace the remaining demo sections with live data in priority order.
5. Complete access controls, support/privacy safeguards, user and billing workflows, and operational hardening.
