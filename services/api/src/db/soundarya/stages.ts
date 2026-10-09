import type { Ctx } from './ctx.js';
import { assessmentsAndHomework, attendance, lessonPlans, lms } from './academics.js';
import { assets, hostelAndCanteen, inventory, library, transport } from './campus.js';
import { attendanceGovernance } from './attendance-gov.js';
import { admissions } from './admissions.js';
import { alumni, campusLife, mentoring, placements, skills } from './engagement.js';
import { communication, documents, governance, health, integrations, lifecycle, reportsAndSystem, research, smartboards, tasksAndWorkflows, welfareAndDiscipline } from './operations.js';
import { smallTables, syllabus } from './finish.js';
import { exams } from './exams.js';
import { obe, questionBank, studentAccounts, surveys } from './outcomes.js';
import { academicAudit, cbcs, courseFiles, evaluation, semesterEndSession } from './quality.js';
import { payroll, recruitment, staffAttendanceAndLeave } from './hr.js';
import { fees, scholarships, sponsorsAndBudgets } from './finance.js';

/** The seed stages in order; each fills one family of modules. */
export const stages: [string, (c: Ctx) => Promise<void>][] = [
  ['attendance and student leave', attendance],
  ['today\'s attendance, corrections, condonation, institution profile and buildings', attendanceGovernance],
  ['internal assessments and homework', assessmentsAndHomework],
  ['LMS', lms],
  ['lesson plans', lessonPlans],
  ['exams, results and revaluation', exams],
  ['fees, payments and defaulters', fees],
  ['scholarships and welfare', scholarships],
  ['sponsors, budgets and expenses', sponsorsAndBudgets],
  ['library', library],
  ['hostel, mess and canteen', hostelAndCanteen],
  ['transport', transport],
  ['inventory and procurement', inventory],
  ['fixed assets', assets],
  ['staff attendance and leave', staffAttendanceAndLeave],
  ['salary structures and payroll runs', payroll],
  ['recruitment', recruitment],
  ['admissions: enquiries, campaigns, cycles, merit list', admissions],
  ['student accounts', studentAccounts],
  ['outcome-based education and attainment', obe],
  ['feedback surveys', surveys],
  ['question bank and papers', questionBank],
  ['semester end session, seating and invigilation', semesterEndSession],
  ['on-screen evaluation', evaluation],
  ['course files', courseFiles],
  ['academic audit', academicAudit],
  ['CBCS course registration', cbcs],
  ['placements and internships', placements],
  ['alumni, giving and mentoring requests', alumni],
  ['campus life: clubs and events', campusLife],
  ['mentoring and intervention plans', mentoring],
  ['skills passport and SDG tags', skills],
  ['tasks and approval workflows', tasksAndWorkflows],
  ['health records', health],
  ['notices, messages and parent-teacher meeting', communication],
  ['counselling, grievances and discipline', welfareAndDiscipline],
  ['committees and governance', governance],
  ['research', research],
  ['certificates, vault and consents', documents],
  ['student lifecycle history', lifecycle],
  ['smartboards, polls and recordings', smartboards],
  ['integrations', integrations],
  ['custom reports, schedules and audit log', reportsAndSystem],
  ['syllabus coverage and year plans', syllabus],
  ['substitutions, AI usage and remaining records', smallTables],
];
