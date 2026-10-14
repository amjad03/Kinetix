/** A profile's rules in plain English, section by section, for Settings > Affiliation. */
import type { ProfileRules } from './rules.js';

export const RULE_SECTIONS = ['assessment', 'pass', 'grading', 'gpa', 'classification', 'credits', 'attendance', 'exams', 'documents'] as const;
export type RuleSection = (typeof RULE_SECTIONS)[number];

const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

export function describeRules(r: ProfileRules): { section: RuleSection; lines: string[] }[] {
  const t = r.terminology;
  const term = t.termLabel.toLowerCase();
  const out: { section: RuleSection; lines: string[] }[] = [];

  const a = r.assessment;
  out.push({
    section: 'assessment',
    lines: [
      `Each ${term} is assessed by ${t.internal} (${t.internalShort}) and ${t.external} (${t.externalShort}).`,
      a.theory.internal + a.theory.external > 0 ? `Theory: ${t.internalShort} ${n(a.theory.internal)} + ${t.externalShort} ${n(a.theory.external)}${a.theory.externalPaperMax !== a.theory.external ? ` (the paper is written for ${n(a.theory.externalPaperMax)} and scaled to ${n(a.theory.external)})` : ''}${a.theory.examHours ? `, ${n(a.theory.examHours)}-hour paper` : ''}.` : '',
      a.practical ? `Practicals: internal ${n(a.practical.internal)} + examination ${n(a.practical.external)}.` : '',
      `Ready-made theory components: ${a.theoryComponents.map((c) => `${c.name} ${n(c.weight)}`).join(', ')}.`,
    ].filter(Boolean),
  });

  const p = r.pass;
  out.push({
    section: 'pass',
    lines: [
      p.minExternalPercent !== null ? `At least ${n(p.minExternalPercent)}% in the ${t.externalShort}.` : '',
      p.minInternalPercent !== null ? `At least ${n(p.minInternalPercent)}% in the ${t.internalShort} / practical part.` : '',
      `At least ${n(p.minTotalPercent)}% in each subject, all parts together.`,
      p.minAggregatePercent !== null ? `At least ${n(p.minAggregatePercent)}% of the total marks of all subjects together.` : '',
      p.internalEligibilityPercent !== null ? `At least ${n(p.internalEligibilityPercent)}% in ${t.internalShort} to be allowed to write the ${t.externalShort}.` : '',
      'Absent in the external examination counts as a fail.',
      r.grace.enabled
        ? `Grace: up to ${n(r.grace.maxPerSubject)} marks in a subject, ${n(r.grace.maxTotal)} in all${r.grace.maxSubjects ? `, in at most ${r.grace.maxSubjects} subject${r.grace.maxSubjects > 1 ? 's' : ''}` : ''}${r.grace.allOrNothing ? ', only when it makes the candidate pass the examination' : ''}.`
        : 'No grace marks are added by the institution.',
    ].filter(Boolean),
  });

  const g = r.grading;
  out.push({
    section: 'grading',
    lines: [
      g.mode === 'marks' ? 'Results are in marks; there are no grade points.' : g.mode === 'positional' ? 'The board awards positional grades; the bands below are for school-computed results.' : 'Absolute grading on fixed bands.',
      ...[...g.bands].sort((x, y) => y.minPercent - x.minPercent).map((b) => `${b.grade}: ${n(b.minPercent)}% and above${g.mode === 'marks' ? '' : `, grade point ${g.pointsMode === 'percentOver10' && b.pass ? 'percentage ÷ 10' : n(b.gradePoint)}`}${b.pass ? '' : ' (fail)'}.`),
      `Absent is shown as ${g.absentGrade}.`,
    ],
  });

  if (r.gpa.enabled)
    out.push({
      section: 'gpa',
      lines: [
        `${t.sgpa} = Σ (credits × grade point) ÷ Σ credits of the ${term}${r.gpa.includeFailedCredits ? ', failed subjects counted with grade point 0' : ', over the credits earned'}.`,
        `${t.cgpa} = Σ credit points of all ${term}s ÷ Σ credits, from unrounded credit points.`,
        `Rounded to ${r.gpa.decimals} decimals (${r.gpa.rounding === 'half_up' ? 'half up' : 'cut off'}).`,
        r.percentage.basis === 'cgpa' ? `Percentage equivalent = ${r.percentage.cgpaSubtract ? `(${t.cgpa} − ${n(r.percentage.cgpaSubtract)})` : t.cgpa} × ${n(r.percentage.cgpaMultiplier)}.` : 'Percentage = total marks ÷ maximum marks × 100.',
      ],
    });

  const c = r.classification;
  const unit = c.basis === 'cgpa' ? t.cgpa : 'percentage';
  out.push({
    section: 'classification',
    lines: c.classes.length
      ? [
          ...c.classes.map((k) => `${k.label}: ${unit} ${n(k.min)} and above${k.firstAttemptOnly ? ', passing every subject at the first attempt' : ''}.`),
          c.minForAward !== null ? `The award needs ${unit} of at least ${n(c.minForAward)}.` : '',
        ].filter(Boolean)
      : ['No class or division is awarded.'],
  });

  const cr = r.credits;
  if (cr.degreeTotal !== null || cr.exits.length)
    out.push({
      section: 'credits',
      lines: [
        cr.degreeTotal !== null ? `${n(cr.degreeTotal)} credits for the full programme${cr.perTermTypical ? `, about ${n(cr.perTermTypical)} a ${term}` : ''}.` : '',
        ...cr.exits.map((e) => `Exit after ${e.afterTerms} ${term}s with at least ${n(e.minCredits)} credits: ${e.award}.`),
      ].filter(Boolean),
    });

  out.push({
    section: 'attendance',
    lines: [
      `At least ${n(r.attendance.minPercent)}% attendance ${r.attendance.basis === 'per_subject' ? 'in each subject' : 'overall'} to be allowed to write the examination.`,
      r.attendance.condonableToPercent !== null ? `Shortage down to ${n(r.attendance.condonableToPercent)}% may be condoned on valid grounds.` : 'Condonation as the university or board notifies.',
    ],
  });

  out.push({
    section: 'exams',
    lines: [
      `Exam application asks for: ${r.examApplication.fields.join(', ')}.`,
      r.examApplication.lateFeeAllowed ? 'Late applications are accepted with a late fee.' : 'No late applications.',
      [r.revaluation.photocopy && 'photocopy of the answer script', r.revaluation.retotalling && 'retotalling', r.revaluation.revaluation && 'revaluation'].filter(Boolean).length
        ? `After results: ${[r.revaluation.photocopy && 'photocopy of the answer script', r.revaluation.retotalling && 'retotalling', r.revaluation.revaluation && 'revaluation'].filter(Boolean).join(', ')}${r.revaluation.windowDays ? `, within ${r.revaluation.windowDays} days` : ', within the window the result notification gives'}.`
        : 'No revaluation.',
      r.revaluation.changeThresholdPercent !== null ? `Revalued marks count only when they change by at least ${n(r.revaluation.changeThresholdPercent)}% of the maximum.` : '',
    ].filter(Boolean),
  });

  out.push({
    section: 'documents',
    lines: [
      `${t.registerNo}: ${r.registerNumber.description}${r.registerNumber.example ? ` Example: ${r.registerNumber.example}.` : ''}`,
      `The ${r.marksCard.title} shows ${r.marksCard.subjectColumns.length} columns per subject and ${r.marksCard.summary.length} summary lines.`,
      ...r.marksCard.footnotes,
    ],
  });
  return out;
}
