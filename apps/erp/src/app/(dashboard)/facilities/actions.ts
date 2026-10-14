'use server';

import { cancelBooking, decideBooking, moveTicket, rateTicket, roomDay } from '@/app/(dashboard)/inventory/actions';

type V = Record<string, string>;

/** The estate office turns a booking down, saying why. */
export async function rejectBooking(bookingId: string, v: V) {
  return decideBooking(bookingId, false, v);
}

export async function approveBooking(bookingId: string, v: V) {
  return decideBooking(bookingId, true, v);
}

export async function cancelBookingRow(bookingId: string, v: V) {
  return cancelBooking(bookingId, v);
}

/** Hands a ticket to a technician or contractor. */
export async function assignTicket(ticketId: string, v: V) {
  return moveTicket(ticketId, 'assigned', v);
}

export async function startTicket(ticketId: string) {
  return moveTicket(ticketId, 'in_progress');
}

/** Marks a ticket done, with what was done and what it cost. */
export async function resolveTicket(ticketId: string, v: V) {
  return moveTicket(ticketId, 'resolved', v);
}

export async function reopenTicket(ticketId: string, v: V) {
  return moveTicket(ticketId, 'open', v);
}

/** The person who raised it rates the work; a poor job can be reopened. */
export async function rateTicketRow(ticketId: string, v: V) {
  return rateTicket(ticketId, v);
}

export async function loadRoomDay(roomId: string, date: string) {
  return roomDay(roomId, date);
}
