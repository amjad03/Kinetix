# ZYNETIX ERP: Module Depth Checklist (target: match or exceed Linways)

Date: 2026-10-14. Companion to `LINWAYS_GAP_ANALYSIS.md` (breadth) and `requirements/MODULE_COVERAGE_MATRIX.md` (capability list). This file is about **depth**: the screens, entities, actions, workflows, approvals, reports and edge cases that a buyer at an Indian college, university or school will check in a demo.

## How to read this

- `- [ ]` is an item an industry-grade product must have. Nobody has ticked anything yet. Ticking means "built, demoed on seed data, and edge cases tested", not just "a route exists".
- **[L:key]** means public evidence shows Linways has it. The keys are listed in the source table below. Anything without a tag is either a market norm (seen in competitor material or Indian regulatory practice) or a capability that would let ZYNETIX go beyond Linways.
- **[C:key]** means a competitor or regulator source sets the depth bar.
- **(KX+)** marks an item where ZYNETIX can go beyond Linways, because Linways shows no public evidence of it.
- Beside each domain heading are the ZYNETIX ERP route directories (`apps/erp/src/app/(dashboard)/<dir>`) that the domain covers.

## Source limits (read before trusting the [L] tags)

- **Direct fetch failed for every host.** The WebFetch tool returned `ENOTFOUND` for every host (linways.com, blog.linways.com, youtube.com, wikipedia), and the agent proxy blocked curl with `403 CONNECT`. All Linways evidence below therefore comes from search-engine result summaries of the URLs cited. Nobody opened the PDFs or pages in full, so a few claims may be paraphrased.
- **YouTube:** only video titles were reachable, through search. Transcripts, chapters and descriptions were not. The titles found were: "Linways AMS in four minutes" (youtube.com/watch?v=JtBfqmncFIA), "Explore the limitless possibilities of online learning in higher education using Linways AMS" (watch?v=Ui5IZoVfQm8), "Explore the limitless possibilities of Online learning with Linways LMS" (watch?v=68xb_zEDQik), "Linways AMS: Customer success stories" (watch?v=LpN1PjolvHo), "Customer success stories from MES College of Engineering, Kuttippuram" (watch?v=RyUhETIARUs) and "Linways Happy customers: Dr. A. S. Varadarajan, MES College of Engineering" (watch?v=F6fqD1nxFQg). These are promotional videos that are roughly 6 to 10 years old, and none of them is a per-module tutorial. Linways also posts videos on Facebook (facebook.com/linwaystechnologies/videos), but those are not tutorials either.
- **Best primary evidence:** user manuals that customer colleges uploaded as NAAC 6.2.2 (e-governance) evidence (C1 to C5). These show real screens.

### Source keys

