# KINETIX AI platform (India-hosted)

**Constraint:** all AI processing runs in India: on the device, on a GPU we run (in the college
or rented from an Indian GPU cloud), or with an Indian pay-per-use API under a contract that
keeps the data in India. No prompt, image or recording goes to a model API abroad.

**Decision:** run AI *as locally as possible* (a self-hosted open model) and fall back to
Sarvam AI's pay-per-use API for the rest. See [Hosting](#hosting-local-first-with-an-indian-fallback)
below and the runbook in [docs/operations/ai-hosting.md](../operations/ai-hosting.md).

## Layers

```
            Board / apps
               │  ai.* requests (task-based, never raw "chat with model")
               ▼
     ┌──────────────────── AI gateway (NestJS module) ─────────────────────┐
     │ task router · prompt templates (versioned) · curriculum grounding    │
     │ (RAG over the syllabus library) · safety filters for minors ·        │
     │ per-tenant quota & metering · response cache · eval logging          │
     └───────┬──────────────┬──────────────┬──────────────┬────────────────┘
             ▼              ▼              ▼              ▼
        LLM serving     Speech (ASR/TTS)   Vision (OCR,    Math engine
        vLLM, OpenAI-   Triton / custom    handwriting,    (symbolic CAS +
        compatible API                     diagrams)       LLM explanation)
             │
     1. self-hosted: vLLM + Whisper/IndicConformer on a college GPU box
        or an E2E Networks GPU (L4 / L40S)          ── AI_BASE_URL, ASR_BASE_URL
     2. fallback: Sarvam AI pay-per-use (Bengaluru) ── AI_FALLBACK_PROVIDER, ASR_FALLBACK_PROVIDER
```

## Task catalogue (what the Board and apps call)

