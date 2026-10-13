# The school code box (C, C++ and Java on the school network)

The smart board runs code in its **code lab** (Board → Computer Science kit → Code lab, or
the subject tool) wherever it can, with no internet needed:

| Language | Where it runs | Needs |
|---|---|---|
| Python | On the board: Pyodide (CPython in WebAssembly) in a sandboxed WebView worker | Nothing on the Board app (it ships Pyodide with JupyterLite). Other apps get it once (see below). |
| JavaScript | On the board: the WebView's engine, in a Web Worker | Nothing |
| SQL | On the board: SQLite, with the students/marks, employees and library sample databases | Nothing |
| C, C++, Java | On the **school code box** on the local network | One spare PC with Docker |
| Python, SQL (fallback) | On the code box when the board cannot run them itself | The code box |

For every run the board picks, in order: **on the board** if it runs that language, else the
**code box**, else the **KINETIX server** (`POST /v1/code/run`, C/C++/Java only, needs the
internet and a signed-in teacher). If none can take it, the code lab says what to do, e.g.
"C needs the school code box. Set it up in Settings → School code box", with these steps. The
line under the output says where the program ran.

## What the code box is

Two containers from `infra/school-code-box/docker-compose.yml`, built from
`services/code-runner` (the same runner the cloud uses, plus Python 3 and SQLite):

- **runner** (`server.mjs`): compiles and runs programs. It has **no network at all**
  (`network_mode: none`), a read-only file system except `/tmp`, a non-root user, no
  capabilities, a seccomp profile that refuses every socket but the Unix one, and caps on
  memory, CPU and processes. Each program also has its own limits (2 s CPU, 5 s wall time,
  256 MB memory, 64 KB output, 128 processes; see [code-runner.md](code-runner.md)).
- **gateway** (`gateway.mjs`): the only part on the network, on port **8181**. It passes
  `GET /health` and `POST /run` to the runner over the Unix socket, checks the **box key**
  (if set), allows 30 runs per minute per board, and serves Python's files to boards at
  `/assets/pyodide/0.27.7/`.

Code is never stored: each program runs in its own temporary folder that is deleted after.

## Setting it up (about 15 minutes)

Any spare PC on the school network: Ubuntu 22.04/24.04 is easiest; Windows 10/11 or macOS
with Docker Desktop also work. 2 CPU cores, 4 GB RAM and 5 GB free disk are enough for a lab.

1. **Install Docker** (free): on Ubuntu `sudo apt install docker.io docker-compose-v2`, or
   Docker Desktop on Windows/macOS.
2. **Get the KINETIX repository** on that PC (a release zip or `git clone`).
3. **Settings** (optional): `cp infra/school-code-box/.env.example infra/school-code-box/.env`
   and edit it: `CODE_BOX_KEY` (a key the boards must give; leave empty on a closed lab
   network), `CODE_BOX_NAME`, `CODE_RUNNER_TOKEN` (any long random text),
   `RUN_CONCURRENCY` (about one per CPU core).
4. **Start it**, from the repository folder:

   ```sh
   docker compose -f infra/school-code-box/docker-compose.yml up -d --build
   ```

   The first build downloads the compilers (about 600 MB) and takes a few minutes; after
   that the box needs no internet. It starts again by itself when the PC restarts.
5. **Check it**: open `http://<this PC's address>:8181/health` from any computer on the
   network. It answers `{"ok":true,"languages":["c","cpp","java","python","sql"],…}`.
6. **Python for other boards (optional)**: `infra/school-code-box/fetch-pyodide.sh` downloads
   Pyodide 0.27.7's core once (5.6 MB, checksum pinned) into `infra/school-code-box/pyodide/`;
   boards that do not have Python then fetch it from the box instead of the internet.
7. **Let boards find it by itself (Linux, optional)**: install Avahi and announce the box:

   ```sh
   sudo apt install avahi-daemon
   sudo cp infra/school-code-box/kinetix-code.service /etc/avahi/services/
   ```

   Boards then find it with **Find** (mDNS `_kinetix-code._tcp`). Some Wi-Fi networks block
   multicast; typing the address always works.
8. **Give the PC a fixed address** (a DHCP reservation on the school router), so boards keep
   finding it.

## Pointing the boards at it

Any of these; the board tries them in this order:

1. **On the board**: Settings → **School code box** → type the PC's address (e.g.
   `192.168.1.20`; the port 8181 is added) and the box key if there is one → **Save**. The
   section shows "Code box found: … · Runs: C, C++, Java, Python, SQL".
2. **For the whole institution**: a `codeBoxUrl` in the board config, so every board gets it
   at once. The board reads it already; the API does not send it yet (to do: an institution
   setting beside the 3D model server's `modelsBase`). Until then, set it per board.
3. **Find** on the network (mDNS, step 7 above).
4. **The school server**: if the board's KINETIX server is on the school network (a private
   address such as `10.x`, `192.168.x`), the board also tries that machine on port 8181, so
   running the code box on the school server needs no setting at all.

## Python on the board

- The **Board** app already contains Pyodide (with JupyterLite), so Python runs offline from
  the first start. Nothing is downloaded.
- An app or build without it (e.g. the Student App, or a Board build without JupyterLite)
  shows **Get Python for offline use** the first time Python is run. It fetches Pyodide 0.27.7's
  core (13.8 MB, five files, each checked against a pinned SHA-256 in
  `packages/kinetix_cs/lib/src/runner/python_runtime.dart`) from, in order: the code box, the
  KINETIX server's `/assets/pyodide/0.27.7/` (when it serves one; the API does not yet), then
  `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`. It is kept on the device; Python then works
  offline. Without it, Python runs on the code box if there is one.

## Troubleshooting

| The board says | What to do |
|---|---|
| "C needs the school code box…" | No box found: check the address in Settings, that the PC is on, and `http://<PC>:8181/health` from the board's network. |
| "The school code box refused this board…" | The box has `CODE_BOX_KEY`; type the same key in Settings → School code box. |
| "Too many runs. Wait a minute." | More than `RUN_PER_MINUTE` runs from one board; raise it in `.env`. |
| "The code runner is not available…" | `docker compose -f infra/school-code-box/docker-compose.yml ps` on the box; `logs runner` shows why. |
| Find finds nothing | Multicast is blocked on that network: type the address instead. |

Updating: `git pull` (or a new release), then the `up -d --build` command again.
