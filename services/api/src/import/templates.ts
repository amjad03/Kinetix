/**
 * The CSV templates people download from the ERP's Import page (GET /v1/admin/import/templates/:kind).
 * docs/operations/import-templates/*.csv are the same files (a test keeps them identical). The
 * examples fit together: importing the four in order sets up a small working institution.
 */

/** The four files that set up a working institution, in order. */
export const CORE_KINDS = ['programs', 'staff', 'students', 'timetable'] as const;
/** The seven onboarding data families (PRD 95): outcome mapping, exams, fees, library, placement, research, quality. */
export const ONBOARDING_KINDS = ['outcomes', 'exams', 'fees', 'library', 'placement', 'research', 'quality'] as const;
export const IMPORT_KINDS = [...CORE_KINDS, ...ONBOARDING_KINDS] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const TEMPLATES: Record<ImportKind, string> = {
  programs: `# KINETIX import: programs, classes (sections) and subjects. One row per class or subject; repeat the program on each row.
# program        Program name, e.g. BCom, BSc, CBSE (required)
# level          ug, pg or school (required)
# terms          Number of semesters (ug/pg) or grades (school) (required)
# term           Semester or grade of the class or subject on this row
# section        Class name within the term, e.g. A. Shown as "BSc Sem 1 A" (school: "Grade 7 A")
# display_name   Optional: the class's name as shown, instead of the one above
# subject_code   Subject code, unique within the program, e.g. BSC-1.1
# subject_name   Subject name
# department     Optional: the department that teaches the subject (created if missing)
# Rows are matched by program name, by term + section, and by subject code: importing again updates them.
program,level,terms,term,section,display_name,subject_code,subject_name,department
BSc,ug,6,1,A,,BSC-1.1,Physics I,Science
BSc,ug,6,1,B,,BSC-1.2,Mathematics I,Science
BSc,ug,6,1,,,BSC-1.3,Kannada I,Languages
BSc,ug,6,1,,,BSC-1.4,Hindi I,Languages
`,
  staff: `# KINETIX import: staff. One row per person.
# full_name           Full name, in any script (required)
# email               Email address (email or phone required; used to match on re-import)
# phone               Mobile number, e.g. 98450 12345 (staff sign in with a code sent to it)
# roles               teacher, hod, principal, tenant_admin, accountant, librarian, admissions_officer; several separated by ; (required)
# preferred_language  en, hi or kn (default en)
# departments         Department names separated by ; (created if missing)
# Rows are matched by email, then phone: importing again updates the name, adds roles and departments.
full_name,email,phone,roles,preferred_language,departments
Priya Nair,priya.nair@example.in,+919845000101,teacher,en,Science
Suresh Hegde,suresh.hegde@example.in,+919845000102,teacher;hod,kn,Science
सुनीता वर्मा,sunita.verma@example.in,+919845000103,teacher,hi,Languages
ಮಂಜುನಾಥ ಗೌಡ,manjunath.gowda@example.in,+919845000104,teacher,kn,Languages
Office Accounts,accounts@example.in,,accountant,en,
`,
  students: `# KINETIX import: students and their parents or guardians. One row per student.
# roll_no             Roll number, unique in the institution (required; used to match on re-import)
# full_name           Full name, in any script (required)
# section             The class, as shown, e.g. BSc Sem 1 A (required; import programs first)
# student_email       Optional: gives the student a login
# student_phone       Optional: gives the student a login (they sign in with a code sent to it)
# preferred_language  en, hi or kn, for the student's login (default en)
# guardian1_name, guardian1_phone, guardian1_relation (father, mother, guardian…), guardian1_language
# guardian2_name, guardian2_phone, guardian2_relation, guardian2_language
# A guardian is matched by phone: brothers and sisters with the same parent phone share one parent login.
roll_no,full_name,section,student_email,student_phone,preferred_language,guardian1_name,guardian1_phone,guardian1_relation,guardian1_language,guardian2_name,guardian2_phone,guardian2_relation,guardian2_language
BSC1A001,Aditi Kulkarni,BSc Sem 1 A,,,en,Ramesh Kulkarni,+919900000201,father,en,Asha Kulkarni,+919900000202,mother,kn
BSC1A002,ಕಾವ್ಯ ಶೆಟ್ಟಿ,BSc Sem 1 A,kavya.shetty@example.in,+919900000203,kn,ಪ್ರಕಾಶ್ ಶೆಟ್ಟಿ,+919900000204,father,kn,,,,
BSC1B001,आरव मिश्रा,BSc Sem 1 B,,,hi,राजेश मिश्रा,+919900000205,father,hi,,,,
BSC1B002,Rohan Kulkarni,BSc Sem 1 B,,,en,Ramesh Kulkarni,+919900000201,father,en,,,,
`,
  timetable: `# KINETIX import: the weekly timetable. One row per period.
# section       The class, as shown, e.g. BSc Sem 1 A (required)
# subject_code  A subject of the class's program and term (required)
# teacher       The teacher's email or phone (required; import staff first)
# day           Mon, Tue, Wed, Thu, Fri, Sat or Sun, or 1 (Monday) to 7 (required)
# start, end    24-hour times, e.g. 09:00 and 09:55 (required)
# room          Optional room name (created if missing)
# Clashes (a class, teacher or room booked twice) are reported per row. A period is matched by class,
# day and start time. With "replace", each class in the file gets exactly the periods in the file.
section,subject_code,teacher,day,start,end,room
BSc Sem 1 A,BSC-1.1,priya.nair@example.in,Mon,09:00,09:55,Room 101
BSc Sem 1 A,BSC-1.2,suresh.hegde@example.in,Mon,10:00,10:55,Room 101
BSc Sem 1 A,BSC-1.3,manjunath.gowda@example.in,Tue,09:00,09:55,Room 101
BSc Sem 1 B,BSC-1.1,priya.nair@example.in,Mon,10:00,10:55,Room 102
BSc Sem 1 B,BSC-1.4,sunita.verma@example.in,Tue,09:00,09:55,Room 102
`,
  outcomes: `# KINETIX import: program outcomes and course outcomes with their mapping. One row per outcome; list the PO and PSO rows before the CO rows that map to them.
# type           po, pso or co (required)
# program        Program name (required; import programs first)
# code           Outcome code, e.g. PO1, PSO1, CO1 (required)
# statement      The outcome in a sentence (required)
# subject_code   For co rows: the subject the outcome belongs to (required for co)
# bloom_level    Optional, for co rows: remember, understand, apply, analyse, evaluate or create
# maps_to        Optional, for co rows: program outcomes with strength 1 (low) to 3 (high), e.g. PO1:3;PO2:2
# Course outcomes go into the subject's draft outcome set; importing again updates them.
type,program,code,statement,subject_code,bloom_level,maps_to
po,BSc,PO1,Apply scientific knowledge to solve problems,,,
po,BSc,PO2,Communicate findings clearly,,,
co,BSc,CO1,Explain the laws of motion,BSC-1.1,understand,PO1:3;PO2:1
`,
  exams: `# KINETIX import: exam sessions of the current academic year. One row per session.
# program     Program name (required; import programs first)
# term        Semester or grade (required)
# name        Name of the session, e.g. Semester 1 Examination (required)
# kind        regular or supplementary (default regular)
# starts_on, ends_on   Dates as YYYY-MM-DD (required)
# A session is matched by program, term and name; only sessions still in draft can be changed by import.
program,term,name,kind,starts_on,ends_on
BSc,1,Semester 1 Examination,regular,2026-12-01,2026-12-15
BSc,1,Semester 1 Supplementary,supplementary,2027-02-01,2027-02-10
`,
  fees: `# KINETIX import: fee structures. One row per fee head; rows with the same structure (and program) form one structure.
# structure     Name of the fee structure, e.g. BSc Sem 1 fees (required)
# program       Optional: the program it applies to (import programs first)
# head          Fee head, e.g. Tuition (required)
# amount        Amount in rupees, e.g. 25000 or 1250.50 (required)
# due_in_days   Days after issue that the fee is due (default 30)
structure,program,head,amount,due_in_days
BSc Sem 1 fees,BSc,Tuition,25000,30
BSc Sem 1 fees,BSc,Library,1500,30
BSc Sem 1 fees,BSc,Laboratory,3000,30
`,
  library: `# KINETIX import: library books. One row per title.
# title       Book title (required)
# author      Author
# isbn        ISBN-10 or ISBN-13
# call_no     Shelf mark, e.g. 530 HAL
# copies      Number of copies (default 1)
# barcode     Accession code printed on the label
# price       Replacement cost in rupees
# A book is matched by barcode, else ISBN, else title and author.
title,author,isbn,call_no,copies,barcode,price
Fundamentals of Physics,Halliday and Resnick,9788126552559,530 HAL,5,LIB-0001,850
Introduction to Algorithms,Cormen,9780262033848,005.1 COR,2,LIB-0002,1200
`,
  placement: `# KINETIX import: recruiting companies. One row per company.
# company         Company name (required; used to match on re-import)
# sector          Industry, e.g. IT services
# website, contact_name, contact_email, contact_phone   Placement contact
company,sector,website,contact_name,contact_email,contact_phone
Infosys,IT services,https://www.infosys.com,Meera Rao,campus@infosys.example,+919845000301
Bosch,Engineering,https://www.bosch.in,Anil Kumar,hr@bosch.example,+919845000302
`,
  research: `# KINETIX import: publications. One row per publication.
# owner_email   Email of the staff member who owns it (required; import staff first)
# title         Title (required)
# kind          journal, conference, book or book_chapter (default journal)
# venue         Journal, conference or publisher (required)
# year          Year of publication (required)
# doi, issn     Optional identifiers. A publication is matched by DOI, else owner and title.
owner_email,title,kind,venue,year,doi,issn
priya.nair@example.in,Thermal conductivity of thin films,journal,Journal of Applied Physics,2025,10.1063/5.0100001,0021-8979
suresh.hegde@example.in,Teaching mathematics with local examples,conference,National Education Conference,2024,,
`,
  quality: `# KINETIX import: accreditation and quality criteria. One row per criterion.
# framework   Name of the framework, e.g. NAAC 2026 (created on first use; required)
# body        naac, nba, nirf, iqac or custom (default custom)
# code        Criterion code, e.g. 1.1.1 (required)
# title       What the criterion asks (required)
# metric, unit, target   Optional measure, its unit and the target figure
framework,body,code,title,metric,unit,target
NAAC 2026,naac,1.1.1,Curriculum design and review,Programs revised in the year,count,5
NAAC 2026,naac,2.4.1,Full-time teachers with a doctorate,Share of teachers,percent,60
`,
};
