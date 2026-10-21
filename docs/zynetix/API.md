# Zynetix API contract (board edition)

The API the Zynetix admin dashboard (ERP web app, edition-aware nav), the board, and the Teacher,
Student and Parent apps use. Base path `/v1`, JSON, `Authorization: Bearer <token>`. Errors carry
`{ statusCode, message, code }`. Roles: `ADMIN` = tenant_admin or principal; `TEACHING` = teacher,
hod, principal; `PLATFORM` = the KINETIX/Zynetix platform team (`platform_admins`, any role).
Principal kinds: `user` (person), `board` (a paired board session), `device` (an enrolled board or
edge box before pairing).

## 1. Edition

An institution is `full` (ERP + board) or `board` (Zynetix only). Migration 0139 adds `tenants.edition` (default `full`).

| Call | Who | Notes |
| --- | --- | --- |
| `GET /me` | user | `tenant: { name, slug, timezone, edition }`; apps hide ERP features when `edition = 'board'`. |
| `GET /devices/me/config` | device, board | adds `edition`. |
| `GET /platform/tenants` | PLATFORM | `[{ id, slug, name, kind, edition, timezone, createdAt }]` |
| `POST /platform/tenants` | PLATFORM | `{ slug, name, kind: school\|college\|university, edition?: full\|board, yearLabel, yearStart, yearEnd, adminName, adminEmail, adminPhone?, timezone?, campus?, city? }` → `{ tenant, admin: { id, fullName, email, temporaryPassword } }` (409 slug taken). |
| `PATCH /platform/tenants/:id` | PLATFORM | `{ name?, edition? }`; applies at once. |

In the board edition every ERP-only route answers **403 `{ code: 'EDITION_BOARD_ONLY' }`**: `fees`,
`fee-accounts`, `finance`, `books` (accounts day-book), `tally`, `hostel`, `hr`, `payroll`,
`admissions` (and `public/admissions/:slug`, `public/leads`), `transport`, `inventory`, `assets`,
`asset-ops`, `library`, `canteen`, `placements`, `alumni`, `alumni-portal`, `careers`, `research`,
`accreditation`, `quality`, `quality-hub`, `obe`, `exam-office`, `external-examiners`,
`examiner-portal`, `evaluation`, `university-results`, `course-registration`, `admin/payments`,
and the Parent App's `children/:id/{bank-transfers,fees,hostel,transport,library}`
(`src/institution/edition.ts`). Everything else stays open (auth, me, users/teachers/students/
guardians, programs/departments/sections/subjects, curriculum, content, timetable, devices,
pairing, board-sync, whiteboards, recordings, cast, ai, quiz-games, polls, homework, exit-tickets,
notifications, audit, billing). The existing per-module switch (`MODULE_DISABLED`) still applies.

## 2. Teachers and timetable (dashboard)

| Call | Who | Body / result |
| --- | --- | --- |
| `GET /admin/teachers` | ADMIN, tenant_admin | `[{ id, fullName, email, phone, status, teachingSubjects, roles, departments: [{ id, name }] }]` |
| `POST /admin/teachers` | ADMIN | `{ fullName, email?, phone? (one required), roles?: ('teacher'\|'hod')[], departmentIds?, teachingSubjects?, preferredLanguage? }` → the teacher + `temporaryPassword`, `mustChangePassword: true` (409 email/phone taken). |
| `PATCH /admin/teachers/:id` | ADMIN | `{ fullName?, email?, phone?, active?, roles?, departmentIds?, teachingSubjects? }` (`active: false` disables sign-in). |
| `POST /admin/users/:id/reset-password` | ADMIN | `{ userId, temporaryPassword, mustChangePassword }` |
| `GET /admin/staff` | ADMIN | teaching staff for pickers. |
| `GET /admin/departments`, `POST`, `PUT /:id`, `DELETE /:id` | ADMIN | departments. |
| `GET /admin/structure`, `GET /admin/classes` | ADMIN | programs, sections, subjects. |
| `POST /admin/import/{programs\|staff\|students\|timetable}` (`?dryRun=1`) | ADMIN | CSV bulk load; `GET /admin/import/templates/:kind` for the template. |
| `GET /admin/timetable?sectionId=\|teacherId=` | ADMIN | the week's periods. |
| `POST /admin/timetable/slots`, `PATCH /admin/timetable/slots/:id` | ADMIN | `{ sectionId, subjectId, teacherId, roomId?, dayOfWeek 1-7, startsAt 'HH:MM', endsAt }` (clash and capacity checks). |
| `GET /admin/rooms`, `PATCH /admin/rooms/:id` | ADMIN | rooms with capacity. |
| `GET /teacher/timetable?date=` | TEACHING | the Teacher App's day. |

