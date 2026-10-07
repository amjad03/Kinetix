# Admissions + Enquiry CRM — Detailed System Requirement

## Scope

- Lead/enquiry capture from web, walk-in, phone, campaigns and imports
- Lead source/campaign attribution
- Counselor assignment and SLA
- Applicant profile and guardian capture
- Program/branch preference
- Eligibility and document checklist
- Application workflow
- Interview/test scheduling
- Offer/selection workflow
- Fee demand and payment handoff
- Enrollment conversion
- Lost/deferred lead reason tracking
- Consent and communications preferences
- Admissions analytics

## Core entities

The implementation must identify explicit domain entities for each capability, with tenant/institution scoping, lifecycle state, audit fields, ownership, timestamps, versioning where required, and referential integrity.

## Required workflows

For every major workflow:

1. define trigger and actor
2. validate prerequisites
3. apply authorization
4. persist transactionally
5. emit domain events
6. send configured notifications
7. record audit event
8. update analytics asynchronously where appropriate
9. make retries/idempotency explicit

## Permissions

Permissions must be action-specific (view/create/update/delete/approve/publish/export/assign/reconcile/etc.) and scoped to platform, tenant, institution, campus, department, program, class/section, or self-service as appropriate.

## APIs

Provide query, command and bulk endpoints with pagination/filtering/sorting, validation, idempotency for commands, optimistic-concurrency/version checks where needed, consistent error envelopes, and API-level authorization.

## Events

Typical domain events should include Created, Updated, Approved, Rejected, Published, Assigned, Completed, Cancelled and Archived variants where meaningful. Event names must be domain-specific and versioned.

## Reports

Every module must specify operational reports, dashboards, exports, filters, ownership, freshness expectations, and permitted data scope.

## Security

Classify data, protect PII/financial/academic records, enforce least privilege, encrypt in transit/at rest as appropriate, and audit sensitive actions.

## Testing

Minimum expectations:

- unit tests for business rules
- integration tests for persistence and events
- API contract tests
- E2E workflows for critical paths
- authorization tests
- negative/error-path tests
- idempotency/retry tests for relevant commands
- performance tests for bulk/report workloads

## Acceptance criteria

The module is complete only when every listed feature has corresponding data model, UI/API workflow, authorization, tests, audit behavior, documentation and production-readiness evidence.
