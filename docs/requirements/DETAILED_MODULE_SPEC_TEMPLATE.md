# Detailed Module Specification Template

Every Kinetix module must have an equivalent specification before P0/P1 implementation.

## 1. Purpose

What business problem does the module solve?

## 2. Actors

- Platform super admin
- Tenant/institution admin
- Campus admin
- Department admin
- Faculty/staff
- Student
- Parent/guardian
- Finance user
- HR user
- Library user
- Transport/hostel/canteen user
- External integration

## 3. Functional scope

Enumerate every user-visible and system-level capability.

## 4. Domain entities

For each entity specify:

- primary key
- tenant scope
- institution scope
- status/state
- required fields
- optional fields
- audit fields
- soft-delete/archive rules
- relationships
- uniqueness constraints
- lifecycle

## 5. Workflows

For each workflow specify:

- trigger
- actor
- preconditions
- happy path
- alternate paths
- validation
- approval requirements
- side effects
- notifications
- audit events
- rollback/compensation

## 6. Business rules

Rules must be explicit and testable. Avoid prose such as “handle appropriately.”

## 7. Permissions

Specify action-level permissions and data scope.

## 8. APIs

Specify commands, queries, mutations, filtering, pagination, validation, idempotency and error codes.

## 9. Events

Specify emitted and consumed domain events, payload contracts, ordering expectations and retry semantics.

## 10. UI surfaces

Specify web, Smartboard and mobile surfaces where applicable.

## 11. Notifications

Specify notification trigger, channel, template, recipient, localization and opt-out rules.

## 12. Reports

Define operational reports, analytics and exports.

## 13. Audit/security

Define PII, financial data, permissions, retention and immutable audit requirements.

## 14. Testing

Every rule must map to unit/integration/E2E/security/performance tests as appropriate.

## 15. Acceptance criteria

Use Given/When/Then and make the criteria objectively verifiable.

## 16. Dependencies

List upstream/downstream modules and integration contracts.
