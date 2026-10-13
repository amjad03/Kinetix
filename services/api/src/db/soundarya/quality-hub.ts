/**
 * Module settings for the quality group where the demo institution differs from the standard: its own
 * ticket and project numbering, grievance deadlines, quiet hours and certificate approval. The school
 * profile leaves out the college-only modules (placements, alumni, research).
 */
import { effectiveSettings, type SettingsModule } from '../../quality-hub/settings.catalogue.js';
import type { Ctx } from './ctx.js';
import { INST } from './data.js';
import { J } from './kit.js';

export async function qualityHubSettings(c: Ctx): Promise<void> {
  const principal = c.byEmail.principal.id;
  const school = INST.kind === 'school';
  const own = (module: SettingsModule, change: (s: ReturnType<typeof effectiveSettings>) => void) => {
    const s = effectiveSettings(module, null);
    change(s);
    const numbering = Object.fromEntries(Object.entries(s.numbering).map(([k, v]) => [k, { prefix: v.prefix, pad: v.pad, suffix: v.suffix ?? '' }]));
    return { module, settings: J({ rules: s.rules, templates: s.templates, defaults: s.defaults }), numbering: J(numbering), updatedBy: principal };
  };
  const rows = [
    own('grievances', (s) => {
      s.numbering.GRV = { prefix: `${INST.codePrefix}/GRV/{FY}/`, pad: 4, suffix: '' };
      s.rules.slaHighHours = 36;
      s.rules.slaMediumHours = 72;
      s.rules.allowAnonymous = !school;
      s.templates.resolved = `${INST.shortName}: grievance {ticketNo} is resolved. Please rate how it went.`;
    }),
    own('communication', (s) => {
      s.rules.quietHoursOn = true;
      s.rules.quietHoursStart = 21;
      s.rules.quietHoursEnd = 7;
    }),
    own('documents', (s) => {
      s.rules.approvalBeforeIssue = true;
    }),
    own('mentoring', (s) => {
      s.rules.menteesPerMentor = school ? 40 : 30;
    }),
    own('events', (s) => {
      s.defaults.defaultCapacity = school ? 300 : 150;
    }),
    own('feedback', (s) => {
      s.defaults.anonymousByDefault = true;
    }),
    ...(school
      ? []
      : [
          own('placements', (s) => {
            s.defaults.minCgpa = 5.5;
            s.defaults.maxBacklogs = 1;
            s.rules.offerResponseDays = 5;
          }),
          own('research', (s) => {
            s.numbering.PRJ = { prefix: `${INST.codePrefix}/RP/{FY}/`, pad: 3, suffix: '' };
          }),
        ]),
  ];
  await c.kit.ins('module_settings', rows, { returning: false });
}