| Key | URL | What it showed |
|---|---|---|
| L-feat | https://www.linways.com/features | Module list: auto-normalised internal marks, seating/hall/invigilation in one click, hostel (multi-hostel, room reservation, allotment), library, digital library, placement and training, leave, HRIS, appraisal, Tally |
| L-home | https://www.linways.com/ | 45+ modules; HR (HR mgmt, biometric integration, leave, appraisal; **no payroll listed**); E-Governance "create your own workflow"; Infrastructure, Transport; Placement, Internship, Placement Training; mentoring, slow learner analysis; parent app, messagebox, grievance; integrations Koha, Power BI, Tally, CRMs; hour-wise attendance dashboard by department, attendance risk categories |
| L-price | https://www.linways.com/pricing | Lite/Professional/Enterprise; custom reports only in Enterprise; 6-month minimum; academic audit and NBA reports appear excluded from Lite |
| L-crm | https://linways.com/pages/best-admission-crm-software-higher-education-college/ | AdmissionWays: landing pages, index-mark calculation on criteria, rank list |
| L-crmblog | https://blog.linways.com/admission-crm-software-colleges-education-crm-platform/ | Agent management, lead source and campaign ROI |
| L-adm | https://blog.linways.com/home/online-admission-management-system-student-enrolment-software-colleges/ | Eligibility check, follow-up, document collection, online application, filtering, allotment |
| L-fee | https://linways.com/pages/fee-management-software-online-fee-collection-system/ | Feebook: challan, online/offline payment, receipts, fines, scholarship, concession, fee assignment |
| L-feeblog | https://blog.linways.com/home/how-to-manage-fees-college-fee-management-system/ | Create concessions and scholarships alongside regular fees |
| L-obe | https://linways.com/pages/outcome-based-education-obe-system-software-linways-lms/ | CO-PO mapping, student-wise and course-wise attainment, question mapped to multiple COs, Bloom level and difficulty per question, PO attainment tree |
| L-obeblog | https://blog.linways.com/how-to-implement-outcome-based-education-obe-using-linways-ams/ | Steps: programme, PO/PSO, PO attainment tree, CO, PO-CO attainment rule, assessment mapping |
| L-naac | https://linways.com/pages/naac-accreditation-management-software-for-higher-education-linways/ | Criteria-wise reports, CGPA and grade estimate, Excel/PDF export, data collection, gap insights |
| L-accr | https://linways.com/pages/the-complete-accreditation-software/ | SSR/SAR auto-generation ("ready to upload criteria-wise report"), workflow, score estimate |
| L-dig | https://linways.com/pages/onscreen-digital-evaluation-software-higher-education/ | On-screen marking, access only for assigned faculty, multi-level evaluation, revaluation and scrutiny, auto-total, CO/PO tracking, controller assigns scripts |
| L-auto | https://linways.com/pages/autonomous-college-management-software/ | Separate exam controller module |
| L-exam | https://linways.com/pages/?p=501 | Hall arrangement, grace marks and moderation, online certificate verification; hall ticket to mark list and result publication |
| L-assess | https://linways.com/pages/student-assessment-management-system-software-online-linways-lms/ | Online exams, result publication |
| L-comm | https://linways.com/pages/subject-community-management-system-linways-lms/ | Subject community with the teacher as moderator; proposed vs actual lesson plan; materials attached to plan; students see plan completion |
| L-lmsblog | https://blog.linways.com/powering-your-teaching-strategies-with-these-5-incredible-features-of-linways-lms/ | Discussion forums, comments, feedback forms, message box |
| L-griev | https://linways.com/pages/grievance-management-platform-for-educational-institutions/ | Route grievance to the responsible person, track actions |
| L-app | https://play.google.com/store/apps/details?id=com.linways.lms | V4 app: faculty timetable, mark/copy attendance, update lesson planner; students see timetable, attendance, materials, subject communities, push |
| C1 | https://aqar2021.stthomas.ac.in/wp-content/uploads/2022/01/Linways-AMS-User-Manual.pdf | Student calendar (exams, assignment deadlines), timetable, attendance (unmarked hours in pink), course material, assignments, internal exams; revaluation/re-totalling/scrutiny request from student portal; grace-mark application with approval; sessional QP via "Question Paper and Marks" |
| C2 | https://ncas.nirmalacollege.edu.in/frontend/web/NAAC/C6/6.2.2/3_Student_Admission_and_Support.pdf | Student: profile, hour-wise and day-wise attendance with date filter, assignment marks by semester, grievances, leave, online exams, documents, library, transactions (online fee payment) |
| C3 | https://ncas.nirmalacollege.edu.in/frontend/web/NAAC/C6/6.2.2/4_Examination.pdf | Online exam: question pool, Create Question with options, Manage Exam, add from pool or direct (direct questions also go to the pool) |
| C4 | https://scmsgroup.org/sstm/NAAC/naac-dvv/ERPdocument-Linwaysmanual.pdf | Headings: Administration, Finance & Accounts, Student Admission & Support, Examination; faculty: OBE settings, subject planning, assignments, exams, quizzes, attainment reports |
| C5 | https://iqac.newmancollege.ac.in/wp-content/uploads/2023/11/6.2.2-erp-document.pdf | Consoles: Academic Admin, Principal, HOD, Admission, EXAT, NAAC, Faculty, Student, Parent; V3 to V4 migration |
| C6 | https://mesmampadcollege.edu.in/examination.html | Approved grace total is published in the student's Linways account and cannot be edited once added |
| F-fed | https://support.fedena.com/support/solutions/articles/204064 and /204066, /211536 | Fedena: refund rules (% or amount), refund revert, discounts by batch/student/category/particular, fine generation, gateway payments refunded rather than reverted |
| F-ms | https://www.iitms.co.in/products/rfcampus/ and https://www.iitms.co.in/products/university-administration-and-information-management-system/ | MasterSoft: tabulation register (TR) and gazette, TR printing with scrutiny/corrections, grade card, transcript, degree certificate, re-exam, revaluation, grievance |
| F-camu | https://camudigitalcampus.com/blogs/camu-s-billing-module-not-just-handle-revenues-but-manage-your-entire-financial-system-efficiently/ and https://camudigitalcampus.com/hostel-management-system/ | Camu: credit-hour/program/flat fee, bulk fee-schedule upload, cash/cheque/gateway; hostel fee tracking, occupancy dashboards |
| F-acad | https://www.serosoft.com/wp-content/uploads/brochure/AcademiaBrochure.pdf and https://www.academiaerp.com/blog/benefit-of-academia-institute-management-system-module-guide-4/ | Academia: 40+ modules; inventory issue to whom and for how long, linked to hostel; HR timesheets, payroll, payslips; procurement and PO workflows |
| F-entab | https://www.entab.in/using-campusCare-payroll-software.html | Entab: payroll with PF/ESI/TDS, online payslips, staff CPD hours, bus GPS with parent alerts |
| F-edum | https://edumarshal.com/placement-management-system/ | Edumarshal: training and placement management system |
| F-crx | https://www.creatrixcampus.com/why-creatrix | Creatrix: CRM, SIS, LMS, OBE, faculty mgmt, accreditation, scheduling, strategic planning, form and report builders, configurable workflow |

---

## 1. Admissions and enquiry CRM
ZYNETIX: `admissions`, `admissions-tools`, `scholarships`, `careers` (public pages)

- [ ] Enquiry capture from web form, walk-in, phone, WhatsApp, fairs, and Meta/Google lead ads, with source and UTM stored [L:L-crmblog]
- [ ] Landing-page builder per programme with embedded form and publish-to-channel [L:L-crm]
- [ ] Lead stages (enquiry > prospect > applicant > admitted > enrolled > lost) with a reason for lost
- [ ] Lead assignment to counsellors (round-robin, by programme, by region), reassignment, and a call/follow-up queue with due-dates [L:L-adm]
- [ ] Duplicate detection (mobile, email, Aadhaar hash) with merge
- [ ] Counsellor activity log (calls, SMS, emails, visits) and next-action reminders
- [ ] Agent/consultant registry, agent portal, commission slabs, payout with TDS, and clawback when a student withdraws [L:L-crmblog]
- [ ] Campaign ROI report: spend per source, cost per lead, cost per admission [L:L-crmblog]
- [ ] Multi-step online application (personal, academic, category, documents, preferences) with save-and-resume [L:L-adm]
- [ ] Application fee through gateway, with a receipt and a reconciliation of unpaid drafts
- [ ] Document upload checklist per programme, verification status per document, re-upload request, and DigiLocker fetch
- [ ] Eligibility rules engine (qualifying exam, minimum %, subject combination, age, domicile) with an automatic reject/flag reason [L:L-adm]
- [ ] Index-mark formula per programme (weights, bonus marks for NSS/NCC/sports, tie-breakers such as DOB or the subject mark) [L:L-crm]
- [ ] Rank list: overall, category-wise and quota-wise (merit, management, community, NRI, sports, PwD), with publish/unpublish [L:L-crm]
- [ ] Seat matrix per programme × quota × category, live vacancy, and reservation roster (SC/ST/OBC/EWS/PwD, Kerala-style community quotas)
- [ ] Allotment rounds: allot, freeze/float, upgrade, slide, cancel, auto-forfeit when the fee is not paid by the deadline [L:L-adm "allotment"]
- [ ] Entrance test: slots, hall ticket, online/offline test, score import, and score feeding the index mark
- [ ] Interview/GD scheduling, panel scoring sheet and score aggregation
- [ ] Admission-fee payment, provisional admission letter, and conversion to student (roll number and register number generation)
- [ ] Management-quota approval workflow (principal or manager sign-off) and donation-free declaration
- [ ] Cancellation and withdrawal with a refund-rule (UGC refund-policy slabs) and an approval chain
- [ ] TC/migration certificate and original-certificate custody register (received, returned, signature)
- [ ] Scholarship/fee-concession eligibility pre-check during application (e-Grantz, state post-matric)
- [ ] Bulk SMS/WhatsApp/email to lead segments, DLT-template enforced
- [ ] Funnel dashboard by programme, source, counsellor and day, compared with last year
- [ ] Edge: changing the programme after admission (fee recalc, seat release); a lateral-entry/transfer admission path; a NRI/foreign-national document set; reopening an applicant after rejection with an audit record
- [ ] Reports: daily admission register, category-wise statistics (AISHE format), quota-fill report, application-to-admission conversion, and agent statement

