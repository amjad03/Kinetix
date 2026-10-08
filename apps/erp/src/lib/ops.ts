// Shared bits for the operations desks (transport, hostel, canteen, inventory, assets).

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/** A key that makes a retried request apply once (goods receipts, wallet top-ups, canteen orders). */
export const newKey = (): string => crypto.randomUUID();

/** A value from a form: undefined when blank. */
export const opt = (s: string | undefined): string | undefined => (s && s.trim() ? s.trim() : undefined);

/** Quantities typed per row (`q_<id>` fields) as `{ id, qty }` rows, leaving out blanks and zeros. */
export function qtyRows(v: Record<string, string>, prefix: string): { id: string; qty: number }[] {
  return Object.entries(v)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, q]) => ({ id: k.slice(prefix.length), qty: Math.trunc(Number(q)) }))
    .filter((r) => Number.isFinite(r.qty) && r.qty > 0);
}

/** Days from `today` (YYYY-MM-DD) to `date`; negative when already past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
}

/** The hour and minute of an ISO time as HH:MM in the school's zone. */
export const isLate = (iso: string, now: number = Date.now()): boolean => Date.parse(iso) < now;

// ---- Transport (v1/transport) ----
export interface TRoute { id: string; name: string; monthlyFeePaise: number; active: boolean; vehicleId: string | null; regNo: string | null; capacity: number | null; driverId: string | null; driverName: string | null; riders: number; stops: number }
export interface TStop { id: string; name: string; lat: number; lng: number; pickupTime: string | null; seq: number }
export interface TRouteDetail extends Omit<TRoute, 'stops' | 'riders'> { stops: TStop[]; riders: { studentId: string; fullName: string; rollNo: string | null; stopId: string }[] }
export interface TVehicle { id: string; regNo: string; model: string; capacity: number; status: string; insuranceExpiresOn: string | null; fitnessExpiresOn: string | null; pucExpiresOn: string | null }
export interface TDriver { id: string; fullName: string; phone: string; role: string; licenseNo: string | null; licenseExpiresOn: string | null; active: boolean }
export interface TTrip { id: string; routeId: string; direction: string; status: string; startedAt: string; endedAt: string | null; pings: number; lastPingAt: string | null; lastSpeedKmh: number | null }
export interface TTripRow { trip: TTrip; routeName: string }
export interface TTripDetail extends TTrip { events: { kind: string; at: string; stopName: string | null }[] }
export interface TCompliance { today: string; items: { kind: string; subject: string; expiresOn: string; expired: boolean }[] }

// ---- Hostel and canteen (v1/hostel, v1/canteen) ----
export interface HBlock { id: string; name: string; gender: string; rooms: number; beds: number; occupied: number }
export interface HBed { bedId: string; label: string; roomId: string; room: string; floor: number; block: string; monthlyFeePaise: number; allotmentId: string | null; studentId: string | null; studentName: string | null }
export interface HPassRow { pass: { id: string; studentId: string; reason: string; destination: string; expectedBackAt: string; status: string; outAt: string | null; inAt: string | null }; studentName: string; overdue: boolean }
export interface HVisitorRow { visitor: { id: string; visitorName: string; relation: string; phone: string; inAt: string; outAt: string | null }; studentName: string }
export interface HPlan { id: string; name: string; monthlyFeePaise: number; meals: string[]; active: boolean; subscribers: number }
export interface HMenu { dayOfWeek: number; meal: string; items: string }
export interface HComplaint { id: string; studentId: string | null; category: string; description: string; status: string; resolution: string | null; createdAt: string }
export interface CItem { id: string; name: string; pricePaise: number; available: boolean }

// ---- Inventory and assets (v1/inventory, v1/assets) ----
export interface IItem { id: string; sku: string; name: string; category: string; unit: string; reorderLevel: number; active: boolean; onHand: number; low: boolean }
export interface IStore { id: string; name: string; location: string }
export interface IVendor { id: string; name: string; gstin: string | null; phone: string; email: string | null }
export interface IStock { storeId: string; store: string; itemId: string; sku: string; item: string; unit: string; qty: number; reorderLevel: number }
export interface IReq { id: string; number: string; reason: string; status: string; decisionNote: string | null; lines: { itemId: string; item: string; unit: string; qty: number }[] }
export interface IPoRow { id: string; number: string; status: string; totalPaise: number; vendor: string }
export interface IPoDetail extends IPoRow { storeId?: string; lines: { id: string; itemId: string; item: string; unit: string; qty: number; unitPricePaise: number; receivedQty: number }[]; invoices: { id: string; invoiceNo: string; amountPaise: number; expectedPaise: number; status: string }[]; receipts: { id: string; receivedAt: string }[] }
export interface IInvoiceRow { invoice: { id: string; invoiceNo: string; amountPaise: number; expectedPaise: number; status: string; note: string | null }; po: string; vendor: string }
export interface Asset { id: string; tag: string; name: string; category: string; location: string; purchasedOn: string; costPaise: number; salvagePaise: number; usefulLifeYears: number; method: string; wdvRatePct: number | null; status: string; qr: string; assignedTo?: string | null; bookValuePaise: number }
export interface AssetDetail extends Asset {
  /** The tag's QR code as SVG, drawn by the API. */
  qrSvg: string;
  allocations: { id: string; assignedTo: string; allocatedOn: string; returnedOn: string | null }[];
  maintenance: { id: string; kind: string; description: string; costPaise: number; doneOn: string; nextDueOn: string | null }[];
  depreciation: { year: number; depreciationPaise: number; bookValuePaise: number }[];
}
export interface MaintDue { assetId: string; tag: string; name: string; nextDueOn: string }
