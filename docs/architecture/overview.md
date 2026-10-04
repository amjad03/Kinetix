# System architecture

## Components

```
                                   ┌──────────────── AWS ap-south-1 (Mumbai) ── DR: ap-south-2 (Hyderabad) ────────────────┐
                                   │                                                                                        │
 Board (Flutter, Android/Windows)  │   ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐   ┌───────────────────┐   │
   local SQLite + outbox  ◄────────┼──►│  API gateway │──►│  KINETIX API   │──►│ PostgreSQL 16   │   │ AI platform       │   │
   ws: realtime                    │   │  (ALB + WAF) │   │  NestJS        │   │ (RDS, RLS)      │   │ vLLM / Triton on  │   │
                                   │   └──────────────┘   │  modules:      │   └─────────────────┘   │ GPU (g6/g5)       │   │
 ERP (Next.js) ◄───────────────────┼──────────────────────│  auth, tenancy,│──►┌─────────────────┐   │ LLM · ASR · TTS · │   │
 Teacher/Student/Parent (Flutter) ◄┼──────────────────────│  academics,    │   │ Redis (pub/sub, │   │ OCR · translation │   │
   FCM/APNs push (payload only     │                      │  devices,      │   │ rate limits)    │   └───────────────────┘   │
   carries IDs, never PII)         │                      │  sessions,     │──►┌─────────────────┐   ┌───────────────────┐   │
                                   │                      │  broadcast,    │   │ S3 (recordings, │   │ Workers (BullMQ): │   │
                                   │                      │  sync, ai-gw   │   │ content, files) │   │ transcode, render,│   │
                                   │                      └────────────────┘   └─────────────────┘   │ transcribe, notify│   │
                                   └────────────────────────────────────────────────────────────────┴───────────────────┘───┘
```

## Key decisions

| Area | Decision | Why |
|---|---|---|
| Board client | Flutter (Android + Windows) | [ADR 0001](../adr/0001-board-on-flutter.md) |
| Backend | NestJS (TypeScript), modular monolith | One deployable for a solo developer. Each module has clear boundaries so it can be split out later. |
| Database | PostgreSQL 16, shared schema, `tenant_id` on every row, **row-level security** | [tenancy.md](tenancy.md) |
| ORM | Drizzle | Typed SQL with explicit transactions. Every request runs in a transaction that sets `app.tenant_id` first (`DbService.withTenant`). |
| Realtime | WebSocket (Socket.IO) gateway; with `REDIS_URL`, the Socket.IO Redis adapter fans rooms out across API instances and live-view state (boards online, viewers, audio) is kept in Redis | Broadcasts, pairing, live view signalling. One instance needs no Redis. |
| Live media | WebRTC through a self-hosted SFU (LiveKit) in Mumbai | Principal live view, audio. [live-classroom.md](live-classroom.md) |
| Jobs | A Postgres job queue (`jobs` table, `FOR UPDATE SKIP LOCKED`), safe with any number of API instances | Transcription, notification fan-out. BullMQ on Redis if volume ever needs it. |
| Files | S3 (ap-south-1), SSE-KMS, a prefix per tenant, presigned URLs | |
| AI | Self-hosted open models on GPUs in India, plus on-device models | Residency requirement. [ai-platform.md](ai-platform.md) |
| Push | FCM/APNs carry only an ID; the app fetches the content over our API | No personal data leaves through push providers |
| Observability | OpenTelemetry → Grafana stack (self-hosted in-region) | |
| IaC | Terraform | |

## API style

- REST + JSON under `/v1`, documented with OpenAPI at `/docs`. The Dart clients are generated from the OpenAPI spec.
- Every request has a tenant context from the JWT (`tid` claim). Device tokens carry `tid` plus `did`.
- Idempotency: every mutating sync operation carries a client-generated `opId` (UUIDv7).

## Identity

| Principal | How it signs in | Token |
|---|---|---|
| Staff / teacher | ERP or Teacher App: phone OTP ([auth-otp.md](auth-otp.md)) or email/phone + password; SSO (Google Workspace / Microsoft 365) later | User JWT (12 h today; short-lived + refresh planned) |
| Student / parent | App: phone OTP ([auth-otp.md](auth-otp.md)) | User JWT |
| Board device | One-time **enrolment code** from the ERP, then device credentials | Device JWT, scoped to its campus |
| Teacher on a board | **Pairing** from the Teacher App ([board-pairing.md](board-pairing.md)) | Board session token, scoped to teacher + device + class |
| Platform staff (KINETIX) | SSO + hardware key | Separate audience; cross-tenant access is logged |

## Running in production

- **Probes (no auth):** `GET /health` is liveness (the process serves requests). `GET /ready` is readiness: `200 {status: 'ready', checks}` when the database answers, every migration shipped with the build is applied, and Redis answers (when `REDIS_URL` is set); otherwise `503 {status: 'not_ready', checks}` with `database`, `migrations` and `redis` each `ok`, `failed`, `pending` (migrations) or `not_configured` (Redis).
- **Logs:** `LOG_FORMAT=json` writes one JSON object per line (`level`, `context`, `message`, `timestamp`, `pid`) for the log shipper; the default is human-readable text. Logs never carry sign-in codes outside the development SMS sender, and phone numbers are masked.
- **Graceful shutdown (SIGTERM):** in order: running jobs finish and polling stops, this instance's sockets are disconnected and their handlers finish (audit of live views, shared live state), the Socket.IO server and its Redis clients close, the HTTP server closes, then the database pools and the shared Redis connection close.
- **More than one instance:** set `REDIS_URL`. Rate limits (sign-in, OTP, pairing, enrolment) are then shared, Socket.IO rooms span instances, and the live classroom's online/viewer/audio state lives in Redis (entries of a crashed instance are ignored after its 30 s heartbeat expires). Per-socket data stays on the instance holding the socket; when a teacher stops a live class, every instance sends its own students away. Set `TRUST_PROXY` (number of proxy hops) behind the load balancer so per-IP limits see the client address. Without Redis everything works as before on one instance; if Redis becomes unreachable, rate limits fall back to per-instance memory and `/ready` reports it.
