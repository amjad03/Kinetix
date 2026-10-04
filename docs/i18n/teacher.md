# Teacher App: Hindi and Kannada

The Teacher App (`apps/teacher`) is localised into English, Hindi (हिन्दी) and Kannada (ಕನ್ನಡ)
with Flutter gen-l10n. Terms and style follow the [glossary](glossary.md).

> **Needs native review.** The Hindi and Kannada strings are a first draft. Before release they
> must be reviewed by native speakers who work in schools and colleges. The strings we are least
> sure of are listed below.

## Where the strings are

| File | What it is |
|---|---|
| `apps/teacher/l10n.yaml` | gen-l10n settings (template `app_en.arb`, class `AppLocalizations`, non-nullable getter) |
| `apps/teacher/lib/l10n/app_en.arb` | English template, with a description and placeholder types for every string |
| `apps/teacher/lib/l10n/app_hi.arb` | Hindi |
| `apps/teacher/lib/l10n/app_kn.arb` | Kannada |
| `apps/teacher/lib/l10n/app_localizations*.dart` | Generated (`flutter gen-l10n`, also run by `flutter pub get` / build). Do not edit. |
| `apps/teacher/lib/core/l10n.dart` | `context.l10n`, the language list, and labels for API codes (attendance status, assessment kind, role, guardian relation) and errors |
| `apps/teacher/lib/core/format.dart` | `Fmt.of(context)`: dates, times and durations with intl `en_IN` / `hi_IN` / `kn_IN` |

There are 371 strings. Plurals use ICU (`{count, plural, =1{…} other{…}}`); every placeholder has a type.

To add a string: add it to `app_en.arb` with an `@key` description, add the Hindi and Kannada
translations to the other two files, then run `flutter gen-l10n` (or `flutter pub get`).

## Which language is shown

1. The language picked in **Profile → Language** (English / हिन्दी / ಕನ್ನಡ) on this phone. It
   applies at once and is kept in `shared_preferences` for that user only. It is also saved to the
   account with `PATCH /v1/me {preferredLanguage}` so notifications and pushes use it; if that
   fails (offline), the app says so and retries quietly on the next start or sign-in.
2. Otherwise the signed-in teacher's `preferredLanguage` from `GET /v1/me`.
3. Before sign-in: the device language when it is Hindi or Kannada, else English.

## What is not translated

