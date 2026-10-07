# Kinetix Complete Module Coverage Matrix

## Platform Core

| Domain | Required capability | Priority |
|---|---|---|
| Multi-tenancy | tenant, institution, campus, isolation, tenant configuration | P0 |
| Identity | user, identity, session, MFA, recovery, device/session control | P0 |
| Authorization | RBAC, scoped permissions, role inheritance, policy checks | P0 |
| Organization | institution, campus, department, cost center, org hierarchy | P0 |
| Academic Model | academic year, term, program, grade, semester, section, batch | P0 |
| Curriculum | course, subject, unit, topic, outcomes, credits, curriculum version | P0 |
| Content | document, textbook metadata, media, resource rights, versioning | P0 |
| Search | global, scoped, faceted, semantic | P0 |
| Notifications | in-app, push, email, SMS/WhatsApp adapters | P1 |
| Audit | immutable audit events and actor context | P0 |
| Files | object storage metadata, access control, virus scanning hooks | P0 |
| Configuration | tenant/institution feature flags and settings | P0 |

## Academic and Student Lifecycle

- Admissions and enquiry CRM
- Application and document collection
- Merit/eligibility rules
- Enrollment and registration
- Student lifecycle and status transitions
- Attendance
- Timetable and room allocation
- Lesson planning
- LMS and learning resources
- Assignments and homework
- Assessment and examination
- Results and transcripts
- Academic progression and promotion
- Certificates
- Internship/project records
- Alumni
- Parent/guardian relationships

## OBE and Accreditation

- Mission/Vision/PEO/PO/PSO management
- CO definition and versioning
- CO-PO matrix
- CO-PSO matrix
- Course-to-CO mapping
- Assessment-to-CO mapping
- Direct attainment
- Indirect attainment
- Weighted aggregation
- Threshold and target rules
- Attainment levels
- Gap analysis
- Improvement actions
- Evidence repository
- Mapping evidence
- Program dashboards
- Accreditation report builder/export
- Audit history

## Finance and Administration

- Fee structure
- Fee plans
- Scholarships/concessions
- Invoices
- Receipts
- Refunds
- Payment reconciliation
- General ledger/accounting integration
- Expense/purchase management
- Budgets
- Cost centers
- GST/tax configuration points
- Payroll and HR
- Leave and attendance
- Recruitment
- Performance management

## Campus Operations

- Library
- Inventory
- Procurement
- Assets
- Transport
- Hostel
- Canteen/mess
- Events
- Clubs
- Facilities
- Maintenance/complaints
- Security/visitor management

## Student Success and Career

- Placement management
- Internship management
- Career services
- Alumni engagement
- Counseling/wellbeing workflows
- Grievance management
- Discipline
- Scholarships
- Employability assessments

## Research and Compliance

- Research proposals
- Projects
- Supervisors
- Publications
- Grants
- Conferences
- IP/patents metadata
- Accreditation evidence
- Institutional KPIs
- Compliance evidence

## Smartboard

- Classroom launcher
- Whiteboard
- Content delivery
- Document/PPT/PDF
- Web/video
- Screen sharing
- Class controls
- Student interaction
- Assessment
- Simulation hub
- Virtual labs
- 3D learning
- AI Teacher Copilot
- Recording/transcript/recap
- Offline mode
- Device management
- Analytics

## Mobile

- Teacher
- Student
- Parent

Each mobile app must use the same domain contracts and authorization model as web/Smartboard.
