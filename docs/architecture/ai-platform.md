# KINETIX AI platform (India-hosted)

**Constraint:** all AI processing runs in India, on our own GPUs in AWS Mumbai or on an Indian
GPU cloud, or on the device. No prompt, image or recording goes to a model API abroad.

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
     GPU pool: AWS g6/g5 in ap-south-1, or an Indian GPU cloud
     (E2E Networks / Yotta / others; benchmark before choosing)
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

## Cost control

- Results are cached per (task, topic, language, grade): "explain photosynthesis, grade 7,
  Kannada" is generated once for all tenants.
- Tenant quotas are metered per plan.
- Inference is batched at night for summaries and transcripts.
