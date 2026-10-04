# Notifications to families

Parents and students hear about what happens in class from the **in-app inbox**
(`notifications` table), and their phones get a **push** for each new item. The push carries
only a generic line ("Attendance update", "New homework") plus the notification id: the app
fetches the text from KINETIX Cloud, so no names or details pass through Google's or Apple's
servers.

## What creates a notification

| Event | Who is told | Dedupe key | Code |
|---|---|---|---|
| A student is marked **absent** (Teacher App or board) | That student's guardians and the student's own account | `absence:<student>:<date>:<period>` | `NotificationsService.attendanceChanged` |
| The mark is **corrected** to present or late | The earlier alert is withdrawn (`retracted_at`) and disappears from the inbox | same | same |
| Marked absent again after a correction | The alert returns, unread | same | same |
| **Homework** is set | Guardians and student accounts of the class | `homework:<id>` | `homeworkCreated` |
| A board is **shared** with the class | Guardians and student accounts of the class | `board:<id>` | `boardShared` |
| The principal **circulates** a message | Guardians and student accounts in the audience (school, programs or classes) | `broadcast:<id>` | `broadcastSent` |
| A **lesson recording** is shared | Families of students absent from that period get "Missed <subject>? Watch the lesson"; the rest of the class gets "Lesson recording: <subject>" | `recording:<id>` | `recordingShared` |
| **Fees** are issued to a class | Guardians and student accounts of the students billed | `fee:<batch>` | `feeIssued` |
| A **fee payment** goes through | The student's guardians and the student, with the receipt number | `fee-paid:<payment>` | `feePaid` |

- **One per recipient and event.** A unique index on `(user_id, dedupe_key)` makes every write
  idempotent: re-submitting attendance, retrying a sync batch, or sharing twice never doubles up.
- **Same transaction.** Notifications are written in the transaction that records the event,
  so they exist only if the event does.
- **Set-based recipients.** They are resolved in SQL (`insert … select`), so a whole-school message
  is one statement however many families there are.
- **Row-level security** confines everything to the tenant. On top of that, the inbox API only ever
  returns the caller's own rows.

## Push

- Apps register their FCM token after sign-in (`POST /v1/push/devices {token, platform, app}`) and
  remove it on sign-out (`DELETE /v1/push/devices {token}`). Tokens are per tenant; a phone that
  signs in as someone else moves to them.
- Every insert into `notifications` returns the new (or revived) rows; their ids are queued as a
  `push.send` job **in the same transaction** (`PushService.queue`), so a push exists only if the
  notification does.
- The job runner (Postgres `jobs` table, `FOR UPDATE SKIP LOCKED`, retries with backoff) sends one
  FCM HTTP v1 message per registered phone, skipping notifications read or withdrawn in the
  meantime, and deletes tokens FCM reports as unregistered.
- Without `FCM_SERVICE_ACCOUNT` nothing is queued; the inbox works as before.

## API

| Route | Who | What |
|---|---|---|
| `GET /v1/notifications?limit=` | any signed-in user | `{ unread, items[] }`, newest first, withdrawn ones hidden |
| `POST /v1/notifications/:id/read` | owner | mark one read |
| `POST /v1/notifications/read-all` | owner | mark all read |
| `POST /v1/push/devices` / `DELETE /v1/push/devices` | any signed-in user | register / remove this phone |

## Next

- SMS fallback for absence alerts to parents without the app (DLT-registered template, Indian provider).
- Per-family quiet hours and language (English, Hindi, Kannada) for notification text.
