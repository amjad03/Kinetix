'use server';

import { optStr as opt, send } from '@/lib/ops-server';

type V = Record<string, string>;
const BASE = '/v1/ptm';

export async function createEvent(v: V) {
  return send(`${BASE}/events`, { title: v.title, eventDate: v.eventDate, location: v.location ?? '' }, '/ptm');
}

export async function closeEvent(id: string) {
  return send(`${BASE}/events/${encodeURIComponent(id)}/close`, undefined, '/ptm');
}

export async function addSlots(eventId: string, v: V) {
  return send(`${BASE}/events/${encodeURIComponent(eventId)}/slots`, { teacherId: opt(v.teacherId), from: v.from, to: v.to, durationMinutes: Number(v.durationMinutes) }, '/ptm');
}

export async function remindFamilies(eventId: string) {
  return send(`${BASE}/events/${encodeURIComponent(eventId)}/remind`, undefined, '/ptm');
}

export async function cancelBooking(slotId: string) {
  return send(`${BASE}/slots/${encodeURIComponent(slotId)}/cancel`, undefined, '/ptm');
}