## 2. Student information and lifecycle
ZYNETIX: `students`, `records`, `classes`, `import`, `documents` (student docs), `dpdp`, `early-years`, `school-mode`, `university`

- [ ] 360° profile tabs (personal, guardian, academic history, admission, fees, attendance, marks, documents, discipline, health, hostel, transport, library, mentoring) [L:L-home "student 360"]; [L:C2] profile settings
- [ ] Configurable custom fields per institution type, with field-level permissions
- [ ] Identifiers: admission no., roll no., university register no., APAAR/ABC ID, Aadhaar (masked), and the PEN/UDISE ID for schools
- [ ] Guardian relations (father, mother, guardian, sibling links across classes), with sibling-discount hooks
- [ ] Bulk import with a mapping template, dry run and an error file; bulk edit on a grid
- [ ] Batch/section allotment, section shuffle, roll-number regeneration rules (alphabetic, gender-wise)
- [ ] Lifecycle states: applicant, active, detained/year-back, long absent, discontinued, TC issued, passed out, alumni, each with an effective date
- [ ] Promotion/semester progression in bulk, using eligibility (attendance, credits, fees) and a list of held-back students
- [ ] Course/branch change and transfer between campuses, with history kept
- [ ] Profile change requests from students/parents that go through an approval and audit trail
- [ ] Student ID card designer, bulk print, and QR/barcode/RFID
- [ ] Certificates on request: bonafide, conduct, course completion, fee structure (for bank loan), study certificate; a request → approve → issue → verify flow
- [ ] TC with reason, dues clearance (no-dues from library, hostel, fees, lab), and a TC register
- [ ] Discipline record link and a gated "remarks visible on TC" option
- [ ] Health record, allergies and emergency contact (school mode) (KX+)
- [ ] DPDP consent per purpose, data-principal requests (access/correct/erase), guardian consent for minors (KX+)
- [ ] Reports: strength register by class, gender and category; the minority/religion statistics required by AISHE/UDISE+; age-wise; students without documents; and the dropout list

## 3. Academics: programme structure, curriculum, course registration, timetable, planning
ZYNETIX: `academics`, `curriculum`, `syllabus`, `courses`, `course-registration`, `course-files`, `departments`, `department`, `timetable`, `scheduling`, `calendar`, `diary`, `university`

- [ ] Hierarchy: institution > department > programme > scheme/regulation (e.g., 2019 scheme) > semester > course > batch/section, with versioned regulations
- [ ] Course master: code, credits (L-T-P-S), type (core/elective/open/audit/MOOC/lab/project), max internal/external, pass rules
- [ ] CBCS/NEP: elective baskets, minimum/maximum credits, prerequisites and co-requisites, honours/minor tracks, multiple entry/exit points
- [ ] Course registration window, seat caps per elective, preference-based allocation (merit or first-come-first-served), waitlist, add/drop deadline, advisor approval [L:L-home "CBCS"]
- [ ] ABC credit transfer and MOOC/SWAYAM credit mapping
- [ ] Faculty-course allocation (workload hours, check against the load norm), with co-teaching and lab batch splits
- [ ] Academic calendar with events, holidays and working-day counts, and a publish-to-students view [L:C1]
- [ ] Timetable: period structure, hour-wise slots, constraints (faculty availability, room capacity, lab continuity), auto-generation with manual drag-drop, and clash detection [L:L-feat]; [L:L-app]
- [ ] Faculty, room and class timetable views; print and PDF
- [ ] Substitution/arrangement when a faculty member is on leave, with a substitute-load report
- [ ] Special classes, extra hours, and a holiday shift (compensatory working day)
- [ ] Lesson planner: proposed plan per topic and hour, actual coverage logged from attendance, deviation report [L:L-comm]
- [ ] Course file: syllabus, lesson plan, materials, QPs, marks, attainment, CQI; completeness checklist and HOD sign-off [L:C4]
- [ ] Teacher diary/work log, and a principal/HOD review of syllabus completion % per course [L:L-comm "students see completion"]
- [ ] Syllabus versioning with board/university approval status and a diff between versions
- [ ] Academic audit: checklist per department, auditor remarks, compliance actions [L:L-price "academic auditing"]
- [ ] Edge: a mid-semester faculty change keeping attendance and plan history; merged sections for an elective; a course shared across programmes
- [ ] Reports: workload statement, timetable utilisation (rooms), syllabus completion by department, and a hours-taken vs hours-allotted register

## 4. Attendance (student and class)
ZYNETIX: `attendance`, `devices`

