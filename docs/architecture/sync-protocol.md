# Offline-first sync protocol

The Board, the Teacher App and the Student App must work with no connection and catch up
later. One protocol covers all of them.

## Model

- **Local store:** SQLite (Drift) on every client.
- **Down-sync (cloud → device): per-collection change feeds.** Each syncable table has
  `updated_at` and a monotonically increasing `version` (`bigint` from one global sequence).
  The client pulls
  `GET /v1/sync/pull?collections=timetable,students,...&since=<cursor>` and receives
  changed rows plus tombstones, with a new cursor. Scope is enforced on the server: a board
  receives only its campus's timetable, the rosters of classes timetabled in its room, and
  content for those subjects.
- **Up-sync (device → cloud): an operation outbox.** The client records intent-level
  operations, not row diffs:
  ```json
  { "opId": "0192f6d0-…(uuidv7)", "type": "attendance.marked",
    "occurredAt": "2026-10-04T09:12:03+05:30", "deviceId": "…", "actorId": "…",
    "payload": { "sessionId": "…", "studentId": "…", "status": "present" } }
  ```
  `POST /v1/sync/push` takes a batch of operations. The server applies them **idempotently by
  `opId`** and returns per-operation results (`applied | duplicate | rejected{reason}`).
- **Large binaries** (recordings, images) are uploaded separately in resumable chunks
  (S3 multipart with presigned URLs). The operation refers to the blob by its content hash.

## Conflict rules

| Data | Rule |
|---|---|
| Attendance mark | Last writer wins by `occurredAt`, then by role priority (teacher > board picker). Every change is kept in the audit history. |
| Participation event, homework given, syllabus progress | Append-only: no conflicts |
| Board canvas | Owned by one session: no concurrent editors across devices |
| Master data (students, timetable) | The cloud is authoritative; clients are read-only |

## Board outbox priorities

1. Attendance (parents are waiting for it)
2. Participation and syllabus progress
3. Session metadata
4. Recording chunks, which are bandwidth-throttled and paused during live view

## Clocks

Clients store `occurredAt` with their own clock and the server-received time. On every sync
the server returns its time; the client keeps a skew estimate and corrects timestamps before
sending.