## 3. Topic resources (all apps)

Library: curriculum → course (subject) → chapter (unit) → topic. Topics are global (platform) or the institution's own.

**`GET /topics/:id/resources?lang=en|hi|kn`** — user or board. One read for board, teacher, student and parent:

```json
{
  "topic": { "id", "title", "summary", "chapter": { "id", "title" }, "course": { "id", "title", "language" } },
  "language": "en",
  "videos": [{ "id", "source": "platform|institution|teacher", "topicId", "youtubeVideoId", "title", "language", "durationSeconds", "channelTitle", "position" }],
  "materials": [{ "id", "source": "platform|institution", "kind": "pdf|book|syllabus|link|model3d|sim", "title", "url", "ref", "author", "bookChapter", "pageFrom", "pageTo", "language", "audience", "position", "createdAt" }],
  "animations": [{ "id": "<kinetix_animations id>", "title", "materialId", "source" }],
  "builtIn": [{ "kind": "model3d|lab", "id", "title" }]
}
```

Visibility: only approved materials whose `audience` includes the caller's app (`board` for a board
session, `student`, `parent` for guardians, `teacher` for staff; ADMIN sees all). Videos follow the
existing rules (platform + institution for everyone, teacher videos for their sections or once
approved).

**`GET /subjects/:id/outline`** — user or board. `{ subject: { id, code, name, term }, course: null | { id, title, …, chapters: [{ id, title, own, topics: [{ id, title, own, counts: { videos, materials, animations } }] }] } }`.

`GET /topics/animations` — the built-in animation catalogue `[{ id, title }]` (29 ids, kept in sync with `packages/kinetix_animations` by a test).

Managing materials (institution):

| Call | Who | Notes |
| --- | --- | --- |
| `GET /topics/:id/materials` | TEACHING, tenant_admin | platform + institution rows with `status`; teachers see approved and their own. |
| `POST /topics/:id/materials` | TEACHING, tenant_admin | `{ kind, title?, url?, ref?, author?, bookChapter?, pageFrom?, pageTo?, language?, audience?: ('board'\|'teacher'\|'student'\|'parent')[] }`. pdf/syllabus/link need `url`; book needs `title`; animation needs a catalogue `ref` (title defaults from it); model3d/sim need `ref` or `url`. ADMIN's are `approved`, a teacher's `pending`. |
| `PATCH /topic-materials/:id` | TEACHING, tenant_admin | a teacher edits only their own, which goes back to `pending`. |
| `DELETE /topic-materials/:id` | TEACHING, tenant_admin | teacher: own only. |
| `PUT /topics/:id/materials/order` | ADMIN | `{ ids }`, every institution material of the topic once. |
| `GET /topic-materials/pending` | ADMIN | teachers' materials waiting, with `topic`. |
| `POST /topic-materials/:id/review` | ADMIN | `{ approve: boolean, reason? }` (reason required to reject). |

