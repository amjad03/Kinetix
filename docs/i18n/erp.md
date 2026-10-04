# ERP: Hindi and Kannada

The ERP (`apps/erp`) is localised into English, Hindi (हिन्दी) and Kannada (ಕನ್ನಡ). Terms and style
follow the [glossary](glossary.md): आप-form and ನೀವು-form, KINETIX / app names / UPI / ISBN / PIN /
class and subject names in Latin script, Western digits, Indian grouping (₹12,34,567).

> **Needs native review.** The Hindi and Kannada strings are a first draft, written alongside the
> English. Before release they must be reviewed by native speakers who work in schools and
> colleges, and the privacy texts also by the institution's legal adviser. The strings we are
> least sure of are listed at the end.

## Approach

No i18n library: a typed dictionary and a small `t()`, which fit server components (most pages)
and client components (dialogs, tables with filters) equally.

| File | What it is |
|---|---|
| `src/i18n/messages/*.ts` | The dictionary, one file per area (`common`, `today`, `calendar`, `settings`, `department`, `plans`, `results`, `school`, `messages`, `boards`, `fees`, `library`, `syllabus`, `admin`). Each file holds the English strings **and** their Hindi and Kannada translations, side by side. |
| `src/i18n/define.ts` | `area(en, { hi, kn })`: TypeScript refuses a translation that misses or adds a key. |
| `src/i18n/messages/index.ts` | Merges the areas into `MESSAGES.en / .hi / .kn`, and the `MessageKey` type. |
| `src/i18n/translate.ts` | `createT(locale, messages)`: `t('key', { name })` fills `{name}` (numbers with Indian grouping); `t.plural('key', n)` picks `key_one` / `key_other` with `Intl.PluralRules`. |
| `src/i18n/format.ts` | `fmt`: dates, months, times, relative days, numbers and rupees in the language. |
| `src/i18n/server.ts` | `getI18n()` → `{ locale, t, fmt }` for server components and server actions. |
| `src/i18n/client.tsx` | `I18nProvider` (root layout, sends only the current language's dictionary) and `useI18n()` for client components. |
| `src/i18n/errors.ts` | API error codes (`services/api/src/common/error-codes.ts`) the ERP words itself. |
| `src/app/language/actions.ts` | The language menu's server action. |

There are 1,294 strings. Server data (names, class, subject, course, homework and calendar titles,
board names, notice text written by staff) is shown as the API sends it.

## Which language is shown

1. The language picked on this browser: the account menu (top right) → Language, or the three
   buttons on the sign-in page. It is kept in the `kx_lang` cookie for a year and, when signed in,
   saved to the account with `PATCH /v1/me {preferredLanguage}` so notifications use it too.
2. Otherwise the signed-in user's `preferredLanguage` (`GET /v1/me`).
3. Before sign-in: the browser's `Accept-Language` when it is Hindi or Kannada, else English.

`<html lang>` follows (`en-IN`, `hi-IN`, `kn-IN`), and the date picker uses the dayjs locale.

## Formats

- Digits are Western everywhere. Numbers and money use Indian grouping in every language. ICU's
  `kn-IN` groups in thousands, so Kannada numbers are formatted with `en-IN` (same digits, lakh
  grouping). Big totals read ₹9.25 लाख / ₹9.25 ಲಕ್ಷ / ₹9.25 L.
- Dates: "शुक्रवार, 2 अक्टूबर 2026", "ಶುಕ್ರವಾರ, 2 ಅಕ್ಟೋಬರ್ 2026"; short "शुक्र, 2 अक्टू॰",
  "ಶುಕ್ರ, 2 ಅಕ್ಟೋ". Hindi and Kannada month and weekday names come from our own tables in
  `src/lib/dates.ts`, not `Intl`: Node and Chrome ship different ICU data ("अक्टू॰" on the server,
  "अक्तू॰" in the browser), which made server-rendered client components fail to hydrate. English
  still uses `Intl` `en-IN`.
- Times are 24-hour ("14:30") in all three languages, as the ERP always did.

## Errors

API error bodies carry `code`. `errorText()` words the codes the ERP can meet (wrong login,
inactive account, calendar range, live view off, board offline, marks empty, lesson-plan review refused and the other plan errors, forbidden, not
found, rate limited, network, server error…). For other codes, English shows the API's message
as is; Hindi and Kannada show a translated general line ("भरी गई जानकारी जाँचें।") followed by the
API's English detail in brackets, because the detail names what was wrong. Live-view refusals
are mapped by the watch ack's `code` (`LIVE_VIEW_OFF`, `LIVE_NO_CLASS`, `LIVE_BOARD_OFFLINE`, …)
with the English text as a fallback for older APIs. Validation in server actions is worded in the
user's language before anything is sent.

## How to add a string

1. Add the key to the right file in `src/i18n/messages/` with its English text, then the Hindi
   and Kannada under `hi` and `kn` in the same file. Keys are `area.thing` (`cal.dialog.title`);
   plurals are `key_one` + `key_other` and are read with `t.plural('key', n)`.
2. Use it: `const { t, fmt } = await getI18n()` in a server component or action,
   `const { t, fmt } = useI18n()` in a client component. Put placeholders in the string
   (`'Due {date}'`), never build sentences from pieces: word order differs in Hindi and Kannada.
3. `pnpm typecheck` fails if a language misses the key; `pnpm test` (`src/i18n/i18n.test.ts`)
   also checks that every key is in all three languages and defined once, that placeholders
   match, that plurals have both forms, and that no English words were left in a translation
   (only brand and technical words from the glossary may stay in Latin script).
4. Add the new string to the review list below if you are not sure of it.

## What is not translated

- Server content (see above) and the API's English detail inside some errors.
- The amount in words on fee receipts ("Rupees One Thousand Two Hundred Fifty only") stays in
  English, as on most Indian receipts.
- The board app's own screen names quoted in the enrolment steps ("Set up this board",
  "Register board") stay in English until the board is localised.
