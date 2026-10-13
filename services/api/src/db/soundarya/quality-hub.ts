/** Module settings for the quality group: Soundarya's own numbering, deadlines and messages where they differ from the standard. */
import { effectiveSettings, type QualityModule } from '../../quality-hub/settings.catalogue.js';
import type { Ctx } from './ctx.js';
import { J } from './kit.js';

export async function qualityHubSettings(c: Ctx): Promise<void> {
  const principal = c.byEmail.principal.id;
  const own = (module: QualityModule, change: (s: ReturnType<typeof effectiveSettings>) => void) => {
    const s = effectiveSettings(module, null);
    change(s);
    return { module, settings: J(s), updatedBy: principal };
  };
  await c.kit.ins(
    'module_settings',
    [
      own('grievances', (s) => {
        s.numbering.ticket = { prefix: 'SIMS/GRV/{FY}/', next: 61, pad: 4 };
        s.rules.slaHours = 48;
        s.templates.received = 'Soundarya: your grievance {ticketNo} is with the grievance cell. We will reply within {slaHours} hours.';
      }),
      own('placements', (s) => {
        s.numbering.drive = { prefix: 'SIMS/PD/{FY}/', next: 9, pad: 3 };
        s.rules.minCgpa = 5.5;
        s.rules.maxBacklogs = 1;
      }),
      own('accreditation', (s) => {
        s.numbering.atr = { prefix: 'SIMS/IQAC/ATR/{FY}/', next: 4, pad: 3 };
      }),
      own('documents', (s) => {
        s.numbering.certificate = { prefix: 'SIMS/CERT/{FY}/', next: 128, pad: 5 };
        s.rules.turnaroundDays = 2;
      }),
      own('communication', (s) => {
        s.templates.footer = 'Sent by Soundarya Institute of Management and Science. Reply STOP to opt out of SMS.';
      }),
    ],
    { returning: false },
  );
}