Global library (PLATFORM): `GET|POST /platform/topics/:id/materials`, `PUT /platform/topics/:id/materials/order`, `PATCH|DELETE /platform/materials/:id` (same bodies). Existing video endpoints stay: `/platform/topics/:id/videos`, `/content/topics/:id/videos[/mine]`, `/content/videos/:id/*`, `/content/video-approvals`.

## 4. YouTube channel import

Paste a channel link (`/channel/UC…`, `/@handle`, `/user/x`, `/c/x`), a bare `@handle` or `UC…` id, or a playlist link. With `YOUTUBE_API_KEY` every upload is listed (Data API v3: channels → uploads playlist); without it the public feed (`feeds/videos.xml?channel_id=` / `?playlist_id=`) gives the latest 15 (`via: 'feed'`).

| Call | Who | Body / result |
| --- | --- | --- |
| `POST /platform/youtube/preview` | PLATFORM | `{ url, courseIds: uuid[] }` → `{ source: { kind: channel\|playlist, id, title }, via: api\|feed, topics: [{ id, title, chapter, course }], videos: [{ youtubeVideoId, title, position, publishedAt, suggestedTopicId, score, alreadyOn: topicId[] }] }`. Nothing is saved. |
| `POST /platform/youtube/import` | PLATFORM | `{ language, playlistId?, items: [{ youtubeVideoId, title, topicId }] }` → `{ added, skipped }` (global topics; duplicates skipped). |
| `POST /content/youtube/preview`, `POST /content/youtube/import` | ADMIN, tenant_admin | the same for the institution's own videos (scope `institution`, global or own topics). |

Suggestions are keyword matches of the video title against topic titles (2 points) and summaries (1 point), `src/platform/matching.ts`. 404 channel not found, 400 not a channel/playlist link, 503 YouTube unreachable.

## 5. AI answer log and capacity

Every AI request (explain, quiz, tutor, board ask/select-ask, read-board, lesson plan, insights,
transcribe…) writes one `ai_usage` row: tenant, user, device (board), topic (chosen or first
grounding topic), kind (`task`), provider/model, latency, tokens in/out, outcome and reason.
Status = `served` (ok, cached) · `rejected` (blocked, quota) · `throttled` · `error` (invalid, unavailable).

Capacity gate: at most `AI_MAX_CONCURRENT` (default 16) model calls per API instance; extra
requests wait up to `AI_QUEUE_WAIT_MS` (default 10000) and are then refused with **429
`{ code: 'AI_THROTTLED' }`** and logged as `throttled`.

| Call | Who | Notes |
| --- | --- | --- |
| `GET /ai/admin/logs` | tenant_admin, principal, quality_officer | `?from&to` (date or ISO; default last 7 days) `&status=served\|rejected\|throttled\|error&kind=<task>&userId&deviceId&topicId&page=1&pageSize=50 (≤200)` → `{ items: [{ id, at, kind, status, outcome, reason, user: {id, fullName}\|null, device: {id, name}\|null, topic: {id, title}\|null, provider, model, latencyMs, tokensIn, tokensOut, estCostInr }], total, page, pageSize }` |
| `GET /ai/admin/logs/summary` | same | same filters + `bucket=day\|hour` → `{ from, to, timezone, bucket, totals: { requests, served, rejected, throttled, error, tokensIn, tokensOut, p50LatencyMs, p95LatencyMs }, buckets: [{ at, …totals }], peakHour: { at, requests, throttled }\|null, byHourOfDay: [{ hour, requests, throttled }], byKind: [{ kind, requests, served, tokensIn, tokensOut }], reasons: [{ status, reason, n }], capacity: { running, waiting, max } }` |
| `GET /ai/usage` | ADMIN | last 30 days by task and outcome (existing). |
| `GET /ai/admin/actions`, `/actions/summary` | AI admins | the AI action audit (existing). |

