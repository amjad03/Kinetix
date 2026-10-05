# Lesson recording

A recorded lesson is **the board's ink as a timed event log plus the teacher's voice**, not a
screen video. An hour of ink is a few hundred kilobytes; an hour of voice at 48 kbit/s AAC is
about 20 MB. Playback rebuilds the board stroke by stroke in sync with the audio, so it is
sharp on any screen and cheap on mobile data.

## Format

`packages/kinetix_ink/lib/src/lesson.dart` documents the JSON (`v: 1`):

```json
{"v": 1, "canvas": {"w": 1920, "h": 1080}, "background": "plain", "durationMs": 3120000,
 "events": [[0, "L", [[...]], 0], [0, "k", "plain"], [1830, "b", 4, {"t": "pen", ...}], [1846, "p", 4, 812.5, 300.1], ...]}
```

Each event is `[ms, kind, …]`: `L` snapshot of all pages, `b` stroke begins, `p` points added,
`u` shape re-dragged, `e` stroke finished, `a` stroke appears (undo of an erase, redo, at a
position), `x` strokes removed, `m` strokes moved, `g` page turned, `n` page inserted, `k`
background. Players ignore kinds they do not know, so newer boards stay compatible.

`LessonRecorder` watches `BoardPages` and the open page's `InkController` and writes down what
changed after each update; the ink engine itself has no recording code. `LessonPlayer`
rebuilds the board at any moment (seeking back replays from the start, a few milliseconds even
for an hour), and `LessonView` draws it. The live classroom view uses the same recorder in
streaming mode (`drain()`, `snapshotNow()`) and the same player (`applyLive`).

## Flow

```
Board: Record ─► LessonRecorder (ink) + VoiceRecorder (AAC .m4a, or ink only without a mic)
       Stop   ─► title + "share with the class" ─► saved on the board's disk ─► upload queue
Upload:  PUT /v1/recordings/:id {title, startedAt}       (id chosen by the board: retry-safe)
         PUT /v1/recordings/:id/events                    (raw JSON, ≤ 32 MB)
         PUT /v1/recordings/:id/audio                     (raw audio, streamed to storage, ≤ 150 MB)
         POST /v1/recordings/:id/finish {durationMs, share}
Cloud:   finish ─► job recording.transcribe (speech server in India) ─► job recording.summarize
         (KINETIX AI) ─► transcript + summary on the recording
         share ─► notifications: "Missed <subject>? Watch the lesson" to families of absentees,
                  "Lesson recording" to the rest of the class (and pushes)
Apps:    Parent / Student / Teacher apps: GET /:id (summary, transcript), /:id/events,
         /:id/audio (HTTP Range, so players can seek)
```

- **Storage:** `ObjectStorage` — local disk in development (`STORAGE_DIR`), S3 in production
  with `S3_REGION` restricted to `ap-south-1`/`ap-south-2` at start-up. Keys are
  `tenants/<tenant>/recordings/<id>/{events.json,audio}`.
- **Jobs:** the `jobs` table is a small Postgres queue (`FOR UPDATE SKIP LOCKED`, five attempts
  with exponential backoff, stale "running" jobs re-claimed after 15 minutes). Requests enqueue
  in their own transaction; any number of API processes run jobs.
- **Speech:** `ASR_BASE_URL` points at an OpenAI-compatible `/audio/transcriptions` server
  (faster-whisper or similar) hosted in India. Without it recordings play without transcripts.
  A summary that would only be a placeholder (no AI server) is not stored.
- **Access:** the teacher who recorded it; school leaders; and, once shared, the class's
  students and their guardians. Families never see a recording that is still uploading.

## Retention: until the semester ends

Owner decision: a recording is kept until the end of its semester, plus a grace period.

- **Its term:** the `academic_terms` row of the recording's class's program on the day it was
  recorded (in the institution's time zone). A term made for the program wins over one for
  every program. Recordings without a class (recorded outside a timetabled period) or without a
  term are **kept**, and listed as "no term" for the principal
  (`GET /v1/admin/recordings/retention`, shown in ERP Settings → Class recordings).
- **When:** `expiresOn` = the term's last day + `recordingRetentionGraceDays` (tenant setting,
  default 7, 0–90, `PUT /v1/admin/settings`) + 1: the day it is deleted. Recording responses
  (`GET /v1/recordings`, `GET /v1/recordings/:id`) carry `expiresOn` (or null) and `keep`.
- **Keep:** the teacher who recorded it (Teacher App or board) can call
  `POST /v1/recordings/:id/keep {keep: true|false}` (audited `recording.kept` / `recording.unkept`).
  No approval is needed for the pilot. Kept recordings are never deleted automatically.
- **In the apps:** the Teacher App's Recordings tab shows "Deleted on {date}" (highlighted
  within seven days) or "Kept", with a Keep / Don't keep button (applied at once, undone if the
  server refuses). The Parent and Student apps show "Available until {expiresOn − 1 day}" on
  shared recordings.
- **Warning:** seven days before `expiresOn` the teacher gets one in-app notification (kind
  `recording`, dedupe key `recording-expiry:<id>`, with a push; the Teacher App opens its
  Recordings tab). It is sent once, even if the dates change later.
- **Daily job:** `recording.retention`, one per institution in the Postgres queue. Each run
  queues the next a day later; every API process checks hourly (and at start) that each tenant
  has one queued (`JobsService.registerDaily` / `ensureDaily`, under an advisory lock). A run
  deletes the files first (events log and audio; if that fails the row stays and the next run
  retries), then the row, withdraws the notifications about it (families' "Lesson recording"
  and the teacher's warning), drops queued transcription/summary jobs and the cached AI summary,
  and writes the audit entry `recording.expired` (actor `system`, with the term, dates and bytes).
  Transcript and summary are columns of the row, so they go with it; nothing else references
  a recording.
- **Year plans:** a plan generated without an end date ends with the class's current term
  (else about 16 weeks, within the academic year).

## Not built yet

- Deleting a recording by hand from the apps.
- Slides, PDFs and videos shown in split screen are not in the event log yet.
- Kannada and Hindi speech models need benchmarking on classroom audio.
