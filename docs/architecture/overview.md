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
| Realtime | WebSocket (Socket.IO) gateway, fanned out through Redis pub/sub | Broadcasts, pairing, live view signalling |
| Live media | WebRTC through a self-hosted SFU (LiveKit) in Mumbai | Principal live view, audio. [live-classroom.md](live-classroom.md) |
| Jobs | BullMQ on Redis | Transcoding, transcription, notification fan-out |
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
| Staff / teacher | ERP or Teacher App: phone OTP or email+password, optional SSO (Google Workspace / Microsoft 365) | User JWT (15 min) + refresh |
| Student / parent | App: phone OTP | User JWT + refresh |
| Board device | One-time **enrolment code** from the ERP, then device credentials | Device JWT, scoped to its campus |
| Teacher on a board | **Pairing** from the Teacher App ([board-pairing.md](board-pairing.md)) | Board session token, scoped to teacher + device + class |
| Platform staff (KINETIX) | SSO + hardware key | Separate audience; cross-tenant access is logged |
