import { randomBytes } from 'node:crypto';
import { Controller, ForbiddenException, Get, HttpCode, Inject, Ip, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { A4, Pdf } from '../common/pdf-doc.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { outcomePassports, students, tenants } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { FAMILY, SKILL_ADMIN, SKILL_STAFF } from './skills.access.js';
import { SkillsService, type Passport } from './skills.service.js';

const newToken = () => randomBytes(16).toString('hex');

/** The Student Outcome Passport: skills with level and evidence, certificates and activities, verified by the institution. */
@Controller('v1/passport')
export class PassportController {
  private readonly verifyBase: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly db: DbService,
    private readonly svc: SkillsService,
  ) {
    this.verifyBase = env.VERIFY_BASE_URL.replace(/\/$/, '');
  }

  /** Student App: my passport (a parent passes `studentId` for a child). */
  @Get('me')
  @Auth('user', FAMILY)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.passport(tx, await this.svc.actingStudent(tx, p, studentId)));
  }

  /** Staff read any student's passport; a student or parent reads their own. */
  @Get('students/:studentId')
  @Auth('user')
  async one(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.allow(tx, p, studentId);
      return this.svc.passport(tx, studentId);
    });
  }

  /** The institution verifies the passport; the QR on its PDF then answers "valid" for anyone who scans it. */
  @Post('students/:studentId/verify')
  @Auth('user', SKILL_ADMIN)
  @HttpCode(200)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      const row = await this.svc.passportRow(tx, p.tenantId, studentId, newToken);
      const [done] = await tx.update(outcomePassports).set({ verifiedBy: p.userId, verifiedAt: this.svc.now(), revokedAt: null }).where(eq(outcomePassports.id, row.id)).returning();
      await auditUser(tx, p, 'passport.verified', 'student', studentId);
      return { verified: true, verifiedAt: done.verifiedAt, verifyUrl: await this.verifyUrl(tx, done.verifyToken) };
    });
  }

  /** Withdraws the institution's verification (the QR then answers "revoked"). */
  @Post('students/:studentId/revoke')
  @Auth('user', SKILL_ADMIN)
  @HttpCode(200)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(outcomePassports).set({ revokedAt: this.svc.now() }).where(eq(outcomePassports.studentId, studentId)).returning();
      found(row, 'Passport');
      await auditUser(tx, p, 'passport.revoked', 'student', studentId);
      return { verified: false };
    });
  }

  /** The printable passport (PDF); it carries the verify QR once the institution has verified it. */
  @Get('students/:studentId/pdf')
  @Auth('user')
  async pdf(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const buf = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.allow(tx, p, studentId);
      const data = await this.svc.passport(tx, studentId);
      const row = await this.svc.passportRow(tx, p.tenantId, studentId, newToken);
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return passportPdf(t?.name ?? '', data, data.verification.verified ? await this.verifyUrl(tx, row.verifyToken) : null, this.svc.now().toISOString().slice(0, 10));
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="outcome-passport-${studentId.slice(0, 8)}.pdf"`);
    res.end(buf);
  }

  private async allow(tx: Tx, p: UserPrincipal, studentId: string) {
    if (hasRole(p, SKILL_STAFF)) return;
    if (!hasRole(p, FAMILY) || !(await this.svc.familyStudents(tx, p)).includes(studentId)) throw new ForbiddenException('Not allowed');
  }

  private async verifyUrl(tx: Tx, token: string) {
    const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
    return `${this.verifyBase}/passport/${t.slug}/${token}`;
  }
}

/** Public check of a passport's QR code. No sign-in; rate limited; shows no more than the printed passport does. */
@Controller('v1/public')
export class PassportVerifyController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly svc: SkillsService,
  ) {}

  @Get('verify-passport/:slug/:token')
  async verify(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    await this.limiter.hit(`verify:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) && /^[0-9a-f]{32}$/.test(token) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) return { status: 'not_found' as const };
    return this.db.withTenant(tenant.id, async (tx) => {
      const [row] = await tx.select().from(outcomePassports).where(eq(outcomePassports.verifyToken, token));
      if (!row || !row.verifiedAt) return { status: 'not_found' as const };
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const data = await this.svc.passport(tx, row.studentId);
      return {
        status: row.revokedAt ? ('revoked' as const) : ('valid' as const),
        institution: t.name,
        studentName: data.student.fullName,
        className: data.student.className,
        verifiedOn: row.verifiedAt.toISOString().slice(0, 10),
        skills: data.skills.filter((s) => s.level !== null).map((s) => ({ name: s.name, level: s.level })),
      };
    });
  }
}