- [ ] Hour-wise and day-wise marking, with session/half-day modes for schools [L:C2]; [L:L-home]
- [ ] Marking from the timetable slot on web, mobile or the board, including bulk "all present" with exceptions and copying attendance across hours [L:L-app "copy attendance"]
- [ ] Biometric/RFID/face sources mapped to hours, with a teacher confirmation step [L:L-home "biometric integration"]
- [ ] Unmarked-hour alert to faculty and an HOD view of unmarked hours [L:C1 "unmarked hours in pink"]
- [ ] Late edit window, edit request with an approval workflow, and an audit trail of who changed what
- [ ] Duty leave/on-duty (OD) for events, sports, NSS and placement, counted as present, approved by the coordinator
- [ ] Medical leave with a certificate upload, used in condonation
- [ ] Student leave application with mentor/HOD approval that auto-marks the absences [L:C2]; [L:L-home]
- [ ] Attendance % by course, overall, and against a threshold (75%/65%), with a condonation-fee workflow and an eligibility (detain) list for exams [L:L-home "attendance risk categories"]
- [ ] Shortage alerts to student/parent by SMS/WhatsApp/app at configurable thresholds
- [ ] Lab-batch and elective-group attendance, and a combined class from multiple sections
- [ ] Attendance for extra/special classes and holiday working days
- [ ] Student self-view with a date filter, per course and per hour [L:C2]
- [ ] Parent daily absence notification [L:L-home]
- [ ] Edge: a student joining mid-semester (denominator from the joining date); a course change; a timetable change after marking
- [ ] Reports: monthly attendance register (university format), shortage list, condonation list, defaulter trend, faculty-wise marking compliance, and a daily department dashboard [L:L-home]

## 5. Examinations and evaluation
ZYNETIX: `exams`, `evaluation`, `question-bank`, `assessment-tools`, `scan`, `integrity`

Internal (CIA):
- [ ] Assessment scheme per course (test 1, test 2, assignment, seminar, attendance marks) with weights and best-of-N rules [L:C1]
- [ ] Internal mark entry grid with lock and HOD approval; a student view of assignment marks [L:C2]
- [ ] Auto normalisation of internal marks to the university maximum (KTU/Calicut/MG/Kerala/VTU rules) [L:L-feat]
- [ ] Attendance-linked internal marks (slab table)
- [ ] Internal mark submission to the university (export in the portal format)

Exam setup and conduct:
- [ ] Exam types: regular, supplementary, improvement, revaluation, special/makeup, lab/practical, viva [L:L-auto]
- [ ] Exam registration (student applies, eligibility on attendance and fees, exam-fee payment, late fee with a super-fine slab)
- [ ] Hall ticket generation with photo/signature, blocking of ineligible students, and a QR code [L:L-exam]
- [ ] Exam timetable, with clash detection for students with backlog papers
- [ ] Seating arrangement (mixing branches, alternate seating), hall allocation, door notices and seating charts [L:L-feat]
- [ ] Invigilation duty roster by load and seniority, duty swap requests, and remuneration [L:L-feat]
- [ ] Answer-sheet accounting (issued, used, spoiled) and an absentee/malpractice statement per hall [L:L-feat "tracking answer sheets"]
- [ ] Malpractice case register with a committee decision and penalty (cancel paper/exam/debar)
- [ ] Question paper setting: QP setter appointment, blueprint (CO/Bloom/marks), multiple sets, scrutiny and moderation, encrypted release N minutes before the exam [L:L-obe "Bloom per question"]; [L:C1]
- [ ] Question bank with Bloom/K-level, difficulty, CO tag, unit and usage history [L:L-obe]; [L:C3]
- [ ] Online exam: question pool, randomisation, timer, auto-grade objective items, proctoring options [L:C3]; [L:L-assess]

Valuation:
- [ ] False/dummy number generation and decoding, kept separate from the evaluator [L:L-feat "anonymisation" per gap analysis]
- [ ] Valuation camp: packet/bundle allocation, examiner and chief examiner, a daily count of scripts valued
- [ ] On-screen evaluation: scan, barcode, script allocation by the controller, per-question marking, annotations, auto-total, multi-level (first/second/third valuation when the difference exceeds X%) [L:L-dig]
- [ ] External examiner portal and remuneration claim, with TA/DA
- [ ] Mark entry from the valuer with double entry or verification, and a mismatch report

Post-exam:
- [ ] Moderation: board-approved moderation marks from result statistics [L:L-exam]; [L:C6 context]
- [ ] Grace marks: rule-based (max per paper/total), application for sports/arts/NSS grace with approval; locked once applied [L:C1]; [L:C6]
- [ ] Revaluation, re-totalling and scrutiny requests from the student portal with fee, answer-script photocopy, and a result-change rule (e.g., change only if it exceeds 10%) [L:C1]; [L:L-dig]
- [ ] Supplementary/improvement: best-of-attempts and the "carry-over internal" rule
- [ ] Withheld results (malpractice, fees, documents) with a release workflow
- [ ] Edge: absent vs zero vs malpractice coding; a student on a re-admission scheme; transfer students with credit equivalence; exam postponement and a reschedule notice
- [ ] Reports: tabulation register and gazette, pass % by course/teacher, topper list, result analysis by gender and category, and the exam-fee collection statement [L:L-exam]; [C:F-ms]

## 6. Results, grade cards and academic documents
ZYNETIX: `results`, `documents`, `boards` (school boards), `university`

- [ ] Grading schemes: absolute and relative, 10-point CGPA, letter grades, school CCE and CBSE/ICSE/state board formats, NEP holistic report card
- [ ] SGPA/CGPA calculation with rounding rules and the percentage-conversion formula printed on the card
- [ ] Result processing run with dry run, freeze, publish and rollback; an approval by the exam board/principal [L:L-exam]
- [ ] Rank list and class/division (distinction, first class), with rules for repeaters being excluded from ranks [L:L-feat]
- [ ] Progress report (internal) to parents, with remarks [L:L-home]
- [ ] Consolidated mark list, semester grade card, and a transcript (full history, all attempts or best) [L:L-exam]; [C:F-ms]
- [ ] Provisional certificate, degree certificate, migration and medium-of-instruction certificate
- [ ] Certificate designer with templates, serial numbers, a security QR, and digital signature
- [ ] Online certificate verification (public QR or ID lookup, employer verification request with fee) [L:L-exam]
- [ ] DigiLocker/NAD push and APAAR/ABC credit upload
- [ ] Duplicate certificate issue with an FIR/affidavit upload, a fee and a "DUPLICATE" watermark
- [ ] Name/DOB correction workflow with a supporting document and reissue
- [ ] Results to students/parents by SMS/app, with withheld results shown as withheld
- [ ] Edge: grade-change after publication (re-issue the card, versioned with an audit trail); a correction to an older semester recalculating CGPA
- [ ] Reports: result register, distinction list, gold medal list, NIRF graduation-outcome data, and a pending-certificate register

