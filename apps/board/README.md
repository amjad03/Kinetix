# KINETIX Board

The classroom app. Flutter, targeting Android (tablets, IFPs) and Windows. See
[ADR 0001](../../docs/adr/0001-board-on-flutter.md) and the
[feature spec](../../docs/product/board-features.md).

```
lib/
  core/           API client, realtime socket, models, device storage, BoardController (app state)
  features/
    enrollment/   first-run registration with the ERP enrolment code
    pairing/      idle screen: QR + 6-digit code, rotates every 2 minutes
    workspace/    teaching screen: session bar, split layout, toolbar
    ink/          multi-touch ink engine (controller, models, canvas, backgrounds)
    broadcast/    principal's messages: banner / card / emergency takeover
    comfort/      eye protection (warmth, dimming, auto by time of day, high contrast)
```

## Run

```bash
flutter pub get
flutter run -d windows          # or -d linux, or an Android device
flutter test                    # unit + widget tests
../../scripts/board-it.sh       # integration test against a freshly seeded local API
```

On first run, enter the server URL and the enrolment code that `pnpm db:seed` prints in
`services/api`. Then pair from the Teacher App. Until that app exists, use the API directly:

```bash
TOKEN=$(curl -s -XPOST localhost:4000/v1/auth/login -H 'content-type: application/json' \
  -d '{"tenant":"demo-college","login":"anita@demo.kinetix.in","password":"kinetix123"}' | jq -r .accessToken)
curl -XPOST localhost:4000/v1/pairing/claim -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"code":"<code on the board>"}'
```

To try the board without a server, use **Practice board**.

## Lesson recording

**Record** on the toolbar records the board's ink (`LessonRecorder` from `kinetix_ink`) and the
teacher's voice, so absent students and parents can watch the lesson in their apps. Code:
`lib/core/recording/` (capture, store, upload queue) and `lib/features/recording/` (UI).

- Only a signed-in teacher can record; a guest board says the teacher must connect first.
- While recording, the status strip shows a red dot, the elapsed time, pause/resume and stop.
  Recording carries on across page turns, opening a saved board and background changes.
- Voice: the `record` package, mono AAC-LC in `.m4a`, 22.05 kHz, 48 kbit/s (about 21 MB an
  hour), behind `VoiceRecorder` (`MicVoiceRecorder`, `NoVoiceRecorder`). With no microphone, a
  denied permission or an unsupported platform, the board records ink only and says so once
  ("Recording the board without sound: no microphone found"). On Linux `record` needs
  `parecord` (PulseAudio/PipeWire, package `pulseaudio-utils`) and `ffmpeg`; without them, or
  with no input source, it falls back to ink only. Android needs `RECORD_AUDIO` (in the manifest).
- Stop asks for a title (default "Corporate Accounting · 5 Oct") and whether to share with the
  class (on when a class is timetabled), then Save or Discard (Discard asks again).
- Saved recordings go to `<app support>/recordings/<id>/` (`meta.json`, `events.json`,
  `audio.m4a`) and into an upload queue that survives restarts:
  `PUT /v1/recordings/:id` → `PUT …/events` → `PUT …/audio` → `POST …/finish {share}`.
  Every step is recorded in `meta.json`, so an interrupted upload resumes where it stopped.

**Upload and the board-session token.** Uploads need the recording teacher's board-session
token, which ends with the class. So the queue uploads eagerly: right after Save, and again when
the teacher taps End class (the session is ended only after the upload, waiting up to two
minutes). Whatever is still pending (the board was offline) stays on disk and uploads the next
time the *same* teacher signs in on this board (also after an app restart), or when the
connection comes back while they are signed in. Another teacher's session never uploads it. A recording that
could not even be created in its own class is created under the later class, so it is not shared
automatically; the teacher shares it from **Recordings** (profile menu).

**Retries.** Network and 5xx errors retry with backoff (5 s doubling to 5 min). "Already
finished" from the events or audio step counts as done. Sharing a recording made without a
timetabled class is refused by the API, so it is finished unshared and the list says why. Other
4xx errors mark it failed until the teacher taps Retry.

**What stays on the board.** After a successful finish the event log and audio are deleted at
once (the cloud has them, and the board's disk is shared by every class and teacher); the small
`meta.json` stays 7 days so the Recordings list can show what was uploaded, then it is removed.
Folders without `meta.json` (the app closed mid-recording) are removed at startup.
