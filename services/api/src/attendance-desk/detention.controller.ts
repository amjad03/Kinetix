import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { PdfWriter } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceDetentionEntries, attendanceDetentionLists } from '../db/schema-academic-ops.js';
import { programs, sections, students, tenants, users } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { dateIn, type Lang, type Localized } from '../notifications/texts.js';
import { ATTENDANCE_TEMPLATES, emptyChannels, queueFamilyMessage } from './alert-channels.js';
import { AttendanceDeskService } from './desk.service.js';
import { attendancePolicy } from '../attendance-governance/policy.js';

/** Who prepares a list (the office and the exam cell) and who publishes or withdraws it (the principal). */
const PREPARERS: RoleName[] = ['principal', 'tenant_admin', 'hod', 'exam_controller'];
const PUBLISHERS: RoleName[] = ['principal', 'tenant_admin'];
const ListBody = z.object({ programId: z.uuid().optional(), term: z.number().int().min(1).max(12).optional(), title: z.string().trim().min(3).max(160).optional() });
const WithdrawBody = z.object({ reason: z.string().trim().min(5).max(500) });

const detainedText = (p: { studentName: string; list: string; pct: number | null; threshold: number; date: string }): Localized => {
  const all = (f: (l: Lang) => { title: string; body: string }) => ({ en: f('en'), hi: f('hi'), kn: f('kn') });
  return all((l) =>
    l === 'hi'
      ? { title: `${p.studentName}: उपस्थिति की कमी के कारण परीक्षा से रोका गया`, body: `${p.list} (${dateIn(l, p.date)}): उपस्थिति ${p.pct ?? 0}%, आवश्यक ${p.threshold}%।` }
      : l === 'kn'
        ? { title: `${p.studentName}: ಹಾಜರಾತಿ ಕೊರತೆಯಿಂದ ಪರೀಕ್ಷೆಗೆ ತಡೆ`, body: `${p.list} (${dateIn(l, p.date)}): ಹಾಜರಾತಿ ${p.pct ?? 0}%, ಬೇಕಾದದ್ದು ${p.threshold}%.` }
        : { title: `${p.studentName}: detained for shortage of attendance`, body: `${p.list} (${dateIn(l, p.date)}): attendance ${p.pct ?? 0}% against the ${p.threshold}% needed.` },
  );
};

/**
 * Published detention lists: the exam cell or a head of department prepares a frozen copy of the shortage list for a
 * programme and term, the principal publishes it (families of detained students are told; hall tickets read it) or
 * withdraws it with a reason. Draft lists can be refreshed by preparing again.
 */
@Controller('v1/attendance-desk/detention-lists')
export class DetentionController {
  constructor(
    private readonly db: DbService,
    private readonly desk: AttendanceDeskService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
  ) {}

