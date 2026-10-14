import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, sections, students, tenants, userRoles, users } from '../db/schema.js';
import { FeesService } from '../fees/fees.service.js';
import { OFFICE_ROLES } from './documents.access.js';
import { monthYear, plainMoney, rupees, rupeeWords, staffBlock, studentBlock } from './doc-data.js';
import { DocumentEngine, type ProduceInput } from './document-engine.service.js';
import { longDate } from './render.js';
import { STAFF_ROLES } from '../hr/hr.access.js';
import { naturalAsc } from '../common/natural-order.js';

const pdfHeaders = (res: Response, name: string) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
};

const METHOD: Record<string, string> = { online: 'Online', cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer', upi: 'UPI', credit: 'Credit adjustment' };

/**
 * Student and staff ID cards (the institution's ID card template, 10 to an A4 sheet with crop
 * marks), fee receipts, fee invoices and appointment letters, all through the document engine
 * with a verification QR.
 */
@Controller('v1/documents')
export class IdCardsController {
  constructor(
    private readonly db: DbService,
    private readonly fees: FeesService,
    private readonly engine: DocumentEngine,
  ) {}

  private async studentCards(tx: Tx, where: ReturnType<typeof eq>): Promise<ProduceInput[]> {
    const rows = await tx
      .select({ id: students.id, name: students.fullName })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(and(where, eq(students.status, 'active')))
      .orderBy(...naturalAsc(sections.displayName), asc(students.rollNo));
    const out: ProduceInput[] = [];
    for (const r of rows) {
      const data = await studentBlock(tx, r.id);
      const s = data.student as Record<string, string>;
      out.push({ docType: 'student_id_card', title: 'Student Identity Card', subject: { type: 'student', id: r.id, name: r.name }, source: { type: 'student_id_card', id: `${r.id}:${s.academicYear}` }, data, keyFields: [{ label: 'Name', value: r.name }, { label: 'Class', value: s.className }, { label: 'Roll number', value: s.rollNo }, { label: 'Valid until', value: s.validUntil }] });
    }
    return out;
  }

  private async staffCards(tx: Tx, where?: ReturnType<typeof eq>): Promise<ProduceInput[]> {
    const rows = await tx
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, STAFF_ROLES)))
      .where(and(eq(users.status, 'active'), where))
      .groupBy(users.id)
      .orderBy(asc(users.fullName));
    const out: ProduceInput[] = [];
    for (const r of rows) {
      const data = await staffBlock(tx, r.id);
      const s = data.staff as Record<string, string>;
      out.push({ docType: 'staff_id_card', title: 'Staff Identity Card', subject: { type: 'staff', id: r.id, name: r.name }, source: { type: 'staff_id_card', id: `${r.id}:${s.validUntil}` }, data, keyFields: [{ label: 'Name', value: r.name }, { label: 'Designation', value: s.designation }, { label: 'Department', value: s.department }, { label: 'Employee code', value: s.employeeCode }] });
    }
    return out;
  }

  @Get('id-cards/students.pdf')
  @Auth('user', OFFICE_ROLES)
  studentsPdf(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId: string, @Res({ passthrough: true }) res: Response) {
    const id = z.uuid().safeParse(sectionId);
    if (!id.success) throw new BadRequestException('Choose a class');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cards = await this.studentCards(tx, eq(students.sectionId, id.data));
      if (!cards.length) throw new NotFoundException('This class has no students');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'idcard.printed', subjectType: 'section', subjectId: id.data, data: { kind: 'student', count: cards.length } });
      pdfHeaders(res, 'student-id-cards.pdf');
      return new StreamableFile(await this.engine.produceCards(tx, p, 'student_id_card', cards, 'Student ID cards'));
    });
  }

  @Get('id-cards/staff.pdf')
  @Auth('user', OFFICE_ROLES)
  staffPdf(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response, @Query('userIds') userIds?: string) {
    const ids = userIds ? z.array(z.uuid()).max(300).safeParse(userIds.split(',')) : undefined;
    if (ids && !ids.success) throw new BadRequestException('Bad userIds');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cards = await this.staffCards(tx, ids?.success ? inArray(users.id, ids.data) : undefined);
      if (!cards.length) throw new NotFoundException('No staff found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'idcard.printed', subjectType: 'user', data: { kind: 'staff', count: cards.length } });
      pdfHeaders(res, 'staff-id-cards.pdf');
      return new StreamableFile(await this.engine.produceCards(tx, p, 'staff_id_card', cards, 'Staff ID cards'));
    });
  }

  /** The caller's own card: a student with a login, or a staff member. */
  @Get('id-cards/me.pdf')
  @Auth('user')
  mePdf(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mine = await this.studentCards(tx, eq(students.userId, p.userId));
      const cards = mine.length ? mine : p.roles.some((r) => STAFF_ROLES.includes(r)) ? await this.staffCards(tx, eq(users.id, p.userId)) : [];
      if (!cards.length) throw new NotFoundException('You do not have an ID card');
      pdfHeaders(res, 'id-card.pdf');
      return new StreamableFile(await this.engine.produceCards(tx, p, cards[0].docType, cards.slice(0, 1), 'ID card'));
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
      const paidOn = longDate(localParts(r.paidAt!, t?.tz ?? 'Asia/Kolkata').date);
      const data = {
        ...(await studentBlock(tx, r.student.id)),
        receipt: { no: r.receiptNo!, date: paidOn, mode: METHOD[r.method] ?? r.method, reference: r.reference ?? '—', amount: rupees(r.amountPaise), amountWords: rupeeWords(r.amountPaise), balance: rupees(r.invoice.balancePaise), towards: r.invoice.title, period: '', receivedBy: 'Accounts office', total: rupees(r.amountPaise) },
        fee: { lines: [{ no: 1, head: r.invoice.title, amount: rupees(r.amountPaise) }] },
        doc: { issuedOn: paidOn },
      };
      const out = await this.engine.produce(tx, p, {
        docType: 'fee_receipt',
        title: 'Fee Receipt',
        subject: { type: 'student', id: r.student.id, name: r.student.fullName },
        source: { type: 'fee_payment', id: r.paymentId },
        serial: r.receiptNo ?? undefined,
        data,
        keyFields: [{ label: 'Receipt number', value: r.receiptNo! }, { label: 'Received from', value: `${r.student.fullName} (${r.student.rollNo})` }, { label: 'Amount', value: rupees(r.amountPaise) }, { label: 'Paid on', value: paidOn }, { label: 'Towards', value: r.invoice.title }],
        photo: null,
      });
      pdfHeaders(res, `${r.receiptNo!.replace(/\//g, '-')}.pdf`);
      return new StreamableFile(out.pdf);
    });
  }

  /** A fee invoice as a GST-ready tax invoice (education services exempt, SAC 999293). */
  @Get('fee-invoices/:file')
  @Auth('user')
  invoice(@CurrentPrincipal() p: UserPrincipal, @Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    const id = z.uuid().safeParse(file.replace(/\.pdf$/, ''));
    if (!id.success || !file.endsWith('.pdf')) throw new NotFoundException('Invoice not found');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id.data));
      if (!inv) throw new NotFoundException('Invoice not found');
      await this.fees.assertCanSee(tx, p, inv.studentId);
      const block = await studentBlock(tx, inv.studentId);
      const s = block.student as Record<string, string>;
      const amount = plainMoney(inv.amountPaise);
      const no = inv.invoiceNo ?? `INV-${inv.id.slice(0, 8).toUpperCase()}`;
      const data = {
        ...block,
        invoice: {
          no, date: longDate(inv.createdAt.toISOString().slice(0, 10)), dueDate: longDate(inv.dueOn), period: inv.title, placeOfSupply: '', billTo: s.guardianName ? `${s.guardianName} (for ${s.name})` : s.name,
          subtotal: rupees(inv.amountPaise), cgst: 'Rs. 0.00', sgst: 'Rs. 0.00', igst: 'Rs. 0.00', taxTotal: 'Rs. 0.00', total: rupees(inv.amountPaise), totalWords: rupeeWords(inv.amountPaise), paid: rupees(inv.paidPaise), balance: rupees(Math.max(0, inv.amountPaise - inv.paidPaise)),
          note: 'Education services by an educational institution to its students are exempt from GST (Notification 12/2017-Central Tax (Rate), entry 66).',
          lines: [{ no: 1, head: inv.title, sac: '999293', qty: '1', rate: amount, taxable: amount, gstRate: 'Exempt', tax: '0.00', amount }],
        },
      };
      const out = await this.engine.produce(tx, p, {
        docType: 'fee_invoice',
        title: 'Tax Invoice',
        subject: { type: 'student', id: inv.studentId, name: s.name },
        source: { type: 'fee_invoice', id: inv.id },
        serial: inv.invoiceNo ?? undefined,
        data,
        keyFields: [{ label: 'Invoice number', value: no }, { label: 'Billed to', value: `${s.name} (${s.rollNo})` }, { label: 'Amount', value: rupees(inv.amountPaise) }, { label: 'Due date', value: longDate(inv.dueOn) }],
        photo: null,
      });
      pdfHeaders(res, `${no.replace(/\//g, '-')}.pdf`);
      return new StreamableFile(out.pdf);
    });
  }

  /** A staff member's letter of appointment from their staff record (office and HR). */
  @Get('appointment-letters/:file')
  @Auth('user', OFFICE_ROLES)
  appointment(@CurrentPrincipal() p: UserPrincipal, @Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    const id = z.uuid().safeParse(file.replace(/\.pdf$/, ''));
    if (!id.success || !file.endsWith('.pdf')) throw new NotFoundException('Staff member not found');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const block = await staffBlock(tx, id.data);
      const s = block.staff as Record<string, string>;
      if (!s.name) throw new NotFoundException('Staff member not found');
      const data = { ...block, appointment: { no: `APT/${s.employeeCode || id.data.slice(0, 6)}`, date: '', name: s.name, position: s.designation || 'Staff member', department: s.department || 'the institution', payScale: 'as per the institution’s pay structure', joiningDate: s.dateOfJoining || monthYear(new Date().toISOString().slice(0, 10)), probation: 'one year', reportingTo: s.department ? `Head of the Department, ${s.department}` : 'Principal', terms: 'Your appointment is subject to verification of your original certificates. You will be governed by the service rules of the institution as amended from time to time.' } };
      const out = await this.engine.produce(tx, p, { docType: 'appointment_letter', title: 'Letter of Appointment', subject: { type: 'staff', id: id.data, name: s.name }, source: { type: 'appointment', id: id.data }, data, keyFields: [{ label: 'Appointee', value: s.name }, { label: 'Position', value: s.designation }, { label: 'Department', value: s.department }], photo: null });
      pdfHeaders(res, `appointment-${s.employeeCode || 'letter'}.pdf`);
      return new StreamableFile(out.pdf);
    });
  }
}
