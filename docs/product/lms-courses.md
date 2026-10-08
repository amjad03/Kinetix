# LMS: course shells and gradebook

One **course** per class and subject (`lms_courses`, unique on section + subject). A course has ordered **modules**, each with ordered **items**, plus **announcements**.

- **Items** link to what already exists: a syllabus `topic`, a concept `video`, a `homework` or an `assessment` of the same class and subject (checked on save), or carry a `url` for a `file` or `link`.
- **Draft / published.** Families see only published courses.
- **Who manages:** principal and administrator; the head of the subject's department; a teacher who has the class and subject in the timetable. Students and guardians read only (`GET /v1/lms/my`, `GET /v1/lms/courses/:id?studentId=`).

## Gradebook

Per course the teacher sets up to ten **weighted categories** (weights total 100). A category counts either homework handed in (share of the class's homework the student submitted) or the marks of assessments of one kind (`test`, `assignment`, `internal`, `exam`, `practical`: effective marks, moderated when present; absent is skipped). The running grade is the weighted average over categories that have data, so a category with nothing graded yet does not pull the grade down. Letters: A+ 90, A 80, B 70, C 60, D 50, else F.

- Students and families see only **published** assessments; the teacher's gradebook shows everything entered.
- **Overrides:** a teacher can replace one student's category percentage with a required reason. Every change (old value, new value, reason) goes to the audit log as `lms.grade_override`. An empty percentage removes the override.
- **CSV:** `GET /v1/lms/courses/:id/gradebook.csv`.

## Screens

- ERP (heads of department and leaders): Courses list, course page (modules, content, announcements, publish) and Gradebook page (categories, overrides, CSV). Teachers manage the same data through the API; they have no ERP login.
- Student App: My Learning has a Courses tab (course cards with the grade, then modules, announcements and the grade breakdown).
- Parent App: Profile has Course grades for each child.

Not built: reordering by drag and drop, file upload into a course (links only), quizzes and discussion forums, per-student pacing and completion tracking.