/** A portrait passport: student, skill table with levels, certificates, activities and the verify QR. */
function passportPdf(institution: string, d: Passport, verifyUrl: string | null, today: string): Buffer {
  const pdf = new Pdf(`Outcome passport ${d.student.fullName}`).addPage();
  const w = A4.w;
  const bottom = A4.h - 60;
  let y = 60;
  const need = (h: number) => {
    if (y + h > bottom) {
      pdf.addPage();
      y = 60;
    }
  };
  pdf.text(institution, w / 2, y, { size: 18, bold: true, align: 'center', color: '#1f3a5f' });
  y += 24;
  pdf.text('STUDENT OUTCOME PASSPORT', w / 2, y, { size: 13, bold: true, align: 'center' });
  y += 28;
  pdf.text(`${d.student.fullName}   Roll No. ${d.student.rollNo}   ${d.student.className}`, 50, y, { size: 11, bold: true });
  y += 18;
  pdf.text(d.verification.verified ? `Verified by the institution on ${d.verification.verifiedAt?.slice(0, 10)}` : 'Not yet verified by the institution', 50, y, { size: 9, color: d.verification.verified ? '#1b6e3c' : '#a33a1f' });
  y += 24;

  pdf.text('Skills', 50, y, { size: 12, bold: true, color: '#1f3a5f' });
  y += 8;
  pdf.line(50, y, w - 50, y, { width: 0.8, color: '#1f3a5f' });
  y += 16;
  const rated = d.skills.filter((s) => s.level !== null);
  if (!rated.length) {
    pdf.text('No skill evidence recorded yet.', 50, y, { size: 10, color: '#444444' });
    y += 18;
  }
  for (const s of rated) {
    need(30 + Math.min(s.evidence.length, 4) * 13);
    pdf.text(`${s.name} (${s.category})`, 50, y, { size: 10.5, bold: true });
    pdf.text(`Level ${s.level} of 5`, w - 50, y, { size: 10.5, bold: true, align: 'right' });
    y += 14;
    for (const e of s.evidence.slice(0, 4)) {
      pdf.text(`- ${e.title}: ${e.detail} (level ${e.level})`.slice(0, 110), 62, y, { size: 8.5, color: '#444444' });
      y += 12;
    }
    if (s.evidence.length > 4) {
      pdf.text(`and ${s.evidence.length - 4} more`, 62, y, { size: 8.5, color: '#444444' });
      y += 12;
    }
    y += 6;
  }

  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    need(34);
    y += 6;
    pdf.text(title, 50, y, { size: 12, bold: true, color: '#1f3a5f' });
    y += 8;
    pdf.line(50, y, w - 50, y, { width: 0.8, color: '#1f3a5f' });
    y += 15;
    for (const l of lines) {
      need(14);
      pdf.text(l.slice(0, 110), 62, y, { size: 9.5 });
      y += 13;
    }
  };
  section('Certificates', d.certificates.map((c) => `${c.issuedOn}  ${c.title}${c.serialNo ? `  (${c.serialNo})` : ''}`));
  section('Clubs and activities', d.activities.clubs.map((c) => `${c.club}: ${c.points} points in ${c.activities} activit${c.activities === 1 ? 'y' : 'ies'}`));
  section('Events attended', d.activities.events.map((e) => `${e.on}  ${e.title}`));

  need(120);
  y += 20;
  pdf.text(`Generated on ${today}`, 50, y + 40, { size: 9, color: '#444444' });
  if (verifyUrl) {
    pdf.qr(verifyUrl, w - 150, y, 100);
    pdf.text('Scan to verify', w - 100, y + 108, { size: 8, align: 'center', color: '#444444' });
  } else {
    pdf.text('Ask the institution to verify this passport to add a verification QR code.', 50, y + 56, { size: 9, color: '#a33a1f' });
  }
  return pdf.build();
}
