# Campus-scoped staff

A multi-campus institution can limit a member of staff to one campus: **Settings → Users**, the person's record,
field **Campus** (also in bulk edit). The campus is stored on each of their roles (`user_roles.campus_id`); new roles
they are given keep it. Leaving the field empty lets them work on every campus.

## Who is limited

- A member of staff is limited when **every** staff role they hold is tied to a campus. One role without a campus
  (an institution-wide role) lifts the limit.
- Student, guardian, alumni and external examiner roles never limit anyone: those people only see their own records.
- Nobody limits their own account, and only the institution's administrator limits an administrator.

## How it is enforced

1. `AuthGuard` reads the person's campuses on every request (in the same query that checks the session), puts them on
   the principal (`campusIds`) and in the request context. A change applies from the next request; no sign-out needed.
2. `DbService.withTenant` sets `app.campus_ids` for the transaction when the request has a campus limit.
3. Row-level security (migration `0182_campus_scope.sql`) adds a **restrictive** `campus_scope` policy, so it can only
   narrow the tenant isolation policy. A row is visible when it has no campus, when no limit is set, or when its campus
   is one of the person's. Inserts and updates are checked the same way, so a limited person cannot move a row to, or
   create a row on, another campus.

## Where it applies

The policy is on the tables that carry a campus:

| Table | What it holds |
| --- | --- |
| `campuses` | the campus itself (by `id`) |
| `programs` | programmes, and so every list that joins them: classes, students, subjects, timetables, results by programme |
| `buildings`, `rooms` | buildings and rooms |
| `fee_structures` | campus fee structures |
| `campus_settings` | a campus's own settings |
| `devices` | smart boards and their sessions' devices |

Tables without a campus column (sections, students, staff profiles and so on) are not filtered row by row; queries that
reach them through `programs` (an inner join) are narrowed by it. Jobs and system lookups run without a request and are
never limited. `user_roles` itself is not filtered, so sign-in and role checks are unaffected.
