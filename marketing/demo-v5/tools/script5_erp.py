"""v5 script: the ERP chapters (real recordings of the Soundarya demo institution; anchors use each clip's marks)."""
def V(id, src, vo, label, m):
    return dict(id=id, kind='clip', src='erp/' + src, vo=vo, label=label, m=m)
def CARD(id, title, sub=''):
    return dict(id=id, kind='card', title=title, sub=sub, vo='')

ERP = [
 ('e0', 'The ERP: one view of the whole school', [
  CARD('k3', 'The ERP', 'Running the whole institution'),
  V('r01', 'dashboard', "Everything the board does lands in the ERP. ^The principal's dashboard shows the whole college today. ^Attendance. ^Fees collected. ^And what needs attention.", 'Principal dashboard', [0, 1, 2, 3]),
  V('r02', 'smartboards', "^Every classroom board shows up here, ^with its health, ^and the principal can even watch a class live.", 'Classroom boards', [0, 2, 4]),
  V('r03', 'early_alerts', "^It warns early about students who may need help, ^with the reason why, ^so a mentor can step in.", 'Early alerts', [0, 1, 2]),
  V('r04', 'language', "^And the whole ERP works in ^Kannada, ^Hindi, and English.", 'Three languages', [0, 1, 2]),
 ]),
 ('e1', 'Students, from admission to results', [
  V('r05', 'admissions', "^Admissions follow simple steps, from enquiry to joining. ^Merit lists are made for you. ^And every application is in one place.", 'Admissions', [0, 2, 4]),
  V('r06', 'students', "^Every student has one profile. ^Search a name, ^and see attendance, ^marks, ^and fees together.", 'Student profiles', [0, 1, 3, 5, 6]),
  V('r07', 'attendance', "^Attendance from every class comes in live. ^See which students are absent, ^and who is falling below the limit.", 'Attendance', [0, 3, 5]),
  V('r08', 'timetable', "^The timetable is built for every class, ^with teachers and rooms.", 'Timetable', [0, 1]),
  V('r09', 'exams', "^The exam office runs every exam: ^registrations, ^hall tickets, ^and paper checking.", 'Exams', [0, 2, 3, 4]),
  V('r10', 'results', "^Results are worked out by themselves, ^with grades and grade points for every student.", 'Results', [0, 1]),
  V('r11', 'certificates', "^Students ask for certificates online. ^The office approves them, ^and prints ID cards with a QR code.", 'Certificates and ID cards', [0, 1, 4]),
 ]),
 ('e2', 'Quality and accreditation', [
  V('r12', 'obe', "^Outcome-based education is built in. ^Each course outcome is linked to the programme's goals, ^and the system measures how well students reach them.", 'Outcome-based education', [1, 3, 4]),
  V('r13', 'naac', "^For NAAC, it gathers the proof as the college works, ^and even predicts the grade.", 'NAAC and IQAC', [0, 1]),
  V('r14', 'lms', "^Every subject gets an online course. ^And the question bank makes exam papers in minutes.", 'Courses and question bank', [1, 3]),
 ]),
 ('e3', 'Money, people and campus', [
  V('r15', 'fees', "^Fees are tracked to the last rupee. ^See who still owes money, ^open any receipt, ^and record a payment.", 'Fees', [0, 2, 3, 5]),
  V('r16', 'finance', "^The accounts desk keeps every ledger, ^and sends everything to Tally.", 'Accounts', [0, 4]),
  V('r17', 'hr', "^Staff records, ^leave, ^and monthly payroll, with PF, tax and payslips.", 'HR and payroll', [0, 1, 3]),
  V('r18', 'library', "^The library knows every book, ^every overdue loan, ^and the fine.", 'Library', [0, 1, 2]),
  V('r19', 'transport', "^Buses, drivers and routes, ^with reminders before papers expire.", 'Transport', [0, 2]),
  V('r20', 'hostel', "^Hostel beds, ^the mess menu, ^and gate passes.", 'Hostel', [1, 2, 3]),
  V('r21', 'placements', "^Placements: companies, drives, and offers. ^Internships, ^and alumni too.", 'Placements', [0, 3, 4]),
  V('r22', 'inventory', "^Stores and purchases, ^with alerts when stock runs low.", 'Inventory', [0, 1]),
  V('r23', 'grievances', "^Complaints are tracked, ^and serious ones are flagged at once.", 'Grievances', [0, 1]),
  V('r24', 'research', "^Research projects, grants and publications.", 'Research', [0]),
  V('r25', 'campus_life', "^And clubs, committees, and events.", 'Campus life', [0]),
 ]),
 ('e4', 'Messages, approvals and reports', [
  V('r26', 'comms', "^Send one notice ^to every board, ^and to parents by SMS and WhatsApp.", 'Notices', [0, 3, 4]),
  V('r27', 'workflows', "^Approvals can be drawn like a flowchart. ^For example: purchases over twenty-five thousand rupees need the principal.", 'Workflows', [1, 2]),
  V('r28', 'analytics', "^And live charts show how the whole institution is doing, ^month by month.", 'Analytics', [0, 2]),
 ]),
]
