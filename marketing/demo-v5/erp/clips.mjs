// Clip definitions: id, title, login (email prefix at soundarya.demo.zynetix.in), start route, scripted actions.
// Helpers (see lib.mjs): hold, click, hoverEl, markEl, scrollTo/scrollBy/scrollToEl, nav, type, key, mark.
const CARD = '.rounded-lg.border';
const TAB = 'main a, main button, main [role=tab]';

export const CLIPS = [
  {
    id: 'dashboard', title: "Principal's dashboard", login: 'principal', route: '/',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('Dashboard: welcome and KPI cards (students, attendance, fees, marks)', 'main h3', 'Students', { exact: true, closest: '.grid' });
      await c.hold(1.2);
      await c.hoverEl(await c.el('main h3', 'Attendance', { exact: true, closest: CARD }), 'Attendance KPI (86%) hovered', 1.0);
      await c.hoverEl(await c.el('main h3', 'Fees collected', { exact: true, closest: CARD }), 'Fees collected KPI hovered', 1.0);
      await c.scrollToEl(await c.el('main h2', 'Attendance trend', { closest: 'section' }), 250, 1.6);
      await c.markEl('Attendance trend chart and Needs your attention list', 'main h2', 'Attendance trend', { closest: '.grid' });
      await c.hold(2.0);
      await c.scrollBy(480, 1.6);
      await c.markEl("Fee collection by class and today's classes", 'main h2', "Today's classes", { closest: '.grid' });
      await c.hold(1.8);
      await c.scrollTo(0, 1.4);
      await c.click(await c.el('main a', 'Finance', { exact: true }), 'Finance view of the dashboard', { zoom: true });
      await c.hold(2.2);
    },
  },
  {
    id: 'admissions', title: 'Admissions pipeline', login: 'admissions', route: '/admissions',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('Guided admissions pipeline: enquiry to enrolment with counts', 'main *', 'Seat allotment', { closest: 'section, ' + CARD });
      await c.hold(1.5);
      await c.hoverEl(await c.el('main button', 'Rank list', {}), 'Rank list step hovered', 0.8);
      await c.scrollToEl(await c.el('main h2', 'Rank list'), 140, 1.6);
      await c.markEl('Merit / rank list for BBA 2027-28', 'main h2', 'Rank list', { closest: 'section, ' + CARD });
      await c.hold(2.0);
      await c.scrollTo(0, 1.2);
      await c.click(await c.el('main a', 'Applications', { exact: true, nth: 1 }), 'Applications list with merit scores and fee status', {});
      await c.hold(1.8);
      await c.click(await c.el('main tbody a', null), 'One application opened: documents, fee, status', {});
      await c.hold(2.0);
      await c.scrollBy(400, 1.4);
      await c.hold(1.5);
    },
  },
  {
    id: 'students', title: 'Student 360 profile', login: 'principal', route: '/students',
    async run(c) {
      await c.hold(1.0);
      c.mark('Student list: 330 students with attendance, fee status');
      await c.hold(0.9);
      await c.click(await c.el('main input[placeholder^="Search name"]'), null, { max: 0.5 });
      await c.type('Vignesh Naik');
      c.mark('Searched for Vignesh Naik');
      await c.hold(0.6);
      await c.click(await c.el('main tbody tr', 'Vignesh Naik'), 'Quick panel opened (attendance, fees, CGPA)', {});
      await c.hold(1.3);
      await c.click(await c.el('[role=dialog] button, [role=dialog] [role=tab]', 'Attendance', { exact: true }), 'Quick panel: attendance tab', {});
      await c.hold(1.3);
      const full = await c.el('a', 'Open full profile'); await full.evaluate((a) => a.removeAttribute('target'));
      await c.click(full, 'Full 360 profile opened', { max: 3 });
      await c.hold(1.5);
      await c.click(await c.el(TAB, 'Academics'), 'Academics tab: marks', {});
      await c.hold(1.5);
      await c.click(await c.el(TAB, 'Fees'), 'Fees tab: invoices and balance', {});
      await c.hold(1.5);
    },
  },
  {
    id: 'attendance', title: 'Attendance overview', login: 'principal', route: '/attendance',
    async run(c) {
      await c.hold(1.0);
      await c.markEl("Today's attendance: rate, absent, late, classes marked", 'main h3, main p, main span', 'Attendance rate', { closest: '.grid' });
      await c.hold(1.6);
      await c.scrollToEl(await c.el('main h2', 'By class'), 150, 1.4);
      c.mark('Class-wise attendance table');
      await c.hoverEl(await c.el('main tbody tr', 'BCA Sem 1 A'), 'Class row hovered (76.9%)', 1.0);
      await c.scrollToEl(await c.el('main h2', 'Absent students'), 150, 1.6);
      c.mark('Absent students list');
      await c.hold(1.6);
      await c.nav('/attendance/governance', 'Attendance approvals: corrections, shortage, condonation');
      await c.hold(1.2);
      await c.scrollToEl(await c.el('main h2', 'Attendance shortage'), 150, 1.6);
      c.mark('Attendance shortage (defaulters below 85%)');
      await c.hold(2.0);
    },
  },
  {
    id: 'timetable', title: 'Class timetable', login: 'principal', route: '/timetable',
    async run(c) {
      await c.hold(1.0);
      c.mark('Weekly timetable grid for BBA Aviation Sem 1 A');
      await c.hold(1.5);
      await c.hoverEl(await c.el('main button', 'Airport Operations'), 'Period card: subject, teacher, room', 1.2);
      await c.click(await c.el('main [role=combobox]'), 'Class or teacher picker opened', {});
      await c.hold(0.6);
      await c.click(await c.el('[role=option]', 'BCA Sem 3 A'), 'Switched to BCA Sem 3 A', {});
      await c.hold(1.8);
      await c.scrollBy(300, 1.2);
      await c.hold(1.5);
    },
  },
  {
    id: 'exams', title: 'Examinations', login: 'principal', route: '/exams/office',
    async run(c) {
      await c.hold(1.0);
      c.mark('Exam office: sessions in progress, waiting on the office');
      await c.hold(1.6);
      await c.hoverEl(await c.el('main *', 'BCom Semester 5: Semester End Examination', { closest: CARD + ', li, a' }), 'BCom Sem 5 session progress', 1.0);
      await c.nav('/exams', 'Exam session: registration, hall tickets issued, valuation');
      await c.hold(1.8);
      await c.hoverEl(await c.el('main *', 'Hall tickets issued', { nth: 1, closest: CARD }), 'Hall tickets issued: 25', 1.0);
      await c.scrollToEl(await c.el('main h2, main h3', 'Valuation & moderation'), 160, 1.5);
      c.mark('Valuation and moderation by paper');
      await c.hold(1.8);
    },
  },
  {
    id: 'results', title: 'Results with SGPA / CGPA', login: 'principal', route: '/exams/5bfb9e14-5870-4a60-b570-3e4e26f0646f',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('Published results: pass %, average SGPA', 'main h3, main p, main span', 'Pass percentage', { closest: '.grid' });
      await c.hold(1.6);
      await c.scrollToEl(await c.el('main h2, main h3', 'Results', { exact: true }), 120, 2.0);
      c.mark('Result sheet: grades per subject, SGPA, CGPA, pass / not passed');
      await c.hold(1.5);
      await c.hoverEl(await c.el('main tbody tr', 'Joseph Urs'), 'Top student row: SGPA 8.33', 1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Nandini Hegde'), 'Student who has not passed', 1.4);
    },
  },
  {
    id: 'obe', title: 'Outcome-based education', login: 'principal', route: '/obe',
    async run(c) {
      await c.hold(1.0);
      c.mark('OBE: COs and POs at target');
      await c.hold(1.2);
      await c.scrollToEl(await c.el('main h2', 'Programme outcome attainment'), 140, 1.4);
      await c.markEl('Programme outcome attainment rings', 'main h2', 'Programme outcome attainment', { closest: 'section, ' + CARD });
      await c.hold(1.6);
      await c.scrollToEl(await c.el('main h2', 'CO–PO mapping matrix'), 140, 1.6);
      await c.click(await c.el('main [role=combobox]', 'BBA-101'), 'Subject picker for the CO-PO matrix', {});
      await c.click(await c.el('[role=option]', 'BBA-301'), null, {});
      await c.markEl('CO-PO mapping matrix for BBA-301', 'main h2', 'CO–PO mapping matrix', { closest: 'section, ' + CARD });
      await c.hold(2.2);
      await c.scrollToEl(await c.el('main h2', 'CO attainment (direct and indirect)'), 140, 1.6);
      c.mark('CO attainment, direct and indirect');
      await c.hold(2.0);
    },
  },
  {
    id: 'naac', title: 'NAAC and IQAC', login: 'iqac', route: '/accreditation/naac',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('NAAC criteria completeness (7 criteria)', 'main h2, main h3', 'Criteria completeness', { closest: 'section, ' + CARD });
      await c.hold(1.4);
      await c.markEl('Predicted CGPA gauge 2.80', 'main h2, main h3', 'Predicted CGPA', { closest: 'section, ' + CARD });
      await c.hoverEl(await c.el('main button', 'Teaching-learning'), 'Criterion 2: teaching-learning 75%', 0.6);
      await c.press(); await c.settle(2); c.mark('Metric table filtered to criterion 2');
      await c.hold(1.0);
      await c.scrollToEl(await c.el('main h2, main h3', 'Metrics'), 140, 1.6);
      await c.hold(1.8);
      await c.nav('/accreditation/iqac', 'IQAC workspace: meetings, actions, feedback');
      await c.hold(2.0);
    },
  },
  {
    id: 'fees', title: 'Fee collection', login: 'accounts', route: '/fees',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('Fees: billed, collected, outstanding, overdue', 'main *', 'Outstanding', { closest: '.grid' });
      await c.hold(1.6);
      await c.hoverEl(await c.el('main *', 'Aug 26 · ₹61.4 L'), 'Monthly collection chart', 0.8);
      await c.scrollToEl(await c.el('main h2', 'Defaulters'), 140, 1.6);
      c.mark('Defaulters and recent receipts');
      await c.hold(1.6);
      await c.click(await c.el('main a[href^="/fees/receipts/"]'), 'Fee receipt opened', {});
      await c.hold(2.2);
      await c.nav('/fees/invoices?status=overdue', 'Overdue invoices');
      await c.hold(1.0);
      await c.click(await c.el('main button', 'Record payment'), 'Record payment dialog (take a payment)', {});
      await c.hold(2.2);
      await c.key('Escape');
    },
  },
  {
    id: 'finance', title: 'Accounts desk', login: 'accounts', route: '/accounts',
    async run(c) {
      await c.hold(1.0);
      c.mark('Accounts desk: collected today, still due, overdue, defaulters');
      await c.hold(1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Voucher'), 'Voucher waiting for a decision', 1.0);
      await c.scrollToEl(await c.el('main h2', 'Registers'), 140, 1.6);
      c.mark('Registers: ledgers, vouchers, cheques, budgets');
      await c.hold(1.6);
      await c.scrollTo(0, 1.0);
      await c.click(await c.el('main a', 'Reports', { exact: true }), 'Accounts reports', {});
      await c.hold(2.0);
      await c.nav('/tally', 'Tally sync: send ledgers and vouchers to Tally');
      await c.hold(2.0);
    },
  },
  {
    id: 'hr', title: 'HR and payroll', login: 'hr', route: '/hr',
    async run(c) {
      await c.hold(1.0);
      c.mark('Staff directory');
      await c.hold(1.2);
      await c.click(await c.el('main a', 'Leave', { exact: true }), 'Leave requests and balances', {});
      await c.hold(1.8);
      await c.nav('/payroll', 'Payroll runs: October, September, August');
      await c.hold(1.4);
      await c.click(await c.el('main tbody a, main tbody button', 'Open', { exact: true }), 'Payroll run for October 2026: prepare, verify, approve, lock, bank file', {});
      await c.hold(2.0);
      await c.scrollBy(300, 1.2);
      c.mark('Staff pay lines with PF, PT, TDS and payslip PDF');
      await c.hold(1.8);
    },
  },
  {
    id: 'library', title: 'Library', login: 'library', route: '/library',
    async run(c) {
      await c.hold(1.0);
      await c.markEl('Library: titles, on loan, overdue, unpaid fines', 'main *', 'Unpaid fines', { closest: '.grid' });
      await c.hold(1.4);
      await c.click(await c.el('main button', 'Overdue · 24'), 'Overdue loans with fine today', {});
      await c.hold(1.6);
      await c.hoverEl(await c.el('main tbody tr', 'Python Crash Course'), 'Overdue book row', 0.8);
      await c.click(await c.el('main button', 'Issue a book'), 'Issue a book dialog', {});
      await c.hold(2.0);
      await c.key('Escape');
      await c.click(await c.el('main button', 'Catalogue · 45'), 'Catalogue', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'transport', title: 'Transport', login: 'transport', route: '/transport',
    async run(c) {
      await c.hold(1.0);
      c.mark('Transport: routes, riders, vehicles, papers expiring');
      await c.hold(1.4);
      await c.click(await c.el('main button', 'Vehicles and drivers'), 'Vehicles and drivers', {});
      await c.hold(1.8);
      await c.click(await c.el('main button', 'Expiring papers'), 'Vehicle papers expiring', {});
      await c.hold(1.6);
      await c.click(await c.el('main button', 'Routes · 4'), 'Routes', { max: 1.5 });
      await c.click(await c.el('main a, main button', 'Details'), 'Route 1 details', {});
      await c.hold(1.0);
      await c.click(await c.el(TAB, 'Stops'), 'Route stops', {});
      await c.hold(2.0);
    },
  },
  {
    id: 'hostel', title: 'Hostel', login: 'warden', route: '/hostel',
    async run(c) {
      await c.hold(1.0);
      c.mark('Hostel: beds, free beds, out on a pass, complaints');
      await c.hold(1.4);
      await c.scrollToEl(await c.el('main h2, main h3', 'Beds', { exact: true }), 200, 1.4);
      c.mark('Bed allotment by room');
      await c.hold(1.4);
      await c.scrollTo(0, 1.0);
      await c.click(await c.el('main button', 'Mess', { exact: true }), 'Mess', {});
      await c.hold(1.8);
      await c.click(await c.el('main button', 'Gate passes'), 'Gate passes', {});
      await c.hold(1.6);
      await c.click(await c.el('main button', 'Complaints'), 'Hostel complaints', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'placements', title: 'Placements', login: 'placements', route: '/placements',
    async run(c) {
      await c.hold(1.0);
      c.mark('Placements: registered, placed, median package');
      await c.hold(1.4);
      await c.scrollToEl(await c.el('main h2', 'Drives'), 140, 1.2);
      c.mark('Placement drives: company, role, package, minimum CGPA');
      await c.hold(1.8);
      await c.scrollToEl(await c.el('main h2', 'Placed by company'), 140, 1.6);
      c.mark('Placed by company');
      await c.hold(1.6);
      await c.scrollToEl(await c.el('main h2', 'Internships'), 140, 1.4);
      c.mark('Internships');
      await c.hold(1.6);
      await c.nav('/alumni', 'Alumni giving campaigns');
      await c.hold(1.8);
    },
  },
  {
    id: 'certificates', title: 'Certificates and ID cards', login: 'principal', route: '/documents',
    async run(c) {
      await c.hold(1.0);
      c.mark('Certificate requests: bonafide, conduct; numbered with QR');
      await c.hold(1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Requested'), 'Request waiting for approval', 1.0);
      await c.click(await c.el('main button', 'New request'), 'New certificate request dialog', {});
      await c.hold(2.0);
      await c.key('Escape');
      await c.click(await c.el('main a, main button', 'Templates', { exact: true }), 'Certificate templates', {});
      await c.hold(1.6);
      await c.click(await c.el('main a, main button', 'ID cards', { exact: true }), 'ID cards with QR for a class or staff', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'comms', title: 'Messages to boards and families', login: 'principal', route: '/messages',
    async run(c) {
      await c.hold(1.0);
      c.mark('Circulate a message; sent messages with delivery');
      await c.hold(1.0);
      await c.click(await c.el('main input'), null, { max: 0.4 });
      await c.type('Parent-teacher meeting on Saturday');
      await c.click(await c.el('main textarea'), null, { max: 0.4 });
      await c.type('PTM for all classes on Saturday, 24 October, 10 am to 1 pm.', 0.045);
      c.mark('Message typed');
      await c.click(await c.el('main button', 'Important'), 'Priority: Important (card with a sound)', {});
      await c.hold(1.2);
      await c.hoverEl(await c.el('main *', '4/4 boards displayed'), 'Delivery: shown on 4 of 4 boards', 1.4);
      await c.nav('/communication', 'Communication engine: SMS, WhatsApp, email templates');
      await c.hold(1.8);
    },
  },
  {
    id: 'lms', title: 'LMS and question bank', login: 'principal', route: '/courses',
    async run(c) {
      await c.hold(1.0);
      c.mark('Courses for every class and subject');
      await c.hold(1.0);
      await c.click(await c.el('main tbody a', 'Airport Operations'), 'Course space: units with notes, recorded lectures, links', {});
      await c.hold(1.8);
      await c.scrollBy(350, 1.3);
      await c.hold(1.0);
      await c.goto('/question-bank'); c.mark('[cut] Question bank: questions mapped to COs and Bloom levels');
      await c.hold(1.8);
      await c.click(await c.el('main button, main a', 'Papers (12)'), 'Generated question papers', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'analytics', title: 'Analytics', login: 'principal', route: '/analytics',
    async run(c) {
      await c.hold(1.0);
      c.mark('Analytics: students, attendance, fees, staff');
      await c.hold(1.2);
      await c.hoverEl(await c.el('main *', 'Monthly performance', { closest: 'section, ' + CARD }), 'Monthly performance chart', 0.4);
      await c.moveTo(1000, 470); await c.settle(0.8, 0.2); await c.hold(1.0);
      await c.scrollBy(420, 1.6);
      c.mark('Admissions by month, department health, weekly attendance');
      await c.hold(2.0);
      await c.scrollBy(500, 1.6);
      await c.hold(2.0);
    },
  },
  {
    id: 'workflows', title: 'Workflow builder', login: 'principal', route: '/workflows/builder',
    async run(c) {
      await c.hold(1.0);
      c.mark('Approval workflows: purchase, certificate, leave, fee concession');
      await c.hold(1.2);
      await c.click(await c.el('main tbody tr', 'Purchase approval'), 'Visual canvas: trigger, HoD approval, amount condition, principal, accounts', {});
      await c.hold(2.0);
      await c.hoverEl(await c.el('main *', 'amount >= 25000', { closest: 'button, [data-id], div' }), 'Condition: amount at least 25,000', 1.2);
      await c.click(await c.el('main *', 'Principal approval', { closest: 'button, [data-id], div' }), 'Step opened in the side panel', {});
      await c.hold(2.0);
    },
  },
  {
    id: 'smartboards', title: 'Smartboards and devices', login: 'principal', route: '/boards',
    async run(c) {
      await c.hold(1.0);
      c.mark('Classroom boards: 4 enrolled, 4 online');
      await c.hold(1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Room 101 Board'), 'Board row: room, platform, last seen', 1.0);
      await c.nav('/devices', 'Device console: app version, storage, power, remote actions');
      await c.hold(2.0);
      await c.scrollBy(300, 1.2);
      c.mark('Recent remote actions');
      await c.hold(1.6);
      await c.nav('/live', 'Live: watch a class while it is taught');
      await c.hold(1.8);
    },
  },
  {
    id: 'settings', title: 'Settings', login: 'admin', route: '/settings',
    async run(c) {
      await c.hold(1.0);
      c.mark('Settings: live classroom view, board sign-in, privacy');
      await c.hold(1.4);
      await c.scrollBy(600, 1.8);
      await c.hold(1.2);
      await c.scrollTo(0, 1.0);
      await c.click(await c.el('a', 'Institution profile'), 'Institution profile: affiliation, AISHE code, NAAC grade', {});
      await c.hold(2.0);
    },
  },
  // ---- extra modules ----
  {
    id: 'language', title: 'English, Hindi and Kannada', login: 'principal', route: '/',
    async run(c) {
      await c.hold(1.2);
      c.mark('Dashboard in English');
      await c.click(await c.el('button, a', 'ಕನ್ನಡ', { exact: true }), 'Switched to Kannada', { max: 3 });
      await c.hold(2.0);
      await c.click(await c.el('button, a', 'हिं', { exact: true }), 'Switched to Hindi', { max: 3 });
      await c.hold(2.0);
      await c.click(await c.el('button, a', 'EN', { exact: true }), 'Back to English', { max: 3 });
      await c.hold(1.2);
    },
  },
  {
    id: 'early_alerts', title: 'Early alerts and mentoring', login: 'principal', route: '/early-alerts',
    async run(c) {
      await c.hold(1.0);
      c.mark('Students who may need help, with reasons (attendance, marks, fees)');
      await c.hold(1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Vignesh Naik'), 'Vignesh Naik: high risk', 1.6);
      await c.nav('/mentoring', 'Mentoring: at-risk students with their mentor');
      await c.hold(1.6);
      await c.hoverEl(await c.el('main tbody tr', 'Vignesh Naik'), 'Mentor, attendance, failing marks, overdue fees, risk', 1.8);
    },
  },
  {
    id: 'grievances', title: 'Grievances', login: 'principal', route: '/grievances',
    async run(c) {
      await c.hold(1.0);
      c.mark('Grievance tickets with severity, status and deadlines');
      await c.hold(1.6);
      await c.hoverEl(await c.el('main tbody tr', 'Senior students demanding money'), 'Ragging complaint marked critical and confidential', 1.4);
      await c.click(await c.el('main button, main a', 'Discipline'), 'Discipline cases', {});
      await c.hold(2.0);
    },
  },
  {
    id: 'inventory', title: 'Inventory and stores', login: 'stores', route: '/inventory',
    async run(c) {
      await c.hold(1.0);
      c.mark('Inventory: items, low stock, requisitions');
      await c.hold(1.4);
      await c.hoverEl(await c.el('main tbody tr', 'Ceiling fan'), 'Low-stock item', 1.0);
      await c.click(await c.el('main button', 'Purchase orders'), 'Purchase orders', {});
      await c.hold(1.8);
      await c.click(await c.el('main button', 'Vendors'), 'Vendors', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'research', title: 'Research office', login: 'principal', route: '/research',
    async run(c) {
      await c.hold(1.0);
      c.mark('Research: projects, publications, grants, patents');
      await c.hold(1.6);
      await c.scrollToEl(await c.el('main h2', 'Research office'), 140, 1.6);
      c.mark('Research office: supervisors, theses, datasets');
      await c.hold(1.6);
      await c.click(await c.el('main button', 'Theses'), 'Theses', {});
      await c.hold(1.8);
    },
  },
  {
    id: 'campus_life', title: 'Clubs and events', login: 'principal', route: '/campus-life',
    async run(c) {
      await c.hold(1.0);
      c.mark('Campus life: clubs, committees, events');
      await c.hold(1.4);
      await c.click(await c.el('main button', 'Committees'), 'Committees', {});
      await c.hold(1.6);
      await c.click(await c.el('main button', 'Events'), 'Events', {});
      await c.hold(1.8);
    },
  },
];
