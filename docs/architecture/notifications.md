# Notifications to families

Parents and students hear about what happens in class from the **in-app inbox**
(`notifications` table). Push messages (FCM/APNs, not built yet) will carry only the
notification id: the app fetches the text from KINETIX Cloud, so no personal data passes
through Google's or Apple's servers.

## What creates a notification

| Event | Who is told | Dedupe key | Code |
|---|---|---|---|
| A student is marked **absent** (Teacher App or board) | That student's guardians | `absence:<student>:<date>:<period>` | `NotificationsService.attendanceChanged` |
| The mark is **corrected** to present or late | The earlier alert is withdrawn (`retracted_at`) and disappears from the inbox | same | same |
| Marked absent again after a correction | The alert returns, unread | same | same |
| **Homework** is set | Guardians and student accounts of the class | `homework:<id>` | `homeworkCreated` |
| A board is **shared** with the class | Guardians and student accounts of the class | `board:<id>` | `boardShared` |
| The principal **circulates** a message | Guardians and student accounts in the audience (school, programs or classes) | `broadcast:<id>` | `broadcastSent` |

- **One per recipient and event.** A unique index on `(user_id, dedupe_key)` makes every write
  idempotent: re-submitting attendance, retrying a sync batch, or sharing twice never doubles up.
- **Same transaction.** Notifications are written in the transaction that records the event,
  so they exist only if the event does.
- **Set-based recipients.** They are resolved in SQL (`insert … select`), so a whole-school message
  is one statement however many families there are.
- **Row-level security** confines everything to the tenant. On top of that, the inbox API only ever
  returns the caller's own rows.

## API

| Route | Who | What |
|---|---|---|
| `GET /v1/notifications?limit=` | any signed-in user | `{ unread, items[] }`, newest first, withdrawn ones hidden |
| `POST /v1/notifications/:id/read` | owner | mark one read |
| `POST /v1/notifications/read-all` | owner | mark all read |

## Next

- Push delivery worker (BullMQ): for each new row, an FCM/APNs message containing only `{id}`.
- SMS fallback for absence alerts to parents without the app (DLT-registered template, Indian provider).
- Per-family quiet hours and language (English, Hindi, Kannada) for notification text.
