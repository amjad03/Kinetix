/**
 * Communication pass: the SMS, WhatsApp and email channels with the institution's DLT registration, prices and caps;
 * prepaid credits (top-ups, a correction and every spend); consent per channel (WhatsApp opt-ins, SMS opt-outs by STOP
 * reply, in the app and on a paper form); DLT and WhatsApp templates in English and Kannada; six campaigns over the
 * last four weeks with their fallback chains, delivery reports and costs, sent by the office and two heads of
 * department (so cost by department shows); a rain emergency in the quiet hours; a scheduled PTM reminder; notices to
 * all, a department, roles, a hostel and a bus route, translated into Hindi and Kannada, one with a poll and one also
 * sent by SMS; RSVPs to the Annual Day; family chat with a flagged message, a parent's report, a removed message, a
 * paused family, an escalation to the head of department and a teacher on do-not-disturb; minutes of last month's PTM.
 */
import { smsUnits } from '../../comms/comms.logic.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

type Person = { id: string; name: string; phone: string | null; email: string | null; lang: string };
type Chan = 'in_app' | 'whatsapp' | 'sms' | 'email';
const PRICE: Record<Chan, number> = { in_app: 0, whatsapp: 78, sms: 22, email: 0 };
const PROVIDER: Record<Chan, string> = { in_app: 'app', whatsapp: 'meta', sms: 'msg91', email: 'ses' };
/** One of `xs`, chosen with the given weights. */
const weighted = <T>(r: Ctx['r'], xs: readonly T[], w: readonly number[]): T => {
  let x = r.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((x -= w[i]) < 0) return xs[i];
  return xs[xs.length - 1];
};
const mask = (a: string | null) => (!a ? '' : a.includes('@') ? `${a.slice(0, 2)}***@${a.split('@')[1]}` : `+91******${a.replace(/\D/g, '').slice(-4)}`);

