# Live classroom view & broadcast

## 1. Live view: the principal looks into any classroom

### Why not stream video

Streaming the board screen as 1080p video costs 1–3 Mbps per class. Many campuses share a
single 50–100 Mbps line. Nearly everything on a board is **vector data** (strokes, page
turns, slide numbers), and that is tiny.

### How it works

```
Board ──(1) board events (strokes, page/slide changes, pane layout)───► WS gateway ──► Redis channel live:<sessionId> ──► viewers
      ──(2) microphone audio: Opus 24 kbps over WebRTC ─────────────────► LiveKit SFU (Mumbai) ─────────────────────────► viewers
      ──(3) fallback screen frames for content we cannot replay as vectors (web pages, 3D, labs): 1–2 fps JPEG/WebRTC video at low resolution
```

- **Viewer:** an ERP dashboard grid (all live classes as thumbnails) and a full view of a
  single class. The viewer runs the **same canvas renderer** as the Board, built from
  shared Dart code compiled to Flutter Web and embedded in the ERP. It replays the event
  stream, so the picture is pixel-identical at a fraction of the bandwidth.
- The **same event stream is the recording.** Live view and recording are two consumers of
  one pipeline.
- **Late join:** a viewer receives the current canvas snapshot, then the live events.
- **Cost per class watched:** about 30–60 kbps in total.

### Permissions & transparency (needs a decision; see open questions)

- Only users with the `live_view` permission (principal, HOD, management) can watch, and
  each school sets who has it.
- Every viewing session is written to the audit log (who, which class, when, how long).
- **Recommended:** a small "👁 Being viewed" indicator on the board, which the school can
  configure. Silent observation of teachers and minors raises labour and DPDP concerns; the
  pilot school should decide this with counsel.
- Audio from the classroom microphone reaches viewers only while a session is active and the
  school has enabled it.

## 2. Broadcast: "circulate" a message to classrooms

### Sender (ERP dashboard)

Compose → choose the audience (**all boards**, campus, program/grade, specific sections) →
choose the priority → **Circulate**.

| Priority | On the board | Apps |
|---|---|---|
| `info` | A banner at the top for 15 s, then kept in the board inbox | Notification |
| `important` | A card in the centre that the teacher dismisses; sound | High-priority notification |
| `emergency` | Full-screen red takeover with an alarm tone, which stays until the admin clears it (fire drill, lockdown, early dismissal) | Critical alert |

### Delivery

1. `POST /v1/broadcasts` stores the announcement and resolves the audience into the target
   device rooms (`campus:<id>`, `section:<id>`, `device:<id>`).
2. The WS gateway emits `broadcast.new` to each room through Redis.
3. The board shows the message and replies with `broadcast.ack`. The dashboard shows a
   delivery map, e.g. "41/43 boards displayed, 2 offline".
4. Offline boards fetch unexpired broadcasts on their next sync and show them if they are
   still valid.
5. The same announcement goes out to the Student and Parent apps through the notification
   worker.
