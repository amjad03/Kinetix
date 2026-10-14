/** The university's tabulation register (result download format) built from a profile, for university-results. */
import type { TemplateConfig } from '../university-results/tabulation.logic.js';
import type { AffiliationProfile, ProfileRules, ProfileScheme } from './rules.js';

/** A class boundary in percent: CGPA classes are turned into percentages with the profile's own equivalence. */
function classPercent(rules: ProfileRules, min: number): number {
  if (rules.classification.basis === 'percent') return min;
  const p = rules.percentage.basis === 'cgpa' ? (min - rules.percentage.cgpaSubtract) * rules.percentage.cgpaMultiplier : min * 10;
  return Math.max(0, Math.min(100, Math.round(p * 100) / 100));
}

export function templateFromProfile(profile: AffiliationProfile, scheme: ProfileScheme, rules: ProfileRules): { code: string; name: string; university: string; config: TemplateConfig } {
  const t = rules.terminology;
  const internalMax = rules.assessment.theory.internal;
  return {
    code: `${profile.code}-${scheme.code}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    name: `${profile.shortName} ${scheme.name} tabulation register`,
    university: profile.name,
    config: {
      title: `${profile.name}: ${t.termLabel} Examination Results`,
      subtitle: `${scheme.name}: ${t.internal} (${internalMax}) and ${t.external} (${rules.assessment.theory.external})`,
      footnote: `Prepared by the institution under ${profile.shortName} ${scheme.name}; the university's published result prevails.`,
      internal: { normaliseTo: internalMax > 0 ? internalMax : null, moderation: { mode: 'none' } },
      grace: { enabled: rules.grace.enabled, maxPerSubject: rules.grace.maxPerSubject, maxTotal: rules.grace.maxTotal, allOrNothing: rules.grace.allOrNothing },
      pass: { minInternalPercent: rules.pass.minInternalPercent, minExternalPercent: rules.pass.minExternalPercent, minTotalPercent: rules.pass.minTotalPercent },
      classes: rules.classification.classes.map((c) => ({ label: c.label, minPercent: classPercent(rules, c.min) })),
      labels: rules.resultSheet.resultCodes.P ? { pass: 'P', fail: 'F', absent: Object.entries(rules.resultSheet.resultCodes).find(([, v]) => v === 'absent')?.[0] ?? 'AB' } : { pass: 'PASS', fail: 'FAIL', absent: 'AB' },
      layout: {
        identity: ['slNo', 'regNo', 'name'],
        subjectCells: internalMax > 0 ? ['internal', 'external', 'total', 'result'] : ['external', 'total', 'result'],
        summary: ['total', 'percent', ...(rules.grace.enabled ? (['grace'] as const) : []), ...(rules.classification.classes.length ? (['class'] as const) : []), 'result'],
      },
    },
  };
}
