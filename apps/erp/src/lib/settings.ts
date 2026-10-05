// Institution settings (GET/PUT /v1/admin/settings) and the consent summary (GET /v1/admin/consents).

/** The DPDP grievance officer families see in the apps (Profile → Privacy). */
export interface GrievanceOfficer {
  name: string;
  email?: string;
  phone?: string;
}

export interface InstitutionSettings {
  liveViewEnabled: boolean;
  liveViewIndicator: boolean;
  classroomAudioToViewers: boolean;
  pinFallbackEnabled: boolean;
  grievanceOfficer?: GrievanceOfficer | null;
  /** Kiosk mode on boards (docs/hardware/kiosk-mode.md). The API never returns the PIN or its hash. */
  boardKiosk?: BoardKiosk;
}

export interface BoardKiosk {
  enabled: boolean;
  pinSet: boolean;
  /** When the IT PIN was last set (ISO), or null. */
  pinSetAt: string | null;
}

/** Kiosk mode is on unless the institution turned it off. */
export const DEFAULT_BOARD_KIOSK: BoardKiosk = { enabled: true, pinSet: false, pinSetAt: null };

export type KioskPinProblem = 'digits' | 'length' | 'mismatch';

/** Checks a new IT PIN the way the API does (4–8 digits), and that it was typed the same twice. */
export function kioskPinProblem(pin: string, confirm: string): KioskPinProblem | null {
  if (!/^\d*$/.test(pin)) return 'digits';
  if (pin.length < 4 || pin.length > 8) return 'length';
  if (pin !== confirm) return 'mismatch';
  return null;
}

/** The on/off settings. */
export type SettingKey = 'liveViewEnabled' | 'liveViewIndicator' | 'classroomAudioToViewers' | 'pinFallbackEnabled';
export const SETTING_KEYS: SettingKey[] = ['liveViewEnabled', 'liveViewIndicator', 'classroomAudioToViewers', 'pinFallbackEnabled'];

/** The "being viewed" sign and class audio only matter while live view is on. */
export function settingDisabled(s: InstitutionSettings, key: SettingKey): boolean {
  return (key === 'liveViewIndicator' || key === 'classroomAudioToViewers') && !s.liveViewEnabled;
}

/** Turning class audio on for leaders asks first; everything else saves at once. */
export function needsConfirm(key: SettingKey, value: boolean): boolean {
  return key === 'classroomAudioToViewers' && value;
}

export const PURPOSES = ['data_processing', 'ai_features', 'class_recordings', 'photos'] as const;
export type Purpose = (typeof PURPOSES)[number];

export interface ConsentSummary {
  noticeVersion: string;
  students: number;
  purposes: { purpose: Purpose; granted: number; withdrawn: number; notAsked: number }[];
}

/** Whole-number shares of students for a purpose that add up to 100 (largest remainder), or null without students. */
export function consentShares(p: { granted: number; withdrawn: number; notAsked: number }): { granted: number; withdrawn: number; notAsked: number } | null {
  const total = p.granted + p.withdrawn + p.notAsked;
  if (total <= 0) return null;
  const keys = ['granted', 'withdrawn', 'notAsked'] as const;
  const raw = keys.map((k) => (p[k] / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return { granted: out[0], withdrawn: out[1], notAsked: out[2] };
}

export type GrievanceProblem = 'name' | 'nameLong' | 'email' | 'phone';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the grievance officer the way the API does (name 1–120, a valid email, phone up to 20). */
export function grievanceProblem(g: { name: string; email: string; phone: string }): GrievanceProblem | null {
  const name = g.name.trim();
  if (!name) return 'name';
  if (name.length > 120) return 'nameLong';
  if (g.email.trim() && !EMAIL.test(g.email.trim())) return 'email';
  if (g.phone.trim().length > 20) return 'phone';
  return null;
}

/** The body for PUT /v1/admin/settings: empty email and phone are left out. */
export function grievanceBody(g: { name: string; email: string; phone: string }): GrievanceOfficer {
  const email = g.email.trim();
  const phone = g.phone.trim();
  return { name: g.name.trim(), ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
}
