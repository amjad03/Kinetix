'use server';

import { num, optStr, read, send } from '@/lib/ops-server';
import { zonedIso, type BudgetSummary, type Clashes, type DutyLeaveRow, type ElectionDetail, type ExternalRegistration, type RefundRow, type StudentPick, type UnitDetail } from '@/lib/life';
import { TIMEZONE } from '@/lib/school';

const PAGE = '/campus-life';
const C = '/v1/campus-life';
type V = Record<string, string>;
const id = encodeURIComponent;

// ---- units ----
export async function unitDetail(unitId: string) {
  return read<UnitDetail>(`${C}/units/${id(unitId)}`);
}
export async function addUnitMembers(unitId: string, studentIds: string[], role: string, enrolledOn: string) {
  return send(`${C}/units/${id(unitId)}/members`, { studentIds, role: role || 'member', enrolledOn }, PAGE);
}
export async function setUnitMember(memberId: string, patch: { role?: string; status?: 'active' | 'left' }) {
  return send(`${C}/unit-members/${id(memberId)}`, patch, PAGE, 'PATCH');
}
export async function addUnitActivity(unitId: string, v: V) {
  return send(`${C}/units/${id(unitId)}/activities`, { title: v.title, kind: v.kind || 'regular', startsOn: v.startsOn, endsOn: v.endsOn || v.startsOn, place: v.place ?? '', hours: Number(v.hours || '0'), result: v.result ?? '', description: v.description ?? '' }, PAGE);
}
export async function dropUnitActivity(activityId: string) {
  return send(`${C}/unit-activities/${id(activityId)}`, undefined, PAGE, 'DELETE');
}
export async function activityHours(activityId: string) {
  return read<{ studentId: string; hours: number }[]>(`${C}/unit-activities/${id(activityId)}/hours`);
}
export async function saveActivityHours(activityId: string, entries: { studentId: string; hours: number }[]) {
  return send(`${C}/unit-activities/${id(activityId)}/hours`, { entries }, PAGE, 'PUT');
}
/** The students of a class (for pickers). */
export async function studentsOf(sectionId: string) {
  return read<{ rows: StudentPick[] }>(`/v1/records/students?f.section=${id(sectionId)}&pageSize=200&sort=roll:asc`);
}

// ---- budgets ----
export async function clubBudgets(year?: string) {
  return read<BudgetSummary>(`${C}/club-budgets${year ? `?year=${id(year)}` : ''}`);
}
export async function setClubBudget(clubId: string, v: V) {
  return send(`${C}/clubs/${id(clubId)}/budget`, { yearLabel: v.yearLabel, amountPaise: num(v.amount), notes: v.notes ?? '' }, PAGE, 'PUT');
}

// ---- events ----
export async function addEventWithBudget(v: V) {
  return send(`${C}/events`, {
    title: v.title,
    eventType: v.eventType || 'other',
    venue: v.venue ?? '',
    capacity: num(v.capacity),
    startsAt: zonedIso(v.startsAt, TIMEZONE),
    endsAt: zonedIso(v.endsAt, TIMEZONE),
    audience: v.audience || 'all',
    feePaise: v.fee ? num(v.fee) : 0,
    description: v.description ?? '',
    publish: false,
  }, PAGE);
}
export async function checkClashes(startsAt: string, endsAt: string, venue: string) {
  return read<Clashes>(`${C}/clashes?startsAt=${id(startsAt)}&endsAt=${id(endsAt)}&venue=${id(venue)}`);
}
export async function eventClashes(eventId: string) {
  return read<Clashes>(`${C}/events/${id(eventId)}/clashes`);
}
export async function proposeEvent(eventId: string) {
  return send(`${C}/events/${id(eventId)}/propose`, {}, PAGE);
}
export async function decideEvent(eventId: string, decision: 'approve' | 'reject', note: string) {
  return send(`${C}/events/${id(eventId)}/approval`, { decision, note }, PAGE);
}
export async function saveEventReport(eventId: string, v: V) {
  return send(`${C}/events/${id(eventId)}/report`, { report: v.report, spentPaise: v.spent ? num(v.spent) : 0 }, PAGE, 'PUT');
}
export async function recordFee(registrationId: string, v: V) {
  return send(`${C}/registrations/${id(registrationId)}/payment`, { paidPaise: num(v.paid), paymentRef: v.ref ?? '' }, PAGE);
}
export async function externalRegistrations(eventId: string) {
  return read<ExternalRegistration[]>(`${C}/events/${id(eventId)}/external`);
}
export async function addExternal(eventId: string, v: V) {
  return send(`${C}/events/${id(eventId)}/external`, { fullName: v.fullName, email: v.email ?? '', phone: v.phone ?? '', institution: v.institution ?? '', paidPaise: v.paid ? num(v.paid) : 0, paymentRef: v.ref ?? '' }, PAGE);
}
export async function cancelExternal(registrationId: string) {
  return send(`${C}/external/${id(registrationId)}/cancel`, {}, PAGE);
}
export async function checkInExternal(eventId: string, v: V) {
  return send(`${C}/events/${id(eventId)}/check-in-external`, { token: v.token }, PAGE);
}
export async function eventRefunds(eventId: string) {
  return read<RefundRow[]>(`${C}/events/${id(eventId)}/refunds`);
}
export async function markRefunded(kind: 'student' | 'external', registrationId: string, v: V) {
  return send(`${C}/refunds/${kind}/${id(registrationId)}`, { refundRef: v.ref ?? '' }, PAGE);
}
export async function dutyLeaves(eventId: string) {
  return read<DutyLeaveRow[]>(`${C}/events/${id(eventId)}/duty-leave`);
}
export async function grantDutyLeave(eventId: string, role: string) {
  return send<{ granted: { studentId: string; excused: number }[]; skipped: number }>(`${C}/events/${id(eventId)}/duty-leave`, { role: role || 'participant' }, PAGE);
}

// ---- elections ----
export async function addElection(v: V) {
  return send(`${C}/elections`, { title: v.title, description: v.description ?? '', votingStartsAt: zonedIso(v.votingStartsAt, TIMEZONE), votingEndsAt: zonedIso(v.votingEndsAt, TIMEZONE) }, PAGE);
}
export async function electionDetail(electionId: string) {
  return read<ElectionDetail>(`${C}/elections/${id(electionId)}`);
}
export async function addPost(electionId: string, v: V) {
  return send(`${C}/elections/${id(electionId)}/posts`, { title: v.title, seats: num(v.seats || '1') }, PAGE);
}
export async function dropPost(postId: string) {
  return send(`${C}/election-posts/${id(postId)}`, undefined, PAGE, 'DELETE');
}
export async function nominate(postId: string, v: V) {
  return send(`${C}/election-posts/${id(postId)}/candidates`, { studentId: v.studentId, manifesto: optStr(v.manifesto) ?? '' }, PAGE);
}
export async function withdrawCandidate(candidateId: string) {
  return send(`${C}/election-candidates/${id(candidateId)}/withdraw`, {}, PAGE);
}
export async function electionStep(electionId: string, step: 'open' | 'close' | 'publish') {
  return send<{ ties?: string[] }>(`${C}/elections/${id(electionId)}/${step}`, {}, PAGE);
}
