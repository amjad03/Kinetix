# Ecosystem sync: board, ERP and apps

What a teacher does on the smartboard, where it goes, and who sees it. The contract test `services/api/test/board-contract.e2e.spec.ts` reads every endpoint the board app calls from `apps/board/lib` and fails if the API has no route for it, so this table cannot drift silently.

## Data flow

| What happens on the board | Board calls | API does | Consumers (and how they see it) |
|---|---|---|---|
| Teacher signs in; period found from the timetable | pairing / profile unlock | `openSession` finds the teacher's slot in the board's room and attaches section, subject and slot | Board roster; ERP live session list |
| Next period starts while signed in | `GET /v1/classroom/now` every minute | `BoardSyncService.now` returns the current slot; `onIt` says if the session is already on it | Board banner "Your class now" (auto-switches when no class is attached) |
| Teacher accepts the next period | `POST /v1/classroom/now/open` | Moves the session to the slot and keeps `timetableSlotId` | Attendance after the switch lands against the right period in ERP (opening a class by hand has no period) |
| Attendance marked | outbox op `attendance.marked` via `POST /v1/sync/push` | Upserts `attendance_records` (last writer by `occurredAt`), notifies guardians of absences, emits `AttendanceCaptured`; after commit sends realtime `attendance.updated` to the students, their guardians and staff | ERP attendance page refreshes itself (`/api/attendance-live` server-sent events), parent app attendance screen refetches, push notification for absences |
| Participation and answers | outbox op `participation.recorded`; `PUT /v1/polls/:id`, `POST /v1/polls/:id/close` | Stores `participation_events`; poll results on close | Teacher app insights; student app poll sheet (realtime `poll.opened/closed`) |
| Poll or quiz tagged to a course outcome | Teacher picks outcomes in Ask the class (`GET /v1/classroom/course-outcomes`, `PUT /v1/polls/:id/cos`); ERP can also tag | OBE direct attainment reads closed tagged polls | ERP OBE attainment (classroom evidence kind) |
| Exit ticket | `PUT /v1/exit-tickets/:id` | Keeps polls as one record | ERP class record, teacher app |
| Homework from the board | `POST /v1/homework/from-board` | Creates the assignment for the section | Student app homework list, parent app; LMS in ERP. **Queued when offline and replayed** |
| Topic marked taught | `POST/DELETE /v1/coverage` | Upserts `topic_coverage` | ERP syllabus coverage, HoD dashboards. **Queued when offline** |
| Badge awarded | `POST /v1/badges` | Inserts badge, notifies family, realtime `badge.awarded` | Parent and student apps. **Queued when offline** |
| Board saved or shared (snapshot) | `PUT /v1/whiteboards/:id`, `POST .../share`, export | Versioned whiteboard, shared copy | Student app boards tab, ERP LMS files. **Save queued when offline (latest save per board) and replayed** |
| Lesson recording | `PUT /v1/recordings/:id`, events, audio, finish | Stores timeline and audio | Student app recordings |
| End class with notes | `POST /v1/classroom/end` | Ends session, optional shared notes | Student app notes, ERP session log |
| Announcement or emergency | ERP broadcasts | Realtime `broadcast.new` to boards; board acks via `POST /v1/broadcasts/:id/ack` | Board overlay, ERP delivery report |
| Exam in the room | `GET /v1/devices/me/exam-room` every minute (device token) | Finds the paper whose seats are in the board's room (15 minutes before start to end), seated count, invigilators | Board exam room screen: subject, countdown, seated, invigilators; classroom tools are covered |
| Device lock, fleet actions | realtime `device.action`, `POST /v1/devices/me/health` | Fleet queue | ERP device console |
| Live view, cast, remote | websocket `/realtime` | Relay | ERP live view, phones |

## Offline behaviour

- Attendance and participation go to a persisted outbox (`/v1/sync/push`, idempotent by `opId`). Replayed with the session token, or the device token after the class has ended.
- Homework, topics taught and badges are kept as `rest` entries in the same persisted file, only when the call never reached the server (a refusal from the server is shown, not kept). They replay in order for the same class session once the board is back; entries from an earlier class are dropped because the server needs that class's session to accept them.
- Whiteboard saves are queued too (a newer save of the same board replaces the kept one) and replay while the same class session is open; if the class ends offline the snapshot is dropped with the session. Recordings and AI calls are not queued: they need the network and fail visibly.

## Gaps found in the audit and what was done

| Gap | Fix |
|---|---|
| Switching class by hand cleared the timetable slot, so later attendance had no period in ERP | `POST /v1/classroom/now/open` keeps the slot; the board offers it at each bell |
| Board stayed on the last period after the bell | Minute check against `GET /v1/classroom/now` with a banner |
| Homework, topics taught and badges lost when the network was down | Deferred queue (above), tested in `apps/board/test/room_sync_test.dart` |
| No exam room mode | `GET /v1/devices/me/exam-room` and the board exam screen |
| No list of what the board needs from the API | `board-contract.e2e.spec.ts` |

Known and left: ERP pages other than attendance do not refresh themselves; a whiteboard saved offline at the very end of a class is lost if the board never regains the network before the class session expires.
