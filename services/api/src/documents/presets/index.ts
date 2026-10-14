import { DOC_TYPES, type DocLayout, DocLayoutSchema, type DocType, PRESET_STYLES, type PresetStyle } from '@kinetix/shared';
import { staffCard, studentCard } from './cards.js';
import { PAGE_PRESETS } from './documents.js';

/**
 * The system presets: four looks (classic, modern, minimal, heritage) for every document type.
 * Read-only; an institution duplicates one to change it. Ids are `preset:<docType>:<style>`.
 */

const BUILDERS: Record<DocType, (st: PresetStyle) => DocLayout> = {
  student_id_card: studentCard,
  staff_id_card: staffCard,
  ...(PAGE_PRESETS as Record<Exclude<DocType, 'student_id_card' | 'staff_id_card'>, (st: PresetStyle) => DocLayout>),
};

export const PRESET_NAMES: Record<PresetStyle, string> = { classic: 'Classic', modern: 'Modern', minimal: 'Minimal', heritage: 'Heritage' };

let cache: Map<string, DocLayout> | null = null;

/** Every preset, built and validated once. */
function all(): Map<string, DocLayout> {
  if (!cache) {
    cache = new Map();
    for (const t of DOC_TYPES) for (const st of PRESET_STYLES) cache.set(presetId(t, st), DocLayoutSchema.parse(BUILDERS[t](st)));
  }
  return cache;
}

export const presetId = (t: DocType, st: PresetStyle) => `preset:${t}:${st}`;

export function parsePresetId(id: string): { docType: DocType; style: PresetStyle } | null {
  const m = /^preset:([a-z_]+):([a-z]+)$/.exec(id);
  if (!m || !(DOC_TYPES as readonly string[]).includes(m[1]) || !(PRESET_STYLES as readonly string[]).includes(m[2])) return null;
  return { docType: m[1] as DocType, style: m[2] as PresetStyle };
}

export function preset(id: string): DocLayout | null {
  return all().get(id) ?? null;
}

export function presetsFor(t: DocType): { id: string; style: PresetStyle; layout: DocLayout }[] {
  return PRESET_STYLES.map((st) => ({ id: presetId(t, st), style: st, layout: all().get(presetId(t, st))! }));
}

/** The preset used when an institution has not chosen a default. */
export const FALLBACK_STYLE: PresetStyle = 'classic';