## 7. OBE, accreditation and quality (NAAC/NBA/NIRF/AISHE/IQAC)
ZYNETIX: `obe`, `accreditation`, `quality`, `academic-audit`, `skills`, `surveys` (indirect)

OBE:
- [ ] Vision, Mission, PEO, PO, PSO per programme, with versioning [L:L-obeblog]
- [ ] CO definition per course, with Bloom level and action verb validation [L:L-obe]
- [ ] CO-PO and CO-PSO mapping matrix with 1/2/3 strength and justification [L:L-obe]
- [ ] Question → CO mapping (one question to several COs), with Bloom and difficulty [L:L-obe]
- [ ] Attainment rules: threshold %, target level, direct/indirect weights (e.g., 80:20), CIA/SEE weights [L:L-obeblog "PO-CO attainment rule"]
- [ ] PO attainment tree (how each CO contributes to each PO) [L:L-obe]
- [ ] Student-wise and course-wise CO attainment; batch PO attainment [L:L-obe]
- [ ] Indirect attainment from course exit survey, alumni, employer and graduate exit surveys
- [ ] Gap analysis, with action taken and CQI loops documented per course and for the next offering
- [ ] Attainment dashboard for HOD/IQAC, with a trend across batches
- [ ] Skill/SDG/value mapping of courses [L:L-home]

Accreditation:
- [ ] NAAC: 7 criteria, metric-wise data entry (QnM/QlM) with department-level data collection workflows, evidence upload per metric, reviewer comments [L:L-naac]
- [ ] Auto-filled metrics from ERP data (student strength, pass %, faculty, publications, placements, fees, etc.) [L:L-naac]
- [ ] Predicted CGPA and grade calculator, metric-wise gap [L:L-naac]
- [ ] SSR export in the official template (Excel/PDF), AQAR yearly export, a DVV clarification-response tracker [L:L-accr "SSR"]
- [ ] NBA SAR: Tier-I/Tier-II criteria, SAR tables, CO/PO attainment, faculty cadre ratio, SFR, FYC computations [L:L-accr "SAR"]
- [ ] NIRF data capture (TLR, RPC, GO, OI, PR) with the submission format
- [ ] AISHE annual return export
- [ ] IQAC: meeting minutes, action-taken reports, feedback analysis (students, teachers, alumni, employers, parents) with ATR
- [ ] Evidence repository with tags, a validity period and auto-harvest from modules
- [ ] Edge: framework revision (NAAC binary/maturity-based grading 2025); multiple cycles retained; metric definitions versioned
- [ ] Reports: criterion-wise readiness %, missing-evidence list, department contribution status

## 8. Fees, finance and accounts
ZYNETIX: `fees`, `accounts`, `books`, `budgets`, `billing`, `gl-export`, `tally`, `settlements`, `scholarships`

Fee setup:
- [ ] Fee heads with ordering (allocation priority), GL/ledger mapping, taxable/non-taxable (GST) flags, refundable/non-refundable [L:L-fee]
- [ ] Fee structures by programme × batch × quota × category × year/semester; credit-hour-based fees; bulk upload [C:F-camu]
- [ ] Optional fees (transport, hostel, uniform, books) linked to module enrolments
- [ ] Instalment plans with due dates and per-instalment fines; a custom instalment plan for a single student with approval
- [ ] Fine rules: per day, per slab, capped, waivable with approval [L:L-fee]; [C:F-fed]

Assignment and concessions:
- [ ] Fee assignment in bulk, re-assignment after a structure change with a delta, and a mid-year join with pro-rata [L:L-fee]
- [ ] Concession/scholarship types (merit, sibling, staff ward, sports, government), percentage or amount, per head [L:L-feeblog]
- [ ] Concession approval workflow (request > HOD > principal > management) with limits per approver
- [ ] Government scholarship tracking (applied, sanctioned, received), with the student's balance adjusted when money arrives
- [ ] Discount views by batch/student/category/head [C:F-fed]

Collection:
- [ ] Counter collection (cash, cheque, DD, card/POS, UPI QR) and multiple modes in one receipt
- [ ] Partial payment with allocation across heads in priority order, and a manual allocation override
- [ ] Bank challan generation and reconciliation upload [L:L-fee]
- [ ] Online payment through two or more gateways, convenience-fee pass-through, a webhook, and auto receipt [L:L-fee]
- [ ] Receipts: numbering series per head/account, cancellation with reason and approval (never delete), duplicate print [L:L-fee]
- [ ] Cheque lifecycle: received > deposited > cleared/bounced; on bounce, reverse the receipt, add a bounce penalty and notify
- [ ] Advance/excess payment kept in a student wallet, adjusted against future dues
- [ ] Refunds: rule-based (UGC withdrawal slabs, % or amount), approval chain, payout by NEFT, and a refund revert [C:F-fed]
- [ ] Carry-forward of dues to the next year; dues blocking hall tickets, results and TCs (configurable)
- [ ] Day-end closing per cashier, cash handover and denomination entry
- [ ] Fee reminders (SMS/WhatsApp/app) on a schedule, plus a defaulters list
- [ ] Parent and student fee view, payment history and receipt download [L:C2 "transactions"]

Accounts:
- [ ] Chart of accounts, multiple bank accounts, fund accounting (trust/college/hostel as separate books)
- [ ] Vouchers (receipt, payment, journal, contra), with maker-checker approval
- [ ] Ledger, day book, cash book, bank book, trial balance, I&E, balance sheet, year close
- [ ] Bank reconciliation (statement import, auto-match)
- [ ] Tally Prime integration (ledger mapping, live push or XML, sync log) [L:L-feat]; [L:L-home]
- [ ] Budget per department with a utilisation check on expenditure
- [ ] GST invoice for taxable services, and 80G receipt for donations
- [ ] Gateway settlement reconciliation (order vs settlement vs bank) with an exceptions queue
- [ ] Reports: collection by head/date/mode/cashier, outstanding ageing, concession register, refund register, scholarship register, a daily collection summary to management, and a fee-structure print

