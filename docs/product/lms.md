# LMS: user guide

The ZYNETIX LMS is one course space per class and subject, built on what the institution already keeps: the
timetable decides who teaches it, homework and internal assessments feed its gradebook, quiz questions carry their
course outcomes into OBE attainment, and live classes become the period's attendance. This guide covers what each
person does; [lms-courses.md](lms-courses.md) has the course shell and gradebook rules in detail.

## Who does what

| Person | Where | What |
| --- | --- | --- |
| Teacher of the class | Teacher App → Profile → **Courses (LMS)** | Content (lesson pages, links), publish, live classes and attendance from joins, students at risk, the discussion queue, quizzes: flagged attempts, hand marking, **Send best scores to internal marks** |
| Head of department, principal, administrator | ERP → **Courses** | Everything the teacher does, plus completion rules, certificates, the LMS overview, NAAC 2.3.2 evidence and learning paths. Principal and administrator change the **LMS rules** |
| IQAC (quality officer) | API `GET /v1/lms/overview`, `/v1/lms/reports/evidence` | The overview and the evidence table |
| Student | Student App → My Learning → **Courses** | Live classes with **Join**, progress, lesson pages (also offline), **Mark as done**, interactive (SCORM/cmi5) lessons, **Get my certificate**, certificates and learning paths, quizzes with the rules shown |
| Parent | Parent App → child → **Grades** | Each course's grade, progress, last activity, live classes attended, why a course **needs attention**, certificates earned |

## Content

A module holds items. Each item has a **completion rule**:

- **Opened**: done when the student opens it (lesson pages, notes, videos).
- **Marked as done**: the student taps **Mark as done** (readings, links).
- **Passed**: done when the student passes it (quizzes at the item's or the quiz's pass mark, SCORM and cmi5 packages by
  their score or status). A passed item cannot be ticked off by hand.

