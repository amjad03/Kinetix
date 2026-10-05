# Content library

KINETIX produces its own course material for every board it serves (CBSE/NCERT, ICSE, state
boards, Bangalore University and other universities). The library is **global**: one copy shared
by every institution. Institutions add their own chapters and topics **on top**; those are
private to them.

## Model

| Table | Global or per institution | Notes |
|---|---|---|
| `curricula` | global | `cbse`, `icse`, `ka-state`, `early-years`, `bu-ug`, `bu-pg`… matches `programs.curriculum_code` |
| `courses` | global | a subject in a class or semester, e.g. "Corporate Accounting, BCom Semester 3"; `reviewed` marks content checked by the curriculum team |
| `chapters`, `topics` | both | `tenant_id` null for the library, set for an institution's own rows |
| `subjects.course_id` | per institution | links the institution's subject to the course it follows |

Topics carry a teacher-facing `summary`, `notes` (key facts, definitions and formulas),
`outcomes`, `resources` (3D models and labs for the board) and `lesson`: the hook, worked example,
activity, questions with answers, homework and key terms, with Kannada and Hindi versions
(`lesson.kn`, `lesson.hi`, which also carry the topic's title, notes and outcomes in that
language). **Notes are what KINETIX AI is grounded in**, so they must be correct; the lesson's
terms and example (and for lesson plans its hook and activity) are added to the grounding too.

Course `term` is the class (K-12) or semester; LKG and UKG are classes -1 and 0.

Row-level security: `chapters` and `topics` have the usual tenant policy plus a read-only
`global_read` policy for rows with no tenant. The application role can only read `curricula`
and `courses`. The library is written by the import script on the owner connection.

## Import

`services/api/content/*.json`, one file per curriculum, loaded by `pnpm content:import` (also run
by `pnpm db:seed`). Courses match by curriculum and code, chapters and topics by title and then
position, and only changed rows are written, so ids stay stable (coverage, plans and videos refer
to topics) and institutions' additions survive re-imports. Global rows no longer in the files are
removed, with what refers to them.

CBSE (Classes 1–10), ICSE (9–10), Karnataka State (1–10) and early years (LKG, UKG) are
converted from the KINETIX prototype's lesson library by
`services/api/scripts/convert-prototype-syllabus.ts`: 187 books, one topic per chapter lesson
(2,573), all `reviewed: false` until a subject teacher checks them. See
`services/api/content/README.md`. Bangalore University is a hand-written sample.

## API

| Route | Who |
|---|---|
| `GET /v1/content/curricula`, `/courses?curriculum&term`, `/courses/:id`, `/topics/:id`, `/search?q&courseId` | anyone signed in, boards |
| `GET /v1/content/syllabus` | the board (its open class) or `?subjectId=` |
| `POST /v1/content/courses/:id/chapters`, `POST /v1/content/chapters/:id/topics`, `PATCH`/`DELETE /v1/content/topics/:id` | teaching staff, admins (own rows only) |
| `PUT /v1/admin/subjects/:id/course` | principal, admin |

## Concept videos

Short explainers from the KINETIX YouTube channel, linked to **global** topics by the KINETIX
platform team (not by institutions) and shown to every institution: on the board when a period
starts (and from its Concept videos button), and on the Student App's topic page.

- `concept_videos` keeps only the YouTube id, a title, the language, the duration (when known) and
  the order. The apps play videos with YouTube's embedded player (youtube-nocookie.com) in a
  WebView; nothing is downloaded or cached (YouTube's terms).
- Ordering: the class's language first (`?lang=`, else the course's language), then English, then
  the rest; the platform team's order within each language.
- The platform team is the `platform_admins` table (users of KINETIX's own institution). The app
  role cannot read it and may only read `concept_videos`; the platform endpoints write through the
  owner role behind `PlatformAdminGuard`. Manage the team with
  `pnpm platform:admin add|remove|list --tenant <slug> --login <email or mobile>` (Docker:
  `kinetix-api platform-admin …`). The demo seed puts `admin@demo.kinetix.in` on the team.
- Titles come from YouTube's oEmbed (no key). With `YOUTUBE_API_KEY` the platform also reads
  durations and imports playlists (playlistItems.list, one quota unit per 50 videos), guessing each
  video's topic in the chosen chapter by title keywords.

| Route | Who |
|---|---|
| `GET /v1/content/topics/:id/videos?lang` | anyone signed in, boards |
| `GET /v1/devices/me/concept-videos?lang` | boards: the open class's period, else the current or next one today (the teacher's, or the room's); topic from the lesson plan, else the year plan's week, else the next untaught syllabus topic |
| `/v1/platform/…`: library tree and search, a topic's videos (add, edit, delete, reorder), playlist preview and import | the platform team |

## AI grounding

When the board asks KINETIX AI anything, the gateway finds the open class's course, matches the
request against topic titles, chapters and summaries (keyword overlap, strong matches only), and
adds those topics' notes to the system prompt. The response's `meta.sources` names the topics so
the board can show "Based on: Methods of valuing goodwill". A teacher can also pick a topic
explicitly (`topicId`). Embedding search replaces keyword matching once the library is large.

## Next

- Translation workflow for the Hindi and Kannada lesson versions; review workflow for the
  imported lessons.
- Splitting chapter lessons into finer topics where a subject teacher wants them.
- Year plans and syllabus coverage per class.
