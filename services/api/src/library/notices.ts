import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, libraryBooks, libraryLoans, students } from '../db/schema.js';
import { libraryMembers } from '../db/schema-lht.js';
import { libraryOverdueNotices } from '../db/schema-library.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { loanRules, plusDays, tenantToday } from './circulation.js';
import { chargeableDays, lateFine, loadClosures } from './fines.js';

export const OVERDUE_JOB = 'library.overdue-notices';
/** The Communication template (SMS needs its DLT id) for library notices: {{member}}, {{title}}, {{due}}, {{days}}, {{fine}}. */
export const NOTICE_TEMPLATE = 'library_overdue';

export type NoticeStep = 'due_soon' | 'first' | 'second' | 'final';
export interface NoticeRun {
  today: string;
  sent: { app: number; sms: number; whatsapp: number };
  byStep: Record<NoticeStep, number>;
  /** Why a channel the settings ask for did not go out (no template, no DLT id). */
  skipped: string[];
}

/** The step a loan is at on `today`: a reminder `dueSoonDays` before the due date, then the notices on the given days overdue. */
export function noticeStep(dueOn: string, today: string, noticeDays: number[], dueSoonDays: number): { step: NoticeStep; daysOverdue: number } | null {
  const late = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  if (late < 0) return dueSoonDays > 0 && -late <= dueSoonDays ? { step: 'due_soon', daysOverdue: 0 } : null;
  const steps: NoticeStep[] = ['first', 'second', 'final'];
  let at: NoticeStep | null = null;
  noticeDays.slice(0, 3).forEach((d, i) => {
    if (late >= d) at = steps[i];
  });
  return at ? { step: at, daysOverdue: late } : null;
}

const WORDS: Record<NoticeStep, { en: string; hi: string; kn: string }> = {
  due_soon: { en: 'Library book due soon', hi: 'पुस्तकालय पुस्तक जल्द देय', kn: 'ಗ್ರಂಥಾಲಯ ಪುಸ್ತಕ ಶೀಘ್ರದಲ್ಲೇ ಹಿಂತಿರುಗಿಸಬೇಕು' },
  first: { en: 'Library book overdue', hi: 'पुस्तकालय पुस्तक अतिदेय', kn: 'ಗ್ರಂಥಾಲಯ ಪುಸ್ತಕ ಗಡುವು ಮೀರಿದೆ' },
  second: { en: 'Second notice: library book overdue', hi: 'दूसरी सूचना: पुस्तक अतिदेय', kn: 'ಎರಡನೇ ಸೂಚನೆ: ಪುಸ್ತಕ ಗಡುವು ಮೀರಿದೆ' },
  final: { en: 'Final notice: return the library book', hi: 'अंतिम सूचना: पुस्तक लौटाएँ', kn: 'ಅಂತಿಮ ಸೂಚನೆ: ಪುಸ್ತಕ ಹಿಂತಿರುಗಿಸಿ' },
};

/**
 * Overdue notices: every day each loan still out gets the notice for the step it has reached (due soon, first, second,
 * final), once per step, in the app to the borrower (and a student's family) and on SMS or WhatsApp through
 * Communication when the library settings ask for it. The step is recorded so a missed day catches up without repeats.
 */