export async function commsPass(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const T = c.tenantId;
  const principal = c.byEmail.principal.id;
  const admin = c.byEmail.admin.id;
  const acc = c.byEmail.accounts.id;
  const hodC = c.byEmail['hod.commerce'].id;
  const hodCA = c.byEmail['hod.computers'].id;
  const dept = { commerce: c.departments['Commerce'], computers: c.departments['Computer Applications'] };
  const people = await k.q<Person>(
    `select u.id, u.full_name as name, u.phone, u.email, u.preferred_language as lang from users u where u.tenant_id = $1 and u.status = 'active'`,
    [T],
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleOf = await k.q<{ userId: string; role: string }>('select user_id, role::text as role from user_roles where tenant_id = $1', [T]);
  const withRole = (role: string) => [...new Set(roleOf.filter((x) => x.role === role).map((x) => x.userId))];
  const guardians = withRole('guardian');
  const studentsU = withRole('student');
  const staffU = [...new Set(roleOf.filter((x) => !['guardian', 'student', 'alumni'].includes(x.role)).map((x) => x.userId))];
  const ago = (days: number, time = '10:00') => at(addDays(c.today, -days), time);

  // ---- channels, credits ------------------------------------------------------------------------------------------
  await k.ins('comm_channel_settings', [
    { channel: 'sms', provider: 'msg91', enabled: true, senderId: 'SIMSBL', dltEntityId: '1201161523456789012', unitCostPaise: PRICE.sms, hourlyLimit: 2000, dailyLimit: 20000, lowBalanceUnits: 500, updatedBy: admin },
    { channel: 'whatsapp', provider: 'meta', enabled: true, senderId: '104567890123456', unitCostPaise: PRICE.whatsapp, hourlyLimit: 1000, dailyLimit: 5000, lowBalanceUnits: 200, updatedBy: admin },
    { channel: 'email', provider: 'ses', enabled: true, senderId: 'office@soundarya.edu.in', unitCostPaise: 0, hourlyLimit: 0, dailyLimit: 0, lowBalanceUnits: 0, updatedBy: admin },
    { channel: 'push', provider: 'fcm', enabled: true, senderId: '', unitCostPaise: 0, hourlyLimit: 0, dailyLimit: 0, lowBalanceUnits: 0, updatedBy: admin },
  ], { returning: false });
  await k.ins('comm_credit_ledger', [
    { channel: 'sms', kind: 'topup', units: 5000, amountPaise: rupees(1100), reference: 'MSG91/INV/2026-27/0412', note: 'Semester start', createdBy: acc, createdAt: ago(60, '11:20') },
    { channel: 'sms', kind: 'adjust', units: -40, note: 'Test messages during the DLT set-up', createdBy: acc, createdAt: ago(58, '15:05') },
    { channel: 'whatsapp', kind: 'topup', units: 1000, amountPaise: rupees(780), reference: 'META/2026/OCT/118', note: 'WhatsApp conversations for the term', createdBy: acc, createdAt: ago(40, '12:00') },
    { channel: 'sms', kind: 'topup', units: 2000, amountPaise: rupees(440), reference: 'MSG91/INV/2026-27/0533', note: 'Before the IA 2 reminders', createdBy: acc, createdAt: ago(9, '10:30') },
  ], { returning: false });

  // ---- consent per channel ----------------------------------------------------------------------------------------
  const prefs: Record<string, unknown>[] = [];
  const waIn = new Set(guardians.filter(() => r.chance(0.42)));
  for (const g of waIn) prefs.push({ userId: g, channel: 'whatsapp', granted: true, source: 'app', noticeVersion: '2026-10', recordedBy: g, createdAt: ago(r.int(15, 50), '20:10') });
  const smsOut = guardians.filter((g) => !waIn.has(g)).slice(0, 5);
  smsOut.forEach((g, i) => prefs.push({ userId: g, channel: 'sms', granted: false, source: i < 2 ? 'reply_stop' : i < 4 ? 'app' : 'erp', noticeVersion: '2026-10', recordedBy: i === 4 ? admin : i < 2 ? null : g, note: i < 2 ? 'Replied "STOP"' : i === 4 ? 'Signed the opt-out form at the front office' : '', createdAt: ago(20 - i * 3, '19:00') }));
  const mailOut = studentsU.slice(0, 6);
  for (const s of mailOut) prefs.push({ userId: s, channel: 'email', granted: false, source: 'app', noticeVersion: '2026-10', recordedBy: s, createdAt: ago(r.int(5, 30), '21:30') });
  for (const s of studentsU.slice(10, 13)) prefs.push({ userId: s, channel: 'push', granted: false, source: 'app', noticeVersion: '2026-10', recordedBy: s, createdAt: ago(r.int(5, 30), '22:00') });
  // One mother who said STOP signed up again on paper.
  prefs.push({ userId: smsOut[0], channel: 'sms', granted: true, source: 'erp', noticeVersion: '2026-10', recordedBy: admin, note: 'Asked to receive SMS again at the PTM; signed the consent form', createdAt: ago(3, '12:40') });
  await k.ins('comm_channel_prefs', prefs, { returning: false });
  const optedOutSms = new Set(smsOut.slice(1));
  const bounced = studentsU.slice(20, 22);
  await k.ins('contact_suppressions', bounced.map((u) => ({ channel: 'email', address: (byId.get(u)?.email ?? `${u}@x.in`).toLowerCase(), userId: u, reason: 'bounced', note: '550 5.1.1 Mailbox does not exist', createdAt: ago(r.int(4, 18)) })), { returning: false });
  const suppressed = new Set(bounced);

  // ---- templates --------------------------------------------------------------------------------------------------
  await k.q(`update message_templates set dlt_header = 'SIMSBL', dlt_content_type = 'service_implicit' where tenant_id = $1 and channel = 'sms'`, [T]);
  await k.q(`update message_templates set wa_template_name = key, wa_language = locale where tenant_id = $1 and channel = 'whatsapp'`, [T]);
  const tpl = async (key: string, channel: Chan, body: string, extra: Record<string, unknown> = {}) => (await k.one<{ id: string }>('message_templates', { key, channel, locale: 'en', subject: '', body, ...extra })).id;
  const tNoticeSms = await tpl('notice', 'sms', 'Notice from {{institution}}: {{title}}. {{body}}', { dltTemplateId: '1107172800000004411', dltHeader: 'SIMSBL', dltContentType: 'service_implicit' });
  await k.one('message_templates', { key: 'notice', channel: 'sms', locale: 'kn', subject: '', body: '{{institution}} ಸೂಚನೆ: {{title}}. {{body}}', dltTemplateId: '1107172800000004412', dltHeader: 'SIMSBL', dltContentType: 'service_implicit' });
  const tNoticeWa = await tpl('notice', 'whatsapp', 'Notice: {{title}}. {{body}}', { waTemplateName: 'school_notice', waLanguage: 'en' });
  const tNoticeMail = await tpl('notice', 'email', 'Dear {{name}},\n\n{{body}}\n\n{{institution}}', { subject: '{{title}}' });
  const tNoticeApp = await tpl('notice', 'in_app', '{{body}}', { subject: '{{title}}' });
  const tFeeSms = await tpl('fee_instalment', 'sms', 'Dear parent, instalment {{n}} of the tuition fee of {{name}} is due on {{date}}. Pay in the Parent App or at the counter. -{{institution}}', { dltTemplateId: '1107172800000004420', dltHeader: 'SIMSBL', dltContentType: 'service_explicit' });
  await tpl('fee_instalment', 'email', 'Dear {{name}},\n\nInstalment {{n}} of the tuition fee is due on {{date}}. You can pay in the Parent App or at the accounts counter.\n\n{{institution}}', { subject: 'Fee instalment {{n}} due on {{date}}' });
  const tAlertSms = await tpl('emergency_alert', 'sms', 'URGENT from {{institution}}: {{title}}. {{body}}', { dltTemplateId: '1107172800000004430', dltHeader: 'SIMSBL', dltContentType: 'transactional' });
  const tPlacementMail = await tpl('placement_drive', 'email', 'Dear {{name}},\n\n{{body}}\n\nPlacement cell, {{institution}}', { subject: '{{title}}' });
  const [inst] = await k.q<{ name: string }>('select name from tenants where id = $1', [T]);

  // ---- campaigns, deliveries, the send log and spends -------------------------------------------------------------
  const ledgerSpends: Record<string, unknown>[] = [];
  /** Works each recipient along the chain the way the engine does, and writes the delivery, every step of the log and the spend. */
  async function campaign(o: { title: string; templateId: string; primary: Chan; fallback: Chan[]; to: string[]; by: string; dept: string | null; when: Date; vars: Record<string, string>; text: (p: Person) => string; emergency?: boolean; status?: 'sent' | 'scheduled'; reportFail?: number }) {
    const status = o.status ?? 'sent';
    const [cmp] = await k.ins<{ id: string }>('message_campaigns', { title: o.title, templateId: o.templateId, audienceId: null, vars: J(o.vars), sendAt: o.when, status, fallback: o.fallback, emergency: !!o.emergency, departmentId: o.dept, createdBy: o.by, createdAt: o.when });
    if (status === 'scheduled') return cmp.id;
    const chain: Chan[] = [o.primary, ...o.fallback.filter((f) => f !== o.primary)];
    let sent = 0;
    let delivered = 0;
    let failed = 0;
    let held = 0;
    let cost = 0;
    for (const uid of o.to) {
      const p = byId.get(uid);
      if (!p) continue;
      const logs: Record<string, unknown>[] = [];
      let final: { status: string; channel: Chan; step: number; cost: number; deliveredAt: Date | null; readAt: Date | null; error: string | null; sentAt: Date | null } | null = null;
      let last = '';
      for (let step = 0; step < chain.length && !final; step++) {
        const ch = chain[step];
        const t0 = new Date(o.when.getTime() + (step * 20 + r.int(0, 90)) * 1000);
        const address = ch === 'email' ? p.email : ch === 'in_app' ? '' : p.phone;
        const skip = (status: 'suppressed' | 'failed', error: string) => {
          logs.push({ sourceType: 'campaign', sourceId: cmp.id, userId: uid, channel: ch, provider: PROVIDER[ch], address: mask(address), status, error, departmentId: o.dept, sentBy: o.by, emergency: !!o.emergency, step, attemptedAt: t0, statusAt: t0 });
          last = `${ch}: ${error}`;
        };
        if (ch !== 'in_app' && !address) { skip('failed', ch === 'email' ? 'No email address on file' : 'No valid mobile number on file'); continue; }
        if (ch === 'whatsapp' && !waIn.has(uid)) { skip('suppressed', 'Has not opted in to WhatsApp'); continue; }
        if (ch === 'sms' && optedOutSms.has(uid) && !o.emergency) { skip('suppressed', 'Opted out of SMS'); continue; }
        if (ch === 'email' && (mailOut.includes(uid) && !o.emergency)) { skip('suppressed', 'Opted out of email'); continue; }
        if (ch === 'email' && suppressed.has(uid)) { skip('suppressed', 'Not sent: bounced'); continue; }
        const units = ch === 'sms' ? smsUnits(o.text(p)) : ch === 'in_app' ? 0 : 1;
        const c1 = units * PRICE[ch];
        // A few operator failures fall to the next channel (the delivery report came back failed).
        const dlrFail = ch !== 'in_app' && step + 1 < chain.length && r.chance(o.reportFail ?? 0.04);
        const pid = `${PROVIDER[ch]}-${cmp.id.slice(0, 8)}-${uid.slice(0, 8)}-${step}`;
        const dAt = new Date(t0.getTime() + r.int(4, 60) * 1000);
        const readAt = ch === 'whatsapp' && r.chance(0.7) ? new Date(dAt.getTime() + r.int(5, 400) * 60_000) : null;
        logs.push({ sourceType: 'campaign', sourceId: cmp.id, userId: uid, channel: ch, provider: PROVIDER[ch], address: mask(address), status: dlrFail ? 'failed' : ch === 'in_app' ? 'accepted' : readAt ? 'read' : r.chance(0.94) ? 'delivered' : 'accepted', providerMessageId: ch === 'in_app' ? null : pid, units, costPaise: c1, error: dlrFail ? 'Absent subscriber' : null, departmentId: o.dept, sentBy: o.by, emergency: !!o.emergency, step, attemptedAt: t0, statusAt: dlrFail ? dAt : readAt ?? dAt });
        if (c1) ledgerSpends.push({ channel: ch, kind: 'spend', units: -units, amountPaise: -c1, note: o.title.slice(0, 120), createdAt: t0 });
        cost += c1;
        if (dlrFail) {
          last = `${ch}: Absent subscriber`;
          continue;
        }
        final = { status: readAt ? 'read' : 'sent', channel: ch, step, cost: c1, deliveredAt: ch === 'in_app' ? null : dAt, readAt, error: null, sentAt: t0 };
      }
      const d = final ?? { status: logs.at(-1)?.status === 'suppressed' ? 'suppressed' : 'failed', channel: chain.at(-1)!, step: chain.length - 1, cost: 0, deliveredAt: null, readAt: null, error: last, sentAt: null };
      const [del] = await k.ins<{ id: string }>('message_deliveries', { campaignId: cmp.id, userId: uid, channel: d.channel, status: d.status, attempts: 1, error: d.error, sentAt: d.sentAt, readAt: d.readAt, step: d.step, costPaise: logs.reduce((n, l) => n + Number(l.costPaise ?? 0), 0), deliveredAt: d.deliveredAt, createdAt: o.when });
      await k.ins('comm_send_log', logs.map((l) => ({ ...l, deliveryId: del.id })), { returning: false });
      if (final) sent++;
      if (d.deliveredAt) delivered++;
      if (d.status === 'failed') failed++;
      if (d.status === 'suppressed') held++;
    }
    await k.q('update message_campaigns set recipients = $2, sent_count = $3, delivered_count = $4, failed_count = $5, suppressed_count = $6, cost_paise = $7 where id = $1', [cmp.id, o.to.length, sent, delivered, failed, held, cost]);
    await k.ins('audit_log', { actorType: 'system', action: 'comms.campaign_sent', subjectType: 'message_campaign', subjectId: cmp.id, data: J({ sent, failed, suppressed: held, costPaise: cost }), at: new Date(o.when.getTime() + 300_000) }, { returning: false });
    return cmp.id;
  }

  const guardiansOfProg = async (prog: string) => (await k.q<{ id: string }>(`select distinct g.user_id as id from guardians g join students s on s.id = g.student_id join sections sec on sec.id = s.section_id join programs p on p.id = sec.program_id where s.tenant_id = $1 and p.id = $2`, [T, c.programs[prog].id])).map((x) => x.id);
  const studentsOfProgTerm = async (prog: string, term: number) => (await k.q<{ id: string }>(`select s.user_id as id from students s join sections sec on sec.id = s.section_id where s.tenant_id = $1 and sec.program_id = $2 and sec.term = $3 and s.user_id is not null`, [T, c.programs[prog].id, term])).map((x) => x.id);
  const name = inst?.name ?? '';
  const fill = (tplText: string, vars: Record<string, string>) => (p: Person) => tplText.replace(/\{\{(\w+)\}\}/g, (_m, k2: string) => (k2 === 'name' ? p.name : k2 === 'institution' ? name : vars[k2] ?? ''));

  const feeVars = { n: '2', date: addDays(c.today, 6).split('-').reverse().join('-') };
  await campaign({ title: 'Fee instalment 2 reminder', templateId: tFeeSms, primary: 'sms', fallback: ['email'], to: guardians, by: acc, dept: null, when: ago(12, '10:15'), vars: feeVars, text: fill('Dear parent, instalment {{n}} of the tuition fee of {{name}} is due on {{date}}. Pay in the Parent App or at the counter. -{{institution}}', feeVars) });
  const iaVars = { title: 'IA 2 timetable', body: 'IA 2 for BCom runs from 16 to 21 November. The timetable is in the app.' };
  await campaign({ title: 'BCom IA 2 timetable', templateId: tNoticeWa, primary: 'whatsapp', fallback: ['sms'], to: await guardiansOfProg('BCM'), by: hodC, dept: dept.commerce, when: ago(6, '17:30'), vars: iaVars, text: fill('Notice from {{institution}}: {{title}}. {{body}}', iaVars) });
  const holVars = { title: 'Kannada Rajyotsava holiday', body: 'The college is closed on 1 November for Kannada Rajyotsava.' };
  await campaign({ title: 'Kannada Rajyotsava holiday', templateId: tNoticeApp, primary: 'in_app', fallback: [], to: [...guardians, ...studentsU], by: principal, dept: null, when: ago(5, '09:00'), vars: holVars, text: () => holVars.body });
  const plVars = { title: 'Campus drive: Infosys, 20 November', body: 'Final-year BCA students with no backlogs can register in the Student App by 15 November.' };
  await campaign({ title: 'Infosys campus drive', templateId: tPlacementMail, primary: 'email', fallback: ['sms'], to: await studentsOfProgTerm('BCA', 5), by: hodCA, dept: dept.computers, when: ago(4, '11:45'), vars: plVars, text: fill('Notice from {{institution}}: {{title}}. {{body}}', plVars) });
  const rainVars = { title: 'College closed today', body: 'Heavy rain: classes are cancelled today. Students in hostels stay in.' };
  await campaign({ title: 'Heavy rain: college closed today', templateId: tAlertSms, primary: 'sms', fallback: ['email'], to: guardians, by: principal, dept: null, when: ago(2, '06:40'), vars: rainVars, emergency: true, text: fill('URGENT from {{institution}}: {{title}}. {{body}}', rainVars), reportFail: 0.02 });
  const ptmVars = { title: 'Parent-teacher meeting', body: `Book your slot in the Parent App for the meeting on ${addDays(c.today, 12)}.` };
  await campaign({ title: 'PTM booking reminder', templateId: tNoticeSms, primary: 'sms', fallback: ['email'], to: guardians, by: principal, dept: null, when: at(addDays(c.today, 2), '17:00'), vars: ptmVars, status: 'scheduled', text: fill('Notice from {{institution}}: {{title}}. {{body}}', ptmVars) });
  void tNoticeMail;
  // Spends after the last top-up exceed nothing: the balance stays positive (5000 - 40 + 2000 = 6960 SMS before spends).
  for (let i = 0; i < ledgerSpends.length; i += 500) await k.ins('comm_credit_ledger', ledgerSpends.slice(i, i + 500), { returning: false });

  // ---- notices: roles, departments, a hostel, a route, translations, a poll, an outside channel, an emergency -----
  const recipients = async (aid: string, list: { userId: string; channel: string }[], sentAt: Date, readRate: number, ackRate = 0) => {
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const x of list) {
      const key = `${x.userId}:${x.channel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const delivered = r.chance(0.93) ? new Date(sentAt.getTime() + r.int(1, 240) * 60_000) : null;
      const read = delivered && r.chance(readRate) ? new Date(delivered.getTime() + r.int(1, 600) * 60_000) : null;
      const ack = read && r.chance(ackRate) ? new Date(read.getTime() + r.int(1, 30) * 60_000) : null;
      rows.push({ announcementId: aid, userId: x.userId, channel: x.channel, deliveredAt: delivered, readAt: read, acknowledgedAt: ack, createdAt: sentAt });
    }
    for (let i = 0; i < rows.length; i += 500) await k.ins('announcement_recipients', rows.slice(i, i + 500), { returning: false });
    return [...new Set(list.map((x) => x.userId))];
  };
  const notice = async (o: Record<string, unknown>) => (await k.one<{ id: string }>('announcements', { ...o, audience: J(o.audience), translations: J(o.translations ?? {}), poll: o.poll ? J(o.poll) : null, external: o.external ? J(o.external) : null }));
  const asParents = (ids: string[]) => ids.map((userId) => ({ userId, channel: 'parent' }));
  const asStudents = (ids: string[]) => ids.map((userId) => ({ userId, channel: 'student' }));
  const asStaff = (ids: string[]) => ids.map((userId) => ({ userId, channel: 'teacher' }));

  const holiday = await notice({ senderId: principal, title: 'Kannada Rajyotsava: college closed on 1 November', body: 'The college remains closed on **1 November** for Kannada Rajyotsava. Classes resume on 3 November.\n\n- The library is open from 10 am to 2 pm\n- Hostel mess timings do not change', priority: 'important', channels: ['boards', 'teacher', 'student', 'parent'], audience: { scope: 'all' }, status: 'sent', sendAt: ago(5, '09:00'), sentAt: ago(5, '09:00'), expiresAt: ago(2, '18:00'), translations: { hi: { title: 'कन्नड़ राज्योत्सव: 1 नवंबर को कॉलेज बंद', body: 'कन्नड़ राज्योत्सव के कारण **1 नवंबर** को कॉलेज बंद रहेगा। कक्षाएँ 3 नवंबर से फिर शुरू होंगी।' }, kn: { title: 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ: ನವೆಂಬರ್ 1 ರಂದು ಕಾಲೇಜಿಗೆ ರಜೆ', body: 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವದ ಪ್ರಯುಕ್ತ **ನವೆಂಬರ್ 1** ರಂದು ಕಾಲೇಜಿಗೆ ರಜೆ. ತರಗತಿಗಳು ನವೆಂಬರ್ 3 ರಿಂದ ಪುನರಾರಂಭ.' } } });
  await recipients(holiday.id, [...asParents(guardians), ...asStudents(studentsU), ...asStaff(staffU)], ago(5, '09:00'), 0.78);

  const bcomGuardians = await guardiansOfProg('BCM');
  const bcomSections = c.sections.filter((s) => s.prog === 'BCM').map((s) => s.id);
  const ia = await notice({ senderId: hodC, departmentId: dept.commerce, title: 'BCom: IA 2 timetable published', body: 'IA 2 for all BCom classes runs from **16 to 21 November**. The timetable is attached to the class notice board.\n\n1. Carry your ID card\n2. Reach the hall 15 minutes early', priority: 'normal', channels: ['student', 'parent'], audience: { scope: 'programs', programIds: [c.programs['BCM'].id] }, status: 'sent', sendAt: ago(6, '17:30'), sentAt: ago(6, '17:30') });
  const bcomStudents = (await k.q<{ id: string }>('select user_id as id from students where tenant_id = $1 and section_id = any($2::uuid[]) and user_id is not null', [T, bcomSections])).map((x) => x.id);
  await recipients(ia.id, [...asParents(bcomGuardians), ...asStudents(bcomStudents)], ago(6, '17:30'), 0.66);

  // The Annual Day: a poll, also by SMS (falls back to email), Kannada translation.
  const adVars = { title: 'Annual Day on 12 December', body: 'Annual Day and the alumni meet are on 12 December at 10 am in the main ground. Reply in the Parent App.' };
  const annual = await notice({ senderId: principal, title: 'Annual Day and Alumni Meet on 12 December', body: 'Our **Annual Day and Alumni Meet** is on 12 December at 10 am in the main ground. Students take part in the cultural programme; parents are welcome.\n\nPlease answer the poll so we can plan the seating.', priority: 'important', channels: ['student', 'parent'], audience: { scope: 'roles', roles: ['guardian', 'student'] }, status: 'sent', sendAt: ago(3, '16:00'), sentAt: ago(3, '16:00'), translations: { kn: { title: 'ಡಿಸೆಂಬರ್ 12 ರಂದು ವಾರ್ಷಿಕೋತ್ಸವ ಮತ್ತು ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿಗಳ ಸಮ್ಮಿಲನ', body: 'ನಮ್ಮ **ವಾರ್ಷಿಕೋತ್ಸವ** ಡಿಸೆಂಬರ್ 12 ರಂದು ಬೆಳಿಗ್ಗೆ 10 ಕ್ಕೆ ಮುಖ್ಯ ಮೈದಾನದಲ್ಲಿ. ಆಸನ ವ್ಯವಸ್ಥೆಗಾಗಿ ಮತದಾನಕ್ಕೆ ಉತ್ತರಿಸಿ.' } }, poll: { question: 'Will you attend the Annual Day?', options: ['Yes, with family', 'Yes, alone', 'No', 'Not sure yet'], closesAt: at(addDays(c.today, 30), '18:00').toISOString(), showResults: true } });
  const annualPeople = await recipients(annual.id, [...asParents(guardians), ...asStudents(studentsU)], ago(3, '16:00'), 0.72);
  const extId = await campaign({ title: 'Annual Day and Alumni Meet on 12 December', templateId: tNoticeSms, primary: 'sms', fallback: ['email'], to: guardians, by: principal, dept: null, when: ago(3, '16:01'), vars: adVars, text: fill('Notice from {{institution}}: {{title}}. {{body}}', adVars) });
  await k.q(`update message_campaigns set announcement_id = $2 where id = $1`, [extId, annual.id]);
  await k.q(`update comm_send_log set source_type = 'announcement', source_id = $2 where source_id = $1`, [extId, annual.id]);
  await k.q(`update announcements set external = $2::jsonb where id = $1`, [annual.id, JSON.stringify({ templateId: tNoticeSms, fallback: ['email'], campaignId: extId })]);
  const votes = annualPeople.filter(() => r.chance(0.58)).map((userId) => ({ announcementId: annual.id, userId, option: weighted(r, [0, 1, 2, 3], [5, 2, 1, 2]), createdAt: ago(r.int(0, 2), '20:00') }));
  await k.ins('announcement_poll_votes', votes, { returning: false });

  // The rain emergency (pinned, acknowledged by most), to everyone through do-not-disturb.
  const rain = await notice({ senderId: principal, title: 'Heavy rain: college closed today', body: 'Due to heavy rain and waterlogging on Tumakuru Road, the college is **closed today**. Hostel students stay in the hostel. Further updates will follow.', priority: 'emergency', requiresAck: true, channels: ['boards', 'teacher', 'student', 'parent'], audience: { scope: 'all' }, status: 'sent', sendAt: ago(2, '06:40'), sentAt: ago(2, '06:40'), expiresAt: ago(1, '20:00'), translations: { hi: { title: 'भारी बारिश: आज कॉलेज बंद', body: 'भारी बारिश के कारण आज कॉलेज **बंद** है। छात्रावास के छात्र छात्रावास में ही रहें।' }, kn: { title: 'ಭಾರಿ ಮಳೆ: ಇಂದು ಕಾಲೇಜಿಗೆ ರಜೆ', body: 'ಭಾರಿ ಮಳೆಯ ಕಾರಣ ಇಂದು ಕಾಲೇಜು **ಮುಚ್ಚಿದೆ**. ವಸತಿ ನಿಲಯದ ವಿದ್ಯಾರ್ಥಿಗಳು ನಿಲಯದಲ್ಲೇ ಇರಿ.' } } });
  await recipients(rain.id, [...asParents(guardians), ...asStudents(studentsU), ...asStaff(staffU)], ago(2, '06:40'), 0.92, 0.85);

  // A hostel notice (residents, their parents and the warden) and a bus-route notice (riders and parents).
  const [girls] = await k.q<{ id: string; wardenUserId: string | null }>(`select id, warden_user_id from hostels where tenant_id = $1 and name like 'Sharada%'`, [T]);
  if (girls) {
    const residents = await k.q<{ studentId: string; userId: string | null }>(`select s.id as student_id, s.user_id from hostel_allotments a join students s on s.id = a.student_id join hostel_beds b on b.id = a.bed_id join hostel_rooms rm on rm.id = b.room_id join hostel_blocks bl on bl.id = rm.block_id where a.tenant_id = $1 and a.vacated_on is null and bl.hostel_id = $2`, [T, girls.id]);
    const hn = await notice({ senderId: principal, title: 'Sharada Hostel: water supply off on Saturday', body: 'Water supply in Sharada Girls’ Hostel is off on Saturday from 9 am to 1 pm for tank cleaning. Store water on Friday night.', priority: 'normal', channels: ['student', 'parent', 'teacher'], audience: { scope: 'hostels', hostelIds: [girls.id] }, status: 'sent', sendAt: ago(1, '18:00'), sentAt: ago(1, '18:00') });
    const resParents = residents.flatMap((x) => c.guardianOf.get(x.studentId) ?? []);
    await recipients(hn.id, [...asStudents(residents.map((x) => x.userId).filter((x): x is string => !!x)), ...asParents(resParents), ...(girls.wardenUserId ? asStaff([girls.wardenUserId]) : [])], ago(1, '18:00'), 0.6);
  }
  const [route2] = await k.q<{ id: string }>(`select id from transport_routes where tenant_id = $1 and name like 'Route 2%'`, [T]);
  if (route2) {
    const riders = await k.q<{ studentId: string; userId: string | null }>(`select s.id as student_id, s.user_id from transport_assignments a join students s on s.id = a.student_id where a.tenant_id = $1 and a.route_id = $2 and a.ended_on is null`, [T, route2.id]);
    const rn = await notice({ senderId: principal, title: 'Route 2: new pick-up time at Rajajinagar', body: 'From Monday the Route 2 bus reaches Rajajinagar 1st Block at **7:25 am** (10 minutes earlier) because of the metro work diversion.', priority: 'important', channels: ['student', 'parent'], audience: { scope: 'routes', routeIds: [route2.id] }, status: 'sent', sendAt: ago(4, '19:00'), sentAt: ago(4, '19:00') });
    await recipients(rn.id, [...asStudents(riders.map((x) => x.userId).filter((x): x is string => !!x)), ...asParents(riders.flatMap((x) => c.guardianOf.get(x.studentId) ?? []))], ago(4, '19:00'), 0.81, 0.5);
  }
  // A staff circular that needs acknowledging, a scheduled notice and a draft.
  const teachersAndHods = [...new Set([...withRole('teacher'), ...withRole('hod')])];
  const staffMeet = await notice({ senderId: principal, title: 'Staff meeting: NAAC peer team visit', body: 'All teaching staff meet in the seminar hall on **Friday at 3:30 pm** to prepare for the NAAC peer team visit.\n\n1. Criterion-wise evidence files\n2. Department presentations', priority: 'normal', requiresAck: true, channels: ['teacher'], audience: { scope: 'roles', roles: ['teacher', 'hod'] }, status: 'sent', sendAt: ago(1, '11:00'), sentAt: ago(1, '11:00') });
  await recipients(staffMeet.id, asStaff(teachersAndHods), ago(1, '11:00'), 0.9, 0.7);
  const sched = await notice({ senderId: principal, title: 'Parent-teacher meeting: book your slot', body: 'The parent-teacher meeting is on the date in the Parent App. Book a slot with each teacher.', priority: 'important', channels: ['parent'], audience: { scope: 'roles', roles: ['guardian'] }, status: 'scheduled', sendAt: at(addDays(c.today, 2), '17:00') });
  const draft = await notice({ senderId: hodCA, departmentId: dept.computers, title: 'BCA: hackathon registrations', body: 'Registrations for the inter-college hackathon close on 25 November.', priority: 'normal', channels: ['student'], audience: { scope: 'programs', programIds: [c.programs['BCA'].id] }, status: 'draft' });

  // ---- events calendar: RSVPs to the Annual Day -------------------------------------------------------------------
  const [annualEvent] = await k.q<{ id: string }>(`select id from calendar_events where tenant_id = $1 and title like 'Annual Day%' limit 1`, [T]);
  if (annualEvent) {
    await k.q(`update calendar_events set rsvp = true, rsvp_by = $2, capacity = 900, venue = 'Main ground' where id = $1`, [annualEvent.id, addDays(c.today, 30)]);
    const repliers = [...guardians.filter(() => r.chance(0.45)), ...studentsU.filter(() => r.chance(0.3))];
    await k.ins('calendar_event_rsvps', repliers.map((userId) => {
      const response = weighted(r, ['going', 'maybe', 'not_going'] as const, [7, 2, 1]);
      return { eventId: annualEvent.id, userId, response, guests: response === 'going' && guardians.includes(userId) ? r.int(0, 3) : 0, note: '', createdAt: ago(r.int(0, 3), '20:30'), updatedAt: ago(r.int(0, 2), '21:00') };
    }), { returning: false });
  }

  // ---- family chat: moderation, a paused family, an escalation, do-not-disturb ------------------------------------
  // Not the demo families (they already talk to their teachers in the operations stage).
  const demo = ['Sahana Gowda', 'Vignesh Naik', 'Chaitra Naik'];
  const stu = c.students.filter((s) => c.guardianOf.has(s.id) && !demo.includes(s.name));
  const teacherOf = (sectionId: string) => c.sections.find((s) => s.id === sectionId)?.subjects[0]?.teacherId ?? c.teachers[0].id;
  const conv = async (studentId: string, staffId: string, familyId: string, lines: [string, string, string, number][], extra: Record<string, unknown> = {}) => {
    const last = lines.at(-1)!;
    const cv = await k.one<{ id: string }>('conversations', { studentId, staffId, familyId, lastMessageAt: ago(last[3], last[2]), staffReadAt: ago(last[3], last[2]), familyReadAt: ago(last[3], last[2]), ...extra });
    const ids: string[] = [];
    for (const [who, body, time, days] of lines) ids.push((await k.one<{ id: string }>('messages', { conversationId: cv.id, senderId: who === 'f' ? familyId : who === 's' ? staffId : (extra.escalatedTo as string), body, kind: who === 'x' ? 'system' : 'text', createdAt: ago(days, time) })).id);
    return { id: cv.id, ids };
  };
  // A rude message flagged by the filter and reported by the teacher, then removed with a note.
  const s1 = stu[3];
  const fam1 = c.guardianOf.get(s1.id)![0];
  const t1 = teacherOf(s1.sectionId);
  const c1 = await conv(s1.id, t1, fam1, [
    ['f', 'Why was my son marked absent on Monday? He was in college.', '18:05', 6],
    ['s', 'He was not in the 10 am class. Please check with him; the attendance sheet has his signature missing.', '19:10', 6],
    ['f', 'This is stupid. You people are useless fellow, always blaming the students.', '20:02', 6],
    ['s', 'I understand you are upset. Please meet me tomorrow at 11 am and we will check the register together.', '08:30', 5],
  ]);
  await k.q(`update messages set flag = 'abusive_language', hidden_at = $2, hidden_by = $3 where id = $1`, [c1.ids[2], ago(5, '10:00'), principal]);
  await k.ins('message_reports', [
    { messageId: c1.ids[2], conversationId: c1.id, reportedBy: null, reason: 'filter', note: 'abusive_language', status: 'actioned', action: 'hide', resolvedBy: principal, resolvedAt: ago(5, '10:00'), resolutionNote: 'Abusive words; the parent was called and apologised', createdAt: ago(6, '20:02') },
    { messageId: c1.ids[2], conversationId: c1.id, reportedBy: t1, reason: 'abusive', note: 'Insulting language', status: 'actioned', action: 'hide', resolvedBy: principal, resolvedAt: ago(5, '10:00'), resolutionNote: 'Abusive words; the parent was called and apologised', createdAt: ago(6, '20:15') },
  ], { returning: false });
  // An open report by a parent about a teacher's message, and an open filter flag (staff giving a student a number).
  const s2 = stu[8];
  const fam2 = c.guardianOf.get(s2.id)![0];
  const t2 = teacherOf(s2.sectionId);
  const c2 = await conv(s2.id, t2, fam2, [
    ['f', 'Can my daughter submit the record book on Monday? She was unwell.', '17:40', 2],
    ['s', 'No extensions. If she cannot follow simple deadlines she should not be in this course.', '18:20', 2],
  ]);
  await k.ins('message_reports', { messageId: c2.ids[1], conversationId: c2.id, reportedBy: fam2, reason: 'harassment', note: 'The teacher was rude about my daughter', status: 'open', createdAt: ago(2, '18:45') }, { returning: false });
  const studentWithLogin = c.students.find((s) => s.prog === 'BCA' && s.term === 5);
  const [su] = studentWithLogin ? await k.q<{ userId: string | null }>('select user_id from students where id = $1', [studentWithLogin.id]) : [];
  if (studentWithLogin && su?.userId) {
    const t3 = teacherOf(studentWithLogin.sectionId);
    const c3 = await conv(studentWithLogin.id, t3, su.userId, [
      ['f', 'Sir, I could not understand the normalisation topic. Can you explain once more?', '21:10', 1],
      ['s', 'Sure. Call me on 98450 12345 after 8 pm and I will explain.', '21:40', 1],
    ]);
    await k.q(`update messages set flag = 'private_contact' where id = $1`, [c3.ids[1]]);
    await k.ins('message_reports', { messageId: c3.ids[1], conversationId: c3.id, reportedBy: null, reason: 'filter', note: 'private_contact', status: 'open', createdAt: ago(1, '21:40') }, { returning: false });
  }
  // A family whose messages the teacher paused for a week after repeated late-night messages.
  const s4 = stu[14];
  const fam4 = c.guardianOf.get(s4.id)![0];
  const t4 = teacherOf(s4.sectionId);
  const c4 = await conv(s4.id, t4, fam4, [
    ['f', 'Madam reply now. I have sent 12 messages tonight.', '23:40', 3],
    ['s', 'Messages from the family are paused in this conversation. Contact the office for anything urgent.', '08:10', 2],
  ]);
  await k.q(`update messages set kind = 'system' where id = $1`, [c4.ids[1]]);
  await k.ins('chat_blocks', { userId: fam4, blockedBy: t4, staffId: t4, reason: 'Repeated messages late at night after being asked to use office hours', until: at(addDays(c.today, 5), '08:10'), createdAt: ago(2, '08:10') }, { returning: false });
  // Escalated to the head of Commerce: the family waited more than 48 hours.
  const s5 = stu.find((s) => s.prog === 'BCM' && ![s1.id, s2.id, s4.id].includes(s.id))!;
  const fam5 = c.guardianOf.get(s5.id)![0];
  const t5 = c.byEmail['sudhir.kamath'].id;
  await conv(s5.id, t5, fam5, [
    ['f', 'Sir, the IA 1 marks of Cost Accounting are not shown in the app. Please check.', '16:20', 4],
    ['x', 'Escalated to Dr. Kavitha Murthy: No reply for 48 hours', '16:25', 2],
    ['e', 'I have asked the teacher to publish the corrected marks today. Sorry for the delay.', '10:05', 1],
  ], { escalatedAt: ago(2, '16:25'), escalatedTo: hodC, escalationReason: 'No reply for 48 hours' });
  // A teacher on exam duty, on do-not-disturb until tomorrow evening.
  await k.ins('chat_availability', [
    { userId: c.byEmail['deepa.nair'].id, dndUntil: at(addDays(c.today, 1), '18:00'), hours: J({ start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] }), awayNote: 'On university exam duty; I will reply tomorrow evening' },
    { userId: c.byEmail['sowmya.reddy'].id, dndUntil: null, hours: J({ start: '09:30', end: '16:30', days: [1, 2, 3, 4, 5] }), awayNote: 'I reply between 9:30 am and 4:30 pm on working days' },
  ], { returning: false });
  await k.ins('retention_rules', [{ target: 'family_chat', category: '', keepDays: 730, action: 'delete', active: true }, { target: 'comm_send_log', category: '', keepDays: 1095, action: 'delete', active: true }], { returning: false }).catch(() => undefined);

  // ---- last month's PTM with attendance and minutes; a booking for the BCom demo parent ---------------------------
  const past = await k.one<{ id: string }>('ptm_events', { title: 'Parent-Teacher Meeting: IA 1 review', eventDate: addDays(c.today, -24), location: 'Classrooms', status: 'closed', createdBy: principal });
  const pastSlots: Record<string, unknown>[] = [];
  const notes = [
    ['Attendance is 71%; needs to reach 75% before the exams. Strong in accounting problems.', 'Attend every class until December; the parent checks attendance in the app weekly.'],
    ['Good progress. Needs to practise theory answers in full sentences.', 'Write two long answers a week for the class teacher to check.'],
    ['Struggling with Business Statistics; missed two assignments.', 'Remedial class on Saturdays; submit the pending assignments by Friday.'],
    ['Excellent IA 1 marks. Encouraged to join the commerce forum.', 'Register for the commerce forum quiz.'],
  ];
  c.teachers.filter((t) => !t.email.startsWith('hod.')).slice(0, 6).forEach((t, ti) => {
    for (let i = 0; i < 6; i++) {
      const st = c.students[(ti * 13 + i * 7) % c.students.length];
      const booked = i < 5 && c.guardianOf.has(st.id);
      const came = booked && r.chance(0.82);
      const n = notes[(ti + i) % notes.length];
      pastSlots.push({ eventId: past.id, teacherId: t.id, startsAt: at(addDays(c.today, -24), `${10 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`), endsAt: at(addDays(c.today, -24), `${10 + Math.floor((i + 1) / 2)}:${(i + 1) % 2 ? '30' : '00'}`), studentId: booked ? st.id : null, bookedBy: booked ? c.guardianOf.get(st.id)![0] : null, bookedAt: booked ? ago(30) : null, attendance: booked ? (came ? 'attended' : 'no_show') : null, minutes: came ? n[0] : '', actionPoints: came ? n[1] : '', minutesAt: booked ? ago(24, '15:00') : null });
    }
  });
  await k.ins('ptm_slots', pastSlots, { returning: false });
  // The BCom demo parent has a slot booked with her class teacher at the coming meeting (the Parent App shows it).
  const sahana = c.students.find((s) => s.name === 'Sahana Gowda');
  const [upcoming] = await k.q<{ id: string }>(`select id from ptm_events where tenant_id = $1 and status = 'open' order by event_date limit 1`, [T]);
  if (sahana && upcoming) {
    const parent = c.guardianOf.get(sahana.id)?.[0];
    const [free] = await k.q<{ id: string }>(`select id from ptm_slots where event_id = $1 and teacher_id = $2 and student_id is null order by starts_at limit 1`, [upcoming.id, c.byEmail['sudhir.kamath'].id]);
    if (parent && free) await k.q('update ptm_slots set student_id = $2, booked_by = $3, booked_at = $4 where id = $1', [free.id, sahana.id, parent, ago(1, '20:15')]);
  }
}
