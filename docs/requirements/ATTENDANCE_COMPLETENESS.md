# Attendance: completeness against Linways, Camu and MasterSoft (checklist section 4 and the attendance brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 4, `ATTENDANCE_DETAILED_SPEC.md` and the attendance pass
brief, exercised against the Soundarya seed: API calls on a seeded database (port 4320), the ERP (port 3320) driven
by Playwright at 1280px and 390px, and the three Flutter apps' own HTTP clients against the same API.
**Before** is the branch when this pass started; **after** is now.

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now),
**Deepened** (existed, gaps closed now). Migrations: `0194_attendance_qr_guard`, `0195_attendance_detention_lists`.
New API test file: `services/api/test/attendance-pass.e2e.spec.ts` (6 workflows, figures worked by hand in comments);
unit spec `src/attendance-governance/qr-guard.spec.ts` (6).

Counts (39 items): before **24 Have, 6 Partial, 8 Missing, 1 Broken**; after **39 Done** (24 Have, 15 Built or Deepened).

## Ways to mark

| Item | Before | After | Evidence |
|---|---|---|---|
| Period-wise (hour) marking | Have | Have | `teacher.controller.ts` `POST /v1/attendance`; `teacher.e2e.spec.ts` |
| Day-wise and forenoon/afternoon sessions | Have | Have | `desk.service.ts` `markDay`; `attendance-desk.e2e.spec.ts` |
| All present with exceptions, copy to other periods | Have | Have | desk `copy`; ERP Mark |
| Smart board marking (offline outbox, last writer wins) | Have | Have | `board-sync`, `sync.service.ts` |
| Teacher App marking | Have | Deepened | adds the self-mark code screen, held scans and reader taps (`attendance_code_screen.dart`) |
| Biometric / RFID ingest (eSSL/ZKTeco ADMS, Matrix COSEC, generic push) | Have | Have | `integrations/devices.controller.ts`; `integrations.e2e.spec.ts` |
| Face-recognition terminals | Missing | Built | device kind `face_terminal`; ADMS verify column (15 = face) and `verify` on generic push recorded per tap |
| Device taps mapped to the period, teacher confirms | Partial: gate punch shown as a day suggestion | Built | a reader with `config.roomId` records `period_tap` for the period meeting in its room (10 min before start to end, own or combined class); `suggestions.ts` `periodHints` on the ERP sheet and the Teacher App sheet; "Use reader taps" sets tapped present, others absent, teacher saves; test "a face terminal in the classroom…" |
| QR self-mark with a rotating code | Broken: no screen displayed the code, and the Student App only enabled Submit at 20 characters while codes are 8 digits | Built | Teacher App code screen (refreshes every 30 s); Student App accepts the 8 digits; `attendance_code_test.dart`, `attendance_scan_test.dart` |
| QR geofence | Missing | Built | settings `qr.requireLocation/lat/lng/radiusM/maxAccuracyM`; haversine distance stored per scan; unit test (222 m outside a 200 m fence) |
| QR anti-proxy | Missing | Built | phone bound on first scan (hashed install id, `attendance_device_bindings`); a phone already used for another student in the period, or bound to another student, is refused (logged, 403); other phone, no phone id, no/poor/mocked location, outside the fence, late (grace minutes) are held for review; `attendance_qr_scans`; ERP QR review (single and bulk accept/reject, release phone); test "QR self-mark…" |

## Changes and leave

| Item | Before | After | Evidence |
|---|---|---|---|
| Bulk and late marking with a lock window | Have | Have | `attendance-rules.ts` `attendanceLocked`; governance e2e |
| Edit request with approval and before/after audit | Have | Have | corrections, `decisions.ts`; ERP Approvals |
| Unmarked-hour reminders and HOD view | Have | Have | desk `unmarked`, hourly job |
| Duty leave / OD (group), approval, counts as present | Have | Have | desk leaves, policy `onDutyCountsAs` |
| Medical leave with certificate, used in condonation | Have | Have | leave document upload, condonation `leaveIds` |
| Student/parent leave application auto-marking | Have | Have | `student-leave.e2e.spec.ts` |
| Effect on percentage (present, excused, absent per kind) | Have | Have | `policy.ts` `eligibilityFor` |

## Students

