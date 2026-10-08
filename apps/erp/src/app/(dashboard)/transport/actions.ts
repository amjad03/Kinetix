'use server';

import { read, send, num, optStr } from '@/lib/ops-server';
import type { TRouteDetail, TTripDetail } from '@/lib/ops';
import type { ActionResult } from '@/lib/types';

const PAGE = '/transport';
type V = Record<string, string>;

export async function loadRoute(id: string): Promise<ActionResult<TRouteDetail>> {
  return read<TRouteDetail>(`/v1/transport/routes/${encodeURIComponent(id)}`);
}

export async function loadTrip(id: string): Promise<ActionResult<TTripDetail>> {
  return read<TTripDetail>(`/v1/transport/trips/${encodeURIComponent(id)}`);
}

export async function addRoute(v: V) {
  return send('/v1/transport/routes', { name: v.name, monthlyFeePaise: num(v.fee || '0'), ...(optStr(v.vehicleId) ? { vehicleId: v.vehicleId } : {}), ...(optStr(v.driverId) ? { driverId: v.driverId } : {}) }, PAGE);
}

/** Assigns a vehicle and driver (blank clears them) and sets the monthly fee. */
export async function updateRoute(id: string, v: V) {
  return send(`/v1/transport/routes/${encodeURIComponent(id)}`, { vehicleId: optStr(v.vehicleId) ?? null, driverId: optStr(v.driverId) ?? null, monthlyFeePaise: num(v.fee || '0') }, PAGE, 'PATCH');
}

export async function setRouteActive(id: string, active: boolean) {
  return send(`/v1/transport/routes/${encodeURIComponent(id)}`, { active }, PAGE, 'PATCH');
}

export async function addStop(routeId: string, v: V) {
  return send(`/v1/transport/routes/${encodeURIComponent(routeId)}/stops`, { name: v.name, lat: num(v.lat), lng: num(v.lng), ...(optStr(v.pickupTime) ? { pickupTime: v.pickupTime } : {}) }, PAGE);
}

export async function seatStudent(routeId: string, stopId: string, v: V) {
  return send('/v1/transport/assignments', { studentId: v.studentId, routeId, stopId, ...(optStr(v.startsOn) ? { startsOn: v.startsOn } : {}) }, PAGE);
}

export async function endSeat(studentId: string) {
  return send(`/v1/transport/assignments/${encodeURIComponent(studentId)}/end`, undefined, PAGE);
}

export async function addVehicle(v: V) {
  const d = (k: string) => (optStr(v[k]) ? { [k === 'insurance' ? 'insuranceExpiresOn' : k === 'fitness' ? 'fitnessExpiresOn' : 'pucExpiresOn']: v[k] } : {});
  return send('/v1/transport/vehicles', { regNo: v.regNo, model: v.model ?? '', capacity: num(v.capacity), ...d('insurance'), ...d('fitness'), ...d('puc') }, PAGE);
}

export async function addDriver(v: V) {
  return send('/v1/transport/drivers', { fullName: v.fullName, phone: v.phone ?? '', role: v.role || 'driver', ...(optStr(v.licenseNo) ? { licenseNo: v.licenseNo } : {}), ...(optStr(v.licenseExpiresOn) ? { licenseExpiresOn: v.licenseExpiresOn } : {}), ...(optStr(v.userId) ? { userId: v.userId } : {}) }, PAGE);
}

/** Charges each rider the route fee as a fee invoice (once per title). */
export async function chargeFees(v: V) {
  return send<{ created?: number }>('/v1/transport/fees', { title: v.title, dueOn: v.dueOn, ...(optStr(v.routeId) ? { routeId: v.routeId } : {}) }, PAGE);
}
