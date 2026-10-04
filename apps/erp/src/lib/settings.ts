// Institution settings (GET/PUT /v1/admin/settings) and the consent summary (GET /v1/admin/consents).

export interface InstitutionSettings {
  liveViewEnabled: boolean;
  liveViewIndicator: boolean;
  classroomAudioToViewers: boolean;
  pinFallbackEnabled: boolean;
}

export type SettingKey = keyof InstitutionSettings;
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