  @Get()
  @Auth('user', PREPARERS)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ l: attendanceDetentionLists, program: programs.name, preparedBy: users.fullName })
        .from(attendanceDetentionLists)
        .leftJoin(programs, eq(programs.id, attendanceDetentionLists.programId))
        .innerJoin(users, eq(users.id, attendanceDetentionLists.preparedBy))
        .orderBy(desc(attendanceDetentionLists.createdAt))
        .limit(100)
        .then((rows) => rows.map((r) => ({ ...r.l, program: r.program, preparedByName: r.preparedBy }))),
    );
  }

  /** Freezes today's shortage list for a programme and term (or every class) as a draft. */
  @Post()
  @Auth('user', PREPARERS)
  prepare(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ListBody)) b: z.infer<typeof ListBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [prog] = b.programId ? await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, b.programId)) : [];
      if (b.programId && !prog) throw new NotFoundException('Programme not found');
      const today = (await this.desk.now(tx)).date;
      const d = await this.desk.detentionRows(tx, b.programId, b.term);
      if (!d.classes) throw new BadRequestException('No classes of the current year match');
      const detained = d.rows.filter((r) => r.status === 'detained').length;
      const title = b.title ?? `Detention list${prog ? `: ${prog.name}` : ''}${b.term ? `, term ${b.term}` : ''} as on ${today}`;
      const [list] = await tx
        .insert(attendanceDetentionLists)
        .values({ tenantId: p.tenantId, programId: b.programId ?? null, term: b.term ?? null, title, asOn: today, classes: d.classes, eligible: d.eligible, condonable: d.rows.length - detained, detained, preparedBy: p.userId })
        .returning();
      if (d.rows.length) {
        await tx.insert(attendanceDetentionEntries).values(
          d.rows.map((r) => ({ tenantId: p.tenantId, listId: list.id, studentId: r.studentId, sectionId: r.sectionId, status: r.status, pct: r.pct, effectivePct: r.effectivePct, thresholdPct: r.thresholdPct, shortIn: r.shortIn })),
        );
      }
      await auditUser(tx, p, 'attendance.detention_list.prepared', 'attendance_detention_list', list.id, { after: { status: 'draft', detained, condonable: d.rows.length - detained } });
      return list;
    });
  }

  /** The list with its students; `format=pdf|xlsx` downloads it for the notice board and the university. */
  @Get(':id')
  @Auth('user', PREPARERS)
  async one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      const out = await this.load(tx, id);
      if (format) await auditUser(tx, p, 'attendance.detention_list.exported', 'attendance_detention_list', id, { format });
      return out;
    });
    if (format !== 'pdf' && format !== 'xlsx') return r;
    const name = `detention-list-${r.list.asOn}`;
    const head = ['Class', 'Roll', 'Student', 'Status', 'Attendance %', 'After condonation %', 'Needed %', 'Short in'];
    const grid = r.entries.map((e) => [e.section, e.rollNo, e.fullName, e.status === 'detained' ? 'Detained' : 'Condonable', e.pct, e.effectivePct, e.thresholdPct, e.shortIn.map((x) => `${x.code} ${x.effective ?? x.pct ?? 0}%`).join(', ') || 'Overall']);
    if (format === 'xlsx') {
      res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('content-disposition', `attachment; filename="${name}.xlsx"`);
      res.end(writeXlsx('Detention list', [head, ...grid]));
      return;
    }
    const pdf = new PdfWriter();
    pdf.text(r.institution, { size: 14, bold: true, align: 'center' });
    pdf.text(r.list.title, { size: 11, bold: true, align: 'center' });
    pdf.text(`Status: ${r.list.status}${r.list.publishedAt ? `, published ${r.list.publishedAt.toISOString().slice(0, 10)}` : ''} · classes ${r.list.classes} · eligible ${r.list.eligible} · condonable ${r.list.condonable} · detained ${r.list.detained}`, { size: 8, align: 'center' });
    pdf.gap(6);
    const xs = [0, 80, 130, 260, 320, 365, 420, 460];
    pdf.row(['Class', 'Roll', 'Student', 'Status', 'Att. %', 'After cond.', 'Needed', 'Short in'], xs, { bold: true, size: 8 });
    for (const g of grid) pdf.row(g.map((c) => String(c ?? '')), xs, { size: 8 });
    pdf.gap(36);
    pdf.row(['Prepared by', '', 'Head of department', '', '', 'Principal'], [0, 60, 170, 250, 330, 420], { size: 9 });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${name}.pdf"`);
    res.end(pdf.build());
  }

  /** Publishes a draft: hall tickets read it from now on, and the families of detained students are told. */
  @Post(':id/publish')
  @HttpCode(200)
  @Auth('user', PUBLISHERS)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { list, entries } = await this.load(tx, id);
      if (list.status !== 'draft') throw new ConflictException(`This list is ${list.status}`);
      if (list.preparedBy === p.userId && !p.roles.includes('principal') && !p.roles.includes('tenant_admin')) throw new ForbiddenException('Someone else must publish the list you prepared');
      const [row] = await tx.update(attendanceDetentionLists).set({ status: 'published', publishedBy: p.userId, publishedAt: new Date() }).where(and(eq(attendanceDetentionLists.id, id), eq(attendanceDetentionLists.status, 'draft'))).returning();
      if (!row) throw new ConflictException('This list was changed meanwhile');
      const policy = await attendancePolicy(tx, null);
      const queued = emptyChannels();
      let told = 0;
      for (const e of entries.filter((x) => x.status === 'detained')) {
        told += await this.notifications.attendanceNotice(tx, e.studentId, { text: detainedText({ studentName: e.fullName, list: list.title, pct: e.effectivePct, threshold: e.thresholdPct, date: list.asOn }), data: { studentId: e.studentId, listId: id }, dedupeKey: `att-detained:${id}:${e.studentId}` });
        await queueFamilyMessage(tx, { tenantId: p.tenantId, channels: policy.alertChannels, template: ATTENDANCE_TEMPLATES.detention, studentId: e.studentId, studentName: e.fullName, vars: { list: list.title, pct: String(e.effectivePct ?? 0), threshold: String(e.thresholdPct) }, dedupeKey: `att-detained:${id}:${e.studentId}`, now: new Date() }, queued);
      }
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.DetentionListPublished, aggregateType: 'attendance_detention_list', aggregateId: id, actorId: p.userId, payload: { detained: list.detained, condonable: list.condonable, programId: list.programId, term: list.term } });
      await auditUser(tx, p, 'attendance.detention_list.published', 'attendance_detention_list', id, { before: { status: 'draft' }, after: { status: 'published' }, notified: told, sms: queued.sms, whatsapp: queued.whatsapp });
      return { ...row, notified: told, sms: queued.sms, whatsapp: queued.whatsapp, skipped: queued.skipped };
    });
  }

  /** Withdraws a list (a draft or a published one) with a reason; hall tickets stop reading it. */
  @Post(':id/withdraw')
  @HttpCode(200)
  @Auth('user', PUBLISHERS)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(WithdrawBody)) b: z.infer<typeof WithdrawBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [list] = await tx.select().from(attendanceDetentionLists).where(eq(attendanceDetentionLists.id, id));
      if (!list) throw new NotFoundException('List not found');
      if (list.status === 'withdrawn') throw new ConflictException('This list is already withdrawn');
      const [row] = await tx.update(attendanceDetentionLists).set({ status: 'withdrawn', withdrawnBy: p.userId, withdrawnAt: new Date(), withdrawReason: b.reason }).where(eq(attendanceDetentionLists.id, id)).returning();
      if (list.status === 'published') await this.events.emit(tx, p.tenantId, { type: DomainEvents.DetentionListWithdrawn, aggregateType: 'attendance_detention_list', aggregateId: id, actorId: p.userId, payload: { reason: b.reason } });
      await auditUser(tx, p, 'attendance.detention_list.withdrawn', 'attendance_detention_list', id, { before: { status: list.status }, after: { status: 'withdrawn' }, reason: b.reason });
      return row;
    });
  }

  private async load(tx: Tx, id: string) {
    const [list] = await tx.select().from(attendanceDetentionLists).where(eq(attendanceDetentionLists.id, id));
    if (!list) throw new NotFoundException('List not found');
    const entries = await tx
      .select({ e: attendanceDetentionEntries, rollNo: students.rollNo, fullName: students.fullName, section: sections.displayName })
      .from(attendanceDetentionEntries)
      .innerJoin(students, eq(students.id, attendanceDetentionEntries.studentId))
      .innerJoin(sections, eq(sections.id, attendanceDetentionEntries.sectionId))
      .where(eq(attendanceDetentionEntries.listId, id))
      .orderBy(asc(sections.displayName), sql`${students.rollNo}`);
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    return { list, institution: t?.name ?? '', entries: entries.map((r) => ({ ...r.e, rollNo: r.rollNo, fullName: r.fullName, section: r.section })) };
  }
}
