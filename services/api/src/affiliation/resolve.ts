/**
 * Which profile, scheme and rules apply to a programme (or to the institution as a whole), with the tenant's
 * overrides laid over the preset. Grading, eligibility and the exam office call this; tenants without a
 * profile get null and keep their own defaults.
 */
import { eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { affiliationSettings, programmeAffiliations } from '../db/schema-affiliation.js';
import { sections } from '../db/schema.js';
import { schemeOf } from './registry/index.js';
import { applyOverrides, type AffiliationProfile, type ProfileRules, type ProfileScheme } from './rules.js';

export interface ResolvedAffiliation {
  profile: AffiliationProfile;
  scheme: ProfileScheme;
  rules: ProfileRules;
  /** The preset before overrides, to compare against. */
  preset: ProfileRules;
  overridden: boolean;
  source: 'institution' | 'programme';
  ref: { profile: string; scheme: string; version: number; overridden: boolean };
}

/**
 * Overrides stored before a preset was revised can stop validating against it; then the preset alone applies
 * (the Affiliation page shows the overrides as needing review) rather than failing every result.
 */
function build(profileCode: string, schemeCode: string, layers: (Record<string, unknown> | null | undefined)[], source: ResolvedAffiliation['source']): ResolvedAffiliation | null {
  const found = schemeOf(profileCode, schemeCode);
  if (!found) return null;
  let rules = found.scheme.rules;
  let overridden = false;
  for (const layer of layers) {
    if (!layer || Object.keys(layer).length === 0) continue;
    const r = applyOverrides(rules, layer);
    if (r.ok) {
      rules = r.rules;
      overridden = true;
    }
  }
  return {
    profile: found.profile,
    scheme: found.scheme,
    rules,
    preset: found.scheme.rules,
    overridden,
    source,
    ref: { profile: found.profile.code, scheme: found.scheme.code, version: found.scheme.version, overridden },
  };
}

export async function resolveAffiliation(tx: Tx, programId?: string | null): Promise<ResolvedAffiliation | null> {
  const [inst] = await tx.select().from(affiliationSettings);
  const [prog] = programId ? await tx.select().from(programmeAffiliations).where(eq(programmeAffiliations.programId, programId)) : [];
  if (prog) {
    // The institution's overrides carry over when the programme follows the same profile and scheme.
    const same = inst && inst.profileCode === prog.profileCode && inst.schemeCode === prog.schemeCode;
    return build(prog.profileCode, prog.schemeCode, [same ? inst.overrides : null, prog.overrides], 'programme');
  }
  return inst ? build(inst.profileCode, inst.schemeCode, [inst.overrides], 'institution') : null;
}

export async function resolveForSection(tx: Tx, sectionId: string): Promise<ResolvedAffiliation | null> {
  const [s] = await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, sectionId));
  return resolveAffiliation(tx, s?.programId ?? null);
}
