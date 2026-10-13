# Free AI for demos: Google Gemini

Every KINETIX AI feature on the board can run on Google Gemini's free tier, through Gemini's
OpenAI-compatible endpoint. No code change is needed: three settings in `services/api/.env`.

## Set it up (5 minutes)

1. Sign in at https://aistudio.google.com/apikey with a Google account and create an API key.
2. Add these lines to `services/api/.env` (the key stays in that file; it is never committed,
   printed or logged):

   ```
   AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   AI_MODEL=gemini-2.5-flash
   AI_API_KEY=<your key>
   ```

3. Restart the API (`pnpm build && pnpm start`, or `pnpm start:dev`, in `services/api`).
4. On the board, sign in a teacher, open **KINETIX AI** and ask "Solve 3x + 7 = 22". A real answer
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

- The free tier allows a limited number of requests per minute and per day for each model; Google
  changes these, so check https://aistudio.google.com (Usage / Rate limits) for your key.
- Over the per-minute limit, or when the model is overloaded, the API waits and asks again. If it
  is still busy the board says **"KINETIX AI is busy right now. Try again in a minute."** Over the
  daily limit it says the same at once; the allowance comes back the next day (midnight Pacific
  time). `gemini-2.5-flash-lite` has higher free limits if you need more: set `AI_MODEL` to it.
- **Rehearse the demo questions beforehand.** The same request from the same institution is
  answered from the cache for 30 days, instantly and without using the free allowance. "Ask again"
  (regenerate) skips the cache.
- Each quiz, homework, summary or read-board is one request (a reply that needs fixing is two).
- Do not run the 40-question evaluation (`pnpm ai:eval`) just before a demo: it uses 40 requests.

## Check accuracy: the board evaluation

`pnpm ai:eval` (in `services/api`) asks 40 board questions (maths, science, social science,
English, Hindi, computer science) and scores the answers; the target is 80 %. It spaces the
questions 7 s apart for the free tier, so it takes about 8 minutes. Without a key the same
questions run against a stand-in in the test suite (`src/ai/board-eval.spec.ts`).

## Privacy

Gemini is not processed in India, and on the free tier Google may use what is sent to improve its
products. Use it for demos and trials, with demo data. KINETIX never sends student names to the
model (insights send figures only), but a picture of the board sends whatever is written on it.
For real classes use the self-hosted model or the Sarvam fallback (`docs/operations/ai-hosting.md`).

## If something goes wrong

| The board says | Check |
|---|---|
| "Preview" label on answers | `AI_BASE_URL` missing, or the API was not restarted. |
| "KINETIX AI is not reachable right now" | The API log line `AI … failed:` says why. "API key not valid": the key is wrong. "unreachable": no internet on the server. |
| "KINETIX AI is busy right now" | The free limit for the minute or the day; wait, or switch `AI_MODEL`. |
| "The board is offline" | The board has no connection to the API. Topics in the board's offline notes still get a labelled sample answer. |
| "KINETIX AI could not produce a usable answer" | Gemini's reply was not usable twice; ask again or rephrase. |