## 9. HR, payroll and staff
ZYNETIX: `hr`, `payroll`, `trainings`, `delegations`

- [ ] Staff master: personal, qualifications (with UGC/AICTE cadre eligibility), experience, publications, bank, PAN, Aadhaar, and documents [L:L-home "HRIS"]
- [ ] Faculty-cadre and SFR tracking for AICTE/NBA; Ph.D./NET/SET status
- [ ] Recruitment: vacancy, applications, screening, interview panel, scoring, offer and appointment letter
- [ ] Onboarding checklist, probation, confirmation workflow
- [ ] Leave types (CL, EL, ML, duty leave, vacation, LOP, compensatory off) with accrual, carry-forward, encashment rules [L:L-feat]; [L:L-home]
- [ ] Leave application, multi-level approval, auto-arrangement of substitute classes, cancellation [L:L-feat]
- [ ] Staff attendance from biometric, with late/early rules and regularisation requests [L:L-home]
- [ ] Appraisal: self-appraisal (API score/PBAS for UGC CAS), HOD review, student feedback input, committee score [L:L-home]
- [ ] Payroll (KX+ vs Linways, which lists none): pay structures (UGC/AICTE scale, consolidated), DA revisions with arrears, PF/ESI/PT/TDS/LWF, loans and advances, LOP from attendance, payslip and Form 16 [C:F-entab]; [C:F-acad]
- [ ] Payroll run: lock, approve, bank transfer file, reversal, supplementary run
- [ ] Statutory returns: PF ECR, ESI challan, TDS 24Q, PT
- [ ] Service book and increments, promotions, transfers
- [ ] Training/FDP/CPD hours register [C:F-entab]
- [ ] Exit: resignation, notice period, no-dues, full and final settlement, experience certificate
- [ ] Delegation of authority during leave
- [ ] Reports: staff strength by cadre, gender and category; leave balance; payroll register; salary statement for the bank; and a faculty list for NAAC/NBA

## 10. Library
ZYNETIX: `library`

- [ ] Cataloguing (MARC21 import, ISBN lookup, accession register, multiple copies, call number DDC) [L:L-feat]
- [ ] Acquisition: suggestion, approval, order, receipt, invoice, budget per department
- [ ] Circulation: issue/return/renew with barcode/RFID, member category rules (loan period and limits), reservations/holds
- [ ] Overdue fines, fine waiver approval, collection linked to fees
- [ ] OPAC with search and availability, student view of issued books [L:C2 "library"]
- [ ] Journals/periodicals: subscriptions, issue check-in, missing-issue claim
- [ ] Digital library: e-resources, institutional repository, access logs [L:L-feat]
- [ ] Koha integration or SIP2 compatibility [L:L-home]
- [ ] Stock verification, lost/damaged book replacement, withdrawal register
- [ ] Gate register and footfall (for the NAAC 4.2 metric)
- [ ] No-dues clearance for TC/exit
- [ ] Book bank/semester-long loan scheme for SC/ST and other eligible students
- [ ] Staff and external (alumni, research) membership with deposits
- [ ] Inter-library loan and DELNET/N-LIST access register
- [ ] Self-checkout kiosk and drop box (RFID) with an overnight return log
- [ ] New-arrivals display and email alert to subscribed members
- [ ] Edge: issue blocked on dues; lost-card replacement; book returned to the wrong branch library
- [ ] Reports: accession register, circulation statistics, overdue list, most borrowed, and NAAC library expenditure and usage

## 11. Hostel (and mess/canteen)
ZYNETIX: `hostel`, `canteen`, `health`

- [ ] Multiple hostels, blocks, floors, rooms, beds, with room types and fees [L:L-feat]
- [ ] Application and allotment by rules (year, distance, merit), room reservation, waitlist [L:L-feat]
- [ ] Room change and vacate requests with warden approval
- [ ] Hostel fee and mess fee (fixed or per-day), mess bill with rebates for leave days [C:F-camu]
- [ ] Gate pass/outing/leave requests with parent approval and in/out logging
- [ ] Night attendance/roll call
- [ ] Visitor log
- [ ] Complaint/maintenance tickets per room
- [ ] Asset inventory per room, linked to inventory [C:F-acad]
- [ ] Discipline incidents and fines
- [ ] Mess menu, inventory and consumption
- [ ] Occupancy dashboard [C:F-camu]
- [ ] Caution deposit collection and refund on vacate, net of damages
- [ ] Warden/resident tutor assignment and duty roster
- [ ] Sick bay/infirmary visit log linked to the health record and a parent alert
- [ ] Late-entry log with an escalation after N instances
- [ ] Edge: mid-semester vacate (pro-rata refund); bed hold during internship; an allotment conflict with a gender or year rule
- [ ] Reports: occupancy, vacancy, fee dues, gate-pass log, and the night attendance absent list

## 12. Transport
ZYNETIX: `transport`

- [ ] Vehicles (registration, insurance, fitness and permit expiry alerts), drivers and conductors (licence expiry) [L:L-home]
- [ ] Routes, stops with timings, stop-wise fees [L:L-home]
- [ ] Student/staff allocation to a route and stop, change requests, and seat capacity checks
- [ ] Transport fee linked to fees, with pro-rata on mid-year change
- [ ] GPS live tracking with parent ETA alerts [C:F-entab]
- [ ] RFID boarding and parent notification
- [ ] Fuel log, maintenance schedule, trip log
- [ ] Bus pass print with a QR and photo
- [ ] Temporary route change (event, exam day) with a parent notice
- [ ] Drop-off authorisation (who may receive the child) for schools, with an OTP or photo handover
- [ ] Driver attendance and duty allocation, with a spare-driver pool
- [ ] Over-speed and route-deviation alerts from GPS
- [ ] Accident/incident register with an insurance claim
- [ ] Staff transport with a salary deduction instead of a fee
- [ ] Edge: student shifted mid-term between routes (fee delta); a vehicle breakdown requiring a substitute vehicle mapping
- [ ] Reports: route-wise and pickup-point-wise lists, vehicle expiry calendar, fee dues by route