**Claude connection** (migration 0141, `ai_connections`): an institution can use its own Anthropic key instead of the server's AI settings. With a key saved, its AI requests go to Anthropic's OpenAI-compatible endpoint (`ANTHROPIC_BASE_URL`, default `https://api.anthropic.com/v1`) with that key, the chosen model and the fallback model; otherwise the server's provider answers. The key is encrypted with `SECRETS_ENCRYPTION_KEY` (rotated by `pnpm secrets:rotate`) and never returned.

| Call | Who | Notes |
| --- | --- | --- |
| `GET /ai/admin/connection` | tenant_admin, principal, PLATFORM | `{ provider: 'anthropic', model, fallbackModel, keySet, keyHint (last 4), updatedAt, source: institution\|server\|none }` |
| `PUT /ai/admin/connection` | same | `{ apiKey?, model?, fallbackModel?: model\|null }`; models `claude-sonnet-5-5` (default), `claude-opus-5-5`, `claude-haiku-5-5` (default fallback). The first save needs `apiKey`; a key left out keeps the stored one. Audited (`ai.connection_updated`) without the key. |
| `DELETE /ai/admin/connection` | same | removes it (`ai.connection_removed`); back to the server's AI. |
| `POST /ai/admin/connection/test` | same | one tiny completion on the primary model → `{ ok: true, model, latencyMs }` or `{ ok: false, error }` (401/403: "The key was rejected by Anthropic"). |

## 6. Boards and edge devices

`POST /devices/me/health` (device or board, every few minutes, max 30/min) now also takes
`deviceKind?: board|ifp|edge, cpuPct?, gpuPct?, npuPct?, ramPct?, ramTotalMb?, diskPct?, cpuTempC?,
gpuTempC?, aiInferences?, aiInferenceMs?` (on-device AI since the previous report)`, uptimeS?`
alongside `os, osVersion?, appVersion?, kiosk, storageFreeMb?, storageTotalMb?, battery?,
currentClass?, locked?`. A report with compute figures is kept as a `device_telemetry` sample.

| Call | Who | Notes |
| --- | --- | --- |
| `GET /devices/compute` | ADMIN | `{ online, total, devices: [{ id, name, room, kind, platform, enrolled, online, lastSeenAt, appVersion, os, osVersion, reportedAt, cpuPct, gpuPct, npuPct, ramPct, ramTotalMb, diskPct, cpuTempC, gpuTempC, uptimeS, ai24h: { inferences, inferenceMs, avgMs } }] }` |
| `GET /devices/compute/usage` | ADMIN | `?from&to` (default last 7 days) `&bucket=day\|hour&deviceId` → `{ from, to, timezone, bucket, totals: { aiInferences, aiInferenceMs }, rows: [{ deviceId, device, at, samples, cpuAvg, cpuMax, gpuAvg, gpuMax, npuAvg, npuMax, ramAvg, ramMax, diskMax, cpuTempMax, gpuTempMax, aiInferences, aiInferenceMs, aiAvgMs }] }` |
| `GET /devices/fleet?hours=4` | ADMIN | fleet health and offline alerts (existing). |
| `POST /devices`, `PATCH /devices/:id`, `POST /devices/:id/enrollment-code` | ADMIN | register a board/edge box and get its enrolment code. |
| `POST /devices/:id/actions`, `GET /devices/:id/actions`, `GET /devices/fleet/actions` | ADMIN | lock, unlock, restart_app, message, kiosk_policy, rename_move, unpair. |
| `POST /devices/enroll`, `POST /devices/me/pairing-codes`, `POST /pairing/claim` | device / teacher | enrolment and pairing (existing). |

## 7. Audit

`GET /audit` (filters), `GET /audit/actions`, `GET /audit/export` (ADMIN). New actions:
`platform.tenant.created|updated`, `teacher.created|updated`, `topic_material.added|edited|removed|reordered|approved|rejected`,
`platform.topic_material.*`, `platform.concept_video.channel_imported`, `concept_video.institution.channel_imported`.
