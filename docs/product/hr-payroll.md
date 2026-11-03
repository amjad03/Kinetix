# HR and payroll: user guide

Who uses it: HR (ERP → HR & Payroll), accounts (payroll runs and statutory files), the principal (approvals, pay
matrix, payroll lock), heads of department (leave, interviews, appraisal), and every staff member (Teacher App →
Profile → Work, or ERP → My payslips / My tax and claims). Technical notes: `docs/architecture/hr-payroll.md`.

## Staff records and lifecycle

- **Staff master** (HR → Staff): personal and statutory details, qualifications with verification, experience,
  publications, documents and the service book. PAN, UAN, Aadhaar and bank account numbers are stored encrypted;
  lists show the last four only. HR sees the full PAN and UAN on the record; exports, ECR, Form 24Q, Form 16 and the
  NAAC/NIRF faculty lists decrypt them when the file is made.
- **Onboarding** checklist on hiring; **probation** recommendations and confirmation letters; **transfers and
  promotions** with an effective date; **service book** entries (appointments, increments, pay fixation, awards).
- **Exit** (HR → Exit): resignation and notice, clearance by Department, Library, Accounts, IT, Hostel and HR, then
  the **full and final settlement**. Once every clearance is done the settlement card works it out:
  - salary for the days of the last month that payroll has not paid;
  - leave encashment of encashable leave (basic + DA ÷ 30 a day, at most 300 days);
  - gratuity after nearly five years of service (15/26 × basic + DA × completed years, a part year over six months
    counting as a year, at most ₹20 lakh);
  - less the notice shortfall (gross ÷ 30 a day; tick "Waive the notice shortfall" to drop it), loan instalments
    still owed and the clearance dues.
  Add a line for anything else (an honorarium owed, a damage recovery), write the note and save. The month the
  settlement pays is left out of that month's payroll run, and loan instalments after the last day are closed.
  Relieve on or after the last working day; the relieving letter and experience certificate follow.
- **UGC cadre check** (HR → Reports → UGC cadre eligibility): for each teacher, what the UGC Regulations 2018 ask of
  their cadre (master's with 55%, 50% for reserved categories and PwD; NET/SET/SLET or Ph.D.; years of experience;
  publications) and what is missing. The faculty-cadre (1:2:6) and student-faculty ratio reports sit beside it.

## Leave

- Types: casual, sick, earned, maternity, duty (on duty), compensatory off, vacation and leave without pay, with
  monthly or yearly accrual, carry-forward limits and encashment rules (HR → Leave types).
- **Vacation leave** is for teaching staff and must fall inside a declared vacation (HR → Settings → Vacations, such
  as winter 22–31 December and summer 20 April – 31 May). It draws on no balance.
- With two approval levels the head of department recommends and the principal or HR approves. Approved leave
  marks attendance as on leave, offers substitutes for the classes, and unpaid leave or unmarked absence becomes loss
  of pay in the month's payroll.

## Pay

- **Pay matrix** (Payroll → Pay matrix): the UGC 7th CPC academic levels 10 to 15 are there from the first visit;
  add a state or institution scale under Pay levels (entry pay and number of cells; each cell is 3% more, to the
  nearest ₹100).
  - **Place on matrix**: staff member, level, cell, effective date (the 1st of a month) and HRA city class. The
    salary structure is written from it: basic from the cell, DA at the rate in force, HRA at 30/20/10% of basic
    (27/18/9% while DA is below 50%), every other line kept.
  - **Annual increment**: choose 1 July (or 1 January), Preview, then Give increments. Staff with six months of
    service since joining or their last promotion move one cell up; those at the top of a level are listed.
    Running it again gives nobody a second increment.
  - **Promote**: pick the new level; pay is fixed one notional increment above the present pay, at the first cell
    of the new level at or above it. Each move goes into the service book and the staff member is told.
- **DA revisions** (Payroll → Components → DA → Revise rate): locked months from the revision on get arrears on
  the chosen month's payslip.
- **Consolidated and guest staff**: set the staff record's pay basis to consolidated (one fixed line, no DA or HRA)
  or hourly with the hourly rate; record taught hours as a "Guest lectures (hours)" adjustment and payroll pays
  hours × rate.

## Tax: declarations and proofs

- Staff open **My tax and claims** (ERP) or **Tax and claims** (Teacher App): choose the old or new regime (both
  tax figures for the year are shown), enter rent for HRA (the landlord's PAN when rent passes ₹1 lakh a year) and
  each investment by section (80C, 80CCD(1B), 80D, 80E, 80G, 80TTA, 24(b)), save and submit.
- HR or accounts approve it (Payroll → Claims and declarations → Investment declarations). TDS from the next run
  uses the declared figures: 80C with employee PF up to ₹1.5 lakh, each other section to its own limit, and the HRA
  exemption (least of HRA received, rent less 10% of basic + DA, and 40% of basic + DA, 50% in the four metros).
- When proofs are due, staff attach a proof to each item and submit them. The reviewer opens the declaration,
  accepts each proof for the amount it supports (or rejects it) and verifies; TDS then uses the accepted figures.
  Sending back needs a note.

## Reimbursements

- Staff claim a bill (official travel, conference, books and journals, telephone, medical, fuel, other) with the
  bill attached. Yearly limits per category are set in HR → Settings.
- HR approves onto a pay month (or rejects with a reason). The claim is paid on that payslip as a reimbursement:
  travel, conference, books and telephone tax free, medical and fuel taxable; none of it counts as wages for ESI or
  professional tax. It shows as Paid once the run is locked.

## Payroll runs and files

- Prepare → verify (HR or accounts) → approve and lock (principal) → publish payslips (staff are told; the Teacher
  App shows them with the PDF). A locked month cannot change; a supplementary run pays arrears or late joiners; the
  latest locked run can be reversed with a reason. Every step is in the run's Activity.
- Downloads from an approved or locked run: the plain bank list, and the **SBI**, **Canara Bank** and **HDFC Bank**
  upload files (set the bank and the institution's salary account under Payroll → Settings → Salary transfer file;
  the account is kept encrypted), PF, ESI, PT, TDS and LWF statements, the **EPFO ECR** text file and the Tally
  journal. Form **24Q** annexures and **Form 16** come from Payroll → Returns. Every download is audited.

## Recruitment

- A head of department raises a requisition; the principal approves it into an opening. Tick **Show on the careers
  page** to publish it at `/v1/public/careers/<institution code>`, where candidates apply with their resume; their
  applications arrive as "Applied" (source: careers page) and HR is told.
- Screening, interview rounds with panel scores, offer letter, acceptance and hiring into a staff record with the
  onboarding checklist.
