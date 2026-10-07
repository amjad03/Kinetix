# Documents and certificates

Certificate templates, a request → approve → issue workflow with serial numbers and QR
verification, student and staff ID cards, fee-receipt PDFs and a document vault per student and
staff member. Code: `services/api/src/documents/`; PDFs from `src/common/pdf.ts`, QR codes from
`src/common/qr.ts` (both dependency-free). ERP pages: `/documents/*`.

## Templates

`certificate_templates`: kind (`transfer_certificate`, `bonafide`, `conduct`, `study`,
`course_completion`, `fee_receipt`, `experience`, `custom`), subject type (student or staff),
title, body text, extra fields the requester fills in, serial prefix (`TC`, `BON`, …) and
`version` (bumped on every edit; an issued certificate keeps the text it was issued with). The
first time an office user lists templates, the default set is created (one per kind).

Placeholders: `{{institution}}`, `{{name}}`, `{{rollNo}}`, `{{className}}`, `{{program}}`,
`{{academicYear}}`, `{{employeeCode}}`, `{{designation}}`, `{{department}}`,
`{{dateOfJoining}}`, `{{purpose}}`, `{{serialNo}}`, `{{issuedOn}}` and `{{fields.<key>}}`.
Unknown placeholders are left visible so a typo shows on the preview rather than vanishing.

## Workflow

```
requested ──approve──▶ approved ──issue──▶ issued ──revoke──▶ revoked
     └────reject────▶ rejected
```

- **Request** (`POST /v1/documents/requests`): office staff for anyone; a student or guardian
  for that student; a staff member for themselves (staff templates). Required template fields
  are checked. One open request per template and subject (409 otherwise).
- **Approve / reject**: principal or administrator (HR manager for staff certificates).
- **Issue**: office staff, on an approved request. Gives the next serial number
  `<prefix>/<financial year>/<00001>` from `certificate_counters` (row-locked, so concurrent
  issues never share a number), freezes the rendered text, and creates a random verification
  token. Issuing twice returns the same certificate.
- **Revoke** (principal or administrator, reason required): the QR then verifies as revoked.
- **Bulk issue** (`POST /v1/documents/bulk-issue {templateId, sectionId | studentIds, purpose}`):
  principal or administrator; creates, approves and issues in one transaction, skipping
  students who already hold a live certificate of that template.

Every step is audited (`certificate.*`) and the subject's family (students) or the staff member
is notified when a certificate is issued (`certificate`).

## QR verification

The PDF carries a QR code with `VERIFY_BASE_URL/<institution slug>/<token>` (env
`VERIFY_BASE_URL`, default the ERP's `/verify` page). The public endpoint
`GET /v1/public/verify/:slug/:token` needs no sign-in, is rate-limited per IP, and returns only
what is printed on the certificate (status, institution, title, serial number, name, issue
date). Tokens are 128-bit random, so they cannot be guessed or enumerated.

ID cards carry `VERIFY_BASE_URL/id/<slug>/<s|t>-<id>.<mac>`, where the MAC is an HMAC of the
id under the server secret; `GET /v1/public/verify-id/:slug/:code` returns the name, class or
designation and whether the person is still active.

## ID cards and receipts (PDF)

- `GET /v1/documents/id-cards/students.pdf?sectionId=` (office staff): eight cards per A4 page.
- `GET /v1/documents/id-cards/staff.pdf[?userIds=a,b]` (office/HR staff).
- `GET /v1/documents/id-cards/me.pdf`: the caller's own card (staff or student).
- `GET /v1/documents/fee-receipts/:paymentId.pdf`: the fee receipt as a PDF, for whoever may
  see the receipt.

## Document vault

`vault_documents`: per student or staff member; title, category (e.g. `aadhaar`, `marks_card`,
`offer_letter`), content type, size, `version` (uploading with `replacesId` supersedes the
earlier version, which stays in history), visibility (`staff` or `owner`), expiry date.
The file is the raw request body (not multipart), with details in the query string. Files go to object storage (`tenants/<id>/vault/<docId>`), at most 10 MB, PDF/JPEG/PNG only.

| Who | Student vault | Staff vault |
|---|---|---|
| principal, administrator | read, upload, archive | read, upload, archive |
| HR manager | — | read, upload, archive |
| the staff member | — | read own (`owner` visibility), upload own |
| student, guardians | read `owner`-visibility documents | — |

`GET /v1/documents/vault/expiring?days=30` lists documents expiring soon. Downloads and
archiving are audited.

## API summary

`/v1/documents`: `templates`, `templates/:id`, `requests`, `requests/mine`,
`requests/:id/{approve,reject,issue,revoke}`, `requests/:id/pdf`, `bulk-issue`,
`id-cards/{students,staff,me}.pdf`, `fee-receipts/:paymentId.pdf`,
`vault/:ownerType/:ownerId`, `vault/files/:id`, `vault/expiring`.
`/v1/public`: `verify/:slug/:token`, `verify-id/:slug/:code`.
