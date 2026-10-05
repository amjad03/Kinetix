# Hosting KINETIX AI

KINETIX AI runs **as locally as possible**: a self-hosted open model (and speech-to-text
server) first, then **Sarvam AI**'s pay-per-use API for whatever the self-hosted servers cannot
take. Every option on this page keeps processing in India. The design is in
[docs/architecture/ai-platform.md](../architecture/ai-platform.md#hosting-local-first-with-an-indian-fallback).

Related: [deploy.md](deploy.md) · [security.md](security.md) · [monitoring.md](monitoring.md).

## The three setups

| | (a) Pilot | (b) Growth (recommended) | (c) On-prem GPU (optional) |
|---|---|---|---|
| Chat tasks | Sarvam `sarvam-105b` | vLLM on an E2E Networks L4 / L40S, Sarvam as fallback | vLLM on a GPU box in the college, Sarvam (or E2E) as fallback |
| Transcripts | Sarvam Saaras (batch) | faster-whisper / IndicConformer on the same GPU, Sarvam as fallback | Same, on the college box |
| Board handwriting (`readBoard`) | Not available (Sarvam is text-only here) | Yes, with a vision model (e.g. Gemma 3 12B) | Yes, with a vision model |
| Fixed cost | None | ₹49/h (L4) or ₹102/h (L40S) on demand | Hardware + power + someone to look after it |
| Variable cost | Sarvam per token / per audio hour | Sarvam only when the GPU is down or busy | Same as (b) |
| Effort | An API key | One VM, two containers | Hardware, UPS, network, patching |

Prices are what E2E Networks and Sarvam listed when this was written. Check the current price
lists before committing, and set the `SARVAM_INR_PER_*` variables to match so the cost estimates
in the logs and in `ai_usage.est_cost_inr` stay right.

### Rough monthly numbers

- **GPU on demand, all month:** L4 ≈ ₹49 × 730 h ≈ ₹36,000; L40S ≈ ₹102 × 730 h ≈ ₹74,500.
  School hours only (10 h × 26 days = 260 h): L4 ≈ ₹12,700, L40S ≈ ₹26,500. Committed / reserved
  plans are cheaper; ask E2E.
- **Sarvam transcripts:** about ₹30 per audio hour (₹45 with diarization, which we do not use).
  A college recording 300 h a month ≈ ₹9,000.
- **Sarvam chat:** about ₹29 per 1M input and ₹73 per 1M output tokens. A typical request
  (1.5k tokens in, 1–2k out including reasoning) costs ₹0.10–0.20; the default cap of 2,000
  requests per institution per day bounds the worst case at ₹200–400 a day.

When an institution's Sarvam bill would pass the GPU's cost, move it to (b).

## Switching between setups (environment only)

No code change is needed: set these on the API (Terraform variables in brackets) and roll the
service.

| Setup | `AI_BASE_URL` (`ai_base_url`) | `AI_FALLBACK_PROVIDER` (`ai_fallback_provider`) | `ASR_BASE_URL` (`asr_base_url`) | `ASR_FALLBACK_PROVIDER` (`asr_fallback_provider`) |
|---|---|---|---|---|
| Development | unset | `none` | unset | `none` (labelled previews, no transcripts) |
| (a) Pilot | unset | `sarvam` | unset | `sarvam` |
| (b) / (c) | `https://<gpu-host>/v1` | `sarvam` | `https://<gpu-host>/asr/v1` | `sarvam` |
| Fully self-hosted | `https://<gpu-host>/v1` | `none` | `https://<gpu-host>/asr/v1` | `none` |

Other settings (defaults in brackets): `AI_MODEL` (`kinetix-llm`, must equal vLLM's
`--served-model-name`), `AI_API_KEY`, `AI_VISION` (`true`: set `false` if the primary model cannot
read images), `AI_TIMEOUT_MS` (60000), `AI_BREAKER_FAILURES` (3) and `AI_BREAKER_COOLDOWN_S` (60),
`AI_DAILY_LIMIT` (2000 requests per institution per day), `ASR_MODEL` (`whisper`), `ASR_API_KEY`,
`ASR_MONTHLY_HOURS` (300 h per institution per month, 0 = no cap), `SARVAM_LLM_MODEL`
(`sarvam-105b`), `SARVAM_ASR_MODEL` (`saaras:v3`), `SARVAM_INR_PER_M_INPUT` (29.28),
`SARVAM_INR_PER_M_OUTPUT` (73.2), `SARVAM_INR_PER_AUDIO_HOUR` (30).

The Sarvam key is a secret. In AWS it lives in Secrets Manager as `kinetix/<env>/sarvam` and is
injected only when one of the fallbacks is `sarvam`:

```bash
aws secretsmanager put-secret-value --secret-id kinetix/prod/sarvam \
  --secret-string '{"SARVAM_API_KEY":"<key from dashboard.sarvam.ai>"}'
```

Plain variables such as `AI_MODEL`, `AI_VISION` or `ASR_MONTHLY_HOURS` go through
`extra_api_environment` (or the dedicated Terraform variables above).

## (a) Pilot: Sarvam only

1. Create an account at Sarvam, sign the enterprise terms (see the [checklist](#data-residency-and-dpa-checklist)),
   and create an API key.
2. Put the key in Secrets Manager (above) and set `ai_fallback_provider = "sarvam"`,
   `asr_fallback_provider = "sarvam"` in the environment's tfvars. `terraform apply`.
3. Check: `POST /v1/ai/explain` returns `meta.provider = "sarvam"`; finishing a recording with
   audio produces a transcript; the API logs `served by sarvam … about ₹…` lines.

Board handwriting reading stays "not available" in this setup.

## (b) Growth: an E2E Networks GPU

### Machine

- E2E Networks (Indian company; data centres in Delhi NCR and Mumbai): a GPU node with an
  **NVIDIA L4 (24 GB)** or **L40S (48 GB)**, Ubuntu 22.04 with the NVIDIA driver and Docker +
  NVIDIA Container Toolkit (E2E offers GPU images with these preinstalled). Pick the region
  nearest the API (Mumbai, for AWS ap-south-1).
- Disk: 200 GB for model weights and the Docker images.
- Firewall: allow 443 only from the API's NAT gateway Elastic IP(s)
  (`aws ec2 describe-nat-gateways --query 'NatGateways[].NatGatewayAddresses[].PublicIp'`), plus
  SSH from your admin IPs. Put Caddy or nginx with a TLS certificate in front of the two
  containers, or use a WireGuard tunnel from the VPC and keep them on a private address.

### Model choice

Benchmark on our evaluation set (Hindi and Kannada questions per board, subject and grade)
before choosing; quality in Kannada varies a lot between models. Candidates that fit:

| GPU | Chat model (examples) | Notes |
|---|---|---|
| L4 24 GB | Gemma 3 12B-it in FP8 (`--quantization fp8`) or an AWQ build; Qwen3 8B / Llama 3.1 8B Instruct in BF16 | Gemma 3 reads images (keeps `readBoard`); the 8B models are text-only (`AI_VISION=false`) |
| L40S 48 GB | Gemma 3 12B-it in BF16; Qwen3 14B in BF16 | Room for longer contexts and more concurrent requests, plus Whisper on the same card |

Keep `max-model-len` modest (8–16k): the gateway sends at most ~60k characters (a one-hour
transcript) for summaries, and smaller contexts leave more memory for concurrency.

Speech: **faster-whisper large-v3** is the simplest (OpenAI-compatible server, good English and
Hindi; Kannada is weaker). **AI4Bharat IndicConformer** is better for Kannada but has no
OpenAI-compatible server of its own: wrap it in a small service that exposes
`POST /v1/audio/transcriptions` (multipart `file`, `model`, `language`; returns `{"text": …}`).

### Setup commands

```bash
# Chat model: vLLM's OpenAI-compatible server. Gemma needs its licence accepted on Hugging Face.
docker run -d --name vllm --restart unless-stopped --gpus all --ipc=host \
  -p 127.0.0.1:8000:8000 \
  -v /data/hf:/root/.cache/huggingface -e HF_TOKEN=<read token> \
  vllm/vllm-openai:latest \
  --model google/gemma-3-12b-it --served-model-name kinetix-llm \
  --max-model-len 16384 --gpu-memory-utilization 0.80 \
  --api-key <long random key>
# On an L4 add: --quantization fp8   (and lower --gpu-memory-utilization if Whisper shares the card)

# Speech-to-text: an OpenAI-compatible faster-whisper server (e.g. speaches, formerly
# faster-whisper-server; check its README for the current image tag and model ids).
docker run -d --name asr --restart unless-stopped --gpus all \
  -p 127.0.0.1:8001:8000 -v /data/hf:/home/ubuntu/.cache/huggingface \
  ghcr.io/speaches-ai/speaches:latest-cuda

# Smoke tests on the box
curl -s localhost:8000/v1/models -H 'authorization: Bearer <key>'
curl -s localhost:8001/v1/audio/transcriptions -F file=@sample.m4a -F model=Systran/faster-whisper-large-v3 -F language=hi
```

Expose them through the TLS proxy as `https://<gpu-host>/v1` (vLLM) and
`https://<gpu-host>/asr/v1` (speech), then set:

```hcl
ai_base_url           = "https://<gpu-host>/v1"
asr_base_url          = "https://<gpu-host>/asr/v1"
asr_model             = "Systran/faster-whisper-large-v3"
ai_fallback_provider  = "sarvam"
asr_fallback_provider = "sarvam"
extra_api_environment = { AI_VISION = "true" } # "false" for a text-only model
```

and put the vLLM key in `AI_API_KEY` (and the speech key, if any, in `ASR_API_KEY`) via
`extra_api_environment`. Those land in the task definition in plain text; moving them into a
Secrets Manager key like `SARVAM_API_KEY` is a small follow-up.

### Operating it

- `ai_usage.provider` shows who served each call. A rising share of `sarvam` means the GPU is
  down or saturated: check `docker logs vllm`, GPU memory (`nvidia-smi`) and the breaker
  warnings in the API logs (`falling back to sarvam`).
- To save money, stop the node outside school hours (E2E bills on-demand nodes hourly); Sarvam
  serves evening requests and transcripts meanwhile (without a fallback, transcript jobs retry
  with backoff and then fail).
- Upgrading the model: change `--model`, keep `--served-model-name` (or change `AI_MODEL`, which
  also starts a fresh answer cache), run the evaluation set, then roll.

## (c) Optional: a GPU box in the college

The same containers as (b) on a workstation in the college (one L4 / RTX 4090 / L40S class card,
64 GB RAM, UPS). It is the cheapest per hour once bought and keeps data on campus, but it needs
a static IP or a WireGuard tunnel to the VPC (avoid tunnel services whose edge may route the
traffic outside India), someone to patch it, and power backup. Keep Sarvam (or
an E2E node) as fallback for outages. Point `AI_BASE_URL` / `ASR_BASE_URL` at it exactly as in
(b).

## Data-residency and DPA checklist

Get these **in the signed contract or DPA**, not only from a web page, before any real
institution's data goes to the provider. Students may be minors (DPDP Act 2023: verifiable
parental consent, no tracking or targeted advertising of children).

**Sarvam AI**

- [ ] Prompts, audio and outputs are processed and stored only in India (name the cloud and
      region, including for the batch speech-to-text uploads: the batch API returns
      presigned storage links, reported as `Azure` storage; confirm that storage is in an Indian
      region such as Central India).
- [ ] Our data is not used to train or improve any model, and not shared with third parties
      beyond named sub-processors (all in India).
- [ ] Retention: how long requests, audio files and batch outputs are kept; deletion on request
      and at contract end, with written confirmation.
- [ ] Security: encryption in transit and at rest, access control, breach notification within a
      fixed time (DPDP Rules), audit rights or reports (ISO 27001 / SOC 2).
- [ ] Rate limits and an SLA for the plan we buy; how 429s are signalled.
- [ ] Sarvam acts as a data processor for us (we are the processor for the institution, which
      is the data fiduciary): the DPA must flow down our obligations.

**E2E Networks** (infrastructure only: we run the models)

- [ ] The node and its disks are in an Indian data centre (name it), and backups/snapshots stay
      in India.
- [ ] No access to the VM's contents by E2E staff except under a documented support process.
- [ ] Disk wipe on node deletion; retention of snapshots after termination.
- [ ] Their certifications (ISO 27001, MeitY empanelment) and breach-notification terms.

**Our side**

- [ ] TLS on every hop (API → GPU, API → Sarvam); keys in Secrets Manager; firewall to the NAT
      IPs only.
- [ ] No prompts or transcripts in logs on the GPU box (vLLM does not log prompts by default;
      keep `--disable-log-requests` if your version logs them).
- [ ] Update the privacy notice's sub-processor list (Sarvam, E2E) before switching them on.

## What the gateway does (for reference)

- Order: self-hosted first, then Sarvam. Falls back on connection errors, timeouts, 5xx and 429;
  never on another 4xx. After `AI_BREAKER_FAILURES` failures in a row the self-hosted server is
  skipped for `AI_BREAKER_COOLDOWN_S` seconds.
- Board images go only to a model with `AI_VISION=true`; otherwise `readBoard` answers 503.
- Sarvam chat: `POST https://api.sarvam.ai/v1/chat/completions`, header
  `api-subscription-key`, model `sarvam-105b`, JSON mode, `reasoning_effort: low`.
- Sarvam speech-to-text: `POST /speech-to-text` for clips up to 30 s; longer recordings use the
  batch job API (`/speech-to-text/job/v1`: create → upload links → PUT → start → poll status →
  download links), language `en-IN` / `hi-IN` / `kn-IN` from the recording, model `saaras:v3`,
  mode `transcribe`. Recordings longer than 2 h are split with ffmpeg (in the API image) into
  1-hour pieces of one job. Polling stops after 14 minutes (the job runner's lock is 15) and the
  transcript job retries with backoff.
- Usage: `ai_usage` rows carry `provider`, `model`, tokens, `audio_ms` (task `transcribe`) and
  `est_cost_inr` (Sarvam only). Over `ASR_MONTHLY_HOURS` the transcript job fails with
  `ASR_MONTHLY_LIMIT` and a `quota` row is written.
