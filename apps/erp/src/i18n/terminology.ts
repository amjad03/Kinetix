import type { Messages } from './messages';

/**
 * An institution's own wording (Settings > Institution setup > wording): it renames what the ERP calls things, for
 * example "Classes" to "Sections" or "Syllabus" to "Course plan". Only strings that exist in the dictionary are
 * replaced, and a placeholder the original had must stay in the new wording.
 */
export function applyTerminology(messages: Messages, overrides: Record<string, string>): Messages {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return messages;
  const out: Record<string, string> = { ...messages };
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of keys) {
    const base = messages[k as keyof Messages];
    const next = overrides[k]?.trim();
    if (typeof base !== 'string' || !next || next.length > 120) continue;
    if (holes(base) !== holes(next)) continue;
    out[k] = next;
  }
  return out as Messages;
}
