# ZYNETIX live demo checklist

Two demo institutions live in the dev database `zynetix_show`:

| Institution | Code | Kind | Logins |
|---|---|---|---|
| Soundarya Institute of Management and Science | `soundarya` | college (BCU, NEP) | [SOUNDARYA_DEMO_LOGINS.md](SOUNDARYA_DEMO_LOGINS.md) |
| Sri Vidya Niketan Public School | `vidyaniketan` | K-12 school (CBSE, classes 1 to 12) | [SCHOOL_DEMO_LOGINS.md](SCHOOL_DEMO_LOGINS.md) |

Password for every demo login: `zynetix123`.

Demo builds in `dist/` (the Mac's Wi-Fi address on 13 October 2026 was `192.168.31.129`). Build them with nothing else running and at least 4 GB free on the disk (the board APK is about 285 MB; a build needs several times that), one at a time, then delete `apps/board/build`:

| File | Build (in `apps/board`) | Notes |
|---|---|---|
| `kinetix-board.apk` | `KINETIX_TEST_SIGNING=true flutter build apk --release --dart-define=KINETIX_API_URL=http://192.168.31.129:4000 -Pkinetix.lanHttp=true`, then move `build/app/outputs/flutter-apk/app-release.apk` to `dist/kinetix-board.apk` | Test-signed release, plain http allowed on the LAN. On another network: board Settings > This board > Set up again, then the new address. |
| `KINETIX Board.app` | `flutter build macos --release --dart-define=KINETIX_API_URL=http://localhost:4000`, then replace `dist/KINETIX Board.app` with `build/macos/Build/Products/Release/KINETIX Board.app` | The Mac board. Builds before 13 October 2026 could not keep their board key (macOS data protection keychain, unavailable to an ad-hoc signed app), so they came back to the set-up screen after every launch instead of connecting to `localhost:4000`. A new build keeps the key in the login keychain: set it up once (the server is filled in; issue an enrolment code in the ERP under **Boards**) and it reconnects on every launch. If macOS asks whether KINETIX Board may use the keychain, choose **Always Allow**. |

AI on the board: Google Gemini `gemini-3.8-flash`, falling back to `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-flash-lite-latest` and `gemini-3.1-flash-lite` (the key and the model list are in `services/api/.env`, never in the repository). The API reads `.env` only when it starts: **restart it after any change** with `scripts/demo-stop.sh && scripts/demo-start.sh`.

## 1. Before the demo (15 minutes before)

1. Plug in the Mac, join the venue Wi-Fi (the same network as the smartboard and the phones), turn off sleep (System Settings > Lock Screen > never while on power).
2. In Terminal: `cd ~/Downloads/Zynetix && scripts/demo-start.sh`. It starts Postgres if needed, builds if a build is missing, runs the migrations, starts the API on port 4000 and the ERP on port 3000, and prints the Mac's Wi-Fi address and the URLs.
3. Check: `node scripts/demo-api-check.mjs` (board enrolment, teacher pairing, PIN, attendance, parent, student sign-in; prints "All API checks passed") and, if there is time, `node scripts/demo-crawl.mjs` (loads every sidebar page for both institutions; only `/topic-videos` used to fail and is fixed).
4. Open the ERP in Chrome at `http://localhost:3000` (on another laptop: `http://<Mac IP>:3000`). Use a wide window (side-by-side tabs need it).
5. In each app (smartboard, teacher, parent, student) set **Server address** to `http://<Mac IP>:4000` if the IP changed since the last time (the builds above used `192.168.31.129`; check with `ipconfig getifaddr en0`).
6. Optional reset of the data: `cd services/api && pnpm db:seed:soundarya` (college) and `pnpm db:seed:school` (school). Each replaces only its own institution and takes about 1 to 2 minutes. Do not run it during the demo.
7. Real AI answers on the board (free, Google Gemini): put `AI_BASE_URL`, `AI_MODEL` (`gemini-3.8-flash`; `gemini-flash-latest` if that name is ever retired), `AI_FALLBACK_MODELS` (the free tier gives each model only 20 requests a day) and `AI_API_KEY` in `services/api/.env` as in `docs/demo/GEMINI_FREE_AI.md`. The API reads `.env` only when it starts: after editing it, restart with `scripts/demo-stop.sh && scripts/demo-start.sh`. After pulling new code, rebuild the API once (`cd services/api && pnpm build`; the start script only builds when there is no build), then start as usual. Check: `grep "ZYNETIX AI:" /tmp/zynetix-api.log | tail -1` names the models (`ZYNETIX AI: gemini-3.8-flash, then gemini-3.7-flash, then … at generativelanguage.googleapis.com`); "labelled preview answers" means the API started before the AI lines were added. On the board, ask the questions you will demo once beforehand: repeats come from the cache, instantly and without using the free allowance.

## 2. Logins

College (`soundarya`, `@soundarya.demo.zynetix.in`):
- Principal `principal@`, admin `admin@`, accounts `accounts@`, HR `hr@`, exam controller `controller@`, IQAC `iqac@`, HoD Commerce `hod.commerce@`, HoD Computer Applications `hod.computers@`, teachers `deepa.nair@`, `sudhir.kamath@`, `sowmya.reddy@`.
- Students `student.bcom@` (Sahana Gowda, BCom Sem 3), `student.bca@` (Vignesh Naik, BCA Sem 3, low attendance).
- Parents `parent.bcom@` (father of Sahana), `parent.bca@` (mother of Vignesh and Chaitra).

School (`vidyaniketan`, `@vidyaniketan.demo.zynetix.in`):
- Principal `principal@` (Mrs. Lalitha Raghavan), admin `admin@`, accounts `accounts@`, HR `hr@`, examination in-charge `controller@`, academic coordinator `coordinator@`, counsellor `counsellor@`, librarian `library@`, transport `transport@`.
- HoDs `hod.science@`, `hod.maths@`, `hod.languages@`, `hod.social@`, `hod.computers@`, `hod.commerce@`.
- Teachers `kavya.shetty@` (Science), `sowmya.reddy@` (Computer Science), `sudhir.kamath@` (Accountancy), and every other teacher by `firstname.surname@`.
- Students `student.class10@` (Ananya Rao, Class 10 A), `student.class7@` (Rohan Shetty, Class 7 A, low attendance).
- Parents `parent.class10@` (Suresh Rao), `parent.class7@` (Lakshmi Shetty, mother of Rohan, Class 7 A, and Diya, Class 3 A).

## 3. College click-path (10 to 15 minutes), as the principal

1. **Sign in** (institution code `soundarya`) and show the language switch (English, Hindi, Kannada).
2. **Dashboard**: KPIs, attendance trend, "Needs your attention" (approvals, fee follow-ups); the tabs at the top (Examinations, Finance, Admissions, HR).
3. **Reports & Analytics > Analytics**: monthly performance, fee collection, dues by class, pending approvals. Right-click a top tab > **Open side by side** to show the dashboard and analytics together (click the right pane to load it).
4. **Students**: search, filters, click a student for the quick panel, then **Open full profile** (attendance, marks, fees, documents, timeline). Show Vignesh Naik (66 percent attendance).
5. **Admissions**: enquiries board, cycles, merit list, campaigns dashboard (Reports & Analytics > Campaign dashboard).
6. **Academics > Academics desk**, **Timetable**, **Attendance** (today, governance, condonation).
7. **Examinations**: exam office and results (published model exam, revaluation, supplementary).
8. **Finance & Fees**: fee collection, defaulters, the accounts desk; **HR & Payroll**: payroll run (verify, approve, lock, bank file).
9. **Accreditation > NAAC**: criteria entries, DVV, IQAC workspace.
10. **Communication / Chat**: parent-teacher conversation about Vignesh; notices.
11. **Reports**: open a report and export it.
12. **Settings**: institution profile, roles, modules.
13. Sign out and sign in as `hod.commerce@`, `accounts@`, `controller@` to show that each role sees its own menu.

## 4. School click-path (10 to 15 minutes), as the principal

1. Sign in with institution code `vidyaniketan`. Dashboard: 493 students in classes 1 to 12, sections A and B, attendance, fees, approvals.
2. **Students**: Class 10 A, open Ananya Rao's profile (report card, attendance, fees, guardians).
3. **Academics > School mode**: houses and house points (Ganga, Kaveri, Narmada, Yamuna), report cards, learning outcomes.
4. **Students > School diary** (daily classwork, homework notes, notices with parent acknowledgements) and **Parent-teacher meetings** (slots and bookings).
5. **Timetable**, **Attendance** (period-wise, class-wise), **Homework**.
6. **Examinations**: Term 1 examination results for Classes 8, 9, 10 and 12 (CBSE scheme: periodic test, notebook, subject enrichment, annual exam).
7. **Finance & Fees**, **Transport**, **Library**.
8. **Admissions**: Class 1 and Class 6 admission rounds for 2027-28, entrance assessment.

## 5. Smartboard, teacher app and parent app

Smartboard (Android or Windows board app):
1. In the ERP, open **Boards** (sidebar): pick the board for the room and issue a new enrolment code (shown once, like `KX-ABCD-1234`).
2. On the board: Server address `http://<Mac IP>:4000`, enter the enrolment code. The board shows a QR and a 6-digit pairing code.
3. Teacher app: sign in (institution code, teacher email, `zynetix123`), **Connect to board**, scan the QR or type the 6 digits. The board picks the teacher up within seconds (live socket, or the `/v1/pairing/pending` poll when the socket is down).
4. Teacher PIN: on the board, the teacher sets a 4-digit PIN once; next time the teacher taps their profile on the board and enters the PIN.
5. Teach: open the class, take attendance in the teacher app (or on the board), run a poll, end the class.
6. Show in the ERP: **Attendance** for that class and period; in the parent app (sign in as the parent of a child in that class) the child's attendance for today.

Parent app: sign in as `parent.class7@vidyaniketan.demo.zynetix.in` (two children), show attendance, diary with acknowledge, PTM booking, fees, report card. Student app: `student.class10@vidyaniketan.demo.zynetix.in`.

## 6. Troubleshooting

- **Mac restarted**: run `scripts/demo-start.sh` again. It clears a stale Postgres lock and starts everything.
- **Wi-Fi address changed** (new network or DHCP): `scripts/demo-start.sh` prints the new address; set **Server address** in every app to `http://<new IP>:4000` and use `http://<new IP>:3000` for the ERP on other devices. Quick check: `ipconfig getifaddr en0`.
- **Postgres will not start / "lock file exists"**: `cat /opt/homebrew/var/postgresql@18/postmaster.pid | head -1` gives a PID; if `ps -p <PID>` shows nothing, `rm /opt/homebrew/var/postgresql@18/postmaster.pid && brew services restart postgresql@18` (the start script does this for you).
- **Port 3000 or 4000 busy**: `scripts/demo-stop.sh` then `scripts/demo-start.sh` (it also frees the ports). To see what holds a port: `lsof -iTCP:4000 -sTCP:LISTEN`.
- **A page shows "Something went wrong"**: reload once; check `tail -50 /tmp/zynetix-erp.log` and `/tmp/zynetix-api.log`.
- **Signed out on another laptop over Wi-Fi**: the start script sets `ZYNETIX_INSECURE_COOKIES=1` so sign-in works over plain http on the LAN; start the ERP with the script, not with `next start` by hand.
- **Board shows "Invalid or expired enrolment code"**: codes are single-use and expire; issue a new one in the ERP.
- **Everything is slow**: close other apps (8 GB Mac); do not run builds or tests during the demo.
- **AI answers say "Preview"**: the AI settings are missing from `services/api/.env` or the API was not restarted (`grep "ZYNETIX AI:" /tmp/zynetix-api.log | tail -1` says which; restart with `scripts/demo-stop.sh && scripts/demo-start.sh`). **"ZYNETIX AI is busy right now"**: Gemini's free limit for the minute (wait a minute) or the day (20 requests per model; list more in `AI_FALLBACK_MODELS`). More in `docs/demo/GEMINI_FREE_AI.md`.
- **`pnpm build` stops with "JavaScript heap out of memory"**: `NODE_OPTIONS=--max-old-space-size=3072 pnpm build` with other apps closed.
- Stop everything after the demo: `scripts/demo-stop.sh`.