Item kinds: lesson page (text written in ZYNETIX, kept on the phone), video, file, PDF, slides, link, SCORM package,
quiz, live class, syllabus topic, homework, internal assessment, worksheet, case study, simulation, virtual lab. Web
addresses must be `https://` or `http://` (no `javascript:` links). Every item can also have a **release date**, a
**prerequisite item**, and an **audience** (for remedial work: **Assign to slow learners** picks the class's slow
learners by the institution's rule). Items can be moved up and down and between modules; the order is saved for the
whole course at once.

**Low bandwidth.** Each item can say how many minutes it takes and how large it is (KB), shown to the student before
they open it. The Student App keeps every published course (lesson text included) on the phone; without a connection
the courses open from that copy, and what the student opens or marks done is sent when the connection returns
(applied as of when it happened; sending twice changes nothing).

## Completion, prerequisites, certificates and paths

**Completion rules** (course page → **Completion rules**): the share of the released items to finish (default 100%,
the demo uses 80%), an optional lowest grade, and whether the course gives a certificate. A course can name **courses
to finish first**: until they are complete, its content shows locked.

**Certificates.** The course's **Completion and certificates** tab lists each student's items done, grade and
certificate. **Issue certificates** issues one to every student who meets the rules and does not have one; the others
are listed with what they still miss. When the institution allows it, a student who qualifies takes their own
(**Get my certificate**). Certificates are recorded in the document register: a serial (`CC/…`), a PDF from the
institution's certificate template, and a QR code anyone can check on the verification page. A certificate can be
revoked with a reason (principal, administrator, head of department); its QR then says so.

**Learning paths** (ERP → Courses → **LMS overview** → **Learning paths**): up to three courses in order for a
programme or a class, the first required. When the required courses are complete the path is complete, and its
certificate (if it gives one) can be taken.

## Quizzes

On top of the question pool, the draw, the time limit and attempts:

- **Negative marking**: a share of a question's marks (or its own negative marks) off a wrong choice answer; a blank
  answer loses nothing; short answers are never marked negative; an attempt never goes below zero.
- **Shuffled options**: each student sees the options of a choice question in their own order; answers are mapped
  back when marking.
- **Proctoring**: *off*, *record* (the quiz page or app reports leaving the quiz, switching tabs, copy and paste;
  the teacher sees each attempt's log and count, and attempts over the limit are flagged), or *strict* (also submits
  the attempt as it stands after that many). Network changes are logged but not counted.
- **Answer review**: never, after the student submits, or after the quiz closes.
- **Pass mark**: used by the course item's completion and shown with the result.
- **Send best scores to internal marks**: each student's best score becomes a draft test in the internal-marks register
  (absent without an attempt); sending again updates the draft until it is submitted there.
- The gradebook can have a **Quizzes** category (best attempt per quiz).

## Assignments

Late policy, cut-off, attempts, extensions, groups and the push to internal marks are as before. New:

- **Rubric marking**: with a rubric chosen for the assignment, the teacher picks a level per criterion; the points are
  scaled to the maximum marks, less any late penalty, and kept with the hand-in.
- **Plagiarism check**: every typed hand-in is compared with the class's other hand-ins of the same homework (group mates
  excepted) as it arrives; the highest similarity is shown on each submission, and the teacher is told when it crosses
  the institution's threshold (default 40%). Each hand-in is also announced as `homework.submission_received` for an
  external checker connected through the integrations. A flag is a prompt to look, never a finding; the full report
  (pairs and shared phrases, also against last year's work) is on the integrity page.

## Live classes

Course page → **Live classes** → **Schedule a live class**: title, start, length and the meeting link (Google Meet,
Zoom, Microsoft Teams, Jitsi, Webex or any other https link). The class and families are told. Students see it in
the app and can join from 15 minutes before the start until the end: **Join** records the join (first and last time,
how many times) and opens the meeting. After the start, **Attendance from joins** suggests present (joined by the
start), late (more than the institution's grace minutes after), or absent; **Save as attendance** writes the period's
attendance (the live class must be linked to its timetable period).

## Discussions

Members of the class start discussions and reply; the author of a discussion is told about replies. Teachers pin,
lock and hide. New:

- **Pre-moderation** (LMS rule): a student's new discussion or reply waits for a teacher's approval.
- **Report**: a member reports a discussion or a reply (abusive, spam, off topic, cheating, other); the class's
  teachers are told; after the institution's number of reports the post is held for review.
- **Moderation queue** (course page → **Moderation**; Teacher App → course → **Moderation**): held and reported posts
  with the reasons; **Approve**, **Hide** or **Dismiss reports**.
- Authors can edit their reply for the institution's edit window (default 15 minutes) or withdraw it.

## Analytics and evidence

- **At risk** (course page → **At risk**; Teacher App): per student, the reasons by the institution's thresholds:
  inactive for N days, opening less than N% of the items, quizzes averaging below N%, N or more homework overdue,
  missing most live classes. One reason is low risk, two medium, three or more high.
- **LMS overview** (ERP → Courses → **LMS overview**): published courses, learners active this week and month,
  content and completions, quiz attempts and flagged ones, live classes and joins, forum posts and open reports,
  certificates, paths, content by kind.
- **NAAC 2.3.2 evidence**: per teacher, courses on the LMS, e-content by kind, quizzes, live classes, forum posts and
  learners reached, whether they use the LMS, and the percentage of teachers using it (NAAC 2.3.2; also the NBA
  teaching-learning evidence). **Download CSV** for the upload.
- The parent's view and a mentor's view of one student: `GET /v1/lms/students/:id/summary`.

## SCORM, cmi5 and xAPI

Upload a SCORM 1.2 / 2004 zip (with `imsmanifest.xml`) or a cmi5 zip (with `cmi5.xml`; the first assignable unit is
used, its url must be inside the zip) under Integrations → SCORM, then add it to a module as a **SCORM package** item.
Students open it from the app; their progress, score and status are tracked and complete the course item by its rule.
cmi5 units report through ZYNETIX's xAPI endpoint (`/v1/xapi/`): statements, state documents and LMS.LaunchData;
the unit's moveOn rule decides completion.

Packages are untrusted code. They are served only from a separate content host (`SCORM_CONTENT_ORIGIN`, required in
production), in a sandbox with no access to ZYNETIX cookies, storage or pages, and with their own signed links that
name no learner (see SECURITY_AUDIT O18).

## LMS rules (principal, administrator)

ERP → Courses → **LMS overview** → **Settings**: discussion posts (appear at once / wait for a teacher), hide after N
reports, edit window, plagiarism check on hand-in and its threshold, the four at-risk thresholds, the live-class grace
minutes, and whether students take their own certificate.

## API

| Area | Endpoints (all under `/v1/lms` unless shown) |
| --- | --- |
| Authoring | `PATCH items/:id`, `PATCH modules/:id`, `PUT courses/:id/order`, `PATCH courses/:id/completion` |
| Offline | `GET my/offline` (ETag, 304), `POST my/progress/sync` |
| Live | `POST/GET courses/:id/live`, `PATCH live/:id`, `POST live/:id/join`, `GET/POST live/:id/attendance`, `GET my-live` |
| Forum | `POST forum/:threadId/report`, `GET courses/:id/forum/queue`, `POST forum/moderation`, `PATCH forum/posts/:id`, `POST forum/posts/:id/withdraw` |
| Quizzes | `POST quiz-attempts/:id/events`, `GET quiz-attempts/:id/events`, `GET quiz-attempts/:id/review`, `POST quizzes/:id/push-marks` |
| Certificates and paths | `GET/POST courses/:id/certificates`, `POST courses/:id/certificate/claim`, `GET my/certificates`, `GET lms-certificates/:id/pdf`, `POST lms-certificates/:id/revoke`, `GET/POST paths`, `PATCH paths/:id`, `GET my/paths`, `POST paths/:id/claim` |
| Analytics | `GET courses/:id/at-risk`, `GET overview`, `GET reports/evidence[?format=csv]`, `GET students/:id/summary` |
| Settings | `GET/PUT settings` |
| Assignments | `GET /v1/homework/:id/rubric`, `PUT /v1/homework/:id/rubric-marks` |
| Packages | `/v1/scorm/*` (player, content, track), `/v1/xapi/*` (fetch, statements, activities/state) |
