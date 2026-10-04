/**
 * The CSV templates people download from the ERP's Import page (GET /v1/admin/import/templates/:kind).
 * docs/operations/import-templates/*.csv are the same files (a test keeps them identical). The
 * examples fit together: importing the four in order sets up a small working institution.
 */

export const IMPORT_KINDS = ['programs', 'staff', 'students', 'timetable'] as const;
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
# roles               teacher, hod, principal, tenant_admin, accountant, librarian; several separated by ; (required)
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
};