@Injectable()
export class LibraryNotices implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(OVERDUE_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.run(tx, job.tenantId, null)).then(() => undefined));
  }

  async run(tx: Tx, tenantId: string, actor: UserPrincipal | null): Promise<NoticeRun> {
    const now = this.clock.now();
    const today = await tenantToday(tx, now);
    const s = (await readSettings(tx, tenantId, 'library')).rules;
    const noticeDays = String(s.noticeDays ?? '1,7,15').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b);
    const dueSoonDays = Number(s.dueSoonDays ?? 0);
    const channels = String(s.noticeChannels ?? '').split(',').map((c) => c.trim()).filter((c) => c === 'sms' || c === 'whatsapp');
    const out: NoticeRun = { today, sent: { app: 0, sms: 0, whatsapp: 0 }, byStep: { due_soon: 0, first: 0, second: 0, final: 0 }, skipped: [] };
    const loans = await tx
      .select({ id: libraryLoans.id, dueOn: libraryLoans.dueOn, bookId: libraryLoans.bookId, memberId: libraryLoans.memberId, studentId: libraryLoans.studentId, title: libraryBooks.title, member: sql<string>`coalesce((select full_name from library_members m where m.id = ${libraryLoans.memberId}), (select full_name from students st where st.id = ${libraryLoans.studentId}), '')` })
      .from(libraryLoans)
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .where(and(isNull(libraryLoans.returnedAt), sql`${libraryLoans.dueOn} <= ${plusDays(today, Math.max(0, dueSoonDays))}::date`))
      .orderBy(libraryLoans.dueOn)
      .limit(5000);
    const closures = loans.length ? await loadClosures(tx, loans[0].dueOn, today, s) : null;
    for (const l of loans) {
      const at = noticeStep(l.dueOn, today, noticeDays, dueSoonDays);
      if (!at) continue;
      const [fresh] = await tx.insert(libraryOverdueNotices).values({ tenantId, loanId: l.id, step: at.step, daysOverdue: at.daysOverdue, sentBy: actor?.userId ?? null, sentAt: now }).onConflictDoNothing().returning({ id: libraryOverdueNotices.id });
      if (!fresh) continue;
      const rules = await loanRules(tx, tenantId, l);
      const days = at.step === 'due_soon' ? 0 : chargeableDays(l.dueOn, today, closures!, rules.graceDays);
      const fine = lateFine(days, rules.finePerDay, rules.maxFinePaise);
      const users = await this.recipients(tx, l);
      const fineText = `₹${(fine / 100).toFixed(2)}`;
      const w = WORDS[at.step];
      if (users.length) {
        await this.notifications.notifyUsers(tx, users, {
          kind: 'announcement',
          text: {
            en: { title: w.en, body: at.step === 'due_soon' ? `${l.member}: "${l.title}" is due on ${l.dueOn}. Renew it in the app or return it at the desk.` : `${l.member}: "${l.title}" was due on ${l.dueOn} (${at.daysOverdue} days). The fine so far is ${fineText}.` },
            hi: { title: w.hi, body: at.step === 'due_soon' ? `${l.member}: "${l.title}" ${l.dueOn} को देय है।` : `${l.member}: "${l.title}" ${l.dueOn} को देय थी (${at.daysOverdue} दिन)। अब तक जुर्माना ${fineText}।` },
            kn: { title: w.kn, body: at.step === 'due_soon' ? `${l.member}: "${l.title}" ${l.dueOn} ರಂದು ಹಿಂತಿರುಗಿಸಬೇಕು.` : `${l.member}: "${l.title}" ${l.dueOn} ರಂದು ಹಿಂತಿರುಗಿಸಬೇಕಿತ್ತು (${at.daysOverdue} ದಿನ). ಈವರೆಗಿನ ದಂಡ ${fineText}.` },
          },
          data: { loanId: l.id, bookId: l.bookId, step: at.step },
          dedupeKey: `library-notice:${l.id}:${at.step}`,
        });
        out.sent.app++;
      }
      const used = ['app'];
      if (at.step !== 'due_soon' && users.length) for (const ch of channels) if (await this.queue(tx, tenantId, ch as 'sms' | 'whatsapp', users, l, at.daysOverdue, fineText, at.step, now, out)) used.push(ch);
      await tx.update(libraryOverdueNotices).set({ channels: used.join(','), recipients: users.length }).where(eq(libraryOverdueNotices.id, fresh.id));
      await tx.update(libraryLoans).set({ noticesSent: sql`${libraryLoans.noticesSent} + 1`, lastNoticeAt: now }).where(eq(libraryLoans.id, l.id));
      out.byStep[at.step]++;
    }
    if (actor) await auditUser(tx, actor, 'library.overdue_notices_sent', 'library_loan', undefined, { today, ...out.byStep, sms: out.sent.sms });
    return out;
  }

  /** The borrower's account and, for a student, the family's. */
  private async recipients(tx: Tx, l: { memberId: string | null; studentId: string | null }): Promise<string[]> {
    const ids = new Set<string>();
    if (l.memberId) {
      const [m] = await tx.select({ userId: libraryMembers.userId }).from(libraryMembers).where(eq(libraryMembers.id, l.memberId));
      if (m?.userId) ids.add(m.userId);
    }
    if (l.studentId) {
      const [s] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, l.studentId));
      if (s?.userId) ids.add(s.userId);
      for (const g of await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, l.studentId))) ids.add(g.userId);
    }
    return [...ids];
  }

  /** Queues an SMS or WhatsApp notice through Communication (a one-person audience and a campaign due now), once per loan and step. */
  private async queue(tx: Tx, tenantId: string, ch: 'sms' | 'whatsapp', users: string[], l: { id: string; title: string; dueOn: string; member: string }, days: number, fine: string, step: NoticeStep, now: Date, out: NoticeRun): Promise<boolean> {
    const label = ch === 'sms' ? 'SMS' : 'WhatsApp';
    const [tpl] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, NOTICE_TEMPLATE), eq(messageTemplates.channel, ch), eq(messageTemplates.active, true))).limit(1);
    const skip = (why: string) => {
      if (!out.skipped.includes(why)) out.skipped.push(why);
      return false;
    };
    if (!tpl) return skip(`No active "${NOTICE_TEMPLATE}" ${label} template in Communication`);
    if (ch === 'sms' && !tpl.dltTemplateId) return skip(`The "${NOTICE_TEMPLATE}" SMS template has no DLT template id`);
    const [rule] = await tx.insert(audienceRules).values({ tenantId, name: `library-notice:${l.id}:${step}:${ch}`, rule: { userIds: users } }).onConflictDoNothing().returning({ id: audienceRules.id });
    if (!rule) return false;
    await tx.insert(messageCampaigns).values({ tenantId, title: `Library notice: ${l.member}`.slice(0, 160), templateId: tpl.id, audienceId: rule.id, vars: { member: l.member, title: l.title.slice(0, 60), due: l.dueOn, days: String(days), fine }, sendAt: now, createdBy: null });
    out.sent[ch]++;
    return true;
  }
}
