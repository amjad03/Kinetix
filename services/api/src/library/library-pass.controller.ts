import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { code128 } from '../common/code128.js';
import { PdfWriter, toCsv } from '../common/pdf.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { libraryBooks, libraryLoans, tenants } from '../db/schema.js';
import { libraryAcquisitions, libraryBranches, libraryCopies, libraryMembers } from '../db/schema-lht.js';
import { libraryPurchaseOrders, libraryVendors } from '../db/schema-library.js';
import { EventBus } from '../events/events.js';
import { FeesService } from '../fees/fees.service.js';
import { addCopies, findMember, rulesFor, tenantToday } from './circulation.js';
import { CopyCatalogue } from './copy-catalogue.js';
import { sendFineToFees } from './fees-link.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { marcToBook, normaliseIsbn } from './marc.js';

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MarcRecordBody = z.record(z.string().regex(/^(LDR|\d{3})$/), z.array(z.string().max(4000)).max(60));
const CopyImportBody = z.object({ record: MarcRecordBody, copies: z.number().int().min(0).max(100).default(1), branchId: z.uuid().optional(), pricePaise: z.number().int().min(0).max(10_000_000).default(0) });
const LabelQuery = z.object({
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  since: Ymd.optional(),
  bookId: z.uuid().optional(),
  ids: z.string().max(20_000).optional(),
  kind: z.enum(['both', 'spine', 'barcode']).default('both'),
});

/** The accession numbers of a range ("ACC-0010" to "ACC-0030"), compared by their number. */
const accNumber = sql`nullif(regexp_replace(${libraryCopies.accessionNo}, '[^0-9]', '', 'g'), '')::bigint`;

/** The parts of a call number as a spine label prints them, one per line ("657.95" / "MAH"). */
export function spineLines(callNo: string): string[] {
  return callNo.trim().split(/\s+/).filter(Boolean).slice(0, 4);
}

/**
 * The library pass: copy cataloguing from other catalogues, spine and barcode labels and RFID encoding lists by copy,
 * sending a member's fines to fees, the rules a member would get, the purchase order sheet, e-resource usage, weeding
 * candidates and the NAAC criterion 4.2 summary.
 */
