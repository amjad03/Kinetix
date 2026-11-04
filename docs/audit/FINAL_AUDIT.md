# ZYNETIX final end-to-end audit

Combined from the per-area audits below (security, finance/people/communication, academics/exams, campus/governance with the ERP page sweep) and the mobile apps pass. Each linked file has the full findings with file:line, tests and the fix for anything open.

## Findings by severity

| Severity | Fixed | Open |
|---|---|---|
| Critical | 0 | 0 |
| High | 10 | 0 |
| Medium | 15 | 6 |
| Low | 7 | 11 |

## By area

| Audit | Fixed | Open | Linways: Ahead / Par / Behind |
|---|---|---|---|
| [ACADEMICS_EXAMS_AUDIT.md](ACADEMICS_EXAMS_AUDIT.md) | 13 | 1 | 1 / 9 / 2 |
| [CAMPUS_GOVERNANCE_QA_AUDIT.md](CAMPUS_GOVERNANCE_QA_AUDIT.md) | 11 | 5 | 8 / 5 / 3 |
| [FINANCE_PEOPLE_COMMS_AUDIT.md](FINANCE_PEOPLE_COMMS_AUDIT.md) | 3 | 6 | 1 / 5 / 1 |
| [SECURITY_FINAL_AUDIT.md](SECURITY_FINAL_AUDIT.md) | 5 | 5 | 0 / 0 / 0 |

## Linways comparison overall

Across all compared features: **10 ahead, 19 at par, 6 behind**. The "Behind" rows in each area file list what is still needed.

## Mobile apps

See [MOBILE_APPS_COMPLETENESS.md](../requirements/MOBILE_APPS_COMPLETENESS.md) for per-app status. Items that need real Firebase keys, store accounts or the Android SDK are listed there.

## Open items

Every Open finding above has its file:line and a concrete fix in its area file. Nothing was skipped silently.

## Open Medium and High items (next to fix)

| Area | ID | Issue |
|---|---|---|
| FINANCE_PEOPLE_COMMS_AUDIT | FEE-2 | Medium: `refundRef` is `rf_<id>_<Date.now()>`, so if a client retries after a timeout the gateway gets a new refund reference and the retry is not idempotent there. The |
| FINANCE_PEOPLE_COMMS_AUDIT | FEE-3 | Medium: If the DB commit fails after the gateway has accepted the refund, the refund is not recorded. Settlement matching does flag it later as `refund_not_recorded` (s |
| FINANCE_PEOPLE_COMMS_AUDIT | HR-3 | Medium: ESI contribution periods (Apr–Sep and Oct–Mar) are not modelled. An employee whose rate goes above ₹21,000 mid-period should keep contributing until the period  |
| SECURITY_FINAL_AUDIT | S6 | Medium: Messaging callbacks (MSG91, Kaleyra, Gupshup, Meta, SES) are authenticated only by the per-institution secret in the URL. Meta signs every POST (`X-Hub-Signatur |
| SECURITY_FINAL_AUDIT | S7 | Medium: Fix: delete the storage object before nulling the key (`ObjectStorage.delete`), add `dob`/`address` to the student anonymisation when no retention rule applies, |
| SECURITY_FINAL_AUDIT | S8 | Medium: Donor PAN (individuals, for 80G receipts) and fee-depth payee bank accounts are plain text. Staff PAN and UAN are now encrypted (`pan_enc`, `uan_enc`), which cl |