## 13. Inventory, assets, infrastructure and procurement
ZYNETIX: `inventory`, `assets`, `budgets`

- [ ] Item master, categories, units, stores (central/department/lab) [L:L-home "infrastructure"]
- [ ] Indent from department, approval chain, budget check [C:F-acad]
- [ ] Quotation comparison, purchase order, GRN, invoice matching (3-way), payment voucher
- [ ] Vendor master, rating, blacklist
- [ ] Stock issue/return per department, consumption, reorder level alerts
- [ ] Assets: tagging (QR), location, custodian, AMC/warranty, depreciation, transfer, condemnation/write-off
- [ ] Rooms/labs/halls master with capacity, used by timetable and seating [L:L-feat]
- [ ] Facility booking (seminar hall, auditorium) with conflict check and approval
- [ ] Maintenance tickets (electrical, IT, civil) with SLA
- [ ] Lab stock verification for the annual audit
- [ ] Tender/e-procurement thresholds (GeM purchase reference, three quotations below the limit, tender above it)
- [ ] Rate contracts and an approved vendor list per item category
- [ ] Purchase committee approval minutes attached to the PO
- [ ] Gate inward/outward register for goods and returnable items
- [ ] Edge: partial GRN; returned or rejected goods (debit note); a PO amendment after approval re-entering the approval chain
- [ ] Reports: stock register, dead stock register, asset register, purchase register, and the NAAC infrastructure expenditure report

## 14. Placements, training, internships, careers, alumni
ZYNETIX: `placements`, `careers`, `alumni`, `trainings`, `skills`

- [ ] Company registry, contacts, job descriptions (JD) [L:L-feat]
- [ ] Drives: eligibility criteria (CGPA, backlogs, branch, batch), auto-eligible student list, registration window [L:L-home]; [C:F-edum]
- [ ] Round-wise results (test, GD, interview) and offers (CTC, offer letter upload); the one-offer/dream-offer policy
- [ ] Student placement profile and resume builder
- [ ] Placement training: sessions, attendance, aptitude test scores [L:L-home]
- [ ] Internships: application, company approval, supervisor feedback, credit mapping [L:L-home]
- [ ] Higher-studies and entrepreneurship tracking (for the NIRF/NAAC 5.2 metric)
- [ ] Alumni registration, verification, directory, events, mentoring, job postings, donations/fundraising with 80G receipts [L:L-home "alumni fundraiser" per gap analysis]
- [ ] Alumni feedback survey (OBE indirect)
- [ ] Recruiter portal: company self-registration, JD posting, shortlist download, result upload
- [ ] Student opt-in/opt-out for placement, with a debarment rule for skipping a registered drive
- [ ] Interview slot scheduling and venue allocation
- [ ] Offer acceptance/rejection by the student, and a joining confirmation
- [ ] Employer feedback form (OBE indirect, NBA)
- [ ] Edge: a student with a backlog cleared after the drive; an offer revoked by the company; a duplicate offer from the same group of companies
- [ ] Reports: placement % by branch, median salary (NIRF), company-wise, offer list, and the internship register

## 15. Research, projects and IPR
ZYNETIX: `research`, `projects`

- [ ] Faculty publications (Scopus/WoS/UGC-CARE indexing), auto-import by DOI/ORCID, h-index
- [ ] Funded projects: agency, sanction, PI/Co-PI, fund utilisation, UC submission
- [ ] Consultancy and revenue sharing
- [ ] Patents/IPR status tracking
- [ ] Ph.D. scholars: registration, supervisor, DC meetings, coursework, pre-submission, thesis plagiarism check, viva [L:L-home "plagiarism checker" per gap analysis]
- [ ] Student projects: team formation, guide allotment, reviews, rubric marks [L:L-home "project collaboration"]
- [ ] Seminars/conferences organised, MoUs and collaborations
- [ ] Research grant applications with internal approval and a deadline tracker
- [ ] Seed money/institutional research grants with a utilisation report
- [ ] Faculty awards, fellowships and editorial/reviewer roles
- [ ] Books and book chapters with ISBN
- [ ] Research ethics committee approval (IEC/IAEC) with expiry
- [ ] Datasets/research outputs repository with access control
- [ ] Equipment usage logs for central instruments, with internal/external billing
- [ ] Edge: a publication with co-authors from multiple institutions credited once; a retracted paper
- [ ] Reports: NAAC Criterion 3 metrics, NIRF RPC data, faculty research profile

## 16. Communication and engagement
ZYNETIX: `communication`, `messages`, `conversations`, `chat`, `ptm`, `surveys`

- [ ] Announcements/circulars to roles, classes and groups, with read receipts [L:L-home "communications"]
- [ ] SMS (DLT templates), email, push and WhatsApp channels; delivery report; credit balance
- [ ] Messagebox: teacher-student and parent messages, with moderation [L:L-home]; [L:L-lmsblog]
- [ ] Event-driven notifications (attendance, fee due, result, exam) with per-event templates and opt-out rules
- [ ] Parent app [L:L-home]
- [ ] Parent-teacher meeting scheduling with slots and minutes
- [ ] Surveys/feedback: course feedback, teacher feedback, infrastructure feedback; anonymity; analysis and ATR [L:L-lmsblog]
- [ ] Polls
- [ ] Emergency broadcast
- [ ] Scheduled messages and recurring reminders
- [ ] Multi-language templates (English plus the regional language)
- [ ] Group chats per class/club, with admin controls and quiet hours
- [ ] Staff circulars with acknowledgement tracking
- [ ] Two-way SMS/WhatsApp replies captured into a conversation
- [ ] Edge: guardian with multiple wards (one message per family); a number on DND; a bounced email
- [ ] Reports: message delivery, feedback analysis by teacher/course, survey participation

