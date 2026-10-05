# Data model

The source of truth is `services/api/src/db/schema.ts` (Drizzle). This page explains the shape.

## Tenancy and people

```
tenants ─┬─ campuses
         ├─ users ── user_roles (role, campus | null = all campuses)
         └─ audit_log (append-only for the app role)
```

- **One `users` table holds everyone**: staff, students and guardians. What a user can do comes from `user_roles`. A person who is both a teacher and a parent has one account with two roles.
- Login identifiers (phone, email) are unique **within a tenant**, so the same parent can exist in two schools.

## Academic structure: one model for K-12 and colleges

| Table | K-12 example | UG/PG example (pilot) |
|---|---|---|
| `programs` | "CBSE", level `k12`, `term_count` 12 | "BCom", level `ug`, `term_count` 6 (semesters) |
| `sections` | Grade 7, section B | BCom Sem 3, section A |
| `subjects` | Science, grade 7 | Corporate Accounting, sem 3 |
| `students` | roll no. in a section | university register no. in a section |
| `timetable_slots` | Mon 10:00–10:40, 7B, Science, Mrs X, Room 12 | Mon 10:00–10:55, BCom 3A, Corp. Accounting, Ms Y, Room 204 |

`programs.curriculum_code` links a program to the **global curriculum library** (`cbse`, `kseab`, `cisce`, `bu-ug`…). That library will hold boards → grades/semesters → subjects → units → chapters → topics → learning outcomes, and belongs to no tenant. It is not built yet.

`academic_terms` (academic year, name, starts_on, ends_on, program_ids — null = every program)
are the semesters, or one term for a school's whole year. A term lies inside its academic year,
and terms of the same programs never overlap, so a class has at most one term on a date
(`termFor(tx, date, programId)` in services/api/src/terms/terms.ts). Lesson recordings are kept
until their term ends (see docs/architecture/lesson-recording.md), and a year plan without an end
date runs to the end of the current term.

Electives and combined classes (common in UG) will need a `section_students` join table, so that one student can belong to several teaching groups. **This is planned, not built.**

## Classroom

```
devices ── pairing_codes (hash only, 120 s, single use)
   └── board_sessions (teacher, slot?, section?, subject?, expires_at, end_reason)
           ├── participation_events (student, outcome, topic_code)   ← random picker, board quizzes
           └── attendance_records (student, date, slot?, status)    ← upsert, latest occurred_at wins
sync_ops (tenant_id, op_id) — idempotency ledger for the board outbox
broadcasts ── broadcast_receipts (device, displayed_at, acknowledged_at)
homework (section, subject, created_by, title, instructions, due_on, board_session?)  ← Teacher App
```

## Families, notifications, saved boards

```
guardians (user ↔ student, relation)          — who may see which child
notifications (user, kind, title, body, data, dedupe_key, read_at, retracted_at)
whiteboards (id chosen by the board, owner, session, section, subject, content jsonb, shared_at)
```

See [notifications.md](notifications.md). A whiteboard's `content` is `{v, background, canvas{w,h},
pages[{strokes[{t,c,w,s?,p[]}]}]}` with points at 0.1 px (`packages/kinetix_ink/lib/src/serialization.dart`).
Students and guardians can read a board only after it is shared with their class.

## Content library

```
curricula (code: cbse, bu-ug…; global)
courses (curriculum, code, title, term, source, reviewed; global)
chapters (course, position, title; tenant_id null = global, else the institution's own)
topics (chapter, position, title, summary, notes[], outcomes[]; tenant_id as chapters)
subjects.course_id                             — the institution's subject follows this course
```

See [content-library.md](content-library.md). Global rows are read-only to the application role;
row-level security shows them to everyone and an institution's own rows only to it.

## AI, recordings, jobs, push

```
ai_usage (task, outcome, provider, model, prompt_version, tokens, latency)   — metering
ai_cache (key = sha256(task, version, grounding, input), result, hits)        — per tenant
recordings (id chosen by the board, owner, session, slot, section, subject, events_key,
            audio_key, duration, transcript, summary, transcript/summary state, shared_at,
            keep, expiry_notified_at)                                         — deleted after their term
jobs (kind, payload, state, attempts, run_after, locked_at)                   — Postgres queue
push_devices (user, token, platform, app)
```

## Fees

```
fee_invoices (student, section at issue, batch, title, amount_paise, paid_paise, due_on, status)
fee_payments (invoice, amount_paise, method, status, provider order/payment ids, receipt_no)
receipt_counters (tenant, financial_year, last_no)  — RCPT/2026-27/00001…
```

See [fees-payments.md](fees-payments.md).

## Library, marks, messages, timetable history

```
library_books (title, author, isbn, call_no, copies)
library_loans (book, student, issued_at, due_on, returned_at, fine_paise)   — ₹2/day late (setting later)
assessments (section, subject, title, kind, max_marks, held_on, published_at)
marks (assessment, student, marks, absent, remark)                         — families see published only
conversations (student, staff, family member, read markers) + messages     — leaders' reads are audited
timetable_slots.archived_at                                                — edits archive and re-create
board_sessions.live_for_class                                              — "Go live" to the class
topics.resources [{kind: model3d|lab, id, title}]                          — opens on the board
```

## Departments

```
departments (name, head_user_id)                 — the head (a user with the hod role) gets the department view
department_staff (department, user)              — a teacher can be in several departments
subjects.department_id                           — a subject belongs to one department
```

The department view counts the current timetable's periods for the department's subjects that
are already over in the range, and matches them with board sessions (taught), attendance
records (taken) and homework, recordings and assessments. Holidays are not modelled yet, so a
holiday shows as a period not held.

Class audio in live classes is not stored: it is relayed (16 kHz IMA ADPCM, 8 KB/s) and only
its turning on and off is audited (`live_audio.on` / `live_audio.off`).

## Calendar, coverage, submissions, consent

```
calendar_events (kind holiday|exam|event, title, starts_on, ends_on, program_ids)  — holidays cancel classes
topic_coverage (section, topic, covered_on, covered_by, board_session)           — syllabus progress
homework_submissions (homework, student, text, files, status, remark, checked_*) — files in object storage
consents (student, purpose, granted, notice_version, given_by)                   — append-only; latest counts
tenants.settings                                                                  — editable column for the app role
                                                                                    (incl. recordingRetentionGraceDays, default 7)
```

Holidays apply wherever the timetable is turned into days: the teacher's day, the principal's
day, the department view and the board's current period. See docs/product/privacy-notice.md for
the consent purposes.

## Planned next

- Year plan: `lesson_plans` (syllabus progress is built as `topic_coverage`).
