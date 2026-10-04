# Parent and Student apps in English, हिन्दी and ಕನ್ನಡ

The Parent App, the Student App and the shared lesson player (`packages/kinetix_lesson`) speak
English, Hindi and Kannada. Terms and style follow [glossary.md](glossary.md).

> **The Hindi and Kannada text is a first draft and needs native review** by people who work in
> Indian schools and colleges before release (see "Needs review" below).

## Where the strings live

| What | Files |
|---|---|
| Parent App (≈300 strings) | `apps/parent/lib/l10n/app_en.arb` (template), `app_hi.arb`, `app_kn.arb`; config `apps/parent/l10n.yaml` |
| Student App (≈350 strings) | `apps/student/lib/l10n/app_en.arb` (template), `app_hi.arb`, `app_kn.arb`; config `apps/student/l10n.yaml` |
| Lesson player (≈25 strings) | `packages/kinetix_lesson/lib/src/l10n.dart` (`LessonStrings`, one class per language) |

- The apps use Flutter gen-l10n (`flutter: generate: true`); `flutter pub get` / `flutter gen-l10n`
  regenerates `lib/l10n/app_localizations*.dart`. Plurals and placeholders are ICU messages; the
  English ARB carries the placeholder types.
- Helpers are in each app's `lib/l10n/l10n.dart`: `context.l10n` (strings), `context.fmt`
  (dates and money, `core/format.dart`), `context.errorText(e)` (errors), `AppLanguage`, and the
  enum labels (attendance status, assessment kind, payment method).
- `LessonStrings.delegate` is registered in both apps. Without it, `LessonStrings.of(context)`
  still follows the ambient locale, so the Teacher App gets the right language too.

## Rules

