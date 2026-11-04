// The transport production pass in the ERP: the API paths its pages may call, the shapes of the live board, the
// optimisation and the safety matrix, and the small pure helpers the map and the tables share (tested on their own).

/** POSTs the transport pages may send besides the shared desk paths: fill stop fees from the fare slabs, send the expiry reminders. */
export const TRANSPORT_PASS_POSTS = /^\/v1\/transport\/(fare-slabs\/apply|expiry-reminders\/run)$/;
export const isTransportPassPost = (path: string) => typeof path === 'string' && TRANSPORT_PASS_POSTS.test(path);

export interface LiveStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  reached: boolean;
}
export interface LiveTrip {
  tripId: string;
  routeId: string;
  routeName: string;
  direction: 'pickup' | 'drop';
  regNo: string | null;
  driverName: string;
  startedAt: string;
  lat: number | null;
  lng: number | null;
  speedKmh: number | null;
  lastPingAt: string | null;
  silentMinutes: number | null;
  stopsReached: number;
  stopsTotal: number;
  nextStop: { id: string; name: string } | null;
  etaMinutes: number | null;
  lateMinutes: number | null;
  riders: number;
  boarded: number;
  alighted: number;
  alerts: number;
  sos: boolean;
  notBoarded: number;
  stops: LiveStop[];
}
export interface LiveBoard {
  at: string;
  trips: LiveTrip[];
}

export type OccupancyStatus = 'over' | 'full' | 'low' | 'ok' | 'no_vehicle';
export interface Optimisation {
  lowPct: number;
  nearKm: number;
  totals: { seats: number; riders: number; occupancyPct: number | null; idleVehicles: number };
  routes: { id: string; name: string; regNo: string | null; capacity: number | null; riders: number; occupancyPct: number | null; seatsLeft: number | null; status: OccupancyStatus }[];
  suggestions: (
    | { kind: 'over'; routeId: string; riders: number; capacity: number; moveTo?: { routeId: string; seats: number }; vehicle?: { id: string; regNo: string; capacity: number } }
    | { kind: 'low'; routeId: string; riders: number; capacity: number; mergeInto?: { routeId: string; seats: number }; vehicle?: { id: string; regNo: string; capacity: number } }
    | { kind: 'swap'; routeId: string; withRouteId: string }
    | { kind: 'no_vehicle'; routeId: string; riders: number; vehicle?: { id: string; regNo: string; capacity: number } }
  )[];
  idleVehicles: { id: string; regNo: string; capacity: number }[];
  emptyStops: { id: string; name: string; routeId: string; routeName: string }[];
}

export const SAFETY_ITEMS = ['speedGovernor', 'gpsWorking', 'cctvWorking', 'firstAidBox', 'fireExtinguisher', 'emergencyExit', 'windowGrills', 'doorLocks', 'yellowPaint', 'schoolBusSign', 'schoolNamePhone', 'seatBelts', 'panicButton'] as const;
export const DERIVED_ITEMS = ['papers', 'gpsTracker', 'femaleAttendant', 'conductor', 'driverLicence', 'driverExperience', 'driverPoliceVerified', 'driverMedical'] as const;
export interface SafetyRow {
  vehicleId: string;
  regNo: string;
  capacity: number;
  routes: string[];
  lastCheckOn: string | null;
  nextCheckDue: string | null;
  items: Record<(typeof SAFETY_ITEMS)[number], boolean>;
  derived: Record<(typeof DERIVED_ITEMS)[number], boolean>;
  driver: { name: string; licenceYears: number | null } | null;
  attendant: { name: string; gender: string } | null;
  gaps: string[];
  compliant: boolean;
}
export interface Safety {
  today: string;
  minDriverExperienceYears: number;
  vehicles: SafetyRow[];
  compliant: number;
  total: number;
}

export interface SlabPreview {
  dryRun: boolean;
  updated: number;
  unchanged: number;
  changes: { stopId: string; route: string; stop: string; distanceKm: number; beforePaise: number | null; afterPaise: number }[];
  uncovered: { route: string; stop: string; distanceKm: number | null }[];
}

/** Slippy-map tile maths (OpenStreetMap): the world in 256-pixel tiles at zoom `z`. */
export function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 256 * 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** The zoom that fits every point in a `w`×`h` box with a margin, and the pixel at the box's top-left at that zoom. */
export function fitView(points: { lat: number; lng: number }[], w: number, h: number, margin = 40, maxZoom = 16): { z: number; left: number; top: number } {
  const pts = points.length ? points : [{ lat: 12.9716, lng: 77.5946 }];
  let z = maxZoom;
  for (; z > 2; z--) {
    const ps = pts.map((p) => project(p.lat, p.lng, z));
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= w - 2 * margin && Math.max(...ys) - Math.min(...ys) <= h - 2 * margin) break;
  }
  const ps = pts.map((p) => project(p.lat, p.lng, z));
  const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2;
  const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2;
  return { z, left: cx - w / 2, top: cy - h / 2 };
}

/** The tiles covering a view: `{ z, x, y, px, py }` with the tile's position in the box. */
export function tilesFor(view: { z: number; left: number; top: number }, w: number, h: number) {
  const out: { z: number; x: number; y: number; px: number; py: number }[] = [];
  const max = 2 ** view.z;
  for (let tx = Math.floor(view.left / 256); tx * 256 < view.left + w; tx++)
    for (let ty = Math.floor(view.top / 256); ty * 256 < view.top + h; ty++) if (ty >= 0 && ty < max) out.push({ z: view.z, x: ((tx % max) + max) % max, y: ty, px: tx * 256 - view.left, py: ty * 256 - view.top });
  return out;
}

/** How a bus stands, most urgent first: SOS, silent (no fix for 5 minutes), late, alerts, on time. */
export function tripState(t: Pick<LiveTrip, 'sos' | 'silentMinutes' | 'lateMinutes' | 'alerts' | 'notBoarded'>): 'sos' | 'silent' | 'late' | 'alert' | 'ok' {
  if (t.sos) return 'sos';
  if (t.silentMinutes != null && t.silentMinutes >= 5) return 'silent';
  if ((t.lateMinutes ?? 0) > 0) return 'late';
  if (t.alerts > 0 || t.notBoarded > 0) return 'alert';
  return 'ok';
}
