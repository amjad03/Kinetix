# ZYNETIX Board: school demo checklist

A 20-minute smartboard demo for a school, with the Teacher App and Student App beside it. The Mac
runs the API; the board is either the Mac itself (the macOS app, on a projector or TV) or an
Android panel/tablet on the same Wi-Fi. The wider ERP click-paths are in
[DEMO_CHECKLIST.md](DEMO_CHECKLIST.md).

## 1. What to install

| Build | Where | Talks to |
|---|---|---|
| `dist/ZYNETIX Board.app` | the Mac (double-click; first time: right-click > Open) | `http://localhost:4000`, so it works with no Wi-Fi at all |
| `dist/zynetix-board.apk` (285 MB) | Android panel or tablet (allow "install unknown apps") | `http://192.168.31.129:4000` (the Mac's Wi-Fi address on the day it was built); plain HTTP on the LAN is allowed in this build |
| `dist/zynetix-teacher.apk`, `dist/zynetix-student.apk`, `dist/zynetix-parent.apk` | phones | set **Server address** on the sign-in screen to `http://<Mac IP>:4000` |

Rebuild the board APK for a new address (in `apps/board`, about 10 minutes, nothing else running):

```sh
ZYNETIX_TEST_SIGNING=true ~/development/flutter-3.47.6/bin/flutter build apk --release \
  --dart-define=ZYNETIX_API_URL=http://$(ipconfig getifaddr en0):4000 -Pzynetix.lanHttp=true
cp build/app/outputs/flutter-apk/app-release.apk ~/Downloads/Zynetix/dist/zynetix-board.apk && rm -rf build
```

## 2. Start the API (15 minutes before)

One command (Postgres, migrations, API on `0.0.0.0:4000`, ERP on port 3000):

```sh
cd ~/Downloads/Zynetix && scripts/demo-start.sh
```

Or the API alone, by hand:

```sh
cd ~/Downloads/Zynetix/services/api
pnpm db:migrate                                          # new tables after a pull
NODE_OPTIONS=--max-old-space-size=3072 pnpm build       # after every pull
pnpm start                                               # listens on all interfaces, port 4000
curl http://localhost:4000/health                        # {"status":"ok"}
```

From a phone's browser, `http://<Mac IP>:4000/health` must also say `ok`. If it does not, see
section 5. The first time `node` listens, macOS may ask "Accept incoming network connections?":
click **Allow**.

## 3. Real AI answers: Google Gemini (free)

Without these settings every AI answer is a sample marked **Preview**.

1. At https://aistudio.google.com/apikey create a key (any Google account).
2. Add to `services/api/.env` (never commit or share it):

   ```
   AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   AI_MODEL=gemini-3.8-flash
   AI_FALLBACK_MODELS=gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.1-flash-lite
   AI_API_KEY=<your key>
   ```

   The free tier gives each model only 20 requests a day; the fallback models take over when one
   is used up (about 120 a day in all). `gemini-2.5-flash` is retired for new keys;
   `gemini-flash-latest` is the alias for the current Flash model if `gemini-3.8-flash` is ever
   retired.

3. Restart the API (`scripts/demo-stop.sh && scripts/demo-start.sh`, or stop `pnpm start` and run
   it again): it reads `.env` only when it starts. `grep "ZYNETIX AI:" /tmp/zynetix-api.log | tail -1`
   must name the model, not "labelled preview answers".
4. **Rehearse every AI question you will ask** (section 6, 10:00-13:00) on the board once: repeats come
   from the cache instantly and do not use the free allowance. If you run out,
   add more models to `AI_FALLBACK_MODELS`. Details: [GEMINI_FREE_AI.md](GEMINI_FREE_AI.md).

## 4. Logins (school `vidyaniketan`, password `zynetix123` for all)

| App | Who | Login |
|---|---|---|
| Board | the board itself | ERP (`http://localhost:3000`, `principal@vidyaniketan.demo.zynetix.in`) > **Boards** > the room's board > **New enrolment code** (or **Add board**; single use, like `KX-ABCD-1234`). On the board: **Set up this board** > Server `http://<Mac IP>:4000` (the Mac app: `http://localhost:4000`) > **Test connection** > the code > **Register board** |
| Teacher App, then the board | Mr. Naveen Patil, Science, Class 7 A (Room 113, Tuesday 09:00) | `naveen.patil@vidyaniketan.demo.zynetix.in`. On the board tap **Sign in**; in the Teacher App **Connect to board**, scan the QR or type the 6 digits |
| Teacher App (second teacher) | Mrs. Kavya Shetty, Science (Class 8 B, 11 Science A, 5 A) | `kavya.shetty@vidyaniketan.demo.zynetix.in` |
| Student App | Rohan Shetty, Class 7 A | `student.class7@vidyaniketan.demo.zynetix.in` |
| Student App | Ananya Rao, Class 10 A | `student.class10@vidyaniketan.demo.zynetix.in` |
| Parent App | Lakshmi Shetty, mother of Rohan (7 A) and Diya (3 A) | `parent.class7@vidyaniketan.demo.zynetix.in` |
| ERP | Mrs. Lalitha Raghavan, principal | `principal@vidyaniketan.demo.zynetix.in` |

Institution code in every app: `vidyaniketan`. The board opens the teacher's current period from
the timetable; outside it, **Profile > Your Classrooms > Open class** opens any class the teacher
teaches. Use Naveen Patil with Class 7 A so that Rohan's Student App receives the buzzer, the exit
ticket and the shared board. Check the API with `node scripts/demo-api-check.mjs` ("All API checks
passed") **before** you set up the demo board: it issues a new enrolment code for the first board in
the list, and a new code signs out a board already set up with that entry (in the ERP too).

## 5. Network

- The Mac, the panel and the phones must be on the **same Wi-Fi**. The address apps use is the
  Mac's: `ipconfig getifaddr en0` (it was `192.168.31.129` when the APK was built).
- **School or guest Wi-Fi often blocks devices from reaching each other** (client isolation).
  Test `http://<Mac IP>:4000/health` from a phone first; if it does not open, put everything on a
  phone hotspot or a travel router, and use the new address.
- **The address changed** (new network): phones: change **Server address** on the sign-in screen.
  A board not yet set up: type the new address in **Server**. A board already set up on the old
  address: board menu > **Board settings** > **This board** > **Set up again**, then the new address
  and a new enrolment code (if kiosk mode is on, IT unlocks it first: hold the clock 3 s, IT PIN).
  Last resort on Android: Settings > Apps > ZYNETIX Board > Storage > **Clear storage**. The Mac app
  always uses `localhost` and never needs this.
- Gemini needs the Mac to have internet. Everything else works on a LAN with no internet.
- Keep the Mac on power, sleep off, other apps closed (8 GB). No builds or tests during the demo.

## 6. The 20-minute script

Prepare: one PDF and one PowerPoint on the board device (Downloads), the Teacher App signed in as
Naveen Patil, the Student App as Rohan, the AI questions rehearsed.

| Time | Show | If the network fails |
|---|---|---|
| 0:00-2:00 | **Sign in without typing on the board.** Board shows QR and 6 digits; Teacher App > Connect to board; the board opens Class 7 A · Science with the period from the timetable. Switch the board language to Hindi, then Kannada, and back. | Teacher App cannot reach the API: teach on the board as **Guest** (no sign-in needed; a board not set up yet: **Skip for now and use the practice board**), or use the Mac app (localhost needs no Wi-Fi, so pairing still works if the phone and Mac share a hotspot). Every step below except AI, attendance, buzzer, exit ticket and sharing works as Guest. |
| 2:00-5:00 | **Writing.** Pen, highlighter, colours; two people write at once (multi-touch); palm rubs out; two-finger tap undoes; new page and page overview; paper: ruled, grid, Hindi lines, world map. **AI pen**: draw a rough triangle and circle (they become clean shapes), write `2x + 3 = 11` (it becomes a typed equation), tap it > **Solve** for the steps. | All on the device, no network needed. |
| 5:00-7:30 | **Geometry.** Ruler (a line along it snaps straight), protractor, compass, set square; a shape with **Show lengths** and **Show angles**; a 3D cube or cone with its volume and surface-area formula worked out; colour one face. | Offline. |
| 7:30-10:00 | **3D models and simulations.** Tools > 3D models: the skull bone by bone, the virus, the microscope, the globe, a landform; turn, cut, take apart, labels in Hindi/Kannada, **Put on board**. Tools > Simulations hub: a PhET sim (circuits, states of matter), **Add to board**, pin it to the page. | Bundled models and sims are offline. Skip the "download on first use" models (mammoth, Saturn V) unless they were opened once before. |
| 10:00-13:00 | **ZYNETIX AI.** Ask "Explain photosynthesis for Class 7" (typed or spoken); **Quick Quiz** on the topic, then **Scan the Board** for a quiz from what is written; explanation > Add to board; **Homework** draft with marks; **Read board** turns the handwriting into text and maths. | AI says "busy": wait a minute or ask a rehearsed question (cached). No internet: show the maths **Solve**, the Dictionary, Periodic table and Key dates, which are offline. |
| 13:00-16:00 | **Running the class.** One-tap **attendance** on the board (it appears in the ERP and the Parent App); random student picker (only present students); timer; **Buzzer**: Rohan buzzes from the Student App and the order appears live; **Exit ticket**: one MCQ, Rohan answers, live bars; seat plan; noise meter; spotlight. | Attendance is kept on the board and sent when the network is back. Without the Student App: timer, picker, seat plan, noise meter and spotlight are offline. |
| 16:00-18:00 | **Lessons from files.** Add > PDF: it opens in the right-hand drawer; **Add page** or **Add all** puts pages on the board to write on. Same with the PowerPoint. Open a second board in the drawer beside the first. | Files on the device: offline. |
| 18:00-20:00 | **End class.** End class > notes > publish to students: Rohan's Student App shows the notes and the board; share the summary on WhatsApp or by QR. In the ERP, **Attendance** shows the period. | The board is autosaved on the device; end the class when the network is back, or save the picture (Screenshot) and share it. |

## 7. If something goes wrong

- **"Preview" on AI answers**: the Gemini settings are missing or the API was not restarted (section 3).
- **"ZYNETIX AI is busy right now"**: Gemini's free limit for the minute; wait a minute.
- **Board stuck on "Connecting" or Teacher App cannot pair**: check `http://<Mac IP>:4000/health` from
  the phone; same Wi-Fi; firewall **Allow** for `node`.
- **"Invalid or expired enrolment code"**: codes are single use; issue a new one in the ERP.
- **The Mac app will not open** ("cannot be opened because the developer cannot be verified"):
  right-click the app > **Open** > **Open**.
- **The Mac app asks to be set up again after it was quit**: this test build is not signed with a
  developer certificate, so macOS may not hand it its saved board key; issue a new enrolment code
  and enter it. Set it up once before the audience arrives and keep the app open.
- **Everything is slow**: close other apps; restart the API with `scripts/demo-stop.sh && scripts/demo-start.sh`.
- More: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md) section 6.