- KINETIX, KINETIX AI, KINETIX Cloud, Teacher App, Parent / Student app names, UPI, ISBN, PIN,
  HOD, UTR (glossary).

## Tests

- `src/i18n/i18n.test.ts`: dictionary completeness and consistency, `t()` interpolation and plurals,
  error wording, date / number / money formats in all three languages.
- `e2e/i18n.spec.ts` (Playwright): Today, Classes, Calendar, Attendance, Homework, Results,
  Messages, Boards, Fees, Library, Department, Settings and Timetable in Hindi and in Kannada at
  1280 and 1440 px wide (and a class's year plan and lesson plans, `/department/plan`): translated headings, `<html lang>`, no error states, and no horizontal
  overflow (`scrollWidth ≤ clientWidth`; wide tables scroll inside their own frame). It also checks
  the language menu (saved to the account and put back), Ravi's account language (Kannada) when
  the browser has not picked one, the sign-in page's language buttons, and Hindi dates / Kannada
  money. The other e2e tests run in English (`signIn` sets `kx_lang=en`).

## Needs native review

Most uncertain first.

| Key(s) | Hindi / Kannada | Why |
|---|---|---|
| `time.yesterdayDay`, `time.tomorrow` | बीता कल / आने वाला कल | कल means both yesterday and tomorrow; is this natural in a date subtitle? |
| `kind.test`, `kind.exam` | टेस्ट / परीक्षा; ಟೆಸ್ಟ್ / ಪರೀಕ್ಷೆ | The glossary gives ಪರೀಕ್ಷೆ for both in Kannada; we used the loan word for "test" to tell them apart. |
| `plan.*`, `dept.flag.behindPlan` | वार्षिक योजना, पाठ योजना; ವಾರ್ಷಿಕ ಯೋಜನೆ, ಪಾಠ ಯೋಜನೆ | Year and lesson plans. "Year plan" covers a semester in colleges: is वार्षिक / ವಾರ್ಷಿಕ (annual) right, or सत्र योजना / ಸೆಮಿಸ್ಟರ್ ಯೋಜನೆ? Status chips are short: योजना के अनुसार / ಯೋಜನೆಯಂತೆ (on track), योजना से आगे / ಯೋಜನೆಗಿಂತ ಮುಂದೆ (ahead), "{n} विषय-वस्तु पीछे" / "{n} ವಿಷಯಗಳು ಹಿಂದೆ" (behind by n topics, with the ವಿಷಯ = topic/subject issue below). |
| `plan.review*`, `plan.lesson.reviewed*`, `error.PLAN_REVIEW_NOT_ALLOWED` | जाँचें / जाँचा गया; ಪರಿಶೀಲಿಸಿ / ಪರಿಶೀಲಿಸಲಾಗಿದೆ; टिप्पणी / ಟಿಪ್ಪಣಿ | The head of department's review of a lesson plan and its remark; same verb as the syllabus library's "Reviewed". |
| `plan.lesson.aiDraft`, `plan.lesson.*` | AI ड्राफ़्ट / AI ಕರಡು; उद्देश्य, चरण, सामग्री, मूल्यांकन; ಉದ್ದೇಶಗಳು, ಹಂತಗಳು, ಸಾಮಗ್ರಿಗಳು, ಮೌಲ್ಯಮಾಪನ | Lesson-plan headings as B.Ed.-trained teachers say them; must match the Teacher App once it shows lesson plans. |
| `error.PLAN_*`, `error.PERIOD_WRONG_DAY` | | Year- and lesson-plan errors from the API's codes (no syllabus, no periods, no teaching days, bad dates, wrong day); the ERP shows only the review refusal today. |
| `plan.week`, `plan.lessonsOf` | "{date} से शुरू सप्ताह"; "{date} ರಿಂದ ಆರಂಭವಾಗುವ ವಾರ"; "{d} पीरियड में से {n}" | "Week of 5 Oct" is long in both; is there a shorter natural form? |
| `syl.*`, `dept.syllabus.*` | विषय-वस्तु; ವಿಷಯ | Glossary: Topic = विषय-वस्तु / ವಿಷಯ, but ವಿಷಯ is also Subject, so Kannada "4 of 7 topics" (`{total} ವಿಷಯಗಳಲ್ಲಿ {covered}`) may read as subjects. |
| `consent.*`, `notice.*`, `grievance.*`, `settings.live.audioPrivacy` | | Legal and privacy wording (DPDP Act name, शिकायत अधिकारी / ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ, "said no" = मना किया / ಬೇಡ ಎಂದಿದ್ದಾರೆ). Needs the legal adviser too. |
| `fees.*` | बिल / ಬಿಲ್ for invoice; समय निकल गया / ಅವಧಿ ಮೀರಿದೆ for overdue; बकाया | Accounts-office usage varies (चालान? ಇನ್‌ವಾಯ್ಸ್?). |
| `msg.ack*`, `msg.acknowledged` | पावती; ಸ್ವೀಕೃತಿ / ಸ್ವೀಕರಿಸಿದೆ | Must match what the board's button says once the board is localised. |
| `msg.allClear` | सब ठीक / ಎಲ್ಲವೂ ಸರಿ | The emergency "all clear". |
| `nav.departments` | विभाग सेटअप / ವಿಭಾಗಗಳ ಸೆಟಪ್ | Distinguishes set-up from the HOD's "Department" view. |
| `status.taught`, `status.missed` | पढ़ाई हुई / छूट गई; ಪಾಠ ಆಯಿತು / ತಪ್ಪಿಹೋಗಿದೆ | Short chip labels. |
| `lib.*` | किताब दें / वापस लें; ಪುಸ್ತಕ ನೀಡಿ / ಹಿಂಪಡೆಯಿರಿ | Library-desk wording. |
| `tt.sem`, `tt.periods_*` | सेम / ಸೆಮ್; पीरियड / ಅವಧಿ | "Period" as said in colleges. |
| Short months in `src/lib/dates.ts` | जन॰ … दिस॰; ಜನ … ಡಿಸೆಂ | Our own abbreviations (with the ॰ mark in Hindi), not ICU's. |
| `live.end.idle`, `live.slow` | | Technical; check they read naturally. |
| `ai.legend.*`, `ai.tokensNote` | टोकन / ಟೋಕನ್ | "Token" kept as a loan word. |
