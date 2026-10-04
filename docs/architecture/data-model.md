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

Electives and combined classes (common in UG) will need a `section_students` join table, so that one student can belong to several teaching groups. **This is planned, not built.**

## Classroom

```
devices ── pairing_codes (hash only, 120 s, single use)
   └── board_sessions (teacher, slot?, section?, subject?, expires_at, end_reason)
           ├── participation_events (student, outcome, topic_code)   ← random picker, board quizzes
           └── attendance_records (student, date, slot?, status)    ← upsert, latest occurred_at wins
sync_ops (tenant_id, op_id) — idempotency ledger for the board outbox
broadcasts ── broadcast_receipts (device, displayed_at, acknowledged_at)
```

## Planned next (Phase 1)

- Curriculum library (global): `curricula`, `curriculum_nodes` (a tree), `learning_outcomes`, `content_items` (lessons, quizzes, 3D models, labs), with per-tenant overrides.
- Year plan and syllabus progress: `lesson_plans`, `coverage_events`.
- Homework and assignments: `assignments`, `submissions`.
- Recordings: `recordings` (event log + audio blobs in S3), `transcripts`.
- Guardianship: `guardians` (guardian user ↔ student, relation, consent).
