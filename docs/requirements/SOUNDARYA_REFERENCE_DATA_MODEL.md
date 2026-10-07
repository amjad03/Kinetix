# Soundarya Reference Implementation — Detailed Data Onboarding

Soundarya is the first reference institution. Its data must be represented through generic Kinetix entities.

## Onboarding sequence

1. Create institution tenant.
2. Create campus(es).
3. Create departments and organizational structure.
4. Import academic years/terms.
5. Import programs and program versions.
6. Import semester/term structure.
7. Import subjects/courses.
8. Import syllabus and curriculum version.
9. Extract units/topics/outcomes for human review.
10. Import prescribed textbook metadata.
11. Import institution-owned notes/PPTs/lab manuals/question banks with rights metadata.
12. Import faculty/student/staff master data through validated import jobs.
13. Configure roles/permissions.
14. Configure assessment and OBE framework.
15. Configure timetable and attendance.
16. Configure finance/admissions/HR modules as adopted by the institution.
17. Connect Smartboards/devices.
18. Run reconciliation reports and sign off.

## Data quality gates

- no duplicate student identities after matching
- no duplicate subject codes within an active curriculum version
- every active course has owner/department
- every active course has assessment configuration
- every OBE-enabled course has CO definitions
- every imported resource has source/rights metadata
- imports are reversible or quarantinable before commit
