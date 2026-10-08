# Screen sharing to the board, and the IT device console

Phase 01 gaps closed: casting a phone or laptop screen to the board, fleet management for IT, and per-class
engagement analytics.

## 1. Screen sharing

Video is WebRTC between the sender and the board. The API only relays signalling over the `/realtime`
namespace (`CastGateway`, `services/api/src/cast`) and keeps `cast_sessions` rows (migration 0088) and audit entries.

Flow:

1. The sender sends `cast.request {deviceId}`. The board must have an open class; a student must belong to its
   section; teachers and leaders may cast. One cast per person per board, at most four per board.
2. The class teacher's own cast is approved at once (board gets `cast.ice`). Anyone else is `pending`: the board
   gets `cast.pending` and the teacher answers with `cast.decide`. Approval sends `cast.approved` to the sender
   and `cast.ice` to the board (with ICE servers).
3. The sender sends the SDP offer and ICE candidates with `cast.signal`; the board answers the same way. The
   server relays them unread, only while the cast is active and the class is open.
4. `cast.stop` ends a cast: the sender, the board, or the class teacher (also from the Teacher App). A cast also
   ends when the sender disconnects, the board goes offline, or the class ends (`cast.ended`, reason in the event).

Clients:

- Board (`apps/board`): `core/cast` (controller, WebRTC receiver) and the **Cast** tab of the split panel
  (`features/cast`). Up to four tiles side by side, one can fill the panel, "Draw on it" marks stay on the board
  only, "Add to board" puts the frame (with marks) on the whiteboard, Stop ends one. The tab opens by itself when
  someone asks.
- Teacher and Student apps: `packages/kinetix_cast` (sender, cast screen). `GET /v1/cast/boards` lists boards the
  person may cast to. Android needs a `mediaProjection` foreground service (declared in both manifests).
  iOS only captures the app itself unless a ReplayKit broadcast extension is added (not built).
- Laptop: `/cast` in the ERP. Teachers and students sign in there (separate `kx_cast` cookie, not an ERP session);
  `getDisplayMedia` runs in the browser and the ERP server holds the realtime socket (`/api/cast/stream`,
  `/api/cast/send`), like the live view. Run one ERP instance per cast (sticky routing) when scaled out.

ICE: `CAST_STUN_URLS`, `CAST_TURN_URLS`, `CAST_TURN_SECRET` (see `infra/docs/coturn.md`). With none set, casts
work on the same network only.

## 2. Device console

ERP **Device console** (`/devices`, principal and administrators): fleet list with online and last seen, app
version, OS, kiosk state, current class, storage free, battery or mains, and alerts for boards offline longer than
N hours (picker: 1 to 72 h, default 4; `GET /v1/devices/fleet?hours=`).

Boards report with `POST /v1/devices/me/health` (device or board token) on connect and every 5 minutes
(`apps/board/lib/core/fleet`). Remote actions (`POST /v1/devices/:id/actions`) are stored in `device_actions`
(migration 0087), audited as `device.action.<type>`, and sent as `device.action`; an offline board gets them
queued for 24 hours and asks with `device.actions.pull` when it connects. The board answers `device.action.ack`.

| Action | Effect |
|---|---|
| lock / unlock | `devices.locked`; the board shows a lock screen (also returned by `/me/config`, so it survives restarts); the IT PIN unlocks locally |
| restart_app | acknowledged, then the app exits; kiosk mode or the Windows startup task restarts it |
| clear_pin_profiles | removes cached teacher PIN profiles |
| message | shown as an IT announcement for 5 to 600 s |
| kiosk_policy | per-board kiosk override (`devices.kiosk_override`), or follow the institution |
| rename_move | name and room |
| unpair | token revoked, the board returns to enrolment |

## 3. Classroom analytics

`GET /v1/analytics/classroom` now returns per-class engagement in `bySection` (polls, answers, whiteboards,
recordings, activity, activity per session) and counts screen shares as a tool. The ERP Reports page shows an
"Engagement by class" table; the HOD dashboard (Department) shows it for that department's classes. The
`classroom.usage` report has the same columns.

## Not built

iOS cross-app screen capture; audio in casts; recording casts; email or SMS for offline alerts (the console shows
them); a TURN deployment (documented only).
