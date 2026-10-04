# KINETIX content library (seed data)

Global curriculum content shared by every institution: curricula, courses, chapters and
topics. Topic `notes` are the key facts, definitions and formulas that KINETIX AI is given as
grounding, so they must be correct; `outcomes` are what students should be able to do.

- One JSON file per curriculum. `pnpm content:import` loads them (idempotent: courses are
  matched by curriculum + code, chapters and topics by position).
- `"reviewed": false` marks drafts that the curriculum team has not yet checked against the
  official syllabus. Apps show unreviewed content to teachers only.
- Institutions add their own chapters and topics on top through the API; those never live here.

The files here are a starting sample (Bangalore University BCom/BCA, CBSE Class 10), not the
full library.
