# Free AI for demos: Google Gemini

Every Zynetix AI feature on the board can run on Google Gemini's free tier, through Gemini's
OpenAI-compatible endpoint. No code change is needed: four settings in `services/api/.env`.

## Set it up (5 minutes)

1. Sign in at https://aistudio.google.com/apikey with a Google account and create an API key.
2. Add these lines to `services/api/.env` (the key stays in that file; it is never committed,
   printed or logged):

   ```
   AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   AI_MODEL=gemini-3.8-flash
   AI_FALLBACK_MODELS=gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.1-flash-lite
   AI_API_KEY=<your key>
   ```

   The free tier allows only **20 requests a day for each model** (October 2026). When
   `gemini-3.8-flash` has used its 20, or is busy, the API asks the next model in
   `AI_FALLBACK_MODELS`, so the list above gives about 120 answers a day. Answers name the model
   that wrote them in the API log.

   `gemini-2.5-flash` is retired for new keys. If Google retires `gemini-3.8-flash` too (the API
   log says "returned 404 … not found"), set `AI_MODEL=gemini-flash-latest`: that alias always
   points at the newest Flash model. In testing it ran out of its daily allowance together with
   `gemini-3.8-flash`, so it is no use as a fallback of it.

3. Restart the API (`scripts/demo-stop.sh && scripts/demo-start.sh` for the demo; or `pnpm build && pnpm start`,
   or `pnpm start:dev`, in `services/api`). The API reads `.env` only when it starts. Its log then says
   `Zynetix AI: gemini-3.8-flash, then gemini-3.7-flash, then … at generativelanguage.googleapis.com` (demo log:
   `grep "Zynetix AI:" /tmp/kinetix-api.log | tail -1`).
4. On the board, sign in a teacher, open **Zynetix AI** and ask "Solve 3x + 7 = 22". A real answer
   has no "Preview" label. The "Preview" label means `AI_BASE_URL` is not set or the API was not
   restarted.

Optional settings (defaults are right for Gemini):

| Setting | Default | What it does |
|---|---|---|
| `AI_REASONING_EFFORT` | `low` for Gemini | How long the model thinks first: `none` (fastest), `low`, `medium`, `high`. |
| `AI_RETRIES` | `2` | When Gemini says it is busy (429 or 503), the API waits (as Gemini asks, or 1.5 s then 3 s) and asks again this many times. |
| `AI_TIMEOUT_MS` | `60000` | Longest wait for one answer. |

## What uses it

| Board feature | API endpoint |
|---|---|
| Ask / explain (typed or spoken), Dictionary word lookup | `POST /v1/ai/explain` |
| Quick Quiz (topic or Scan the Board), with explanations | `POST /v1/ai/quiz` |
| Homework draft (formats, marks, model answers, rubric) | `POST /v1/ai/homework` |
| Homework marking help (teacher app) | `POST /v1/grading-assist/homework/:homeworkId/:studentId/suggest` |
| Lesson plan | `POST /v1/ai/lesson-plan` |
| Read board (handwriting to text and maths), Scan the Board | `POST /v1/ai/read-board` (the page goes as a PNG image) |
| Summary, Lecture, Select & Ask (explain, solve, translate…) | `POST /v1/ai/board-summary`, `/lecture`, `/select-ask` |
| Student tutor (student app) | `POST /v1/ai/tutor/ask` |

The AI pen's handwriting to text on the board itself runs on the device (ML Kit / Windows ink),
not on Gemini. The maths solver works with no AI at all.

Answers come back as plain text with Unicode maths (x², √, ×, H₂O): the API turns any LaTeX or
markdown Gemini writes into readable text. Read board keeps the maths it finds as LaTeX, and the
board typesets it.

## Free-tier limits and the demo

- The free tier allows about 5 requests a minute and **20 requests a day for each model**
  (October 2026; Google changes these, so check https://aistudio.google.com, Usage / Rate limits,
  for your key). The API log names the limit that was hit, e.g. `429
  (GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit 20, …)`.
- A busy or used-up model hands over to the next one in `AI_FALLBACK_MODELS` at once. When every
  model is busy the API waits and asks again; if they stay busy the board says **"Zynetix AI is
  busy right now. Try again in a minute."** When every model has used its day, it says the same
  at once; the allowances come back the next day (midnight Pacific time). For more, add models to
  `AI_FALLBACK_MODELS` or use a paid key.
- The Gemma models on the same key (`gemma-4-31b-it`) have higher limits but take about 40 s per
  answer and write their reasoning into the reply: do not use them for the board.
- **Rehearse the demo questions beforehand.** The same request from the same institution is
  answered from the cache for 30 days, instantly and without using the free allowance. "Ask again"
  (regenerate) skips the cache.
- Each quiz, homework, summary or read-board is one request (a reply that needs fixing is two).
- Do not run the 40-question evaluation (`pnpm ai:eval`) on a demo day: it uses 40 requests, two
  models' daily allowance.

## Check accuracy: the board evaluation

`pnpm ai:eval` (in `services/api`) asks 40 board questions (maths, science, social science,
English, Hindi, computer science) and scores the answers; the target is 80 %. It spaces the
questions 13 s apart for the free tier (about 5 a minute), so it takes about 12 minutes, and it
uses `AI_FALLBACK_MODELS` once the first model has used its 20 requests for the day; each line
names the model that answered. `AI_EVAL_ONLY=m13,p02 pnpm ai:eval` asks only the questions
named (to re-check the ones that missed). Without a key the same questions run against a stand-in
in the test suite (`src/ai/board-eval.spec.ts`). `AI_LIVE_SMOKE=1 npx vitest run
test/ai-live.e2e.spec.ts` (with the AI settings in the environment) runs every board AI task once
against the real model through the API: about 13 requests.

## Privacy

Gemini is not processed in India, and on the free tier Google may use what is sent to improve its
products. Use it for demos and trials, with demo data. Zynetix never sends student names to the
model (insights send figures only), but a picture of the board sends whatever is written on it.
For real classes use the self-hosted model or the Sarvam fallback (`docs/operations/ai-hosting.md`).

## If something goes wrong

| The board says | Check |
|---|---|
| "Preview" label on answers | `AI_BASE_URL` missing, or the API was not restarted. |
| "Zynetix AI is not reachable right now" | The API log line `AI … failed:` says why. "API key not valid": the key is wrong. "unreachable": no internet on the server. "returned 404 … not found": Google retired the model; set `AI_MODEL=gemini-flash-latest` and restart. |
| "Zynetix AI is busy right now" | The free limit for the minute or the day; wait, or switch `AI_MODEL`. |
| "The board is offline" | The board has no connection to the API. Topics in the board's offline notes still get a labelled sample answer. |
| "Zynetix AI could not produce a usable answer" | Gemini's reply was not usable twice; ask again or rephrase. |
