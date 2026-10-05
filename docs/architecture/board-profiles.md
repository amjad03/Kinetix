# Shared-board profiles (teacher PINs)

Several teachers use one board or tablet through the day. The first time, each signs in the
full way (the Teacher app pairs with the board, see [board-pairing.md](board-pairing.md)).
After that they can set a 4–6 digit PIN for that board and switch to their profile by tapping
their name and typing the PIN.

## Server (`services/api/src/board-profiles`, migration `0036_device_profiles`)

`device_profiles` (tenant RLS): one row per board and teacher, created by every full sign-in
(and kept current by PIN sign-ins), with `pin_hash`, `failed_attempts`, `locked_at`.

| Route | Who | What |
|---|---|---|
| `GET /v1/devices/me/profiles` | board (device or session token) | teachers, most recent first, each PIN's salt and hash (none for a locked profile) |
| `PUT /v1/devices/me/profiles/me/pin` `{pin}` | board with a teacher signed in | set or change the teacher's PIN; lifts a lockout |
| `POST /v1/devices/me/profiles/:userId/unlock` `{pin}` | board | checks the PIN, opens a class session exactly as pairing does (`PairingService.openSession`) |
| `DELETE /v1/devices/me/profiles/me` | board with a teacher | the teacher leaves the board's list |
| `GET /v1/devices/:id/profiles` | ERP admins | PIN set, wrong tries, locked |
| `POST /v1/devices/:id/profiles/:userId/reset-pin` | ERP admins | clears PIN and lockout (ERP → Boards → ⋮ → Teachers on this board) |
| `DELETE /v1/devices/:id/profiles/:userId` | ERP admins | removes a teacher from the board |

- Only a salted PBKDF2-HMAC-SHA256 hash is stored (`pbkdf2-sha256$iterations$salt$hash`, the
  kiosk PIN's format, `common/kiosk-pin.ts`); PINs anyone would try first (1111, 1234, 2580…)
  are refused.
- Every wrong PIN is counted and audited; the fifth locks the profile. The count is committed
  before the error goes out. A full sign-in or an admin reset unlocks it. Unlock is also rate
  limited per board and per profile.
- A PIN sign-in still needs an active teacher with a teaching role at the board's campus, and
  ends whatever class was open on the board, as pairing does.

## Board (`apps/board/lib/features/profiles`)

- `ProfilesController` (on `BoardController.profiles`) keeps the list in the board's settings,
  so PINs are checked offline against the cached hash (as the kiosk PIN is). Offline wrong PINs
  are counted on the board and lock after five, also across restarts.
- Each teacher's class session (token and context) is kept in the OS secret store under the
  teacher. Coming back to the board within the period, even offline, reopens it; otherwise
  the PIN opens a new session online.
- Each teacher's own settings (layout, Simple board, pen or fingers, AI pen, eye comfort) are
  saved under `profile.<teacherId>.` and the board's own come back when they sign out; each
  teacher's own whiteboard is kept on the board when another teacher switches in with a PIN.
- Auto-lock: after the idle time (Board settings → Lock when idle: off, 5, 10, 15 or 30
  minutes; 10 by default) a teacher with a PIN gets the lock screen; the class stays open
  behind it. The board signs out when the period ends, as before.
- After a full sign-in a teacher without a PIN is offered "Set a PIN"; settings and the
  profile menu have Set/Change PIN, Switch teacher and Lock board.
