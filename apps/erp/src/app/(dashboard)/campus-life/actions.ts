'use server';

import { send, num, optStr, read } from '@/lib/ops-server';
import type { ActionItem, ClubActivity, ClubMember, CommitteeMember, EventRegistration, EventSummary, Meeting } from '@/lib/clife';

const PAGE = '/campus-life';
const C = '/v1/campus-life';
type V = Record<string, string>;
const id = encodeURIComponent;

// ---- clubs ----
export async function addClub(v: V) {
  return send(`${C}/clubs`, { name: v.name, category: v.category || 'general', description: v.description ?? '', ...(optStr(v.coordinator) ? { facultyCoordinatorId: v.coordinator } : {}) }, PAGE);
}
export async function clubMembers(clubId: string) {
  return read<ClubMember[]>(`${C}/clubs/${id(clubId)}/members`);
}
export async function clubActivities(clubId: string) {
  return read<ClubActivity[]>(`${C}/clubs/${id(clubId)}/activities`);
}
export async function decideMember(clubId: string, memberId: string, decision: 'approve' | 'reject') {
  return send(`${C}/clubs/${id(clubId)}/members/${id(memberId)}/decision`, { decision }, PAGE);
}
export async function setMemberRole(clubId: string, memberId: string, role: 'member' | 'lead') {
  return send(`${C}/clubs/${id(clubId)}/members/${id(memberId)}`, { role }, PAGE, 'PATCH');
}
export async function addActivity(clubId: string, v: V) {
  return send(`${C}/clubs/${id(clubId)}/activities`, { title: v.title, activityOn: v.activityOn, points: num(v.points || '0') }, PAGE);
}
export async function markAttendance(activityId: string, studentIds: string[]) {
  return send(`${C}/activities/${id(activityId)}/attendance`, { studentIds }, PAGE);
}

// ---- committees ----
export async function addCommittee(v: V) {
  return send(`${C}/committees`, { name: v.name, statutory: v.statutory === 'yes', description: v.description ?? '' }, PAGE);
}
export async function committeeMembers(cid: string) {
  return read<CommitteeMember[]>(`${C}/committees/${id(cid)}/members`);
}
export async function committeeMeetings(cid: string) {
  return read<Meeting[]>(`${C}/committees/${id(cid)}/meetings`);
}
export async function meetingActions(meetingId: string) {
  return read<ActionItem[]>(`${C}/action-items?meetingId=${id(meetingId)}`);
}
export async function addCommitteeMember(cid: string, v: V) {
  return send(`${C}/committees/${id(cid)}/members`, { userId: v.userId, role: v.role || 'member', tenureStart: v.tenureStart, ...(optStr(v.tenureEnd) ? { tenureEnd: v.tenureEnd } : {}) }, PAGE);
}
export async function endTenure(cid: string, memberId: string, tenureEnd: string) {
  return send(`${C}/committees/${id(cid)}/members/${id(memberId)}`, { tenureEnd }, PAGE, 'PATCH');
}
export async function addMeeting(cid: string, v: V) {
  return send(`${C}/committees/${id(cid)}/meetings`, { title: v.title, meetingOn: v.meetingOn, agenda: v.agenda ?? '' }, PAGE);
}
export async function saveMinutes(meetingId: string, v: V) {
  return send(`${C}/meetings/${id(meetingId)}`, { minutes: v.minutes, status: v.status || 'held' }, PAGE, 'PATCH');
}
export async function addAction(meetingId: string, v: V) {
  return send(`${C}/meetings/${id(meetingId)}/actions`, { title: v.title, ownerUserId: v.ownerUserId, dueOn: v.dueOn }, PAGE);
}
export async function setActionStatus(actionId: string, status: string) {
  return send(`${C}/action-items/${id(actionId)}/status`, { status }, PAGE);
}

// ---- events ----
export async function addEvent(v: V) {
  return send(
    `${C}/events`,
    { title: v.title, description: v.description ?? '', eventType: v.eventType || 'other', venue: v.venue ?? '', capacity: num(v.capacity), startsAt: v.startsAt, endsAt: v.endsAt, audience: v.audience || 'all', feePaise: num(v.fee || '0'), publish: v.publish === 'yes' },
    PAGE,
  );
}
export async function eventStep(eventId: string, step: 'publish' | 'cancel') {
  return send(`${C}/events/${id(eventId)}/${step}`, undefined, PAGE);
}
export async function checkIn(eventId: string, v: V) {
  return send(`${C}/events/${id(eventId)}/check-in`, { token: v.token }, PAGE);
}
export async function eventRegistrations(eventId: string) {
  return read<EventRegistration[]>(`${C}/events/${id(eventId)}/registrations`);
}
export async function eventSummary(eventId: string) {
  return read<EventSummary>(`${C}/events/${id(eventId)}/summary`);
}
