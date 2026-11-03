# Attendance: user guide

Who uses it: teachers (Teacher App, board), heads of department and the principal (ERP → Attendance), the exam
cell (detention lists), students and families (Student and Parent apps).

## Marking

- **By period, day or session**, as Academics → Settings → Attendance says. ERP → Attendance → Mark, the Teacher
  App, or the board. "All present", then tap the absentees; copy one period's marks to the class's other periods.
- **Classroom readers.** Register a biometric, RFID or face terminal under Integrations → Devices with the room it
  is in. A tap from ten minutes before a period to its end shows on that period's sheet ("Reader 09:56"). "Use
  reader taps" marks the tapped students present and the rest absent; nothing is recorded until you save.
- **QR self-marking.** In the Teacher App open the period and tap the code icon. The 8-digit code changes every
  30 seconds. Students type it in the Student App, which sends the phone's install id and location.
  - Accepted: from the student's own phone, on the campus, within the grace minutes.
  - Held for you (Teacher App code screen, or ERP → Attendance → QR review): another phone, no location, a poor or
    mocked fix, outside the campus, or a late scan. Accept marks present; reject leaves the mark alone.
  - Refused: one phone marking a second student in the period, or a phone bound to someone else.
  - A student with a new phone: QR review → row menu → Release phone (with a reason).
- **Lock and corrections.** A day locks the set number of hours after it ends; then ask for a correction, which a
  head of department or the principal approves (Attendance approvals).

## Leave, condonation and detention

- On duty and medical/personal leave are applied for by families or recorded by staff, approved by the class
  teacher, mentor, head or principal; the approval writes the marks as the settings say.
- Condonation (Attendance approvals → Condonations): points added once approved and any fee is paid or waived.
- Eligibility → Programme: today's shortage list. **Prepare list** freezes it as a draft; the principal
  **publishes** it (families of detained students are told; hall tickets read it) or **withdraws** it with a
  reason. Download PDF (with signature lines) or Excel for the notice board and the university.
- Hall tickets with "block by attendance" hold back detained students from the published list, and students short
  under their class's rules until condonation brings them over the line.

## Alerts

- Absence (per period or the evening digest), shortage and detention notices always go in the apps.
- Academics → Settings → Attendance → Alert channels adds SMS and WhatsApp. They use the Communication templates
  `attendance_absence`, `attendance_shortage` and `attendance_detention` (SMS needs the DLT template id). Missing
  templates are reported when alerts are sent.

## Staff and cover

- Staff attendance comes from the gate biometric, Teacher App check-in or HR; regularisation in HR.
- Timetable → Substitutions lists periods needing cover: teachers on approved leave and teachers marked absent.

## Reports (Attendance → Reports)

- **Marking compliance**: per teacher, periods that met, marked the same day, later, or not at all.
- **Subject-wise**: per class, periods held, class average, students short and near the limit.
- **Defaulter trend**: students short, condonable and detained at the end of each week.
- **NAAC / AISHE**: instructional days (UDISE+ 1.2), attendance by programme, shortage, detention, condonations
  and staff attendance; the accreditation workspace reads the same figures (NAAC 2.2.1 evidence rows).
- The monthly register (Attendance → Register) downloads as PDF or Excel in the university format.
