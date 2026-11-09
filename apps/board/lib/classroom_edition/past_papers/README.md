# Past papers (Classroom edition class tool)

Class tools → **Past papers**: a library of KCET, NEET, JEE Main, JEE Advanced, COMEDK, II PUC,
I PUC, CBSE XII and CBSE XI papers on the board itself. Offline, no AI, no camera, and by roll
number only.

| Piece | File |
| --- | --- |
| Exams, the timer's defaults and the marking (one table, `examRules`) | `exam_rules.dart` |
| Paper, question, question set, filters | `paper_model.dart` |
| Files in app storage (`<app support>/past_papers/`), in memory for tests | `paper_storage.dart` |
| The library: index, import of PDFs and packs, duplicates by SHA-256, bundled packs | `paper_library.dart` |
| Paper packs: read, validate, write | `paper_pack.dart` |
| First guess from a file name ("NEET_2023_Physics_key.pdf") | `filename_guess.dart` |
| Add papers (PIN, system file picker, the form, progress, report) | `paper_import.dart` |
| PDF pages drawn with PDFium (`pdfrx`, the board's PDF renderer) and cached | `pdf_pages.dart`, `page_cache.dart` |
| Full-screen viewer, answer key side by side or on top, Put page on board | `paper_viewer.dart` |
| Exam timer (`ExamCountdown`) | `exam_timer.dart` |
| Practice and the class quiz from a paper | `practice.dart` (+ `PresetQuiz` in `class_tools/quiz_view.dart`) |
| The tool: library, a paper, practice setup | `past_papers_view.dart` |
| Settings → College and PIN → Past papers → Add papers | `papers_settings.dart` |

## Storage

```
<app support>/past_papers/
  index.json                      the library (below)
  papers/<id>/paper.pdf           <id>: the first 12 hex digits of the paper PDF's SHA-256
  papers/<id>/key.pdf             its answer key (optional)
  papers/<id>/questions.json      its question set (optional; the format below)
  papers/<id>/images/<n>.png|jpg  the question set's pictures
```

`index.json`:

```json
{
  "version": 1,
  "papers": [
    {
      "id": "3f2a9c01b7de", "exam": "neet", "year": 2099, "session": "Shift 1",
      "subjects": ["Physics", "Chemistry", "Biology"], "language": "English",
      "source": "Made up for tests",
      "paper": "papers/3f2a9c01b7de/paper.pdf", "paperHash": "<sha256>",
      "answerKey": "papers/3f2a9c01b7de/key.pdf", "keyHash": "<sha256>",
      "questions": "papers/3f2a9c01b7de/questions.json", "questionCount": 3,
      "pages": 4, "pack": "sample-pack", "added": "2026-11-09T10:05:00.000"
    }
  ],
  "bundled": ["assets/private/past_papers/kea-kcet.zip"]
}
```

Every file is written next to itself first (`.part`) and then renamed, so a pulled plug never
leaves half an index. A PDF (paper or key) whose SHA-256 is already in the library is skipped.

## The paper pack, version 1

A `.zip` (any name) with `manifest.json` at its root, and the files it names (paths relative to
the zip's root; no `..`, no leading `/`, no backslashes):

```
manifest.json
neet-2099/paper.pdf
neet-2099/key.pdf
neet-2099/questions.json
neet-2099/q2.png
kcet-2099-physics/paper.pdf
```

`manifest.json`:

```json
{
  "format": "zynetix-paper-pack",
  "version": 1,
  "id": "sample-pack",
  "title": "Sample papers",
  "publisher": "Who put the pack together",
  "papers": [
    {
      "id": "neet-2099",
      "exam": "neet",
      "year": 2099,
      "session": "Shift 1",
      "subjects": ["Physics", "Chemistry", "Biology"],
      "language": "English",
      "source": "Where the paper is from (shown as \"Source: …\")",
      "paper": "neet-2099/paper.pdf",
      "answerKey": "neet-2099/key.pdf",
      "questions": "neet-2099/questions.json"
    }
  ]
}
```

* `exam`: `kcet`, `neet`, `jee-main`, `jee-advanced`, `comedk`, `puc2` (II PUC), `puc1` (I PUC),
  `cbse12`, `cbse11` (the labels, e.g. `"JEE Main"`, are read too).
* Required: `format`, `version`, `papers`, and per paper `exam`, `year` and `paper`.
  `answerKey`, `questions`, `session`, `subjects`, `language` (default English) and `source`
  are optional.
* A board reads packs up to its `packVersion` (1) and refuses newer ones with "This paper pack
  is for a newer Zynetix Board". A version 2 must keep version 1's fields, or change `format`.
* A paper with a problem (unknown exam, missing or non-PDF file, a bad question) is left out
  and named in the import report; the pack's other papers still come in. Importing a pack again
  skips what is already there, but adds a key or question set the library's copy lacks.

`questions.json` (the question set; also the format stored in app storage):

```json
{
  "version": 1,
  "questions": [
    {
      "n": 1, "section": "A", "subject": "Physics", "chapter": "Electrostatics",
      "stem": "Which made-up quantity ...?",
      "options": ["one", "two", "three", "four"],
      "answer": "B",
      "marks": 4, "negative": 1
    },
    { "n": 2, "chapter": "Optics", "image": "neet-2099/q2.png", "options": ["A", "B", "C", "D"], "answer": ["A", "C"] },
    { "n": 3, "chapter": "Motion", "crop": { "page": 2, "rect": [0.08, 0.12, 0.84, 0.25] }, "answer": "12.5" }
  ]
}
```

* `n` is required, and the question needs a `stem`, an `image` (PNG or JPEG in the zip) or a
  `crop` (a part of the paper's own page: `page` from 1, `rect` = left, top, width, height as
  0…1 of the page).
* With `options`, `answer` is a letter (`"B"`) or a list of letters for "one or more correct".
  Without options it is the numerical answer, as text (`"12.5"`).
* `marks` and `negative` override the exam's marking (`examRules`) for that question (JEE
  Advanced's sections differ). `negative` is the marks taken away for a wrong answer.

## Bundled packs

Packs built into the app come from `apps/board/assets/private/past_papers/*.zip`, which is
**gitignored** (exam papers are never committed). The folder is optional: to bundle packs, create
it and add `- assets/private/past_papers/` to `pubspec.yaml`'s assets (Flutter refuses a listed
folder that is missing, so it is not listed by default). On first open the tool imports any
bundled pack it has not imported before (`PaperLibrary.importBundled`, remembered in
`index.json`'s `bundled`).

## Marking and time (`examRules`)

| Exam | Time | Right | Wrong |
| --- | --- | --- | --- |
| NEET | 3 h 20 min | +4 | −1 |
| JEE Main | 3 h | +4 | −1 |
| JEE Advanced | 3 h per paper | +3 (questions set their own) | −1 |
| KCET | 80 min per subject | +1 | 0 |
| COMEDK | 3 h | +1 | 0 |
| II PUC, I PUC | 3 h 15 min (with 15 min reading) | +1 | 0 |
| CBSE XII, CBSE XI | 3 h | +1 | 0 |

Check these against the current year's notification before a full rehearsal.

## Class quiz from a paper

`paperQuiz` turns the chosen questions into a `PresetQuiz` for the existing class quiz
(`class_tools/quiz_view.dart`): each question on a new board page (the question's picture when
it has one), roll numbers tapped right or wrong, a `QuizRecord` per question (chapter: the
bank's chapter whose title matches the tag, else the tag) and, at the end, a `MockRecord` with
each present roll number's score under the exam's marking. Numerical and "more than one right"
questions are left out of the class quiz (they work in Practise).

## Tests

`test/classroom_edition/past_papers_test.dart` (index, import with generated PDFs, packs,
duplicates, filters, the file-name guess, the timer, scoring, the screens) and
`past_papers_shots_test.dart` (screenshots when `PAPERS_SHOTS=<dir>` is set). The fixtures are
made in the test with the `pdf` package; none is a real exam paper.
