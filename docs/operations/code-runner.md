# Code runner (C, C++, Java)

The code lab on the Board and in the Student App runs programs in two places (decision:
**hybrid**):

| Language | Where it runs | Network needed |
|---|---|---|
| Python | On the device: Pyodide (CPython in WebAssembly) in a WebView, in a Web Worker | No |
| JavaScript | On the device: the WebView's engine, in a Web Worker | No |
| SQL | On the device: SQLite (`sqlite3` package), in an isolate, with the students, employees and library sample databases | No |
| C, C++, Java | On the institution's **code runner**, in India, through `POST /v1/code/run` | Yes |

Nothing a student types leaves India: on-device languages never leave the device, and the
runner is in ap-south-1 (or the college's own server). Code is not stored; the API logs only
the institution, language, status and time.

## On the device

- `packages/kinetix_cs/assets/runner/` holds the page and its worker; the app serves them on
  127.0.0.1 only (the 3D viewer's pattern, `RunnerServer`). Stop ends the worker; a run is
  stopped after 10 s (Python's first start-up of a few seconds is not counted) or 64 KB of
  output.
- **Pyodide is not committed.** `packages/kinetix_cs/tool/fetch_pyodide.sh` downloads
  Pyodide 0.27.7's *core* (interpreter and standard library, no numpy) with a pinned SHA-256
  into `assets/runner/pyodide/`. Run it before every release build of the Board and the
  Student App (mobile-release.md). Size: 13.8 MB on disk (wasm 10.1 MB, stdlib 2.4 MB),
  about 5.5 MB in the APK/MSIX. Without it the apps build and Python says it is not
  installed.
- On Windows panels the page needs the WebView2 runtime (as the 3D viewer does).

## The server side

`POST /v1/code/run` `{language: c|cpp|java, source ≤ 64 KB, stdin ≤ 16 KB}` →
`{status, stdout, stderr, compileOutput, exitCode, timeMs}`; `status` is `ok`,
`compile_error`, `runtime_error`, `timeout`, `memory_limit` or `output_limit`.

- **Who:** a signed-in teacher, HOD, principal or student, or a board with a teacher.
- **Rate limits:** `CODE_RUN_USER_PER_MINUTE` (20) per person or board and
  `CODE_RUN_TENANT_PER_MINUTE` (120) per institution; 429 `RATE_LIMITED` past them (Redis
  shared across API instances).
- **Errors:** 503 `CODE_RUNNER_UNAVAILABLE` when `CODE_RUNNER_URL` is unset or the runner is
  down; 503 `CODE_RUNNER_BUSY` when its queue is full.

### The runner (`services/code-runner`)

A dependency-free Node server (`server.mjs`) with gcc/g++ 12 and OpenJDK 17. Each program:

| Limit | Default | Setting |
|---|---|---|
| CPU time | 2 s (compiler 15 s) | `RUN_CPU_SECONDS`, `COMPILE_SECONDS` |
| Wall time | 5 s (+1.5 s for the JVM) | `RUN_WALL_MS` |
| Memory | 256 MB address space (C/C++); 128 MB heap in a 2 GB address space (Java) | `RUN_MEMORY_MB`, `JAVA_HEAP_MB`, `JAVA_ADDRESS_MB` |
| Output | 64 KB stdout + stderr, then killed | `RUN_OUTPUT_BYTES` |
| Files | 1 MB per file, in its own 0700 directory under /tmp, deleted after | `RUN_FILE_BYTES` |
| Processes | 128 for the runner's user (fork bombs stop there; the group is killed) | `RUN_PROCESSES` |
| Concurrency | 2 programs at once, 16 waiting, then 503 | `RUN_CONCURRENCY`, `RUN_QUEUE` |

The container (docker-compose.yml):

- `network_mode: none`: no network at all. The API reaches it over a Unix socket on a shared
  volume (`CODE_RUNNER_URL=unix:/run/kx-runner/runner.sock`), and it answers only requests
  carrying `CODE_RUNNER_TOKEN`.
- `read_only: true`, with only `/tmp` writable (tmpfs, 256 MB, nosuid, nodev).
- user 10001 (non-root), `cap_drop: ALL`, `no-new-privileges`.
- seccomp: `infra/docker/code-runner-seccomp.json`, Docker's default denials plus io_uring, the
  mount API, chroot, personality, and every socket that is not a Unix socket.
- `mem_limit: 1g`, `cpus: 2`, `pids_limit: 256`; tini reaps zombies.

**AWS (Terraform, `infra/terraform/code_runner.tf`):** a Fargate service `code-runner` in the
data subnets, which have no NAT route; it reaches only the ECR, CloudWatch Logs and S3
endpoints it needs to start. Its security group accepts TCP 8080 from the API only. No task
role, so nothing inside holds AWS credentials. It has a read-only root, user 10001, and all
capabilities dropped. The API finds it at `http://code-runner.kinetix-<env>.internal:8080`
(Cloud Map), and its token is `CODE_RUNNER_TOKEN` in the `app` secret. Fargate does not take
custom seccomp profiles; its default profile applies, with the runner's own limits on top.
Image: `kinetix-<env>-code-runner` in ECR, built by `.github/workflows/docker.yml`. Size it with
`code_runner_cpu`, `code_runner_memory`, `code_runner_count` and `code_runner_concurrency`
(each running program needs about half a vCPU). A class of 60 compiling at once queues for a
few seconds on the defaults.

**Self-hosted on a college server:** run the `code-runner` service from docker-compose.yml
beside the API, as above.

### Checks

- `services/api/test/code.e2e.spec.ts` covers auth, validation, rate limits and errors with a
  fake runner. Where gcc, g++ and prlimit are installed, it also starts the real runner and
  checks its limits: timeouts, output and memory caps, crashes, files. It runs as `nobody`
  when the tests run as root. Java is checked only when javac is installed.
- After a deploy: `docker compose exec api node -e "fetch('http://localhost:4000/health')"`,
  then run a sample C program from the Board's code lab.
