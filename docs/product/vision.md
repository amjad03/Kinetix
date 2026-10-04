# KINETIX: product vision and scope

## One sentence

KINETIX turns any classroom screen into an AI teaching board, and connects what happens in
that room to every student's record, every parent's phone and the principal's dashboard.

## Who it serves

| Segment | Examples | What differs |
|---|---|---|
| K-12 schools | CBSE, ICSE/ISC, Karnataka State Board (KSEAB), other state boards | Grades & sections, homeroom teachers, parents are central |
| Colleges (UG/PG) | Bangalore University–affiliated colleges (**pilot**), autonomous colleges | Programs, semesters, credits, electives, internal assessment, placement readiness |
| Universities | Departments, multiple campuses, affiliated colleges | Multi-campus tenants, university-level syllabus authority |

The **pilot is a UG + PG college affiliated to Bangalore University**. So the first data
model must handle programs, semesters, electives and internal assessment. Grade/section-only
K-12 models won't do. K-12 is the same model with "grade" in place of "semester".

## Ecosystem

```
                 ┌──────────────────────── KINETIX Cloud (AWS ap-south-1, Mumbai) ──────────────────────┐
                 │  Identity & tenancy · Academic core · Content library · Sync · Realtime · AI · Files │
                 └───────▲──────────────▲───────────────▲───────────────▲───────────────▲───────────────┘
                         │              │               │               │               │
                  KINETIX Board     KINETIX ERP     Teacher App     Student App     Parent App
                  (classroom)       (web: admin,    (attendance,    (recordings,    (alerts, fees,
                                    principal,      homework,       AI tutor,       progress,
                                    content team)   board pairing)  library)        concerns)
```

## Principles

1. **Offline first.** A classroom never waits for the internet. Everything works offline and syncs later.
2. **The ERP is the single source of truth.** The Board, the apps and the dashboards all read the same records.
3. **Every classroom moment becomes data.** Answers, attendance, syllabus coverage and recordings flow into each student's profile.
4. **Teachers new to technology come first.** Guided tour, practice board, simple mode, contextual help.
5. **India-only data.** Every byte, including AI inference, stays in Indian data centres (DPDP Act 2023).
6. **Multilingual from day one.** English, Hindi and Kannada now; the i18n design admits any Indian language.
7. **Works on hardware the school already owns.** A tablet with a projector, an old TV with a touch frame, an IFP, a Windows PC.

## Release plan (proposal)

| Phase | Deliverable |
|---|---|
| **0 – Foundations** *(this repo now)* | Architecture, Cloud API core (tenancy, auth, pairing, timetable, sessions, broadcast), Board shell (pairing, multi-touch whiteboard, split screen, eye comfort) |
| **1 – Board MVP for the pilot** | Full Board feature set ([board-features.md](board-features.md)), minimal ERP (students, timetable, syllabus import), Teacher App (pairing, attendance, homework) |
| **2 – ERP & apps** | Full ERP (exams, fees, library, admissions), Student & Parent apps, principal dashboard, payments |
| **3 – Intelligence** | Adaptive learning, placement readiness for UG/PG, analytics |

Full Board scope is required for the first version. Phase 1 therefore holds every Board
feature. Phases 0 and 1 run back-to-back.
