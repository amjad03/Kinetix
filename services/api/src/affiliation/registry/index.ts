/** The code-defined profile registry: every university, board and framework an institution can pick. */
import type { AffiliationProfile, ProfileScheme } from '../rules.js';
import { BOARD_AND_FRAMEWORK_PROFILES } from './boards.js';
import { UNIVERSITY_PROFILES } from './universities.js';

export const PROFILES: readonly AffiliationProfile[] = [...UNIVERSITY_PROFILES, ...BOARD_AND_FRAMEWORK_PROFILES];

export const profileByCode = (code: string): AffiliationProfile | undefined => PROFILES.find((p) => p.code === code);

/** A profile's scheme, or its default scheme when `scheme` is null. */
export function schemeOf(profileCode: string, scheme: string | null | undefined): { profile: AffiliationProfile; scheme: ProfileScheme } | null {
  const profile = profileByCode(profileCode);
  if (!profile) return null;
  const s = profile.schemes.find((x) => x.code === (scheme ?? profile.defaultScheme));
  return s ? { profile, scheme: s } : null;
}

/** The registry as a list for pickers: no rule bodies. */
export function catalogue() {
  return PROFILES.map((p) => ({
    code: p.code,
    name: p.name,
    shortName: p.shortName,
    kind: p.kind,
    category: p.category,
    headquarters: p.headquarters,
    website: p.website,
    jurisdiction: p.jurisdiction,
    defaultScheme: p.defaultScheme,
    schemes: p.schemes.map((s) => ({ code: s.code, name: s.name, effectiveFrom: s.effectiveFrom, effectiveTo: s.effectiveTo, appliesTo: s.appliesTo, version: s.version, ruleAuthority: s.ruleAuthority })),
  }));
}
