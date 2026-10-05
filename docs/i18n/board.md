# KINETIX Board: Hindi and Kannada

The Board app (`apps/board`) shows its own buttons and messages in English, हिन्दी or ಕನ್ನಡ.
Terms and style follow [glossary.md](glossary.md).

**The Hindi and Kannada strings are a first draft and need review by native speakers who work
in schools and colleges before release.**

## Where the strings are

- `apps/board/lib/l10n/app_en.arb` is the template (with descriptions and placeholders);
  `app_hi.arb` and `app_kn.arb` hold the translations. Plurals and counts use ICU
  (`{count, plural, =1{…} other{…}}`).
- `flutter gen-l10n` (run by `flutter pub get`, settings in `apps/board/l10n.yaml`) writes
  `lib/l10n/gen/`. Code reads strings with `context.l10n` (`lib/l10n/l10n.dart`).
- Dates use intl with `en_IN`, `hi_IN` / `hi`, `kn_IN` / `kn`. The status-strip clock keeps
  "pm" in Latin letters, because intl's Kannada data shortens it to a bare "p".
- The maths solver (`packages/kinetix_math`) writes its working in English.
  `lib/l10n/math_text.dart` translates its steps, answers and errors by pattern; anything it
  does not recognise is shown in English. If the package's wording changes, update the patterns
  (the `Maths solver in Hindi and Kannada` test lists sample problems that must translate fully).
- `test/l10n_test.dart` checks that every key exists in all three files with the same
  placeholders, and pumps the board, popovers, panels and dialogs in each language at
  1920×1080 and 1280×720 with the real fonts.

## Not translated

Content from the server or the catalogue (AI answers, syllabus titles and notes, broadcast
text, 3D model and lab content from `kinetix_3d` / `kinetix_labs`), names, class and subject
names, product and app names (KINETIX, KINETIX AI, KINETIX Cloud, KINETIX ERP, Teacher App,
Student App), ERP menu names quoted in instructions ("Devices → Add board", "Syllabus") and the
Teacher App's "Connect to board" button. Server error messages are shown as the server sends
them.

## Which language the board uses

1. Board settings → Language sets the board's own language (saved like the other settings).
2. When a teacher pairs, the board switches to the teacher's preferred language if it is one of
   the three; when they sign out (or the period ends) it returns to the board's own language.
3. Choosing a language in settings while a teacher is signed in applies at once.
4. KINETIX AI's answer-language menu is separate. Text that goes out with AI content (homework
   built from a quiz or a draft, "Explain …" questions) is written in the AI language.

## Strings to check first

- Class audio (कक्षा की आवाज़, ತರಗತಿ ಧ್ವನಿ) and the Mic on chip (माइक चालू, ಮೈಕ್ ಆನ್).
- Undo / Redo: short loan words अनडू / रीडू and ಅನ್‌ಡು / ರೀಡು fit the toolbar; teachers may
  prefer पहले जैसा करें / ರದ್ದುಗೊಳಿಸಿ.
- Random pick (रैंडम चुनाव, ರ್ಯಾಂಡಮ್ ಆಯ್ಕೆ), Acknowledge on emergencies (पढ़ लिया, ಓದಿದೆ),
  Eye comfort / Dimming (मद्धिम, ಮಂದತೆ), Chalkboard (ब्लैकबोर्ड, ಕಪ್ಪು ಹಲಗೆ).
- Ruler as स्केल / ಸ್ಕೇಲ್ and protractor as चाँदा / ಕೋನಮಾಪಕ.
- Topic: glossary has विषय-वस्तु / ವಿಷಯ; Kannada ವಿಷಯ is also "Subject".
- Syllabus coverage in Books: Mark as taught (पढ़ाया गया मार्क करें, ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ),
  "x of y topics taught" (`booksTaughtCount`), Taught on … (`booksTaughtOn`), Undo reuses
  अनडू / ಅನ್‌ಡು from the toolbar.
- Maths terms (विविक्तकर / ಶೋಧಕ for discriminant, ಸಮಾಸ for expression, ತ್ರಾಪಿಜ್ಯ, ವಜ್ರಾಕೃತಿ):
  check against the state textbooks.
- Quiz option letters stay A–D in every language.
- AI pen (AI पेन, AI ಪೆನ್): *Back to my ink* (मेरी स्याही वापस, ನನ್ನ ಶಾಯಿ ಮರಳಿ), scribble to rub out
  (घिचपिच करें, ಗೀಚಿ), handwriting model (लिखावट मॉडल, ಕೈಬರಹ ಮಾದರಿ).
- Today's plan (आज की योजना, ಇಂದಿನ ಯೋಜನೆ): step timer (चरण टाइमर, ಹಂತ ಟೈಮರ್), Drafted with
  KINETIX AI (`planAiDrafted`), and "Steps · x of y min" (`planStepsOf`).