| Task | Where it runs | Candidate models (to benchmark, unverified) |
|---|---|---|
| `ink.recognize`: handwriting to text (en/hi/kn) | **On device** | Google ML Kit Digital Ink: models are downloaded once and recognition runs locally |
| `ink.beautify`: shapes to clean geometry | **On device** | Our own geometric fitting (lines, circles, polygons) with no ML |
| `math.solve`: step-by-step | **On device** for algebra/arithmetic/calculus basics; cloud for word problems | A symbolic CAS engine on device; LLM for explanations |
| `ocr.document` / `ocr.board` | Cloud, with an on-device fallback for Latin script | PaddleOCR / Surya / Tesseract with Indic models |
| `explain.topic`, `quiz.generate`, `homework.generate`, `assignment.generate` | Cloud, with a small on-device LLM offline on capable devices | Open-weight LLMs served by vLLM (Qwen / Llama / Gemma class, Indic models such as Sarvam's), grounded with RAG over our curriculum library |
| `lesson.summarize`, `transcribe` | Cloud (batch, after class) | IndicConformer / Whisper-class ASR |
| `tts.read_aloud` | On device (OS TTS); cloud for natural Indic voices | OS TTS; AI4Bharat Indic Parler-TTS class |
| `translate` | Cloud; cached per content item | IndicTrans2 |
| `diagram.generate` | Cloud | An open diffusion model, plus a curated diagram library first |

## Offline AI on the Board

| Device class | What works offline |
|---|---|
| Minimum (4 GB) | Handwriting recognition, shape cleanup, CAS maths solver, cached quizzes and lessons for the week |
| Recommended (8 GB+) | All of the above + a 1–3B quantised LLM (llama.cpp / MediaPipe LLM Inference) for explain, quiz and homework generation, grounded in the cached chapter text |

The night before, the Board **pre-generates** and caches AI content for the next day's
timetabled chapters while it is online: an explanation, a quiz bank and homework drafts.
In practice, "AI offline" covers almost everything a teacher needs, even on low-end devices.

**Built today: offline sample answers** (`apps/board/lib/features/offline_ai`). The board carries
74 hand-written lesson notes (ported from the prototype: number systems to the French
Revolution, primary to senior secondary), each with a summary, key points, an example, an
activity, common mistakes and quiz questions. When KINETIX AI cannot be reached (no network,
or the API answers 503/504) and the question, quiz, homework or lesson-plan topic matches a
note, the board answers from it; in demo builds it answers known topics without asking the
demo server. These answers are labelled "Offline sample" in every board language (the notes
themselves are English). Anything the notes do not cover keeps the normal error: nothing is
invented, and nothing leaves the board.

## Grounding & quality

- Every generation is grounded in **our curriculum library**: the syllabus topic, learning
  outcomes and textbook-aligned notes. The model is asked to cite the chunks it used.
- Prompt templates are versioned files in the repo. The model version and template version
  are logged with every output.
- An evaluation set of questions per board, subject and grade is run before any model or
  prompt change ships.
- Generated quizzes and homework are shown to the teacher **as drafts**. They go to students
  only after the teacher accepts them.
- Safety: content filters for under-18 users, and blocklists for regional languages.

## Hosting: local first, with an Indian fallback

The gateway (`services/api/src/ai/`) talks to two kinds of server, in order:

| | Primary (self-hosted) | Fallback (pay-per-use) |
|---|---|---|
| Chat tasks | Any OpenAI-compatible server (`AI_BASE_URL`): vLLM with an open 8–14B multilingual model | Sarvam AI `POST /v1/chat/completions`, `sarvam-105b` (`AI_FALLBACK_PROVIDER=sarvam`) |
| Board handwriting (`readBoard`) | The primary, if its model reads images (`AI_VISION=true`) | Not sent: Sarvam is text-only here, so the task is "not available" (503) while the primary is down |
| Lesson transcripts | OpenAI-compatible `/audio/transcriptions` (`ASR_BASE_URL`): faster-whisper / IndicConformer | Sarvam speech-to-text (`ASR_FALLBACK_PROVIDER=sarvam`): REST for clips up to 30 s, the batch job API for lesson recordings (up to 2 h per file; longer audio is split with ffmpeg) |

Rules:

- **When to fall back.** Connection errors, timeouts, 5xx and 429 go to the fallback. A 4xx
  (the request itself is wrong) does not: it is reported, not retried elsewhere.
- **Circuit breaker.** After `AI_BREAKER_FAILURES` failures in a row (default 3) the primary is
  skipped for `AI_BREAKER_COOLDOWN_S` (default 60 s), then one request tests it again. One
  breaker per server per API instance.
- **Either alone works.** Only the fallback configured is the pilot setup (no GPU); only the
  primary is a fully self-hosted install; neither gives labelled previews (development).
- **Metering.** Every call writes an `ai_usage` row with the provider and model that actually
  answered, tokens, latency and, for Sarvam, an estimated cost in rupees (`est_cost_inr`, from
  `SARVAM_INR_PER_*`). Responses carry the same in `meta.provider` / `meta.model`.
  Transcripts are metered as task `transcribe` with `audio_ms`.
- **Caps.** `AI_DAILY_LIMIT` model requests per institution per day (cached answers are free);
  `ASR_MONTHLY_HOURS` hours of transcription per institution per calendar month (IST, default
  300 h, all providers). Over the cap the transcript job fails with `ASR_MONTHLY_LIMIT` and an
  `ai_usage` row with outcome `quota`.
- **Language.** The recording language is passed as a hint: `en`/`hi`/`kn` to the self-hosted
  server, `en-IN`/`hi-IN`/`kn-IN` to Sarvam.
- **Data residency.** Self-hosted servers are ours. For Sarvam and E2E Networks, residency,
  no-training and deletion must be confirmed in the contract before production use: see the
  checklist in the runbook.

Recommended path: **pilot** on Sarvam alone (no fixed cost), **grow** onto an E2E Networks L4 or
L40S running vLLM + Whisper/IndicConformer with Sarvam as fallback, and optionally move the
primary onto a GPU box in the college. The options, costs and setup commands are in
[docs/operations/ai-hosting.md](../operations/ai-hosting.md).

## Cost control

- Results are cached per (task, topic, language, grade): "explain photosynthesis, grade 7,
  Kannada" is generated once for all tenants.
- Tenant quotas are metered per plan.
- Inference is batched at night for summaries and transcripts.
