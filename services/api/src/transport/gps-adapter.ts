import { z } from 'zod';

/** One position from a vendor's tracker, tied to a vehicle by registration number. */
export interface GpsFix {
  vehicle: string;
  lat: number;
  lng: number;
  speedKmh?: number;
}

/** A GPS vendor: turns whatever the vendor posts into fixes. Authentication is the caller's (a per-source token). */
export interface GpsAdapter {
  readonly name: string;
  parse(body: unknown): GpsFix[];
}

const Fix = z
  .object({
    vehicle: z.string().optional(),
    regNo: z.string().optional(),
    deviceId: z.string().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speedKmh: z.number().min(0).max(300).optional(),
    speed: z.number().min(0).max(300).optional(),
  })
  .transform((f) => ({ vehicle: (f.vehicle ?? f.regNo ?? f.deviceId ?? '').trim().toUpperCase(), lat: f.lat, lng: f.lng, speedKmh: f.speedKmh ?? f.speed }))
  .refine((f) => f.vehicle.length > 0);

/** Any vendor that can POST JSON: one fix, an array of fixes, or `{ positions: [...] }`, with `vehicle` (or `regNo`/`deviceId`) as the registration number. */
export class GenericHttpGpsAdapter implements GpsAdapter {
  readonly name = 'generic_http';

  parse(body: unknown): GpsFix[] {
    const raw = Array.isArray(body) ? body : Array.isArray((body as { positions?: unknown })?.positions) ? (body as { positions: unknown[] }).positions : [body];
    return raw.slice(0, 200).flatMap((r) => {
      const f = Fix.safeParse(r);
      return f.success ? [f.data] : [];
    });
  }
}

export const GPS_ADAPTERS: Record<string, GpsAdapter> = { generic_http: new GenericHttpGpsAdapter() };