- **Server content is not translated**: names, class and subject names, homework and fee titles,
  syllabus text, KINETIX AI answers, messages, and notification titles/bodies (the server writes
  those in the recipient's `preferredLanguage`). Validation messages from the server are shown as
  sent; the app's own errors (offline, timeout, wrong password, wrong account type, 404/429/5xx)
  are translated.
- **Dates**: intl with `en_IN` / `hi_IN` / `kn_IN` ("Thu 1 Oct", "गुरु 1 अक्तू॰", "ಗುರು 1 ಅಕ್ಟೋ").
  Times are "2:05 pm" in every language (Kannada's CLDR marker is a bare "a"/"p"). Note that
  `en_IN` abbreviates September as "Sept".
- **Numbers**: Western digits everywhere; money is always Indian grouping (`₹1,23,456`), also in
  Kannada (whose intl number pattern is Western grouping).
- Keep in Latin script: KINETIX, KINETIX AI, app names (KINETIX Parent / Teacher), OTP, UPI,
  roll numbers, class and subject names.

## Language choice

1. Before sign-in: the device's first language among en/hi/kn, else English.
2. Signed in: the account's `preferredLanguage` from `GET /v1/me`.
3. Profile → Settings → Language (English / हिन्दी / ಕನ್ನಡ) overrides it on this phone (pref
   `language`) and is saved to the account with `PATCH /v1/me {preferredLanguage}` so updates and
   push lines arrive in it. The save is fire-and-forget; if it fails (`language_unsynced`), it is
   retried quietly on the next start or sign-in.
4. Student App: "KINETIX AI answers in" stays a separate setting; until the student picks one it
   follows the app language.

## Layout

Tested at 360×640 and 430×932 with text ×1.0 and ×1.3 in all three languages
(`apps/*/test/i18n_test.dart`, `packages/kinetix_lesson/test/lesson_l10n_test.dart`). Changes made
for longer Hindi/Kannada text: pills wrap to two lines; the attendance day header, notification
time and fees-card buttons wrap; the Parent "Mark all as read" is an icon with a tooltip; the
live-class ended card stays clear of the top bar; the Parent sign-in brand row wraps at 2× text.

## Needs review

Please check in particular:

- Hindi "कल" is used for both yesterday and tomorrow (as phones commonly do); the due chips say
  "कल जमा करना है", so context disambiguates.
- "Overdue" for fees: "तारीख निकल गई" / "ಗಡುವು ಮೀರಿದೆ"; "Excused": "छुट्टी मंज़ूर" / "ಅನುಮತಿ ರಜೆ".
- Kannada "Test" is "ಟೆಸ್ಟ್" (glossary has ಪರೀಕ್ಷೆ for both test and exam) to keep the two apart.
- "Transcript": "ट्रांसक्रिप्ट" / "ಪ್ರತಿಲಿಪಿ"; "Program": "कोर्स" / "ಕೋರ್ಸ್";
  "Undergraduate/Postgraduate": "स्नातक/स्नातकोत्तर" / "ಪದವಿ/ಸ್ನಾತಕೋತ್ತರ".
- The question hint "forfeiture of shares": "शेयरों का हरण" / "ಷೇರುಗಳ ಮುಟ್ಟುಗೋಲು" (textbooks may use "अंशों का हरण").
- Greetings: "नमस्ते" for good afternoon; "शुभ संध्या", "ಶುಭ ಮಧ್ಯಾಹ್ನ".
- Kannada date suffixes written apart from the date ("ಶುಕ್ರ 9 ಅಕ್ಟೋ ರೊಳಗೆ").
- "LIVE" badge: "लाइव" / "ಲೈವ್"; "Learn" tab: "सीखें" / "ಕಲಿಯಿರಿ".
- Live class audio: "Teacher's mic is on/off" ("शिक्षक का माइक चालू/बंद है" / "ಶಿಕ್ಷಕರ ಮೈಕ್ ಆನ್/ಆಫ್ ಆಗಿದೆ"); Mute: "कक्षा की आवाज़ बंद करें" / "ತರಗತಿಯ ಧ್ವನಿ ಮ್ಯೂಟ್ ಮಾಡಿ".
- Privacy (consent) screens and the notice (docs/product/privacy-notice.md): the purpose
  texts, "If you say no", "Who decides" and the grievance-officer line ("शिकायत अधिकारी" /
  "ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ") are a first draft and need legal as well as native review.
  "Privacy": "गोपनीयता" / "ಗೌಪ್ಯತೆ"; "Allow all": "सबकी अनुमति दें" / "ಎಲ್ಲವನ್ನೂ ಅನುಮತಿಸಿ".
- Homework hand-in: "Hand in" "जमा करें" / "ಸಲ್ಲಿಸಿ"; "Returned to redo" "दोबारा करने के लिए
  लौटाया" / "ಮತ್ತೆ ಮಾಡಲು ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ"; "Checked" "जाँचा गया" / "ಪರಿಶೀಲಿಸಲಾಗಿದೆ".
- Calendar: "Holiday" "छुट्टी" / "ರಜೆ"; "Event" "कार्यक्रम" / "ಕಾರ್ಯಕ್ರಮ"; "Coming up"
  "आने वाले" / "ಮುಂಬರುವವು"; Hindi "कल छुट्टी है" (tomorrow) relies on context like the due chips.
- Syllabus progress: "12 of 30 topics taught" uses "विषय-वस्तु" / "ವಿಷಯ" for topic, as in the
  glossary (Kannada ವಿಷಯ is also "subject").
- Error texts now come from the server's error `code` (services/api common/error-codes.ts) in
  both apps (`describeErrorCode` in `lib/l10n/l10n.dart`); the server's English message is the
  fallback for codes without words of their own (validation messages).

### Year plan wording (needs native review)

| English | Hindi | Kannada |
|---|---|---|
| This week in class | इस हफ़्ते कक्षा में | ಈ ವಾರ ತರಗತಿಯಲ್ಲಿ |
| Class is on schedule | कक्षा योजना के अनुसार चल रही है | ತರಗತಿ ಯೋಜನೆಯಂತೆ ನಡೆಯುತ್ತಿದೆ |
| Class is N topics behind the plan | कक्षा योजना से N विषय-वस्तु पीछे है | ತರಗತಿ ಯೋಜನೆಗಿಂತ N ವಿಷಯಗಳಷ್ಟು ಹಿಂದಿದೆ |
| Coming up in class (least certain; short for a card title) | कक्षा में आगे | ತರಗತಿಯಲ್ಲಿ ಮುಂದೆ |
