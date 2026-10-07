# Kinetix Security + Privacy Acceptance Requirements

## Mandatory controls

- tenant isolation
- authorization at API/service/repository boundaries
- secure session handling
- MFA support
- password hashing using a modern adaptive password hash
- rate limits for authentication and public endpoints
- secret management; no secrets in source control
- encryption in transit
- encryption at rest where supported/required
- audit logging for privileged/sensitive operations
- PII classification
- financial-data controls
- academic-record immutability/versioning
- secure file upload pipeline
- malware scanning hooks
- signed/short-lived download URLs where appropriate
- webhook signature validation
- input validation and output encoding
- CSRF/XSS/SQLi protections appropriate to the stack
- dependency and container vulnerability scanning
- backup verification and restore drills

## High-risk operations requiring explicit authorization

- role/permission changes
- user impersonation
- bulk data export
- result publication/change
- marks modification after lock
- financial refund/write-off
- payroll finalization
- OBE attainment recalculation/publication
- accreditation evidence deletion/retirement
- institution deletion/tenant lifecycle actions

## Privacy

The system must minimize data collection, implement role-scoped access, maintain retention policies, support export/deletion workflows where lawful, and maintain auditability.
