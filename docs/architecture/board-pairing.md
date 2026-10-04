# Board ↔ Teacher pairing (sign-in without typing a PIN on the board)

## Problem

The Board is a shared screen that the whole class can see. A PIN typed on it is a PIN
everyone has seen. The teacher already carries a trusted device: their phone, signed in to
the Teacher App. We use the phone to unlock the board.

## Online flow (default)

```
Board                                   Cloud API                               Teacher App (signed in)
  │ POST /v1/devices/pairing-codes          │                                           │
  │ (device token) ───────────────────────► │ create code: 6 digits + 128-bit secret,   │
  │ ◄─────────────── { code, qrPayload,     │ TTL 120 s, bound to this device           │
  │                     expiresAt }         │                                           │
  │ show QR + "482 913"                     │                                           │
  │ ws: join room device:<id>               │                                           │
  │                                         │      POST /v1/pairing/claim {code | qr}   │
  │                                         │ ◄──────────────────────────────────────── │ scan QR or type code
  │                                         │ check: same tenant, same campus,          │
  │                                         │ not expired, not used, teacher active     │
  │                                         │ resolve current timetable period          │
  │                                         │ create BoardSession                       │
  │ ws event "pairing.claimed"              │ ─────────────────────────────────────────►│ "Connected to Room 204 ·
  │ { sessionToken, teacher, period } ◄──── │                                           │  BCom 3rd sem · Accounts"
  │ open the teacher's workspace            │                                           │
```

- **QR payload:** `kinetix://pair?c=<code>&s=<secret>&d=<deviceId>`. Scanning sends the secret, which makes the claim safe from someone guessing the code. **Typing the 6 digits** is the fallback. Typed claims are rate-limited (5 attempts per teacher per minute, 20 per device per minute) and only accepted from the same campus.
- The code rotates every 120 s and is single-use. Codes are stored as **hashes**.
- The **board session token** is a JWT scoped to `{tid, did, uid, sid}`. It expires at the end of the period plus a 15-minute grace, at the latest.
- **Ending a session:** "End class" on the board or in the Teacher App, the period ending, or 20 minutes idle (with a warning). The board then returns to the pairing screen and clears the teacher's state from memory.
- **Takeover:** If another teacher pairs during an active session, the first teacher gets a notification. Their session's canvas is saved, and the board switches over.

## Offline flow (internet down)

Requirements: the board and the phone are on the same Wi-Fi, or within Bluetooth LE range.

1. While online, the Teacher App holds an **offline credential**: a short JWT signed with the cloud's Ed25519 key, `{tid, uid, campusId, devicePubKey, exp: +7 days}`. It binds the teacher to a key pair generated on the phone; the private key stays in the Android Keystore or iOS Secure Enclave.
2. The Board has the cloud's public key, the campus staff list and the timetable cached.
3. The Board's QR code includes a nonce and its LAN address: `kinetix://pair-local?n=<nonce>&h=<ip:port>&d=<deviceId>`.
4. The phone sends `{offlineCredential, sign(nonce‖deviceId)}` to the board's local HTTPS endpoint, or over BLE.
5. The board verifies the cloud signature, the expiry, the campus and the nonce signature, then opens the session. The session syncs to the cloud with the evidence attached when the connection returns.

## Fallback: no phone

The tenant can enable a **scrambled keypad PIN**: the digit positions are shuffled each time,
and the keypad only appears after the teacher picks their name. Watching where the teacher
taps reveals nothing. It is off by default.

## Threats considered

| Threat | Mitigation |
|---|---|
| A student photographs the QR code and claims it | Only staff accounts with the teacher role can claim. The claim needs the student to be signed in as a teacher. |
| Guessing the 6-digit code | 10⁶ space, 120 s TTL, rate limits, same-campus restriction |
| A stolen phone | App lock (biometric/OS PIN) on the Teacher App; an admin can revoke the session |
| A board left signed in | Idle timeout, end of period, remote sign-out from the ERP |
| Replaying an offline credential | Nonce challenge signed by a key that cannot be exported; 7-day expiry |
