# KINETIX content library (seed data)

Global curriculum content shared by every institution: curricula, courses, chapters and
topics. Topic `notes` are the key facts, definitions and formulas that KINETIX AI is given as
grounding, so they must be correct; `outcomes` are what students should be able to do;
`lesson` is the rest of the lesson (hook, worked example, activity, questions with answers,
homework, key terms) with Kannada and Hindi versions (`lesson.kn`, `lesson.hi`) where written.

- One JSON file per curriculum. `pnpm content:import` loads them all (idempotent: courses are
  matched by curriculum + code, chapters and topics by title and then position; only changed
  rows are written, so topic ids stay stable for coverage, plans and videos). A course must
  live in one file only.
- `"reviewed": false` marks drafts that the curriculum team has not yet checked against the
  official syllabus. Apps show unreviewed content to teachers only.
- Institutions add their own chapters and topics on top through the API; those never live here.

## Files

| File | Curriculum | What |
|---|---|---|
| `cbse.json` | `cbse` | 55 NCERT books, Classes 1–10, 670 chapter lessons |
| `icse.json` | `icse` | 40 CISCE syllabus subjects, Classes 9–10, 409 lessons |
| `ka-state.json` | `ka-state` | 80 KTBS books, Classes 1–10, 1,394 lessons (585 also in Kannada) |
| `early-years.json` | `early-years` | KINETIX's LKG and UKG curriculum (classes -1 and 0), 100 lessons |
| `bu-*.json` | `bu-ug`, `bu-pg` | Bangalore University programmes (BCA, BCom, …), one file per programme |
| `kslu-*.json` | `kslu-law` | Karnataka State Law University law programmes |

The `bu-*` and `kslu-*` files are **generated** from the hand-written sources in
`sources/*.txt` by `scripts/build-syllabus.ts` (`pnpm --filter @kinetix/api content:build-syllabus`);
edit the sources, not the JSON. The source format is described at the top of the script. Every
course names its scheme and academic year in `source` and is `reviewed: false` until faculty check
it; `sources/REVIEW.md` (generated from the sources' `!` lines) lists what to check. A test keeps the
JSON in step with the sources and checks every topic's shape and lab and 3D ids.

The first four are **generated** from the KINETIX prototype by
`scripts/convert-prototype-syllabus.ts`; do not edit them by hand. Every course is marked
`source: "kinetix-curriculum-team (prototype import)"` and `reviewed: false` until a subject
teacher has reviewed it. Each chapter's lesson is one topic (title = the chapter's); chapter
titles are from the NCERT/KTBS books' contents pages. Topic resources link the prototype's 3D
models (`model3d`, ids as in `packages/kinetix_3d`) and virtual labs (`lab`, matched by the
prototype's lab keywords, science and maths only; ids as in `packages/kinetix_labs`). The
prototype's simulations are not carried over.

To regenerate (after the prototype's `python3 tools/syllabus/build.py`):

    pnpm --filter @kinetix/api content:convert-prototype /path/to/kinetix_old_local

## Loading

- Local: `pnpm --filter @kinetix/api content:import` (also run by `pnpm db:seed` and by the
  test setup). Needs migrations up to `0035_topic_lessons`.
- Deployed: the image ships this folder; run the `content-import` mode once after `migrate`
  (see docs/operations/deploy.md). Safe to re-run after every release.
