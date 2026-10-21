# Zynetix demo guide

The server runs on the presenter's Mac in Docker; boards, IFPs and phones join over the same Wi-Fi.

## Prerequisites
- Docker Desktop (running), about 8 GB free RAM and 10 GB disk.
- Mac and devices on the same Wi-Fi (no client isolation).

## Start / stop
```
scripts/zynetix-demo.sh          # build, migrate, seed SDMCET, print the LAN URL
scripts/zynetix-demo.sh stop     # stop, keep data
scripts/zynetix-demo.sh reset    # stop and wipe data
```
It prints `API: http://<mac-ip>:4000` and `ERP: http://<mac-ip>:3000`. Re-running is safe. If the macOS firewall asks, allow incoming connections.
The 15 simulated SDMCET boards stay online through a small heartbeat service the script starts (board EE-301 stays offline on purpose). A real board you pair takes over its own entry from its first report.

**AI (Claude):** the easiest way is the dashboard: sign in as the institution admin (or principal), open **Zynetix → AI settings**, paste your Anthropic API key, pick the model (`claude-sonnet-5-5` by default, falling back to `claude-haiku-5-5` when busy), **Save**, then **Test connection** (it shows the reply time, or why the key was refused). The key is stored encrypted (SECRETS_ENCRYPTION_KEY; Docker Compose sets a local one) and never shown again; **Remove key** goes back to the server's AI. The overview shows a hint while no AI is connected. Alternative: run `scripts/zynetix-demo.sh` and paste the key into `.env.ai` when it opens (or `ANTHROPIC_API_KEY=sk-ant-... scripts/zynetix-demo.sh`; press Enter to skip and use the dashboard instead); that key applies to every institution on the server, and an institution's own dashboard key takes precedence. Without a key the AI shows previews. The Mac needs internet for AI answers.

## Point the apps at the server
Enter the printed API URL as the server in each app's sign-in/settings screen (apps built with the `api_url` workflow input already have it baked in). Check from a phone browser first: `http://<mac-ip>:4000/docs`.

## Builds
GitHub Actions workflow **Zynetix builds** (`zynetix-builds.yml`; run manually with an optional `api_url`) produces artifacts `zynetix-board|teacher|student|parent-android` (APK) and `zynetix-board-macos` (zipped .app).

## Android IFP / phones
1. Download the APK artifact and copy it to the device (USB: `adb install -r zynetix-board.apk`, or a USB stick / file manager).
2. Allow installs from unknown sources (Settings > Security, or the prompt for the file manager/browser).
3. Open the app and set the server URL.

## macOS board app (unsigned)
Unzip, move to Applications. First launch: right-click the app > Open > Open. If macOS says it is damaged:
`xattr -dr com.apple.quarantine /Applications/<app name>.app`. Allow camera and microphone when asked.

## Demo accounts
Institution **`sdmcet`** (SDM College of Engineering and Technology, Dharwad; board edition). Password for every login: **`zynetix123`**. Loaded by `scripts/zynetix-demo.sh` (or `pnpm db:seed:sdmcet` in `services/api`); re-running rebuilds the institution and keeps topic ids. Names are fictional.

| Role | Name | Login | Classes (Odd semester 2026) |
| --- | --- | --- | --- |
| Zynetix admin | Sudhir Pai | `admin@sdmcet.zynetix.in` | Dashboard: content, timetable, accounts, boards, AI usage |
| Principal | Dr. K. Gopinath | `principal@sdmcet.zynetix.in` | Everything, read and approve |
| HoD CSE | Dr. Prakash Hiremath | `prakash.cse@sdmcet.zynetix.in` | CSE 3A Data Structures, CSE 5A Computer Networks, … |
| Teacher CSE | Prof. Sunita Kulkarni | `sunita.cse@sdmcet.zynetix.in` | CSE 3A Maths III + Java, CSE 3B Data Structures, CSE 5A Theory of Computation, CSE 5B Computer Networks |
| Teacher CSE | Prof. Vinayak Joshi | `vinayak.cse@sdmcet.zynetix.in` | CSE 3A DDCO, CSE 3B Maths III + Java, CSE 5A Artificial Intelligence, CSE 5B TOC |
| Teacher CSE | Prof. Deepa Patil | `deepa.cse@sdmcet.zynetix.in` | CSE 3A Operating Systems, CSE 5A SEPM + RM&IPR, CSE 5B AI |
| HoD ECE | Dr. Mahesh Kadakol | `mahesh.ece@sdmcet.zynetix.in` | ECE 3A Electronic Principles, ECE 5A Electromagnetic Waves, … |
| Teacher ECE | Prof. Shweta Desai | `shweta.ece@sdmcet.zynetix.in` | ECE 3A Maths III + Network Analysis, ECE 5A DSP + Computer Communication Networks |
| Teacher ECE | Prof. Raghavendra Bhat | `raghavendra.ece@sdmcet.zynetix.in` | ECE 3A Verilog + ARM, ECE 5A Communication Systems |
| HoD Mech | Dr. Basavaraj Angadi | `basavaraj.mech@sdmcet.zynetix.in` | Mech 3A Thermodynamics, Mech 5A Theory of Machines + Machine Design |
| Teacher Mech | Prof. Santosh Hosamani | `santosh.mech@sdmcet.zynetix.in` | Mech 3A Maths III + Mechanics of Materials, Mech 5A Heat Transfer + IME |
| Teacher Mech | Prof. Kavya Naik | `kavya.mech@sdmcet.zynetix.in` | Mech 3A Manufacturing + Material Science, Mech 5A Fluid Mechanics |
| HoD Civil | Dr. Shrinivas Pujar | `shrinivas.civil@sdmcet.zynetix.in` | Civil 3A Fluid Mechanics, Civil 5A Structures + Water Supply |
| Teacher Civil | Prof. Anand Kattimani | `anand.civil@sdmcet.zynetix.in` | Civil 3A Maths III + Surveying, Civil 5A Geotechnical + Transportation |
| Teacher Civil | Prof. Pooja Mudhol | `pooja.civil@sdmcet.zynetix.in` | Civil 3A Strength of Materials + Engineering Geology, Civil 5A Hydrology |
| HoD EEE | Dr. Girish Huddar | `girish.eee@sdmcet.zynetix.in` | EEE 3A Analog Electronics, EEE 5A Power Electronics + Renewables |
| Teacher EEE | Prof. Rekha Shettar | `rekha.eee@sdmcet.zynetix.in` | EEE 3A Maths III + Transformers and Generators, EEE 5A T&D + Microcontrollers |
| Teacher EEE | Prof. Manjunath Yaligar | `manjunath.eee@sdmcet.zynetix.in` | EEE 3A Circuit Analysis + Measurements, EEE 5A Control Systems |
| HoD MBA | Dr. Veena Hegde | `veena.mba@sdmcet.zynetix.in` | MBA 1A Accounting + Digital Business, MBA 3A Consumer Behaviour |
| Teacher MBA | Prof. Arun Kamat | `arun.mba@sdmcet.zynetix.in` | MBA 1A MOB + Statistics, MBA 3A Strategy + Talent Management |
| Teacher MBA | Prof. Nandini Kulkarni | `nandini.mba@sdmcet.zynetix.in` | MBA 1A Managerial Economics + Marketing, MBA 3A Investments + Analytics |
| HoD M.Tech | Dr. Ramesh Gouda | `ramesh.mtech@sdmcet.zynetix.in` | M.Tech 1A Advances in Computer Networks |
| Teacher M.Tech | Prof. Lakshmi Bhat | `lakshmi.mtech@sdmcet.zynetix.in` | M.Tech 1A Maths Foundations + Machine Learning |
| Teacher M.Tech | Prof. Kiran Desai | `kiran.mtech@sdmcet.zynetix.in` | M.Tech 1A Advanced Algorithms + RM&IPR |
| Student | Prerana Shettar (2SD24EC001, BE ECE Sem 3 A) | `prerana.ece@sdmcet.zynetix.in` | |
| Parent | Prabhakar Shettar (father of Prerana) | `parent.prerana.ece@sdmcet.zynetix.in` | |