| Item | Before | After | Evidence |
|---|---|---|---|
| Condonation workflow (points, fee paid/waived) | Have | Have | `attendance-governance.e2e.spec.ts` |
| Shortage list against the university profile (75%, VTU 85%, BCI 70%) | Have | Have | `eligibility.ts` threshold chain (programme > rule > profile > institution) |
| Detention list | Partial: live list only | Built | published, frozen lists (`attendance_detention_lists/entries`, 0195): exam cell or HOD prepares, principal publishes or withdraws with a reason; families of detained students told in the apps (and SMS/WhatsApp); domain events `attendance.detention_list_published/withdrawn`; PDF with signature lines and Excel |
| Detention feeding exam eligibility (hall tickets) | Partial: hall tickets used overall % and the institution threshold, ignoring per-subject rules, programme overrides and the university profile | Built | `holds.ts` `attendanceHolds`: published list's detained entries hold the ticket; otherwise each class's own policy (condonable shown with the gap until condonation is approved); test "publishes a detention list that holds hall tickets…" (71.4% + 5 points releases the ticket) |
| Parent app alerts on absence and shortage | Have | Have | `notifications.service.ts` `attendanceChanged`, desk digests and shortage alerts |
| SMS and WhatsApp alerts | Missing | Built | settings `alertChannels`; `alert-channels.ts` queues Communication campaigns on templates `attendance_absence`, `attendance_shortage`, `attendance_detention` (DLT id required for SMS), once per dedupe key; the evening digest goes on SMS/WhatsApp even when the app digest is off; skipped channels reported; `attendance_alerts.channels`; test "absence digests and shortage alerts…" |
| Lab batch, elective and combined classes | Have | Have | `periodRoster` |
| Special classes and holiday working days | Have | Have | special classes, working-day swaps |
| Student self-view with date filter | Have | Have | desk `students/:id`; Student App overview |
| Joining mid-semester (denominator from joining) | Have | Have | roster filters by `enrolledOn` |

## Staff and timetable

| Item | Before | After | Evidence |
|---|---|---|---|
| Staff attendance (biometric, app check-in, late rules, regularisation) | Have | Have | `hr.service.ts`, `hr-workflows` |
| Staff leave to substitution | Have | Have | `leave.service.ts` arrange substitutes |
| Substitution when a teacher is absent without leave | Missing | Built | `substitutions.service.ts` `needed` lists periods of teachers marked absent (reason `absent`); suggestions skip absent teachers; test "a teacher marked absent…" |

## Reports

| Item | Before | After | Evidence |
|---|---|---|---|
| Monthly register PDF (university format) | Partial: bare grid | Deepened | institution header, subject, legend (P/A/L, OD, ML), signature lines |
| Subject-wise report | Partial: register per subject only | Built | `reports/subjects`: held, class average after condonation, short, near the limit, teachers |
| Student-wise report | Have | Have | ERP Student |
| Faculty-wise marking compliance | Partial: unmarked count by teacher | Built | `reports/compliance`: periods that met, marked the same day, later, not at all (hand check 1 of 5 = 20% on time) |
| Defaulter trend | Missing | Built | `reports/trend`: short, condonable, detained, near the limit at each week's end |
| NAAC / AISHE / UDISE+ hooks | Missing | Built | accreditation sources `instructional_days` (fills UDISE-1.2) and `attendance_shortage` (NAAC 2.2.1 evidence rows); `reports/accreditation` figures |

## Apps

| Item | Before | After | Evidence |
|---|---|---|---|
| Student and parent views | Have | Have | verified against the live API: `apps/student/test/live_attendance_test.dart`, `apps/parent/test/live_attendance_test.dart` |
| Teacher marking | Have | Deepened | `apps/teacher/test/live_attendance_test.dart` (timetable, sheet with hints, code) |
| Apps verified against the API | Missing | Built | the three live tests above, run with `LIVE_API_URL` (skipped otherwise) |

## Hardening

- Every new endpoint has a role check and runs under the tenant's row-level security: another teacher sees no scans
  and gets 403 deciding; another institution sees none (404 on an id); families and students get 403; lists for
  another tenant are empty. Query strings and bodies go through zod pipes (bad `status` → 400).
- The phone id is stored only as a tenant-scoped SHA-256; refused scans are logged after the request's transaction
  commits, so the audit trail survives the 403.
- QR review and reports page server-side (`page`, `pageSize`, 31-day compliance window, 16-week trend cap).
- Authorization docs regenerated (`docs/security/AUTHZ_MATRIX.md`, `docs/product/role-matrix.md`).
- Fixed a date-dependent assertion in `timetable-substitutions.e2e.spec.ts` (failed whenever the next Monday was the 9th).

## Demo data (Soundarya)

`services/api/src/db/soundarya/attendance-pass.ts`: geofence at the campus and SMS alerts on; attendance SMS
templates with DLT ids and a WhatsApp absence template; today's first BCom Sem 3 A period has eight accepted scans,
three held (1.8 km away, a new phone, 22 minutes late) and one refused (shared phone), plus yesterday's accepted and
rejected reviews; a face terminal in the second period's room with 26 taps; Prof. Sudhir Kamath absent today
(his periods need cover); about one period in fifteen of the last month entered the next day; a published BCom
detention list and a BBA draft.

## Screens checked

`apps/erp/scripts/attendance-qa.mjs` loads 18 attendance pages at 1280px and 390px (headings, no error state, no
console errors, no sideways scroll): all pass. Screenshots: `docs/demo/screens/attendance/01`–`08`.

## Not built

- The smart board does not display the self-mark code (the board signs in as a device, not as the teacher); the
  teacher shows it from the Teacher App, which can be cast to the board.
- WhatsApp sends need the institution's own WhatsApp Business account; without one the channel is reported as
  failing in Communication (SMS works through MSG91 with DLT templates).