## 17. LMS and online learning
ZYNETIX: `live`, `homework`, `topic-videos`, `course-files`, `assessment-tools`, `learning-support`, `ai`

- [ ] Subject communities per course/batch, with teacher moderation [L:L-comm]
- [ ] Course materials (files, links, videos) by unit/topic, linked to the lesson plan [L:L-comm]; [L:C1]
- [ ] Assignments: create, submit, late policy, rubric grading, plagiarism check, resubmission [L:C1]; [L:C2]
- [ ] Quizzes/online tests, with a question pool [L:C3]
- [ ] Discussion forums and comments [L:L-lmsblog]
- [ ] Live classes (Teams/Meet/Zoom) from the timetable, with attendance import [L:L-home "MS Teams"]
- [ ] Recorded lectures and topic videos
- [ ] Student calendar showing deadlines [L:C1]
- [ ] Mobile access [L:L-app]
- [ ] LTI 1.3/SCORM
- [ ] Learning analytics: engagement per student and course
- [ ] AI lesson plans, question generation, tutor (KX+, as Linways only makes marketing claims)
- [ ] Content access rules (release date, prerequisite completion)
- [ ] Remedial content assigned to slow learners
- [ ] Peer review of assignments
- [ ] Gradebook export to the internal marks module
- [ ] Coding assessments with auto-grading (Linways sells Codeways separately)
- [ ] Edge: a late submission after the deadline extension for one student; a group assignment with individual marks
- [ ] Reports: assignment submission compliance, material usage, quiz analytics (item difficulty and discrimination)

## 18. Grievance, discipline, mentoring and welfare
ZYNETIX: `grievances`, `mentoring`, `early-alerts`, `learning-support`, `health`

- [ ] Grievance submission (student, parent, staff), categories, anonymous option [L:L-griev]; [L:C2]
- [ ] Routing to the responsible committee/person, SLA, escalation, action tracking, closure with feedback [L:L-griev]
- [ ] Statutory committees: anti-ragging, ICC (POSH), SC/ST cell, grievance redressal (UGC 2023 regulations), with confidential handling
- [ ] Mentor allotment (n students per mentor), meeting log, confidential notes [L:L-home]
- [ ] Slow learner/advanced learner identification by rules, with an intervention plan and outcome tracking [L:L-home]
- [ ] Early alerts: attendance, marks, fees, behaviour [L:L-home]
- [ ] Discipline incidents: record, inquiry, action, appeal
- [ ] Counselling sessions (confidential)
- [ ] Anti-ragging undertaking collection (student and parent affidavit) at admission
- [ ] Welfare: free-ship and poor-student fund applications with approval
- [ ] Divyang/PwD accommodations (scribe, extra time) feeding exams
- [ ] Mentor-mentee confidential channel [L:L-home]
- [ ] Parent visibility on mentor remarks (configurable)
- [ ] Edge: a grievance against the person it would be routed to (auto-reroute); appeals to the next level
- [ ] Reports: grievance register for NAAC, mentoring statistics, slow-learner outcomes

## 19. Campus life, events and clubs
ZYNETIX: `campus-life`, `calendar`

- [ ] Clubs/associations: members, office bearers, activities [L:L-home "clubs"]
- [ ] Event planning: proposal, budget approval, venue booking, registration (internal/external with fee), attendance, certificates, a report with photos [L:L-home "event planning"]
- [ ] NSS/NCC: enrolment, hours, camps
- [ ] Sports: teams, achievements
- [ ] Achievement records (student awards) for NAAC Criterion 5
- [ ] Cultural fests and inter-college events, with external registration and payment
- [ ] Volunteer and duty-leave linkage to attendance
- [ ] Participation certificates generated in bulk with QR verification
- [ ] Photo/media gallery per event
- [ ] Club budgets and expense claims
- [ ] Extension and outreach activities (NAAC 3.4)
- [ ] Gender sensitisation and sustainability activities (NAAC Criterion 7)
- [ ] Student council elections
- [ ] Edge: event cancelled after paid registrations (refunds); clash with exams flagged
- [ ] Reports: event register, participation, and the NAAC 5.3 metrics

## 20. Governance, settings, workflow, analytics and platform
ZYNETIX: `governance`, `settings`, `module-settings`, `institution-setup`, `workflows`, `delegations`, `audit`, `sso`, `integrations`, `connectors`, `devices`, `platform`, `analytics`, `reports`, `ops-reports`, `tasks`, `dpdp`

- [ ] Institution setup wizard: type (affiliated/autonomous/university/school), presets, academic year
- [ ] Role consoles: management, principal, HOD, faculty, exam controller, student, parent, admission [L:C5]
- [ ] RBAC with scoped permissions (department, programme), field-level masking
- [ ] E-governance workflow builder: forms, approval chains, conditions, SLAs, escalation [L:L-home "create your own workflow"]
- [ ] Committee management: members, meetings, agenda, minutes, action items
- [ ] Audit log of every change with a before/after diff
- [ ] SSO (Google/Microsoft), MFA
- [ ] Integrations: Tally, Koha, Power BI, biometric, payment gateways, SMS [L:L-home]
- [ ] Principal/management dashboards [L:L-home]
- [ ] Custom report builder (Linways gates this to Enterprise) [L:L-price]
- [ ] Data import and export, including a Linways-format importer
- [ ] Multi-campus/group dashboards
- [ ] DPDP compliance (KX+)
- [ ] Module enable/disable per institution, and feature flags
- [ ] Number series configuration (admission, receipt, roll, certificate)
- [ ] Branding (logo, letterhead, signatures) per campus
- [ ] Document templates editor (certificates, letters, receipts)
- [ ] Task management and approvals inbox across modules
- [ ] Backup/export of all tenant data, and a data-retention policy
- [ ] Mobile apps for faculty, students and parents, with push [L:L-app]
- [ ] Edge: academic year rollover (copying structures, promoting students, closing fees); role change for staff who move department
- [ ] Reports: usage analytics per module and role, login reports, pending-approvals ageing