Every class has six students (`<first>.<dept>@sdmcet.zynetix.in`) and each a parent (`parent.<first>.<dept>@sdmcet.zynetix.in`); the seed prints the full teacher-to-class list. Rooms are `<block>-<floor><n>` (CS-201, EC-201, ME-301, MBA-101, PG-101), one board each (`Board EC-201`), plus the `Zynetix Edge AI box`.

### Suggested demo script (about 15 minutes)
1. **Admin dashboard** (`admin@`): Boards: 15 classroom boards and the edge box with CPU/GPU/NPU/RAM and temperatures; `Board EE-301` is offline since yesterday, CS-302 shows a two-day gap last week, CV-201 drops out in the afternoons. AI usage: 14 days of answers, the 10-11 am peak with throttled requests, rejected and error reasons. Timetable: pick any class.
2. **Board, ECE** (`shweta.ece@`, Board EC-201, BE ECE Sem 3 A): BEC304 Network Analysis > Module 1 > *Kirchhoff's laws*: the Veritasium video, the built-in **Electric circuit** animation and Hayt's textbook pages. Then BMATEC301 > Module 1 > *Fourier series of period 2L* for the 3Blue1Brown Fourier video.
3. **Board, CSE** (`vinayak.cse@`, CSE 5A): BCS515B Artificial Intelligence > Module 5 > *Neural networks and gradient descent* (two videos). `sunita.cse@`, CSE 5B: BCS502 Computer Networks > Module 1 > *Packet switching versus circuit switching* (**Packet switching** animation) and Module 2 > *CRC and Hamming codes* (video).
4. **Other branches, animations**: EEE (`rekha.eee@`) BEE304 > Module 4 > *Electromagnetic induction and the generator principle*; Civil (`pooja.civil@`) BCV305 > Module 1 > *Plate tectonics*, Module 3 > *The rock cycle*; Mech (`basavaraj.mech@`) BME302 > Module 1 > *States of matter and phase change*; MBA (`nandini.mba@`) 22MBA12 > Module 1 > *Circular flow of income* (animation and video).
5. **Student and Parent apps** (`prerana.ece@`, `parent.prerana.ece@`): the same topic's videos and materials.

The topic videos are **demo placeholders** (public 3Blue1Brown, MIT OpenCourseWare, Veritasium, Crash Course and TED lectures; `DEMO_PLACEHOLDER_VIDEOS` in `services/api/src/db/seed-sdmcet.ts`). After importing the owner's channel, remove them with `delete from concept_videos where playlist_id = 'sdmcet-demo-placeholder';`. Syllabus entries point at vtu.ac.in until the department's PDFs are uploaded.

## Troubleshooting
- Device cannot connect: same Wi-Fi? Try `curl http://<mac-ip>:4000/docs` from another machine; check the Mac firewall. Guest/campus Wi-Fi often isolates clients; use a phone hotspot or a router.
- Wrong IP printed: `ipconfig getifaddr en0` (en1 on some Macs) and use that manually.
- Port busy: set `API_PORT` / `ERP_PORT` before running the script.
- Build runs out of memory: Docker Desktop > Settings > Resources, give 6 GB or more.
- Logs: `docker compose logs -f api erp`. Clean slate: `scripts/zynetix-demo.sh reset`.
- Seed fails: `docker compose --profile seed-sdmcet run --rm seed-sdmcet` shows the error.