@Controller('v1/library')
export class LibraryPassController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly copyCat: CopyCatalogue,
    private readonly fees: FeesService,
    private readonly events: EventBus,
  ) {}

  // ---- copy cataloguing ----------------------------------------------------------------------------------------

  @Get('copy-catalogue/targets')
  @Auth('user', LIBRARY_ROLES)
  targets() {
    return this.copyCat.targets().map(({ key, name }) => ({ key, name }));
  }

  /** Searches another library's catalogue (SRU) by ISBN, or title and author, and marks titles this catalogue has. */
  @Get('copy-catalogue')
  @Auth('user', LIBRARY_ROLES)
  async searchCopy(@CurrentPrincipal() p: UserPrincipal, @Query('target') key = '', @Query('isbn') isbnRaw = '', @Query('title') title = '', @Query('author') author = '') {
    const target = this.copyCat.targets().find((t) => t.key === key) ?? this.copyCat.targets()[0];
    if (!target) throw new ServiceUnavailableException('Copy cataloguing is turned off');
    const isbn = isbnRaw.trim() ? normaliseIsbn(isbnRaw) : '';
    if (isbnRaw.trim() && !isbn) throw new BadRequestException('This is not a valid ISBN (check the last digit)');
    if (!isbn && title.trim().length < 3) throw new BadRequestException('Give an ISBN, or at least three letters of the title');
    let found;
    try {
      found = await this.copyCat.search(target, { isbn: isbn ?? '', title: title.slice(0, 200), author: author.slice(0, 120) });
    } catch {
      throw new ServiceUnavailableException(`${target.name} cannot be reached; try again or type the details in`);
    }
    const isbns = found.map((f) => f.book.isbn).filter(Boolean);
    const have = new Set(isbns.length ? (await this.db.withTenant(p.tenantId, (tx) => tx.select({ isbn: libraryBooks.isbn }).from(libraryBooks).where(inArray(libraryBooks.isbn, isbns)))).map((r) => r.isbn) : []);
    return { target: { key: target.key, name: target.name }, records: found.map((f) => ({ ...f.book, inCatalogue: !!f.book.isbn && have.has(f.book.isbn), marc: f.marc })) };
  }

  /** Adds a record found by copy cataloguing to the catalogue (with its MARC21 record) and accessions its copies. */
  @Post('copy-catalogue/import')
  @Auth('user', LIBRARY_ROLES)
  importCopy(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CopyImportBody)) b: z.infer<typeof CopyImportBody>) {
    const book = marcToBook(b.record);
    if (!book.title) throw new BadRequestException('This record has no title (MARC 245)');
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (book.isbn) {
        const [have] = await tx.select({ id: libraryBooks.id }).from(libraryBooks).where(eq(libraryBooks.isbn, book.isbn)).limit(1);
        if (have) throw new ConflictException({ statusCode: 409, message: 'The catalogue already has this ISBN; add copies to it instead', bookId: have.id });
      }
      const [row] = await tx
        .insert(libraryBooks)
        .values({ tenantId: p.tenantId, title: book.title.slice(0, 300), author: book.author.slice(0, 200), isbn: book.isbn || null, publisher: book.publisher, edition: book.edition, pubYear: book.pubYear, ddc: book.ddc, classScheme: 'ddc', classNumber: book.ddc, callNo: book.callNo || null, subject: book.subject, keywords: book.keywords.slice(0, 500), pages: book.pages, language: book.language, pricePaise: b.pricePaise, marc: b.record, copies: 0 })
        .returning();
      const branch = b.branchId ?? (await tx.select({ id: libraryBranches.id }).from(libraryBranches).orderBy(sql`${libraryBranches.isMain} desc`).limit(1))[0]?.id ?? null;
      const made = b.copies ? await addCopies(tx, p.tenantId, row.id, b.copies, { branchId: branch, pricePaise: b.pricePaise, acquiredOn: await tenantToday(tx, this.clock.now()) }) : [];
      await auditUser(tx, p, 'library_book.created', 'library_book', row.id, { label: row.title, source: 'copy_cataloguing', copies: made.length });
      return { ...row, accession: made.map((c) => c.accessionNo) };
    });
  }

  // ---- labels and RFID ------------------------------------------------------------------------------------------

  private async labelCopies(p: UserPrincipal, raw: Record<string, string | undefined>) {
    const q = LabelQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException('Check the label filters');
    const f = q.data;
    const ids = (f.ids ?? '').split(',').map((x) => x.trim()).filter((x) => z.uuid().safeParse(x).success).slice(0, 2000);
    const num = (acc?: string) => (acc ? Number(acc.replace(/[^0-9]/g, '')) || null : null);
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: libraryCopies.id, accessionNo: libraryCopies.accessionNo, barcode: libraryCopies.barcode, rfid: libraryCopies.rfid, title: libraryBooks.title, author: libraryBooks.author, callNo: libraryBooks.callNo, isbn: libraryBooks.isbn, branch: libraryBranches.name, shelf: libraryCopies.shelf })
        .from(libraryCopies)
        .innerJoin(libraryBooks, eq(libraryBooks.id, libraryCopies.bookId))
        .leftJoin(libraryBranches, eq(libraryBranches.id, libraryCopies.branchId))
        .where(
          and(
            sql`${libraryCopies.status} not in ('withdrawn', 'lost')`,
            ids.length ? inArray(libraryCopies.id, ids) : undefined,
            f.bookId ? eq(libraryCopies.bookId, f.bookId) : undefined,
            f.since ? gte(libraryCopies.acquiredOn, f.since) : undefined,
            num(f.from) ? sql`${accNumber} >= ${num(f.from)}` : undefined,
            num(f.to) ? sql`${accNumber} <= ${num(f.to)}` : undefined,
          ),
        )
        .orderBy(sql`length(${libraryCopies.accessionNo})`, asc(libraryCopies.accessionNo))
        .limit(3000),
    );
  }

  /**
   * Label sheets for copies (A4, 3 by 8): a barcode label (Code 128 of the copy's barcode, the accession number, the
   * title and the library's name) and a spine label (the call number, one part per line). Filter by accession range,
   * acquired since, a title, or chosen copies.
   */
  @Get('copies/labels.pdf')
  @Auth('user', LIBRARY_ROLES)
  async copyLabels(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string | undefined>, @Res() res: Response) {
    const copies = await this.labelCopies(p, raw);
    const kind = (raw.kind as 'both' | 'spine' | 'barcode' | undefined) ?? 'both';
    const [inst] = await this.db.withTenant(p.tenantId, (tx) => tx.select({ name: tenants.name }).from(tenants));
    const labels: { kind: 'barcode' | 'spine'; c: (typeof copies)[number] }[] = [];
    for (const c of copies) {
      if (kind !== 'spine') labels.push({ kind: 'barcode', c });
      if (kind !== 'barcode') labels.push({ kind: 'spine', c });
    }
    const pdf = new PdfWriter();
    const cols = 3;
    const rows = 8;
    const lw = 178;
    const lh = 96;
    const left = 30;
    const top = 812;
    labels.forEach((l, i) => {
      const at = i % (cols * rows);
      if (i > 0 && at === 0) pdf.newPage();
      const x = left + (at % cols) * (lw + 6);
      const y = top - Math.floor(at / cols) * (lh + 4) - lh;
      pdf.box(x, y, lw, lh);
      const code = l.c.barcode || l.c.accessionNo;
      if (l.kind === 'barcode') {
        pdf.textAt((inst?.name ?? 'Library').slice(0, 38), x + 6, y + lh - 12, { size: 7, bold: true });
        pdf.bars(code128(code.slice(0, 40)), x + 8, y + 34, lw - 16, 34);
        pdf.textAt(code, x + 6, y + 22, { size: 9, bold: true });
        pdf.textAt(l.c.title.slice(0, 40), x + 6, y + 10, { size: 7 });
      } else {
        const parts = spineLines(l.c.callNo || '');
        parts.forEach((part, k) => pdf.textAt(part.slice(0, 14), x + 10, y + lh - 22 - k * 16, { size: 13, bold: true }));
        pdf.textAt(l.c.accessionNo, x + 10, y + 10, { size: 8 });
        if (l.c.shelf) pdf.textAt(l.c.shelf.slice(0, 16), x + lw - 70, y + 10, { size: 7 });
      }
    });
    if (!labels.length) pdf.text('No copies match these filters.', { size: 11 });
    await this.db.withTenant(p.tenantId, (tx) => auditUser(tx, p, 'library.labels_printed', 'library_copy', undefined, { copies: copies.length, kind }));
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="library-copy-labels.pdf"');
    res.end(pdf.build());
  }

  /** The list an RFID tag encoder (or station) writes from: one row per copy with the item id to put on the tag. */
  @Get('copies/rfid.csv')
  @Auth('user', LIBRARY_ROLES)
  async rfidList(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string | undefined>, @Res() res: Response) {
    const copies = await this.labelCopies(p, raw);
    const rows: unknown[][] = [['Item id (write to tag)', 'Accession no.', 'Barcode', 'RFID tag now', 'Title', 'Call number', 'ISBN', 'Branch', 'Shelf']];
    for (const c of copies) rows.push([c.barcode || c.accessionNo, c.accessionNo, c.barcode ?? '', c.rfid ?? '', c.title, c.callNo ?? '', c.isbn ?? '', c.branch ?? '', c.shelf]);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="library-rfid-encoding.csv"');
    res.end(`﻿${toCsv(rows)}`);
  }

  // ---- fines and rules --------------------------------------------------------------------------------------------

  /** Puts every unpaid fine of a student member on the fee account (one invoice per loan); each loan is reported. */
  @Post('members/:id/fines-to-fees')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  finesToFees(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
      if (!m) throw new NotFoundException('Member not found');
      if (!m.studentId) throw new ConflictException('Only a student’s fines can go on the fee account');
      const loans = await tx
        .select({ id: libraryLoans.id })
        .from(libraryLoans)
        .where(and(sql`(${libraryLoans.memberId} = ${m.id} or ${libraryLoans.studentId} = ${m.studentId})`, sql`${libraryLoans.returnedAt} is not null`, isNull(libraryLoans.finePaidAt), isNull(libraryLoans.fineInvoiceTitle), sql`${libraryLoans.finePaise} > ${libraryLoans.fineWaivedPaise}`));
      const today = await tenantToday(tx, this.clock.now());
      const results = [];
      for (const l of loans) {
        try {
          const r = await tx.transaction((sp) => sendFineToFees(sp, p, this.fees, this.events, l.id, today));
          results.push({ loanId: l.id, ok: true, ...r });
        } catch (e) {
          results.push({ loanId: l.id, ok: false, message: (e as Error).message });
        }
      }
      return { sent: results.filter((r) => r.ok).length, totalPaise: results.reduce((s, r) => s + ('amountPaise' in r ? (r.amountPaise as number) : 0), 0), results };
    });
  }

  /** The rules a member gets for a material (category, the matrix cell that applies, closed days), for the desk. */
  @Get('rules/preview')
  @Auth('user', LIBRARY_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Query('memberCode') code = '', @Query('material') material = 'book') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const member = await findMember(tx, p.tenantId, code);
      const r = await rulesFor(tx, p.tenantId, member, material.slice(0, 40));
      return { member: { id: member.id, cardNo: member.cardNo, fullName: member.fullName, categoryId: member.categoryId }, material, loanDays: r.loanDays, maxBooks: r.maxBooks, maxItems: r.maxItems, finePerDayPaise: r.finePerDay, graceDays: r.graceDays, maxFinePaise: r.maxFinePaise, maxRenewals: r.maxRenewals, canReserve: r.canReserve, ruleId: r.ruleId, closedWeekdays: r.settings.closedWeekdays, skipsHolidays: r.settings.fineSkipsHolidays };
    });
  }

  // ---- purchase orders ----------------------------------------------------------------------------------------------

  /** The purchase order as a printable sheet for the vendor: lines, quantities, list prices, discount and total. */
  @Get('purchase-orders/:id/pdf')
  @Auth('user', LIBRARY_ROLES)
  async poPdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const data = await this.db.withTenant(p.tenantId, async (tx) => {
      const [po] = await tx.select({ po: libraryPurchaseOrders, vendor: libraryVendors }).from(libraryPurchaseOrders).innerJoin(libraryVendors, eq(libraryVendors.id, libraryPurchaseOrders.vendorId)).where(eq(libraryPurchaseOrders.id, id));
      if (!po) throw new NotFoundException('Purchase order not found');
      const lines = await tx.select().from(libraryAcquisitions).where(eq(libraryAcquisitions.poId, id)).orderBy(asc(libraryAcquisitions.number));
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      return { ...po, lines, inst: inst?.name ?? '' };
    });
    const r = (paise: number) => `Rs ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pdf = new PdfWriter();
    pdf.text(data.inst, { size: 14, bold: true });
    pdf.text('Library purchase order', { size: 12, bold: true });
    pdf.rule();
    pdf.text(`Order no. ${data.po.number}    Date ${data.po.orderedOn ?? ''}    Expected by ${data.po.expectedBy ?? ''}`, { size: 10 });
    pdf.text(`To: ${data.vendor.name}${data.vendor.gstin ? `  (GSTIN ${data.vendor.gstin})` : ''}`, { size: 10, bold: true });
    if (data.vendor.address) pdf.paragraph(data.vendor.address, { size: 9 });
    pdf.gap(6);
    const xs = [0, 30, 270, 380, 420, 480];
    pdf.row(['#', 'Title and author', 'ISBN', 'Qty', 'Price', 'Amount'], xs, { bold: true });
    let gross = 0;
    data.lines.forEach((l, i) => {
      const amount = l.estPricePaise * l.quantity;
      gross += amount;
      pdf.row([String(i + 1), `${l.title}${l.author ? ` / ${l.author}` : ''}`, l.isbn, String(l.quantity), r(l.estPricePaise), r(amount)], xs);
    });
    const discount = Math.round((gross * Number(data.po.discountPct)) / 100);
    pdf.rule();
    pdf.row(['', 'Gross', '', '', '', r(gross)], xs, { bold: true });
    if (discount) pdf.row(['', `Discount ${Number(data.po.discountPct)}%`, '', '', '', `- ${r(discount)}`], xs);
    pdf.row(['', 'Net payable', '', '', '', r(gross - discount)], xs, { bold: true });
    pdf.gap(10);
    if (data.po.note) pdf.paragraph(data.po.note, { size: 9 });
    pdf.paragraph('Please supply the latest editions, quote this order number on the invoice, and deliver to the library.', { size: 9 });
    pdf.gap(30);
    pdf.text('Librarian                                        Principal', { size: 10 });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${data.po.number.replace(/[^A-Za-z0-9-]/g, '_')}.pdf"`);
    res.end(pdf.build());
  }

  // ---- e-resources usage ------------------------------------------------------------------------------------------------

  /** Use of each e-resource by month: opens through the library (the access log) and the provider's own counts. */
  @Get('eresources/usage')
  @Auth('user', LIBRARY_ROLES)
  usage(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const ym = /^\d{4}-\d{2}$/;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock.now());
      const t = to && ym.test(to) ? to : today.slice(0, 7);
      const f = from && ym.test(from) ? from : `${Number(t.slice(0, 4)) - 1}-${t.slice(5, 7)}`;
      if (f > t) throw new BadRequestException('The start month is after the end month');
      const rows = (
        await tx.execute<{ id: string; title: string; provider: string; month: string; opens: number; readers: number; sessions: number; searches: number; downloads: number; cost_paise: number }>(sql`
          with months as (select to_char(m, 'YYYY-MM') as month from generate_series(${`${f}-01`}::date, ${`${t}-01`}::date, interval '1 month') m)
          select e.id, e.title, e.provider, months.month, e.cost_paise::bigint as cost_paise,
            (select count(*)::int from library_eresource_access a where a.resource_id = e.id and to_char(a.accessed_at at time zone 'Asia/Kolkata', 'YYYY-MM') = months.month) as opens,
            (select count(distinct a.user_id)::int from library_eresource_access a where a.resource_id = e.id and to_char(a.accessed_at at time zone 'Asia/Kolkata', 'YYYY-MM') = months.month) as readers,
            coalesce(u.sessions, 0) as sessions, coalesce(u.searches, 0) as searches, coalesce(u.downloads, 0) as downloads
          from library_eresources e cross join months left join library_eresource_usage u on u.resource_id = e.id and u.month = months.month
          order by e.title, months.month`)
      ).rows;
      const byResource = new Map<string, { id: string; title: string; provider: string; costPaise: number; opens: number; readers: number; sessions: number; searches: number; downloads: number; months: { month: string; opens: number; sessions: number; downloads: number }[] }>();
      for (const r of rows) {
        const e = byResource.get(r.id) ?? { id: r.id, title: r.title, provider: r.provider, costPaise: Number(r.cost_paise), opens: 0, readers: 0, sessions: 0, searches: 0, downloads: 0, months: [] };
        e.opens += r.opens;
        e.readers = Math.max(e.readers, r.readers);
        e.sessions += r.sessions;
        e.searches += r.searches;
        e.downloads += r.downloads;
        e.months.push({ month: r.month, opens: r.opens, sessions: r.sessions, downloads: r.downloads });
        byResource.set(r.id, e);
      }
      const list = [...byResource.values()].map((e) => ({ ...e, costPerUsePaise: e.costPaise && e.downloads + e.opens ? Math.round(e.costPaise / (e.downloads + e.opens)) : null }));
      return { from: f, to: t, resources: list, totals: { opens: list.reduce((s, e) => s + e.opens, 0), sessions: list.reduce((s, e) => s + e.sessions, 0), downloads: list.reduce((s, e) => s + e.downloads, 0) } };
    });
  }

  // ---- weeding -------------------------------------------------------------------------------------------------------

  /** Copies to consider for weeding: not issued for `years` years (or never), damaged, or of a superseded edition. */
  @Get('weeding')
  @Auth('user', LIBRARY_ROLES)
  weeding(@CurrentPrincipal() p: UserPrincipal, @Query('years') yearsText = '5') {
    const years = Math.max(1, Math.min(30, Number(yearsText) || 5));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock.now());
      const cutoff = `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
      const rows = (
        await tx.execute<{ id: string; accession_no: string; title: string; author: string; edition: string; pub_year: number | null; status: string; acquired_on: string | null; last_issued: string | null; issues: number; newer: boolean }>(sql`
          select c.id, c.accession_no, b.title, b.author, b.edition, b.pub_year, c.status, c.acquired_on::text,
            (select max(l.issued_at)::date::text from library_loans l where l.copy_id = c.id) as last_issued,
            (select count(*)::int from library_loans l where l.copy_id = c.id) as issues,
            exists (select 1 from library_books n where n.id <> b.id and lower(n.title) = lower(b.title) and lower(n.author) = lower(b.author) and coalesce(n.pub_year, 0) > coalesce(b.pub_year, 0) and n.status = 'active') as newer
          from library_copies c join library_books b on b.id = c.book_id
          where c.status in ('available', 'damaged', 'missing')
            and (c.status = 'damaged' or coalesce(c.acquired_on, c.created_at::date) <= ${cutoff}::date)
            and not exists (select 1 from library_loans l where l.copy_id = c.id and l.issued_at::date > ${cutoff}::date)
          order by c.status = 'damaged' desc, last_issued nulls first, b.title limit 1000`)
      ).rows;
      return { years, cutoff, rows: rows.map((r) => ({ id: r.id, accessionNo: r.accession_no, title: r.title, author: r.author, edition: r.edition, pubYear: r.pub_year, status: r.status, acquiredOn: r.acquired_on, lastIssued: r.last_issued, issues: r.issues, newerEdition: r.newer, reason: r.status === 'damaged' ? 'damaged' : r.newer ? 'superseded' : r.issues === 0 ? 'never_issued' : 'not_used' })) };
    });
  }

  // ---- NAAC criterion 4.2 ------------------------------------------------------------------------------------------------

  /**
   * NAAC criterion 4.2 by financial year: expenditure on books (copies accessioned at their price, or the invoices of
   * received orders) and on journals and e-resources (subscriptions starting in the year); daily footfall of students
   * and teachers from the gate register; online logins (e-resources and repository); and the per-day usage percentage
   * (mean daily footfall over students and teachers on roll).
   */
  @Get('naac')
  @Auth('user', [...LIBRARY_ROLES, 'quality_officer'])
  naac(@CurrentPrincipal() p: UserPrincipal, @Query('years') yearsText = '5') {
    const years = Math.max(1, Math.min(10, Number(yearsText) || 5));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock.now());
      const y = Number(today.slice(0, 4));
      const fyNow = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
      const out = [];
      for (let fy = fyNow; fy > fyNow - years; fy--) {
        const from = `${fy}-04-01`;
        const to = `${fy + 1}-03-31`;
        const [r] = (
          await tx.execute<Record<string, number | string>>(sql`
            select
              (select count(*)::int from library_copies c where coalesce(c.acquired_on, c.created_at::date) between ${from}::date and ${to}::date and c.source in ('purchase', 'book_bank')) as books_added,
              (select coalesce(sum(c.price_paise), 0)::bigint from library_copies c where coalesce(c.acquired_on, c.created_at::date) between ${from}::date and ${to}::date and c.source in ('purchase', 'book_bank') and c.acquisition_id is null) as books_direct_paise,
              (select coalesce(sum(coalesce(i.net_paise, a.invoice_amount_paise)), 0)::bigint from library_acquisitions a left join library_invoices i on i.id = a.invoice_id where a.status = 'invoiced' and coalesce(i.invoice_date, a.invoice_date) between ${from}::date and ${to}::date) as books_invoiced_paise,
              (select count(*)::int from library_periodicals pr where pr.subscription_from <= ${to}::date and coalesce(pr.subscription_to, '2999-12-31') >= ${from}::date) as journals,
              (select coalesce(sum(pr.cost_paise), 0)::bigint from library_periodicals pr where pr.subscription_from between ${from}::date and ${to}::date) as journals_paise,
              (select count(*)::int from library_eresources e where coalesce(e.subscription_from, e.created_at::date) <= ${to}::date and (e.licence_until is null or e.licence_until >= ${from}::date)) as eresources,
              (select coalesce(sum(e.cost_paise), 0)::bigint from library_eresources e where coalesce(e.subscription_from, e.created_at::date) between ${from}::date and ${to}::date) as eresources_paise,
              (select count(distinct (g.in_at at time zone 'Asia/Kolkata')::date)::int from library_gate_log g where (g.in_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as open_days,
              (select count(*)::int from library_gate_log g join library_members m on m.id = g.member_id where m.kind = 'student' and (g.in_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as footfall_students,
              (select count(*)::int from library_gate_log g join library_members m on m.id = g.member_id where m.kind = 'staff' and (g.in_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as footfall_teachers,
              (select count(*)::int from library_gate_log g where (g.member_id is null or exists (select 1 from library_members m where m.id = g.member_id and m.kind = 'external')) and (g.in_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as footfall_others,
              ((select count(*) from library_eresource_access a where (a.accessed_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) + (select count(*) from library_repository_access a where (a.accessed_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date))::int as online_logins,
              (select count(*)::int from library_loans l where (l.issued_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as loans,
              (select count(*)::int from students s where s.status in ('active', 'enrolled')) as students,
              (select count(distinct r.user_id)::int from user_roles r where r.role::text in ('teacher', 'hod')) as teachers`)
        ).rows;
        const n = (k: string) => Number(r[k] ?? 0);
        const booksPaise = n('books_direct_paise') + n('books_invoiced_paise');
        const journalsPaise = n('journals_paise') + n('eresources_paise');
        const days = n('open_days');
        const footfall = n('footfall_students') + n('footfall_teachers');
        const users = n('students') + n('teachers');
        out.push({
          year: `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`,
          booksAdded: n('books_added'),
          booksPaise,
          journals: n('journals'),
          eresources: n('eresources'),
          journalsPaise,
          totalPaise: booksPaise + journalsPaise,
          totalLakhs: Math.round((booksPaise + journalsPaise) / 1e5) / 100,
          openDays: days,
          footfallStudents: n('footfall_students'),
          footfallTeachers: n('footfall_teachers'),
          footfallOthers: n('footfall_others'),
          footfallPerDay: days ? Math.round((footfall / days) * 10) / 10 : 0,
          onlineLogins: n('online_logins'),
          loans: n('loans'),
          usagePct: days && users ? Math.round(((footfall / days / users) * 100) * 100) / 100 : 0,
        });
      }
      const spend = out.map((o) => o.totalLakhs);
      return { years: out, averageLakhs: spend.length ? Math.round((spend.reduce((a, b) => a + b, 0) / spend.length) * 100) / 100 : 0 };
    });
  }
}
