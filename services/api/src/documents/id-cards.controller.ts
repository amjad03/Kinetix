import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, departments, designations, sections, staffProfiles, students, tenants, userRoles, users } from '../db/schema.js';
import { FeesService } from '../fees/fees.service.js';
import { OFFICE_ROLES } from './documents.access.js';
import { type CardData, feeReceiptPdf, idCardsPdf } from './pdfs.js';
import { idCardCode } from './render.js';
import { STAFF_ROLES } from '../hr/hr.access.js';

const pdfHeaders = (res: Response, name: string) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
};

/** Student and staff ID cards with a signed QR, and fee receipts as PDF. */
@Controller('v1/documents')
export class IdCardsController {
  private readonly secret: string;
  private readonly verifyBase: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly db: DbService,
    private readonly fees: FeesService,
  ) {
    this.secret = env.JWT_SECRET;
    this.verifyBase = env.VERIFY_BASE_URL.replace(/\/$/, '');
  }

  private async studentCards(tx: Tx, tenantId: string, where: ReturnType<typeof eq>): Promise<CardData[]> {
    const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
    const rows = await tx
      .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName, year: academicYears.label })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(and(where, eq(students.status, 'active')))
      .orderBy(asc(sections.displayName), asc(students.rollNo));
    return rows.map((r) => ({ institution: t.name, kind: 'student' as const, name: r.name, lines: [['Class', r.className], ['Roll No', r.rollNo], ['Year', r.year]] as [string, string][], qrUrl: `${this.verifyBase}/id/${t.slug}/${idCardCode(this.secret, tenantId, 'student', r.id)}` }));
  }

  private async staffCards(tx: Tx, tenantId: string, where?: ReturnType<typeof eq>): Promise<CardData[]> {
    const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
    const rows = await tx
      .select({ id: users.id, name: users.fullName, code: staffProfiles.employeeCode, designation: designations.name, department: departments.name })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, STAFF_ROLES)))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
      .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
      .where(and(eq(users.status, 'active'), where))
      .groupBy(users.id, staffProfiles.userId, designations.id, departments.id)
      .orderBy(asc(users.fullName));
    return rows.map((r) => ({ institution: t.name, kind: 'staff' as const, name: r.name, lines: [['Designation', r.designation ?? '-'], ['Department', r.department ?? '-'], ['Emp. code', r.code ?? '-']] as [string, string][], qrUrl: `${this.verifyBase}/id/${t.slug}/${idCardCode(this.secret, tenantId, 'staff', r.id)}` }));
  }

  @Get('id-cards/students.pdf')
  @Auth('user', OFFICE_ROLES)
  studentsPdf(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId: string, @Res({ passthrough: true }) res: Response) {
    const id = z.uuid().safeParse(sectionId);
    if (!id.success) throw new BadRequestException('Choose a class');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cards = await this.studentCards(tx, p.tenantId, eq(students.sectionId, id.data));
      if (!cards.length) throw new NotFoundException('This class has no students');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'idcard.printed', subjectType: 'section', subjectId: id.data, data: { kind: 'student', count: cards.length } });
      pdfHeaders(res, 'student-id-cards.pdf');
      return new StreamableFile(idCardsPdf(cards));
    });
  }

  @Get('id-cards/staff.pdf')
  @Auth('user', OFFICE_ROLES)
  staffPdf(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response, @Query('userIds') userIds?: string) {
    const ids = userIds ? z.array(z.uuid()).max(300).safeParse(userIds.split(',')) : undefined;
    if (ids && !ids.success) throw new BadRequestException('Bad userIds');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cards = await this.staffCards(tx, p.tenantId, ids?.success ? inArray(users.id, ids.data) : undefined);
      if (!cards.length) throw new NotFoundException('No staff found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'idcard.printed', subjectType: 'user', data: { kind: 'staff', count: cards.length } });
      pdfHeaders(res, 'staff-id-cards.pdf');
      return new StreamableFile(idCardsPdf(cards));
    });
  }

  /** The caller's own card: a student with a login, or a staff member. */
  @Get('id-cards/me.pdf')
  @Auth('user')
  mePdf(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cards = [...(await this.studentCards(tx, p.tenantId, eq(students.userId, p.userId))), ...(p.roles.some((r) => STAFF_ROLES.includes(r)) ? await this.staffCards(tx, p.tenantId, eq(users.id, p.userId)) : [])];
      if (!cards.length) throw new NotFoundException('You do not have an ID card');
      pdfHeaders(res, 'id-card.pdf');
      return new StreamableFile(idCardsPdf(cards.slice(0, 1)));
    });
  }

  /** `<paymentId>.pdf`, for whoever may see the receipt. */
  @Get('fee-receipts/:file')
  @Auth('user')
  receipt(@CurrentPrincipal() p: UserPrincipal, @Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    const id = z.uuid().safeParse(file.replace(/\.pdf$/, ''));
    if (!id.success || !file.endsWith('.pdf')) throw new NotFoundException('Receipt not found');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.fees.receipt(tx, p, id.data);
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      pdfHeaders(res, `${r.receiptNo!.replace(/\//g, '-')}.pdf`);
      return new StreamableFile(
        feeReceiptPdf({ institution: r.institution, receiptNo: r.receiptNo!, studentName: r.student.fullName, rollNo: r.student.rollNo, className: r.className, invoiceTitle: r.invoice.title, amountPaise: r.amountPaise, balancePaise: r.invoice.balancePaise, method: r.method, reference: r.reference, paidOn: localParts(r.paidAt!, t?.tz ?? 'Asia/Kolkata').date }),
      );
    });
  }
}
