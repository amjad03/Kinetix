'use server';

import { send, num, optStr } from '@/lib/ops-server';

const PAGE = '/hostel';
type V = Record<string, string>;
const H = '/v1/hostel';
const id = encodeURIComponent;

export async function addBlock(v: V) {
  return send(`${H}/blocks`, { name: v.name, gender: v.gender || 'mixed' }, PAGE);
}

export async function addRoom(v: V) {
  return send(`${H}/blocks/${id(v.blockId)}/rooms`, { number: v.number, floor: num(v.floor || '0'), beds: num(v.beds), monthlyFeePaise: num(v.fee || '0') }, PAGE);
}

export async function allot(v: V) {
  return send(`${H}/allotments`, { studentId: v.studentId, bedId: v.bedId, ...(optStr(v.startsOn) ? { startsOn: v.startsOn } : {}) }, PAGE);
}

export async function vacate(allotmentId: string) {
  return send(`${H}/allotments/${id(allotmentId)}/vacate`, undefined, PAGE);
}

export async function chargeHostelFees(v: V) {
  return send(`${H}/fees`, { title: v.title, dueOn: v.dueOn }, PAGE);
}

export async function issuePass(v: V) {
  return send(`${H}/gate-passes`, { studentId: v.studentId, reason: v.reason, destination: v.destination ?? '', expectedBackAt: v.expectedBackAt }, PAGE);
}

/** Gate moves: out, in, cancel. */
export async function passStep(passId: string, step: 'out' | 'in' | 'cancel') {
  return send(`${H}/gate-passes/${id(passId)}/${step}`, undefined, PAGE);
}

export async function signInVisitor(v: V) {
  return send(`${H}/visitors`, { studentId: v.studentId, visitorName: v.visitorName, relation: v.relation ?? '', phone: v.phone ?? '', idProof: v.idProof ?? '' }, PAGE);
}

export async function signOutVisitor(visitorId: string) {
  return send(`${H}/visitors/${id(visitorId)}/out`, undefined, PAGE);
}

export async function addPlan(v: V) {
  return send(`${H}/mess/plans`, { name: v.name, monthlyFeePaise: num(v.fee), meals: v.meals.split(',').filter(Boolean) }, PAGE);
}

export async function subscribeMess(v: V) {
  return send(`${H}/mess/subscriptions`, { studentId: v.studentId, planId: v.planId, ...(optStr(v.startsOn) ? { startsOn: v.startsOn } : {}) }, PAGE);
}

export async function chargeMessFees(v: V) {
  return send(`${H}/mess/fees`, { title: v.title, dueOn: v.dueOn }, PAGE);
}

export async function setMenu(dayOfWeek: number, meal: string, v: V) {
  return send(`${H}/mess/menu`, { dayOfWeek, meal, items: v.items }, PAGE, 'PUT');
}

export async function setComplaintStatus(complaintId: string, status: 'in_progress' | 'resolved', v: V = {}) {
  return send(`${H}/complaints/${id(complaintId)}/status`, { status, ...(optStr(v.resolution) ? { resolution: v.resolution } : {}) }, PAGE);
}