- Server content: names, class and subject names, homework, message and assessment text, board names.
- Kept in English per the glossary: KINETIX, app names, QR, OTP, MCQ, roll numbers, class names.
- Server error messages the app does not know. Every API error carries a stable `code`
  (`services/api/src/common/error-codes.ts`); `errorText` in `core/l10n.dart` words the codes the
  Teacher App can receive (`NOT_YOUR_CLASS`, `PAIRING_CODE_INVALID`, `COVERAGE_FUTURE_DATE`,
  `SUBMISSION_MISSING`, …, and the status codes `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
  `VALIDATION`, `SERVER_ERROR`). Older servers send no code, so the English messages they are
  known to send are still matched as a fallback; any other server text is shown as is.
- The lesson player (`packages/kinetix_lesson`: player controls, transcript and summary panels)
  is shared with the Parent App and is not localised yet. The Teacher App passes it translated
  load errors only.

## Formats

- Dates use intl with `en_IN`, `hi_IN`, `kn_IN` ("सोमवार, 5 अक्तूबर", "ಸೋಮ, 28 ಸೆಪ್ಟೆಂ").
- Digits stay Western in every language.
- Times are "10:00 AM" in all three languages: intl's Kannada short form is "10:00 a", which reads
  as ambiguous. Reviewers should confirm (the alternative is ಪೂರ್ವಾಹ್ನ / ಅಪರಾಹ್ನ).

## Layout checks

`test/layout_test.dart` opens every screen (tabs, attendance, connect to board, homework and
assessment forms, marks entry with errors and dialogs, chat, new message, profile, sign-in with all
errors, empty states, the holiday card, calendar, syllabus progress and its date picker, the year plan with its
dialogs, the lesson plan editor with an AI draft, topic picker and review remark, homework
submissions, a student's work and the photo viewer) in all three languages at 360×640 and 412×892 with text scale 1.0 and 1.3,
using the real bundled fonts; any overflow fails the test. `test/i18n_test.dart` checks each tab,
marks entry and chat in Hindi and Kannada, and the Language setting.

## Strings to review first

| Key | Hindi | Kannada | Question |
|---|---|---|---|
| `yesterday` / `tomorrow` | कल / कल | ನಿನ್ನೆ / ನಾಳೆ | Hindi uses कल for both; fine in context? |
| `greetingAfternoon` | नमस्ते | ಶುಭ ಮಧ್ಯಾಹ್ನ | No common Hindi "good afternoon". |
| `statusExcused`, `countExcused` | छुट्टी / छुट्टी पर | ರಜೆ | Excused absence = on leave? |
| `kindTest` vs `kindExam` | टेस्ट / परीक्षा | ಟೆಸ್ಟ್ / ಪರೀಕ್ಷೆ | Glossary gives ಪರೀಕ್ಷೆ for both; ಟೆಸ್ಟ್ used to tell them apart. |
| `kindInternal`, `kindPractical` | आंतरिक / प्रैक्टिकल | ಆಂತರಿಕ / ಪ್ರಾಯೋಗಿಕ | Usual college terms? |
| `newAssessment` | नया मूल्यांकन | ಹೊಸ ಮೌಲ್ಯಮಾಪನ | Too formal? |
| `absentShort` (marks box) | अनु | ಗೈರು | Teachers may simply write AB. |
| `heldOn`, `outOf` | तारीख / कुल अंक | ದಿನಾಂಕ / ಒಟ್ಟು ಅಂಕ | |
| `freeSession` | खुला सेशन | ಮುಕ್ತ ಸೆಷನ್ | Board session with no timetabled class. |
| `preparingTranscript` etc. | ट्रांसक्रिप्ट | ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ | Loan word; not in the glossary. |
| `typeMarksHint` | … Next बटन … | … Next ಬಟನ್ … | The keyboard key label depends on the keyboard. |
| `dueOn` / `dueToday` / `dueTomorrow` | जमा: … | ಸಲ್ಲಿಕೆ: … | Short labels instead of the glossary's "जमा करने की तारीख". |
| `threadPrivacy` | स्कूल प्रबंधन | ಶಾಲೆಯ ಮುಖ್ಯಸ್ಥರು | "School leaders" at a college. |
| `roleAdmin`, `roleAccountant`, `roleLibrarian` | एडमिन / लेखाकार / पुस्तकालयाध्यक्ष | ಆಡಳಿತಾಧಿಕಾರಿ / ಲೆಕ್ಕಿಗರು / ಗ್ರಂಥಪಾಲಕರು | |
| `markAllPresent` | सभी उपस्थित | ಎಲ್ಲರೂ ಹಾಜರು | Button; reads as a statement. |
| `topicsTaught`, `taughtOn`, `topicMarked` | पढ़ाई गई / पढ़ाया / पढ़ाया गया मार्क किया | ಕಲಿಸಲಾಗಿದೆ | "Taught" for syllabus topics; Kannada ವಿಷಯ is both topic and subject (`errorTopicNotInSyllabus`). |
| `statusHandedIn`, `statusReturned`, `returnWork` | जमा किया / लौटाया गया / दोबारा करने के लिए लौटाएँ | ಸಲ್ಲಿಸಲಾಗಿದೆ / ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ | Homework handed in / sent back to redo. |
| `checkWork`, `statusChecked` | जाँचा गया मार्क करें | ಪರಿಶೀಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ | Long for a button; teachers may say "चेक किया". |
| `submissions` | जमा किया गया काम | ಸಲ್ಲಿಕೆಗಳು | |
| `holidayNoClasses`, `calendarEvent` | छुट्टी / कार्यक्रम | ರಜೆ / ಕಾರ್ಯಕ್ರಮ | |
| `teaching` (Profile section) | पढ़ाई | ಬೋಧನೆ | |
| `yearPlan`, `planOnTrack`, `planBehindBy`, `planAhead` | वार्षिक योजना / समय पर / … पीछे / योजना से आगे | ವಾರ್ಷಿಕ ಯೋಜನೆ / ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿದೆ / … ಹಿಂದಿದೆ | Year plan status banner; "on track" wording. |
| `lessonPlan`, `planLesson`, `lessonPlanned` | पाठ योजना / योजना / योजना तैयार | ಪಾಠ ಯೋಜನೆ / ಯೋಜನೆ / ಯೋಜಿಸಲಾಗಿದೆ | Button on the period card; teachers may say "लेसन प्लान". |
| `lessonCheck`, `objectiveHint`, `minutesShortLabel` | समझ की जाँच / विद्यार्थी … कर पाएँगे / मिनट | ಅರ್ಥವಾಗಿದೆಯೇ ಪರಿಶೀಲನೆ / … / ನಿಮಿ | B.Ed. terms for objectives and assessment? |
| `draftWithAi`, `aiDraftLabel`, `aiPreviewNote` | ड्राफ़्ट / नमूना | ಕರಡು / ಮಾದರಿ | "Draft" (ड्राफ़्ट / ಕರಡು) is not in the glossary yet. |
| `weekOf`, `periodsCount`, `planLate` | … वाला हफ़्ता / पीरियड / देर से | … ರ ವಾರ / ಅವಧಿ / ತಡವಾಗಿದೆ | |
