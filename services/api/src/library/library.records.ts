import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { departmentOptions } from '../admin/structure.records.js';
import { auditUser } from '../common/audit.js';
import { Bool, choiceFilter, choices, oneOf, OptionalInt, qual, Rupees, rupeesOf, studentByRoll, wordsOf, yesNo } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { departments, libraryBooks, libraryLoans, students, users } from '../db/schema.js';
import { libraryBranches, libraryClearances, libraryCopies, libraryFineWaivers, libraryMemberCategories, libraryMembers } from '../db/schema-lht.js';
import { FeesService } from '../fees/fees.service.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { addCopies, ensureStudentMember, findCopy, findMember, issueCopy, memberClass, memberStanding, nextCardNo, renewLoan, returnLoan, settleLoan, syncCopies, tenantToday, unpaidFineSql } from './circulation.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { callNumber, normaliseIsbn } from './marc.js';

/**
 * The library's lists as record kit entities: the catalogue, the accession register, members and their categories,
 * branches, loans (issue, return, renew, fines, lost and damaged), fine waivers and no-dues clearances. Acquisitions,
 * periodicals, the repository, inter-library loans and the gate register are in library-more.records.ts.
 */

export const MATERIALS = choices(['book', 'Book'], ['reference', 'Reference'], ['thesis', 'Thesis'], ['cd', 'CD or DVD'], ['map', 'Map'], ['other', 'Other']);
export const COPY_STATUSES = choices(['available', 'On the shelf'], ['on_loan', 'On loan'], ['in_transit', 'In transit'], ['missing', 'Missing'], ['damaged', 'Damaged'], ['binding', 'At the binder'], ['lost', 'Lost'], ['withdrawn', 'Withdrawn']);
const SETTABLE_COPY_STATUSES = COPY_STATUSES.filter((s) => ['available', 'missing', 'damaged', 'binding'].includes(s.value));
const SOURCES = choices(['purchase', 'Purchase'], ['donation', 'Donation'], ['exchange', 'Exchange'], ['book_bank', 'Book bank']);
const MEMBER_KINDS = choices(['student', 'Student'], ['staff', 'Staff'], ['external', 'External']);
const CATEGORY_KINDS = choices(['student', 'Students'], ['staff', 'Staff'], ['external', 'External readers'], ['book_bank', 'Book bank']);
const MEMBER_STATUSES = choices(['active', 'Active'], ['blocked', 'Blocked'], ['expired', 'Expired'], ['left', 'Left']);
const LOAN_STATUSES = choices(['out', 'Out'], ['overdue', 'Overdue'], ['returned', 'Returned'], ['lost', 'Lost'], ['damaged', 'Damaged']);
const VIAS = choices(['desk', 'Desk'], ['self', 'Self-checkout'], ['kiosk', 'Kiosk'], ['dropbox', 'Drop box'], ['sip2', 'Self-check machine']);
const WAIVER_STATUSES = choices(['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']);
/** Senior staff who approve fine waivers. */
const APPROVERS = ['tenant_admin', 'principal'] as const;

export async function branchOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryBranches.id, name: libraryBranches.name }).from(libraryBranches).orderBy(asc(libraryBranches.sortOrder), asc(libraryBranches.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
async function categoryOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryMemberCategories.id, name: libraryMemberCategories.name }).from(libraryMemberCategories).orderBy(asc(libraryMemberCategories.sortOrder), asc(libraryMemberCategories.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
async function staffUserOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.execute<{ id: string; full_name: string }>(sql`select distinct u.id, u.full_name from users u join user_roles r on r.user_id = u.id where u.status = 'active' and r.role::text not in ('student', 'guardian') order by u.full_name`);
  return rows.rows.map((r) => ({ value: r.id, label: r.full_name }));
}
const mainBranch = async (ctx: KitCtx) => (await ctx.tx.select({ id: libraryBranches.id }).from(libraryBranches).orderBy(sql`${libraryBranches.isMain} desc`, asc(libraryBranches.sortOrder)).limit(1))[0]?.id ?? null;

const IsbnField = z
  .union([z.literal(''), z.null(), z.string().trim().max(20)])
  .transform((v, c) => {
    if (!v) return null;
    const n = normaliseIsbn(v);
    if (!n) {
      c.addIssue({ code: 'custom', message: 'This is not a valid ISBN (check the last digit)' });
      return z.NEVER;
    }
    return n;
  });

const onLoan = sql<number>`(select count(*)::int from library_loans l where l.book_id = ${qual(libraryBooks.id)} and l.returned_at is null)`;
const shelfCopies = sql<number>`(select count(*)::int from library_copies c where c.book_id = ${qual(libraryBooks.id)} and c.status = 'available')`;
const allCopies = sql<number>`(select count(*)::int from library_copies c where c.book_id = ${qual(libraryBooks.id)} and c.status <> 'withdrawn')`;
const issuesEver = sql<number>`(select count(*)::int from library_loans l where l.book_id = ${qual(libraryBooks.id)})`;

/** Today in the institution as SQL (list status columns: overdue and the like). */
const SQL_TODAY = sql`(now() at time zone coalesce((select timezone from tenants limit 1), 'Asia/Kolkata'))::date`;

const homeBranch = alias(libraryBranches, 'home_branch');
const atBranch = alias(libraryBranches, 'at_branch');
const loanCopy = alias(libraryCopies, 'loan_copy');
const loanMember = alias(libraryMembers, 'loan_member');
const loanStudent = alias(students, 'loan_student');
const waiverLoan = alias(libraryLoans, 'waiver_loan');
const requester = alias(users, 'requester');
const decider = alias(users, 'decider');

const loanStatus = sql<string>`case when ${libraryLoans.returnedAt} is null and ${libraryLoans.dueOn} < ${SQL_TODAY} then 'overdue' when ${libraryLoans.returnedAt} is null then 'out' when ${libraryLoans.condition} = 'lost' then 'lost' when ${libraryLoans.condition} = 'damaged' then 'damaged' else 'returned' end`;
const borrower = sql<string>`coalesce(${loanMember.fullName}, ${loanStudent.fullName})`;
const loanUnpaid = sql<number>`case when ${libraryLoans.finePaidAt} is null and ${libraryLoans.fineInvoiceTitle} is null then ${unpaidFineSql} else 0 end`;

const memberLoansOut = sql<number>`(select count(*)::int from library_loans l where (l.member_id = ${qual(libraryMembers.id)} or (${qual(libraryMembers.studentId)} is not null and l.student_id = ${qual(libraryMembers.studentId)})) and l.returned_at is null)`;
const memberUnpaid = sql<number>`(select coalesce(sum(greatest(0, l.fine_paise - l.fine_waived_paise)), 0)::bigint from library_loans l where (l.member_id = ${qual(libraryMembers.id)} or (${qual(libraryMembers.studentId)} is not null and l.student_id = ${qual(libraryMembers.studentId)})) and l.fine_paid_at is null and l.fine_invoice_title is null)`;

@Injectable()
export class LibraryRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly fees: FeesService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.books(), this.copies(), this.members(), this.categories(), this.branches(), this.loans(), this.waivers(), this.clearances()]) this.registry.register(e);
  }

  private today(ctx: KitCtx) {
    return tenantToday(ctx.tx, this.clock.now());
  }

  // ---- the catalogue ----------------------------------------------------------------------------------------

  books(): RecordEntity {
    return {
      key: 'library-books',
      module: 'library',
      table: libraryBooks,
      subjectType: 'library_book',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.title),
      list: {
        select: {
          id: libraryBooks.id,
          title: libraryBooks.title,
          author: libraryBooks.author,
          isbn: libraryBooks.isbn,
          callNo: libraryBooks.callNo,
          ddc: libraryBooks.ddc,
          subject: libraryBooks.subject,
          keywords: libraryBooks.keywords,
          publisher: libraryBooks.publisher,
          edition: libraryBooks.edition,
          pubYear: libraryBooks.pubYear,
          language: libraryBooks.language,
          pages: libraryBooks.pages,
          material: libraryBooks.material,
          departmentId: libraryBooks.departmentId,
          departmentName: departments.name,
          priceRupees: rupeesOf(libraryBooks.pricePaise),
          barcode: libraryBooks.barcode,
          status: libraryBooks.status,
          copies: allCopies,
          available: shelfCopies,
          onLoan,
          issues: issuesEver,
          createdAt: libraryBooks.createdAt,
        },
        joins: (q) => q.leftJoin(departments, eq(departments.id, libraryBooks.departmentId)),
        search: [libraryBooks.title, libraryBooks.author, libraryBooks.isbn, libraryBooks.callNo, libraryBooks.subject, libraryBooks.keywords, libraryBooks.publisher],
        filters: {
          material: choiceFilter('Material', libraryBooks.material, MATERIALS),
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(libraryBooks.departmentId, v) },
          availability: yesNo('On the shelf', sql`${shelfCopies} > 0`, sql`${shelfCopies} = 0`, ['Available now', 'All copies out']),
          status: choiceFilter('Status', libraryBooks.status, choices(['active', 'In the catalogue'], ['withdrawn', 'Withdrawn'])),
        },
        sorts: { title: libraryBooks.title, author: libraryBooks.author, callNo: libraryBooks.callNo, year: libraryBooks.pubYear, copies: allCopies, available: shelfCopies, issues: issuesEver, added: libraryBooks.createdAt },
        defaultSort: { id: 'title', dir: 'asc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(300), column: libraryBooks.title, required: true },
        author: { label: 'Author', type: 'text', schema: z.string().trim().max(200), column: libraryBooks.author },
        isbn: { label: 'ISBN', type: 'text', schema: IsbnField, column: libraryBooks.isbn, help: 'ISBN-10 or ISBN-13; it is checked and kept as ISBN-13' },
        publisher: { label: 'Publisher', type: 'text', schema: z.string().trim().max(200), column: libraryBooks.publisher, bulk: true },
        edition: { label: 'Edition', type: 'text', schema: z.string().trim().max(60), column: libraryBooks.edition },
        pubYear: { label: 'Year', type: 'number', schema: OptionalInt(1400, 2100), column: libraryBooks.pubYear },
        language: { label: 'Language', type: 'text', schema: z.string().trim().max(40), column: libraryBooks.language, bulk: true },
        subject: { label: 'Subject', type: 'text', schema: z.string().trim().max(200), column: libraryBooks.subject, bulk: true },
        ddc: { label: 'DDC number', type: 'text', schema: z.string().trim().max(30), column: libraryBooks.ddc, help: 'Dewey Decimal Classification, e.g. 657.95' },
        callNo: { label: 'Call number', type: 'text', schema: OptionalText(40), column: libraryBooks.callNo, help: 'The shelf mark; "Assign call numbers" makes it from the DDC number and the author' },
        keywords: { label: 'Keywords', type: 'text', schema: z.string().trim().max(500), column: libraryBooks.keywords },
        pages: { label: 'Pages', type: 'number', schema: OptionalInt(1, 20000), column: libraryBooks.pages },
        material: { label: 'Material', type: 'select', schema: oneOf(MATERIALS), column: libraryBooks.material, options: MATERIALS, bulk: true },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, column: libraryBooks.departmentId, options: departmentOptions, bulk: true },
        price: { label: 'Price (₹)', type: 'number', schema: Rupees, column: libraryBooks.pricePaise, rowKey: 'priceRupees', help: 'What a lost copy costs the borrower' },
        copies: { label: 'Copies', type: 'number', schema: Int(1, 500), required: true, edit: false, rowKey: 'copies', apply: async () => undefined, help: 'Each copy gets its own accession number' },
      },
      create: async (ctx, v) => {
        const [b] = await ctx.tx
          .insert(libraryBooks)
          .values({
            tenantId: ctx.p.tenantId,
            title: String(v.title),
            author: (v.author as string) ?? '',
            isbn: (v.isbn as string | null) ?? null,
            publisher: (v.publisher as string) ?? '',
            edition: (v.edition as string) ?? '',
            pubYear: (v.pubYear as number | null) ?? null,
            language: (v.language as string) ?? '',
            subject: (v.subject as string) ?? '',
            ddc: (v.ddc as string) ?? '',
            callNo: (v.callNo as string | null) ?? null,
            keywords: (v.keywords as string) ?? '',
            pages: (v.pages as number | null) ?? null,
            material: (v.material as string) ?? 'book',
            departmentId: (v.departmentId as string | null) ?? null,
            pricePaise: (v.price as number) ?? 0,
            copies: 0,
          })
          .returning({ id: libraryBooks.id });
        await addCopies(ctx.tx, ctx.p.tenantId, b.id, Number(v.copies ?? 1), { branchId: await mainBranch(ctx), pricePaise: (v.price as number) ?? 0, acquiredOn: await this.today(ctx) });
        return b.id;
      },
      duplicate: async (ctx, row) => ({ title: await copyName(ctx.tx, libraryBooks, libraryBooks.title, String(row.title)), isbn: null, barcode: null, copies: 0 }),
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'author', header: 'Author' },
        { key: 'isbn', header: 'ISBN' },
        { key: 'callNo', header: 'Call number' },
        { key: 'ddc', header: 'DDC' },
        { key: 'subject', header: 'Subject' },
        { key: 'publisher', header: 'Publisher' },
        { key: 'edition', header: 'Edition' },
        { key: 'pubYear', header: 'Year' },
        { key: 'material', header: 'Material' },
        { key: 'departmentName', header: 'Department' },
        { key: 'copies', header: 'Copies' },
        { key: 'available', header: 'On the shelf' },
        { key: 'onLoan', header: 'On loan' },
        { key: 'issues', header: 'Times issued' },
        { key: 'priceRupees', header: 'Price (₹)' },
      ],
      actions: {
        assignCallNo: {
          label: 'Assign call numbers',
          apply: async (ctx, id) => {
            const [b] = await ctx.tx.select().from(libraryBooks).where(eq(libraryBooks.id, id));
            if (!b.ddc) throw new BadRequestException('Give the DDC number first');
            const callNo = callNumber(b.ddc, b.author);
            await ctx.tx.update(libraryBooks).set({ callNo }).where(eq(libraryBooks.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_book.call_number', 'library_book', id, { changes: { callNo: { before: b.callNo, after: callNo } } });
            return callNo;
          },
        },
        addCopies: {
          label: 'Add copies',
          params: z.object({ count: z.coerce.number().int().min(1).max(200).default(1), branchId: OptionalRef.optional(), price: Rupees.optional(), source: z.enum(['purchase', 'donation', 'exchange', 'book_bank']).default('purchase'), vendor: z.string().trim().max(120).default(''), invoiceNo: z.string().trim().max(60).default('') }),
          apply: async (ctx, id, raw) => {
            const p = raw as { count: number; branchId?: string | null; price?: number; source: string; vendor: string; invoiceNo: string };
            const [b] = await ctx.tx.select().from(libraryBooks).where(eq(libraryBooks.id, id));
            if (b.status === 'withdrawn') throw new ConflictException('This title has been withdrawn');
            const made = await addCopies(ctx.tx, ctx.p.tenantId, id, p.count, { branchId: p.branchId ?? (await mainBranch(ctx)), pricePaise: p.price ?? b.pricePaise, source: p.source, vendor: p.vendor, invoiceNo: p.invoiceNo, acquiredOn: await this.today(ctx) });
            await auditUser(ctx.tx, ctx.p, 'library_book.copies_added', 'library_book', id, { accession: made.map((c) => c.accessionNo) });
            return made.map((c) => c.accessionNo).join(', ');
          },
        },
        withdraw: {
          label: 'Withdraw the title',
          tone: 'danger',
          params: z.object({ reason: z.string().trim().min(3, 'Say why').max(300) }),
          apply: async (ctx, id, raw) => {
            const { reason } = raw as { reason: string };
            const [{ out }] = await ctx.tx.select({ out: sql<number>`count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, id), isNull(libraryLoans.returnedAt)));
            if (out > 0) throw new ConflictException('Some copies are out on loan; withdraw the title when they are back');
            const today = await this.today(ctx);
            await ctx.tx.update(libraryCopies).set({ status: 'withdrawn', withdrawnOn: today, withdrawnReason: reason }).where(and(eq(libraryCopies.bookId, id), ne(libraryCopies.status, 'withdrawn')));
            await ctx.tx.update(libraryBooks).set({ status: 'withdrawn', copies: 0 }).where(eq(libraryBooks.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_book.withdrawn', 'library_book', id, { reason, changes: { status: { before: 'active', after: 'withdrawn' } } });
          },
        },
      },
      import: {
        columns: [
          { key: 'title', header: 'Title', required: true, example: 'Corporate Accounting' },
          { key: 'author', header: 'Author', example: 'S. N. Maheshwari' },
          { key: 'isbn', header: 'ISBN', help: 'Rows are matched on the ISBN, else on title and author', example: '9789352600000' },
          { key: 'publisher', header: 'Publisher', example: 'Vikas' },
          { key: 'edition', header: 'Edition', example: '7th' },
          { key: 'year', header: 'Year', example: '2023' },
          { key: 'ddc', header: 'DDC number', example: '657.95' },
          { key: 'call_no', header: 'Call number', example: '657.95 MAH' },
          { key: 'subject', header: 'Subject', example: 'Accounting' },
          { key: 'keywords', header: 'Keywords' },
          { key: 'language', header: 'Language', example: 'English' },
          { key: 'pages', header: 'Pages' },
          { key: 'material', header: 'Material', options: MATERIALS.map((m) => m.value), example: 'book' },
          { key: 'price', header: 'Price (₹)', example: '650' },
          { key: 'copies', header: 'Copies', help: 'New titles only: the number of copies to accession (1 if empty)', example: '3' },
        ],
        key: ['isbn', 'title'],
        exists: async (ctx, r) => !!(await this.bookFor(ctx, r)),
        run: async (ctx, rows) => {
          const branchId = await mainBranch(ctx);
          const today = await this.today(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const title = required(r, 'title');
            const isbnRaw = r.get('isbn');
            const isbn = isbnRaw ? (normaliseIsbn(isbnRaw) ?? fail('This is not a valid ISBN (check the last digit)', isbnRaw)) : null;
            const material = r.get('material') ? (MATERIALS.find((m) => m.value === lc(r.get('material')))?.value ?? fail('Unknown material', r.get('material'))) : 'book';
            const price = r.get('price') ? Math.round(Number(r.get('price')) * 100) : undefined;
            if (price !== undefined && !(price >= 0)) fail('This value is not valid', r.get('price'));
            const values = {
              title,
              author: r.get('author'),
              isbn,
              publisher: r.get('publisher'),
              edition: r.get('edition'),
              pubYear: r.get('year') ? int(r.get('year'), 1400, 2100) : null,
              ddc: r.get('ddc'),
              callNo: r.get('call_no') || (r.get('ddc') ? callNumber(r.get('ddc'), r.get('author')) : null),
              subject: r.get('subject'),
              keywords: r.get('keywords'),
              language: r.get('language'),
              pages: r.get('pages') ? int(r.get('pages'), 1, 20000) : null,
              material,
              ...(price !== undefined && { pricePaise: price }),
            };
            const found = await this.bookFor({ tx, p: ctx.p }, r);
            if (!found) {
              const [b] = await tx.insert(libraryBooks).values({ tenantId: ctx.p.tenantId, ...values, copies: 0 }).returning({ id: libraryBooks.id });
              const n = r.get('copies') ? int(r.get('copies'), 1, 500) : 1;
              await addCopies(tx, ctx.p.tenantId, b.id, n, { branchId, pricePaise: price ?? 0, acquiredOn: today });
              return outcome(true, false, [title, `${n} copies`]);
            }
            const changed = Object.entries(values).some(([k, v]) => (found as Record<string, unknown>)[k] !== v && !(v === '' && (found as Record<string, unknown>)[k] === ''));
            if (changed) await tx.update(libraryBooks).set(values).where(eq(libraryBooks.id, found.id));
            return outcome(false, changed, [title]);
          });
        },
      },
    };
  }

  private async bookFor(ctx: KitCtx, r: { get: (k: string) => string }) {
    const isbn = r.get('isbn') ? normaliseIsbn(r.get('isbn')) : null;
    if (isbn) {
      const [b] = await ctx.tx.select().from(libraryBooks).where(eq(libraryBooks.isbn, isbn)).limit(1);
      if (b) return b;
    }
    const [b] = await ctx.tx.select().from(libraryBooks).where(and(sql`lower(${libraryBooks.title}) = ${lc(r.get('title'))}`, sql`lower(${libraryBooks.author}) = ${lc(r.get('author'))}`)).limit(1);
    return b;
  }

  // ---- the accession register -------------------------------------------------------------------------------

  copies(): RecordEntity {
    const currentBorrower = sql<string | null>`(select coalesce(m.full_name, s.full_name) from library_loans l left join library_members m on m.id = l.member_id left join students s on s.id = l.student_id where l.copy_id = ${qual(libraryCopies.id)} and l.returned_at is null limit 1)`;
    return {
      key: 'library-copies',
      module: 'library',
      table: libraryCopies,
      subjectType: 'library_copy',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.accessionNo} ${r.title}`,
      list: {
        select: {
          id: libraryCopies.id,
          accessionNo: libraryCopies.accessionNo,
          barcode: libraryCopies.barcode,
          rfid: libraryCopies.rfid,
          bookId: libraryCopies.bookId,
          title: libraryBooks.title,
          author: libraryBooks.author,
          callNo: libraryBooks.callNo,
          branchId: libraryCopies.branchId,
          branchName: homeBranch.name,
          atBranchId: libraryCopies.atBranchId,
          atBranchName: atBranch.name,
          shelf: libraryCopies.shelf,
          status: libraryCopies.status,
          source: libraryCopies.source,
          acquiredOn: libraryCopies.acquiredOn,
          priceRupees: rupeesOf(libraryCopies.pricePaise),
          vendor: libraryCopies.vendor,
          invoiceNo: libraryCopies.invoiceNo,
          withdrawnOn: libraryCopies.withdrawnOn,
          withdrawnReason: libraryCopies.withdrawnReason,
          note: libraryCopies.note,
          borrower: currentBorrower,
          createdAt: libraryCopies.createdAt,
        },
        joins: (q) => q.innerJoin(libraryBooks, eq(libraryBooks.id, libraryCopies.bookId)).leftJoin(homeBranch, eq(homeBranch.id, libraryCopies.branchId)).leftJoin(atBranch, eq(atBranch.id, libraryCopies.atBranchId)),
        search: [libraryCopies.accessionNo, libraryCopies.barcode, libraryCopies.rfid, libraryBooks.title, libraryBooks.author, libraryBooks.callNo],
        filters: {
          status: choiceFilter('Status', libraryCopies.status, COPY_STATUSES),
          branch: { label: 'Branch', options: branchOptions, where: (v) => uuidEq(libraryCopies.branchId, v) },
          source: choiceFilter('Source', libraryCopies.source, SOURCES),
          book: { label: 'Title', where: (v) => uuidEq(libraryCopies.bookId, v) },
        },
        sorts: { accession: sql`length(${libraryCopies.accessionNo}), ${libraryCopies.accessionNo}`, title: libraryBooks.title, status: libraryCopies.status, branch: homeBranch.name, acquired: libraryCopies.acquiredOn, price: libraryCopies.pricePaise },
        defaultSort: { id: 'accession', dir: 'asc' },
      },
      fields: {
        barcode: { label: 'Barcode', type: 'text', schema: OptionalText(60), column: libraryCopies.barcode, create: false },
        rfid: { label: 'RFID tag', type: 'text', schema: OptionalText(60), column: libraryCopies.rfid, create: false },
        shelf: { label: 'Shelf', type: 'text', schema: z.string().trim().max(60), column: libraryCopies.shelf, bulk: true, create: false },
        source: { label: 'Source', type: 'select', schema: oneOf(SOURCES), column: libraryCopies.source, options: SOURCES, bulk: true, create: false },
        acquiredOn: { label: 'Acquired on', type: 'date', schema: DateText, column: libraryCopies.acquiredOn, create: false },
        price: { label: 'Price (₹)', type: 'number', schema: Rupees, column: libraryCopies.pricePaise, rowKey: 'priceRupees', create: false },
        vendor: { label: 'Vendor', type: 'text', schema: z.string().trim().max(120), column: libraryCopies.vendor, bulk: true, create: false },
        invoiceNo: { label: 'Invoice', type: 'text', schema: z.string().trim().max(60), column: libraryCopies.invoiceNo, create: false },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: libraryCopies.note, create: false },
        status: {
          label: 'Status',
          type: 'select',
          schema: oneOf(SETTABLE_COPY_STATUSES),
          options: SETTABLE_COPY_STATUSES,
          create: false,
          bulk: true,
          apply: async (ctx, id, value) => {
            const [c] = await ctx.tx.select().from(libraryCopies).where(eq(libraryCopies.id, id));
            if (['on_loan', 'withdrawn', 'lost', 'in_transit'].includes(c.status)) throw new ConflictException(`This copy is ${c.status.replace('_', ' ')}; its status changes with the loan, the transfer or a restore`);
            await ctx.tx.update(libraryCopies).set({ status: String(value) }).where(eq(libraryCopies.id, id));
            await syncCopies(ctx.tx, c.bookId);
          },
        },
      },
      move: {
        label: 'Move to branch',
        options: branchOptions,
        apply: async (ctx, id, to) => {
          const [c] = await ctx.tx.select().from(libraryCopies).where(eq(libraryCopies.id, id));
          if (c.branchId === to) throw new BadRequestException('The copy already belongs to this branch');
          // A copy on the shelf at home moves with its record; one away or on loan keeps its present place.
          const atHome = !c.atBranchId || c.atBranchId === c.branchId;
          await ctx.tx.update(libraryCopies).set({ branchId: to, ...(atHome && c.status === 'available' && { atBranchId: to }) }).where(eq(libraryCopies.id, id));
          await auditUser(ctx.tx, ctx.p, 'library_copy.moved', 'library_copy', id, { changes: { branchId: { before: c.branchId, after: to } } });
        },
      },
      columns: [
        { key: 'accessionNo', header: 'Accession no.' },
        { key: 'title', header: 'Title' },
        { key: 'author', header: 'Author' },
        { key: 'callNo', header: 'Call number' },
        { key: 'barcode', header: 'Barcode' },
        { key: 'rfid', header: 'RFID tag' },
        { key: 'branchName', header: 'Branch' },
        { key: 'atBranchName', header: 'Now at' },
        { key: 'shelf', header: 'Shelf' },
        { key: 'status', header: 'Status', value: wordsOf(COPY_STATUSES, 'status') },
        { key: 'source', header: 'Source', value: wordsOf(SOURCES, 'source') },
        { key: 'acquiredOn', header: 'Acquired on' },
        { key: 'priceRupees', header: 'Price (₹)' },
        { key: 'vendor', header: 'Vendor' },
        { key: 'invoiceNo', header: 'Invoice' },
        { key: 'withdrawnOn', header: 'Withdrawn on' },
        { key: 'withdrawnReason', header: 'Withdrawal reason' },
      ],
      remove: {
        guard: async (ctx, id) => {
          const [c] = await ctx.tx.select({ status: libraryCopies.status }).from(libraryCopies).where(eq(libraryCopies.id, id));
          return c?.status === 'on_loan' ? 'This copy is out on loan; take it back before deleting it' : null;
        },
      },
      actions: {
        withdraw: {
          label: 'Withdraw',
          tone: 'danger',
          params: z.object({ reason: z.string().trim().min(3, 'Say why').max(300) }),
          apply: async (ctx, id, raw) => {
            const { reason } = raw as { reason: string };
            const [c] = await ctx.tx.select().from(libraryCopies).where(eq(libraryCopies.id, id));
            if (c.status === 'on_loan') throw new ConflictException('This copy is out on loan');
            if (c.status === 'withdrawn') throw new ConflictException('Already withdrawn');
            await ctx.tx.update(libraryCopies).set({ status: 'withdrawn', withdrawnOn: await this.today(ctx), withdrawnReason: reason }).where(eq(libraryCopies.id, id));
            await syncCopies(ctx.tx, c.bookId);
            await auditUser(ctx.tx, ctx.p, 'library_copy.withdrawn', 'library_copy', id, { reason, changes: { status: { before: c.status, after: 'withdrawn' } } });
          },
        },
        receive: {
          label: 'Received back home',
          apply: async (ctx, id) => {
            const [c] = await ctx.tx.select().from(libraryCopies).where(eq(libraryCopies.id, id));
            if (c.status !== 'in_transit') throw new ConflictException('This copy is not in transit');
            await ctx.tx.update(libraryCopies).set({ status: 'available', atBranchId: c.branchId }).where(eq(libraryCopies.id, id));
            await syncCopies(ctx.tx, c.bookId);
            await auditUser(ctx.tx, ctx.p, 'library_copy.received', 'library_copy', id, { changes: { status: { before: 'in_transit', after: 'available' } } });
          },
        },
        restore: {
          label: 'Back in circulation',
          apply: async (ctx, id) => {
            const [c] = await ctx.tx.select().from(libraryCopies).where(eq(libraryCopies.id, id));
            if (!['missing', 'damaged', 'binding', 'lost', 'withdrawn'].includes(c.status)) throw new ConflictException('Only a missing, damaged, lost, withdrawn or bound copy can come back');
            await ctx.tx.update(libraryCopies).set({ status: 'available', withdrawnOn: null, withdrawnReason: '' }).where(eq(libraryCopies.id, id));
            await ctx.tx.update(libraryBooks).set({ status: 'active' }).where(eq(libraryBooks.id, c.bookId));
            await syncCopies(ctx.tx, c.bookId);
            await auditUser(ctx.tx, ctx.p, 'library_copy.restored_to_shelf', 'library_copy', id, { changes: { status: { before: c.status, after: 'available' } } });
          },
        },
      },
      import: {
        columns: [
          { key: 'accession_no', header: 'Accession no.', required: true, help: 'Existing copies are matched on it', example: 'ACC-0101' },
          { key: 'isbn', header: 'ISBN', help: 'The title the copy is of: by ISBN…', example: '9789352600000' },
          { key: 'title', header: 'Title', help: '…or by its exact title' },
          { key: 'barcode', header: 'Barcode', help: 'The accession number if empty' },
          { key: 'rfid', header: 'RFID tag' },
          { key: 'branch', header: 'Branch', options: async (ctx) => (await branchOptions(ctx)).map((b) => b.label) },
          { key: 'shelf', header: 'Shelf' },
          { key: 'source', header: 'Source', options: SOURCES.map((s) => s.value), example: 'purchase' },
          { key: 'acquired_on', header: 'Acquired on', example: '2026-06-01' },
          { key: 'price', header: 'Price (₹)', example: '650' },
          { key: 'vendor', header: 'Vendor' },
          { key: 'invoice', header: 'Invoice' },
        ],
        key: ['accession_no'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: libraryCopies.id }).from(libraryCopies).where(sql`lower(${libraryCopies.accessionNo}) = ${lc(r.get('accession_no'))}`).limit(1))[0],
        run: async (ctx, rows) => {
          const branches = await branchOptions(ctx);
          const touched = new Set<string>();
          const results = await eachRow(ctx.tx, rows, async (tx, r) => {
            const acc = required(r, 'accession_no');
            const branchId = r.get('branch') ? (branches.find((b) => lc(b.label) === lc(r.get('branch')))?.value ?? fail('No branch with this name', r.get('branch'))) : null;
            const source = r.get('source') ? (SOURCES.find((s) => s.value === lc(r.get('source')))?.value ?? fail('Unknown source', r.get('source'))) : undefined;
            const acquiredOn = r.get('acquired_on') ? (/^\d{4}-\d{2}-\d{2}$/.test(r.get('acquired_on')) ? r.get('acquired_on') : fail('Use a date like 2026-10-15', r.get('acquired_on'))) : undefined;
            const price = r.get('price') ? Math.round(Number(r.get('price')) * 100) : undefined;
            if (price !== undefined && !(price >= 0)) fail('This value is not valid', r.get('price'));
            const set = { ...(r.get('barcode') && { barcode: r.get('barcode') }), ...(r.get('rfid') && { rfid: r.get('rfid') }), ...(branchId && { branchId, atBranchId: branchId }), ...(r.get('shelf') && { shelf: r.get('shelf') }), ...(source && { source }), ...(acquiredOn && { acquiredOn }), ...(price !== undefined && { pricePaise: price }), ...(r.get('vendor') && { vendor: r.get('vendor') }), ...(r.get('invoice') && { invoiceNo: r.get('invoice') }) };
            const [found] = await tx.select().from(libraryCopies).where(sql`lower(${libraryCopies.accessionNo}) = ${lc(acc)}`).limit(1);
            if (found) {
              const changed = Object.keys(set).length > 0;
              if (changed) await tx.update(libraryCopies).set(set).where(eq(libraryCopies.id, found.id));
              return outcome(false, changed, [acc]);
            }
            const isbn = r.get('isbn') ? normaliseIsbn(r.get('isbn')) : null;
            if (r.get('isbn') && !isbn) fail('This is not a valid ISBN (check the last digit)', r.get('isbn'));
            const [book] = isbn ? await tx.select().from(libraryBooks).where(eq(libraryBooks.isbn, isbn)).limit(1) : r.get('title') ? await tx.select().from(libraryBooks).where(sql`lower(${libraryBooks.title}) = ${lc(r.get('title'))}`).limit(2) : [];
            if (!book) fail('No title in the catalogue matches this row; add the title first', r.get('isbn') || r.get('title') || '(no ISBN or title)');
            await tx.insert(libraryCopies).values({ tenantId: ctx.p.tenantId, bookId: book.id, accessionNo: acc, barcode: r.get('barcode') || acc, ...set });
            touched.add(book.id);
            return outcome(true, false, [acc, book.title]);
          });
          for (const b of touched) await syncCopies(ctx.tx, b);
          return results;
        },
      },
    };
  }

  // ---- members ------------------------------------------------------------------------------------------------

  members(): RecordEntity {
    return {
      key: 'library-members',
      module: 'library',
      table: libraryMembers,
      subjectType: 'library_member',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.cardNo} ${r.fullName}`,
      list: {
        select: {
          id: libraryMembers.id,
          cardNo: libraryMembers.cardNo,
          kind: libraryMembers.kind,
          fullName: libraryMembers.fullName,
          studentId: libraryMembers.studentId,
          rollNo: students.rollNo,
          className: memberClass,
          userId: libraryMembers.userId,
          phone: libraryMembers.phone,
          email: libraryMembers.email,
          organisation: libraryMembers.organisation,
          categoryId: libraryMembers.categoryId,
          categoryName: libraryMemberCategories.name,
          status: libraryMembers.status,
          validUntil: libraryMembers.validUntil,
          depositRupees: rupeesOf(libraryMembers.depositPaise),
          depositPaidOn: libraryMembers.depositPaidOn,
          depositRefundedOn: libraryMembers.depositRefundedOn,
          depositReceipt: libraryMembers.depositReceipt,
          blockedReason: libraryMembers.blockedReason,
          cardReissues: libraryMembers.cardReissues,
          note: libraryMembers.note,
          loansOut: memberLoansOut,
          unpaidRupees: rupeesOf(memberUnpaid),
          createdAt: libraryMembers.createdAt,
        },
        joins: (q) => q.leftJoin(students, eq(students.id, libraryMembers.studentId)).leftJoin(libraryMemberCategories, eq(libraryMemberCategories.id, libraryMembers.categoryId)),
        search: [libraryMembers.cardNo, libraryMembers.fullName, students.rollNo, libraryMembers.phone, libraryMembers.email, libraryMembers.organisation],
        filters: {
          kind: choiceFilter('Kind', libraryMembers.kind, MEMBER_KINDS),
          category: { label: 'Category', options: categoryOptions, where: (v) => (v === 'none' ? isNull(libraryMembers.categoryId) : uuidEq(libraryMembers.categoryId, v)) },
          status: choiceFilter('Status', libraryMembers.status, MEMBER_STATUSES),
          dues: yesNo('Dues', sql`(${memberUnpaid} > 0 or ${memberLoansOut} > 0)`, sql`(${memberUnpaid} = 0 and ${memberLoansOut} = 0)`, ['Has books or fines', 'Clear']),
          deposit: yesNo('Deposit', sql`${libraryMembers.depositPaise} > 0 and ${libraryMembers.depositRefundedOn} is null`, sql`not (${libraryMembers.depositPaise} > 0 and ${libraryMembers.depositRefundedOn} is null)`, ['Held', 'None held']),
        },
        sorts: { card: sql`length(${libraryMembers.cardNo}), ${libraryMembers.cardNo}`, name: libraryMembers.fullName, kind: libraryMembers.kind, category: libraryMemberCategories.name, status: libraryMembers.status, validUntil: libraryMembers.validUntil, loans: memberLoansOut, fines: memberUnpaid },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        kind: { label: 'Kind', type: 'select', schema: z.enum(['staff', 'external']), options: MEMBER_KINDS.filter((k) => k.value !== 'student'), required: true, edit: false, column: libraryMembers.kind, help: 'Students get their card automatically; use "Enrol a class" for many at once' },
        userId: { label: 'Member of staff', type: 'select', schema: OptionalRef, options: staffUserOptions, edit: false, column: libraryMembers.userId },
        fullName: { label: 'Name', type: 'text', schema: z.string().trim().max(120), column: libraryMembers.fullName, help: 'For external readers; staff names come from their account' },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: libraryMembers.phone },
        email: { label: 'Email', type: 'email', schema: z.union([z.literal(''), z.email()]), column: libraryMembers.email },
        organisation: { label: 'Organisation', type: 'text', schema: z.string().trim().max(160), column: libraryMembers.organisation, help: 'For alumni and researchers: their institution' },
        categoryId: { label: 'Category', type: 'select', schema: OptionalRef, options: categoryOptions, column: libraryMembers.categoryId, bulk: true },
        validUntil: { label: 'Valid until', type: 'date', schema: DateText, column: libraryMembers.validUntil, bulk: true },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: libraryMembers.note },
      },
      create: async (ctx, v) => {
        let fullName = String(v.fullName ?? '').trim();
        if (v.kind === 'staff') {
          if (!v.userId) throw new BadRequestException('Choose the member of staff');
          const [u] = await ctx.tx.select({ name: users.fullName, phone: users.phone, email: users.email }).from(users).where(eq(users.id, String(v.userId)));
          if (!u) throw new NotFoundException('Staff member not found');
          const [dup] = await ctx.tx.select({ card: libraryMembers.cardNo }).from(libraryMembers).where(and(eq(libraryMembers.userId, String(v.userId)), isNull(libraryMembers.studentId)));
          if (dup) throw new ConflictException(`This member of staff already has card ${dup.card}`);
          fullName = fullName || u.name;
          v.phone = v.phone || u.phone || '';
          v.email = v.email || u.email || '';
        } else if (!fullName) throw new BadRequestException({ formErrors: [], fieldErrors: { fullName: ['This value is required'] } });
        const [m] = await ctx.tx
          .insert(libraryMembers)
          .values({ tenantId: ctx.p.tenantId, cardNo: await nextCardNo(ctx.tx, ctx.p.tenantId), kind: String(v.kind), userId: v.kind === 'staff' ? String(v.userId) : null, fullName, phone: String(v.phone ?? ''), email: String(v.email ?? ''), organisation: String(v.organisation ?? ''), categoryId: (v.categoryId as string | null) ?? null, validUntil: (v.validUntil as string | null) ?? null, note: String(v.note ?? '') })
          .returning({ id: libraryMembers.id });
        return m.id;
      },
      move: { label: 'Change category', options: categoryOptions, column: libraryMembers.categoryId },
      columns: [
        { key: 'cardNo', header: 'Card' },
        { key: 'fullName', header: 'Name' },
        { key: 'kind', header: 'Kind', value: wordsOf(MEMBER_KINDS, 'kind') },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'className', header: 'Class' },
        { key: 'organisation', header: 'Organisation' },
        { key: 'categoryName', header: 'Category' },
        { key: 'status', header: 'Status', value: wordsOf(MEMBER_STATUSES, 'status') },
        { key: 'validUntil', header: 'Valid until' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'loansOut', header: 'Books out' },
        { key: 'unpaidRupees', header: 'Unpaid fines (₹)' },
        { key: 'depositRupees', header: 'Deposit (₹)' },
        { key: 'depositRefundedOn', header: 'Deposit refunded on' },
      ],
      remove: {
        guard: async (ctx, id) => {
          const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
          const s = await memberStanding(ctx.tx, m, await this.today(ctx));
          if (s.out > 0) return 'This member still has books out';
          if (m.depositPaise > 0 && !m.depositRefundedOn) return 'Refund the deposit before removing the member';
          return null;
        },
      },
      actions: {
        block: {
          label: 'Block card',
          tone: 'danger',
          params: z.object({ reason: z.string().trim().min(3, 'Say why').max(300) }),
          apply: async (ctx, id, raw) => {
            const { reason } = raw as { reason: string };
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            await ctx.tx.update(libraryMembers).set({ status: 'blocked', blockedReason: reason }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.blocked', 'library_member', id, { reason, changes: { status: { before: m.status, after: 'blocked' } } });
          },
        },
        unblock: {
          label: 'Unblock card',
          apply: async (ctx, id) => {
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            if (m.status !== 'blocked') throw new ConflictException('This card is not blocked');
            await ctx.tx.update(libraryMembers).set({ status: 'active', blockedReason: '' }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.unblocked', 'library_member', id, { changes: { status: { before: 'blocked', after: 'active' } } });
          },
        },
        renew: {
          label: 'Renew card',
          params: z.object({ validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-05-31') }),
          apply: async (ctx, id, raw) => {
            const { validUntil } = raw as { validUntil: string };
            if (validUntil < (await this.today(ctx))) throw new BadRequestException('The new date has already passed');
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            await ctx.tx.update(libraryMembers).set({ validUntil, ...(m.status === 'expired' && { status: 'active' }) }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.renewed', 'library_member', id, { changes: { validUntil: { before: m.validUntil, after: validUntil } } });
          },
        },
        reissueCard: {
          label: 'Replace a lost card',
          params: z.object({ fee: Rupees.optional() }),
          apply: async (ctx, id, raw) => {
            const { fee } = raw as { fee?: number };
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id)).for('update');
            const card = await nextCardNo(ctx.tx, ctx.p.tenantId);
            const note = [m.note, `Card ${m.cardNo} reported lost and replaced by ${card}`].filter(Boolean).join('\n').slice(0, 2000);
            await ctx.tx.update(libraryMembers).set({ cardNo: card, cardReissues: m.cardReissues + 1, note }).where(eq(libraryMembers.id, id));
            if (fee && m.studentId) await this.fees.chargeStudents(ctx.tx, ctx.p, `Library card replacement ${card}`, await this.today(ctx), [{ studentId: m.studentId, amountPaise: fee }]);
            await auditUser(ctx.tx, ctx.p, 'library_member.card_replaced', 'library_member', id, { changes: { cardNo: { before: m.cardNo, after: card } }, feePaise: fee ?? 0 });
            return card;
          },
        },
        collectDeposit: {
          label: 'Collect deposit',
          params: z.object({ amount: Rupees.refine((v) => v > 0, 'Give the amount'), receipt: z.string().trim().max(60).default('') }),
          apply: async (ctx, id, raw) => {
            const { amount, receipt } = raw as { amount: number; receipt: string };
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            if (m.depositPaise > 0 && !m.depositRefundedOn) throw new ConflictException('A deposit is already held for this member');
            await ctx.tx.update(libraryMembers).set({ depositPaise: amount, depositPaidOn: await this.today(ctx), depositRefundedOn: null, depositReceipt: receipt }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.deposit_collected', 'library_member', id, { amountPaise: amount, receipt });
          },
        },
        refundDeposit: {
          label: 'Refund deposit',
          apply: async (ctx, id) => {
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            if (!(m.depositPaise > 0) || m.depositRefundedOn) throw new ConflictException('No deposit is held for this member');
            const s = await memberStanding(ctx.tx, m, await this.today(ctx));
            if (s.out > 0) throw new ConflictException('This member still has books out');
            if (s.unpaidPaise > 0) throw new ConflictException(`Unpaid fines of ₹${(s.unpaidPaise / 100).toFixed(2)} must be cleared first`);
            await ctx.tx.update(libraryMembers).set({ depositRefundedOn: await this.today(ctx) }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.deposit_refunded', 'library_member', id, { amountPaise: m.depositPaise });
          },
        },
        markLeft: {
          label: 'Mark as left',
          apply: async (ctx, id) => {
            const [m] = await ctx.tx.select().from(libraryMembers).where(eq(libraryMembers.id, id));
            const s = await memberStanding(ctx.tx, m, await this.today(ctx));
            if (s.out > 0) throw new ConflictException('This member still has books out');
            await ctx.tx.update(libraryMembers).set({ status: 'left' }).where(eq(libraryMembers.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_member.left', 'library_member', id, { changes: { status: { before: m.status, after: 'left' } } });
          },
        },
      },
      import: {
        columns: [
          { key: 'kind', header: 'Kind', required: true, options: MEMBER_KINDS.map((k) => k.value), example: 'external' },
          { key: 'card_no', header: 'Card', help: 'Existing cards are matched on it; new members get the next number if empty' },
          { key: 'roll_no', header: 'Roll no.', help: 'Students: their roll number' },
          { key: 'email', header: 'Email', help: 'Staff: the email of their account' },
          { key: 'name', header: 'Name', help: 'External readers', example: 'Dr. R. Iyer' },
          { key: 'phone', header: 'Phone' },
          { key: 'organisation', header: 'Organisation', example: 'IISc Bengaluru' },
          { key: 'category', header: 'Category', options: async (ctx) => (await categoryOptions(ctx)).map((c) => c.label) },
          { key: 'valid_until', header: 'Valid until', example: '2027-05-31' },
        ],
        key: ['card_no'],
        exists: async (ctx, r) => !!r.get('card_no') && !!(await ctx.tx.select({ id: libraryMembers.id }).from(libraryMembers).where(sql`lower(${libraryMembers.cardNo}) = ${lc(r.get('card_no'))}`).limit(1))[0],
        run: async (ctx, rows) => {
          const cats = await categoryOptions(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const kind = MEMBER_KINDS.find((k) => k.value === lc(required(r, 'kind')))?.value ?? fail('Unknown kind of member (student, staff or external)', r.get('kind'));
            const categoryId = r.get('category') ? (cats.find((c) => lc(c.label) === lc(r.get('category')))?.value ?? fail('No category with this name', r.get('category'))) : undefined;
            const validUntil = r.get('valid_until') ? (/^\d{4}-\d{2}-\d{2}$/.test(r.get('valid_until')) ? r.get('valid_until') : fail('Use a date like 2026-10-15', r.get('valid_until'))) : undefined;
            let found: typeof libraryMembers.$inferSelect | undefined;
            if (r.get('card_no')) [found] = await tx.select().from(libraryMembers).where(sql`lower(${libraryMembers.cardNo}) = ${lc(r.get('card_no'))}`);
            const set = { ...(categoryId && { categoryId }), ...(validUntil && { validUntil }), ...(r.get('phone') && { phone: r.get('phone') }), ...(r.get('organisation') && { organisation: r.get('organisation') }) };
            if (!found && kind === 'student') {
              const s = await studentByRoll(tx, required(r, 'roll_no')).catch((e: Error) => fail(e.message, r.get('roll_no')));
              const [had] = await tx.select({ id: libraryMembers.id }).from(libraryMembers).where(eq(libraryMembers.studentId, s.id));
              found = await ensureStudentMember(tx, ctx.p.tenantId, s.id);
              if (Object.keys(set).length) await tx.update(libraryMembers).set(set).where(eq(libraryMembers.id, found.id));
              return outcome(!had, !!had && Object.keys(set).length > 0, [found.cardNo, s.fullName]);
            }
            if (!found && kind === 'staff') {
              const email = required(r, 'email').toLowerCase();
              const [u] = await tx.select({ id: users.id, name: users.fullName }).from(users).where(eq(users.email, email));
              if (!u) fail('No member of staff with this email or phone', email);
              [found] = await tx.select().from(libraryMembers).where(and(eq(libraryMembers.userId, u!.id), isNull(libraryMembers.studentId)));
              if (!found) {
                await tx.insert(libraryMembers).values({ tenantId: ctx.p.tenantId, cardNo: r.get('card_no') || (await nextCardNo(tx, ctx.p.tenantId)), kind, userId: u!.id, fullName: u!.name, email, ...set });
                return outcome(true, false, [u!.name]);
              }
            }
            if (!found) {
              const name = required(r, 'name');
              await tx.insert(libraryMembers).values({ tenantId: ctx.p.tenantId, cardNo: r.get('card_no') || (await nextCardNo(tx, ctx.p.tenantId)), kind, fullName: name, email: r.get('email'), ...set });
              return outcome(true, false, [name]);
            }
            const changed = Object.keys(set).length > 0 || (!!r.get('name') && found.kind === 'external' && found.fullName !== r.get('name'));
            if (changed) await tx.update(libraryMembers).set({ ...set, ...(r.get('name') && found.kind === 'external' && { fullName: r.get('name') }) }).where(eq(libraryMembers.id, found.id));
            return outcome(false, changed, [found.cardNo, found.fullName]);
          });
        },
      },
    };
  }

  categories(): RecordEntity {
    const memberCount = sql<number>`(select count(*)::int from library_members m where m.category_id = ${qual(libraryMemberCategories.id)})`;
    return {
      key: 'library-member-categories',
      module: 'library',
      table: libraryMemberCategories,
      subjectType: 'library_member_category',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.name),
      list: {
        select: {
          id: libraryMemberCategories.id,
          name: libraryMemberCategories.name,
          kind: libraryMemberCategories.kind,
          loanDays: libraryMemberCategories.loanDays,
          maxBooks: libraryMemberCategories.maxBooks,
          fineRupees: rupeesOf(libraryMemberCategories.finePaisePerDay),
          maxRenewals: libraryMemberCategories.maxRenewals,
          canReserve: libraryMemberCategories.canReserve,
          depositRupees: rupeesOf(libraryMemberCategories.depositPaise),
          sortOrder: libraryMemberCategories.sortOrder,
          members: memberCount,
        },
        search: [libraryMemberCategories.name],
        filters: { kind: choiceFilter('Kind', libraryMemberCategories.kind, CATEGORY_KINDS) },
        sorts: { name: libraryMemberCategories.name, kind: libraryMemberCategories.kind, loanDays: libraryMemberCategories.loanDays, maxBooks: libraryMemberCategories.maxBooks, members: memberCount },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: libraryMemberCategories.name, required: true },
        kind: { label: 'For', type: 'select', schema: oneOf(CATEGORY_KINDS), column: libraryMemberCategories.kind, options: CATEGORY_KINDS, required: true, help: '"Book bank" loans run for the whole semester' },
        loanDays: { label: 'Loan period (days)', type: 'number', schema: Int(1, 400), column: libraryMemberCategories.loanDays, required: true, bulk: true },
        maxBooks: { label: 'Books at a time', type: 'number', schema: Int(1, 50), column: libraryMemberCategories.maxBooks, required: true, bulk: true },
        fine: { label: 'Fine per day (₹)', type: 'number', schema: Rupees, column: libraryMemberCategories.finePaisePerDay, rowKey: 'fineRupees', bulk: true },
        maxRenewals: { label: 'Renewals allowed', type: 'number', schema: Int(0, 20), column: libraryMemberCategories.maxRenewals, bulk: true },
        canReserve: { label: 'Can reserve books', type: 'boolean', schema: Bool, column: libraryMemberCategories.canReserve, bulk: true },
        deposit: { label: 'Deposit (₹)', type: 'number', schema: Rupees, column: libraryMemberCategories.depositPaise, rowKey: 'depositRupees' },
      },
      order: { column: libraryMemberCategories.sortOrder },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, libraryMemberCategories, libraryMemberCategories.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Category' },
        { key: 'kind', header: 'For' },
        { key: 'loanDays', header: 'Loan days' },
        { key: 'maxBooks', header: 'Books at a time' },
        { key: 'fineRupees', header: 'Fine per day (₹)' },
        { key: 'maxRenewals', header: 'Renewals' },
        { key: 'depositRupees', header: 'Deposit (₹)' },
        { key: 'members', header: 'Members' },
      ],
    };
  }

  branches(): RecordEntity {
    const copyCount = sql<number>`(select count(*)::int from library_copies c where c.branch_id = ${qual(libraryBranches.id)} and c.status <> 'withdrawn')`;
    const away = sql<number>`(select count(*)::int from library_copies c where c.at_branch_id = ${qual(libraryBranches.id)} and c.status = 'in_transit')`;
    return {
      key: 'library-branches',
      module: 'library',
      table: libraryBranches,
      subjectType: 'library_branch',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: libraryBranches.id, name: libraryBranches.name, code: libraryBranches.code, isMain: libraryBranches.isMain, sortOrder: libraryBranches.sortOrder, copies: copyCount, inTransit: away },
        search: [libraryBranches.name, libraryBranches.code],
        sorts: { name: libraryBranches.name, copies: copyCount },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: libraryBranches.name, required: true },
        code: { label: 'Code', type: 'text', schema: z.string().trim().max(20), column: libraryBranches.code },
        isMain: {
          label: 'Main library',
          type: 'boolean',
          schema: Bool,
          apply: async (ctx, id, value) => {
            if (value) await ctx.tx.update(libraryBranches).set({ isMain: false }).where(ne(libraryBranches.id, id));
            await ctx.tx.update(libraryBranches).set({ isMain: !!value }).where(eq(libraryBranches.id, id));
          },
          help: 'New copies go to the main library unless another branch is chosen',
        },
      },
      order: { column: libraryBranches.sortOrder },
      columns: [
        { key: 'name', header: 'Branch' },
        { key: 'code', header: 'Code' },
        { key: 'isMain', header: 'Main library' },
        { key: 'copies', header: 'Copies' },
        { key: 'inTransit', header: 'Waiting to go home' },
      ],
    };
  }

  // ---- loans --------------------------------------------------------------------------------------------------

  loans(): RecordEntity {
    return {
      key: 'library-loans',
      module: 'library',
      table: libraryLoans,
      subjectType: 'library_loan',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.title} · ${r.borrower}`,
      list: {
        select: {
          id: libraryLoans.id,
          issuedAt: libraryLoans.issuedAt,
          dueOn: libraryLoans.dueOn,
          returnedAt: libraryLoans.returnedAt,
          bookId: libraryLoans.bookId,
          title: libraryBooks.title,
          accessionNo: loanCopy.accessionNo,
          memberId: libraryLoans.memberId,
          cardNo: loanMember.cardNo,
          borrower,
          borrowerKind: sql<string>`coalesce(${loanMember.kind}, 'student')`,
          studentId: libraryLoans.studentId,
          rollNo: loanStudent.rollNo,
          fineRupees: rupeesOf(libraryLoans.finePaise),
          waivedRupees: rupeesOf(libraryLoans.fineWaivedPaise),
          unpaidRupees: rupeesOf(loanUnpaid),
          finePaidAt: libraryLoans.finePaidAt,
          fineInvoiceTitle: libraryLoans.fineInvoiceTitle,
          renewCount: libraryLoans.renewCount,
          condition: libraryLoans.condition,
          conditionNote: libraryLoans.conditionNote,
          via: libraryLoans.via,
          returnedVia: libraryLoans.returnedVia,
          bookBank: libraryLoans.bookBank,
          status: loanStatus,
          daysOverdue: sql<number>`greatest(0, ${SQL_TODAY} - ${libraryLoans.dueOn})`.mapWith(Number),
        },
        joins: (q) => q.innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId)).leftJoin(loanCopy, eq(loanCopy.id, libraryLoans.copyId)).leftJoin(loanMember, eq(loanMember.id, libraryLoans.memberId)).leftJoin(loanStudent, eq(loanStudent.id, libraryLoans.studentId)),
        search: [libraryBooks.title, loanCopy.accessionNo, loanMember.cardNo, loanMember.fullName, loanStudent.fullName, loanStudent.rollNo],
        filters: {
          status: {
            label: 'Status',
            options: LOAN_STATUSES,
            where: (v) =>
              v === 'out'
                ? isNull(libraryLoans.returnedAt)
                : v === 'overdue'
                  ? sql`${libraryLoans.returnedAt} is null and ${libraryLoans.dueOn} < ${SQL_TODAY}`
                  : v === 'returned'
                    ? sql`${libraryLoans.returnedAt} is not null and ${libraryLoans.condition} is null`
                    : v === 'lost' || v === 'damaged'
                      ? eq(libraryLoans.condition, v)
                      : undefined,
          },
          kind: { label: 'Borrower', options: MEMBER_KINDS, where: (v) => (MEMBER_KINDS.some((k) => k.value === v) ? sql`coalesce(${loanMember.kind}, 'student') = ${v}` : undefined) },
          via: { label: 'Issued or returned through', options: VIAS, where: (v) => (VIAS.some((k) => k.value === v) ? or(eq(libraryLoans.via, v), eq(libraryLoans.returnedVia, v)) : undefined) },
          fines: yesNo('Fines', sql`${loanUnpaid} > 0`, sql`${loanUnpaid} = 0`, ['Unpaid fine', 'No fine due']),
          bookBank: yesNo('Book bank', eq(libraryLoans.bookBank, true), eq(libraryLoans.bookBank, false)),
          member: { label: 'Member', where: (v) => uuidEq(libraryLoans.memberId, v) },
          book: { label: 'Title', where: (v) => uuidEq(libraryLoans.bookId, v) },
        },
        sorts: { issued: libraryLoans.issuedAt, due: libraryLoans.dueOn, returned: libraryLoans.returnedAt, title: libraryBooks.title, borrower, fine: libraryLoans.finePaise },
        defaultSort: { id: 'issued', dir: 'desc' },
      },
      fields: {
        copyCode: { label: 'Copy (barcode or accession no.)', type: 'text', schema: Text(60), required: true, edit: false, rowKey: 'accessionNo', apply: async () => undefined },
        memberCode: { label: 'Member (card or roll no.)', type: 'text', schema: Text(60), required: true, edit: false, rowKey: 'cardNo', apply: async () => undefined },
        dueOn: {
          label: 'Due on',
          type: 'date',
          schema: DateText,
          help: 'Leave empty for the member’s loan period',
          apply: async (ctx, id, value) => {
            if (!value) throw new BadRequestException('Give the due date');
            const [l] = await ctx.tx.select().from(libraryLoans).where(eq(libraryLoans.id, id));
            if (l.returnedAt) throw new ConflictException('This book has already been returned');
            await ctx.tx.update(libraryLoans).set({ dueOn: String(value) }).where(eq(libraryLoans.id, id));
          },
        },
        bookBank: { label: 'Book bank (whole semester)', type: 'boolean', schema: Bool, edit: false, apply: async () => undefined },
      },
      create: async (ctx, v) => {
        const member = await findMember(ctx.tx, ctx.p.tenantId, String(v.memberCode ?? ''));
        const copy = await findCopy(ctx.tx, String(v.copyCode));
        const loan = await issueCopy(ctx.tx, ctx.p, this.clock.now(), this.notifications, { member, copy, dueOn: (v.dueOn as string | null) ?? undefined, bookBank: !!v.bookBank });
        return loan.id;
      },
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'accessionNo', header: 'Accession no.' },
        { key: 'borrower', header: 'Borrower' },
        { key: 'cardNo', header: 'Card' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'borrowerKind', header: 'Kind' },
        { key: 'issuedAt', header: 'Issued' },
        { key: 'dueOn', header: 'Due' },
        { key: 'returnedAt', header: 'Returned' },
        { key: 'status', header: 'Status', value: wordsOf(LOAN_STATUSES, 'status') },
        { key: 'daysOverdue', header: 'Days overdue', value: (r) => (r.returnedAt ? 0 : Number(r.daysOverdue ?? 0)) },
        { key: 'fineRupees', header: 'Fine (₹)' },
        { key: 'waivedRupees', header: 'Waived (₹)' },
        { key: 'unpaidRupees', header: 'Unpaid (₹)' },
        { key: 'renewCount', header: 'Renewals' },
        { key: 'via', header: 'Issued through' },
        { key: 'returnedVia', header: 'Returned through' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ r: libraryLoans.returnedAt }).from(libraryLoans).where(eq(libraryLoans.id, id)))[0]?.r ? null : 'This book is still out; take it back first') },
      actions: {
        return: {
          label: 'Take back',
          params: z.object({ branchId: OptionalRef.optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const { branchId } = raw as { branchId?: string | null };
            const l = await returnLoan(ctx.tx, ctx.p, this.clock.now(), id, { branchId: branchId ?? null });
            return l.finePaise > 0 ? `Fine ₹${(l.finePaise / 100).toFixed(2)}` : undefined;
          },
        },
        renew: { label: 'Renew', apply: async (ctx, id) => `Due ${(await renewLoan(ctx.tx, ctx.p, this.clock.now(), id)).dueOn}` },
        finePaid: {
          label: 'Fine paid at the desk',
          apply: async (ctx, id) => {
            const [l] = await ctx.tx.select().from(libraryLoans).where(eq(libraryLoans.id, id));
            if (!l.returnedAt) throw new ConflictException('The fine is charged when the book comes back');
            if (l.finePaise - l.fineWaivedPaise <= 0) throw new ConflictException('There is no fine to collect');
            if (l.finePaidAt || l.fineInvoiceTitle) throw new ConflictException('This fine is already settled');
            await ctx.tx.update(libraryLoans).set({ finePaidAt: this.clock.now() }).where(eq(libraryLoans.id, id));
            await auditUser(ctx.tx, ctx.p, 'library.fine_paid', 'library_loan', id, { finePaise: l.finePaise - l.fineWaivedPaise });
          },
        },
        sendToFees: {
          label: 'Collect the fine with fees',
          apply: async (ctx, id) => {
            const [l] = await ctx.tx.select({ l: libraryLoans, title: libraryBooks.title }).from(libraryLoans).innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId)).where(eq(libraryLoans.id, id));
            if (!l.l.studentId) throw new ConflictException('Only a student’s fine can go on the fee account');
            const due = l.l.finePaise - l.l.fineWaivedPaise;
            if (!l.l.returnedAt || due <= 0) throw new ConflictException('There is no fine to collect');
            if (l.l.finePaidAt || l.l.fineInvoiceTitle) throw new ConflictException('This fine is already settled');
            const title = `Library fine: ${l.title.slice(0, 60)} (${id.slice(0, 8)})`;
            const res = await this.fees.chargeStudents(ctx.tx, ctx.p, title, await this.today(ctx), [{ studentId: l.l.studentId, amountPaise: due }]);
            if (res.charged === 0) throw new ConflictException('The fee account could not be charged');
            await ctx.tx.update(libraryLoans).set({ fineInvoiceTitle: title }).where(eq(libraryLoans.id, id));
            await auditUser(ctx.tx, ctx.p, 'library.fine_sent_to_fees', 'library_loan', id, { finePaise: due, title });
            return title;
          },
        },
        requestWaiver: {
          label: 'Ask to waive the fine',
          params: z.object({ amount: Rupees.refine((v) => v > 0, 'Give the amount'), reason: z.string().trim().min(3, 'Say why').max(500) }),
          apply: async (ctx, id, raw) => {
            const { amount, reason } = raw as { amount: number; reason: string };
            const [l] = await ctx.tx.select().from(libraryLoans).where(eq(libraryLoans.id, id));
            const due = l.finePaise - l.fineWaivedPaise;
            if (!l.returnedAt || due <= 0) throw new ConflictException('There is no fine to waive');
            if (l.finePaidAt || l.fineInvoiceTitle) throw new ConflictException('This fine is already settled');
            if (amount > due) throw new BadRequestException(`The fine still due is ₹${(due / 100).toFixed(2)}`);
            const [open] = await ctx.tx.select({ id: libraryFineWaivers.id }).from(libraryFineWaivers).where(and(eq(libraryFineWaivers.loanId, id), eq(libraryFineWaivers.status, 'pending')));
            if (open) throw new ConflictException('A waiver for this fine is already waiting for a decision');
            const [w] = await ctx.tx.insert(libraryFineWaivers).values({ tenantId: ctx.p.tenantId, loanId: id, amountPaise: amount, reason, requestedBy: ctx.p.userId }).returning();
            await auditUser(ctx.tx, ctx.p, 'library_fine_waiver.created', 'library_fine_waiver', w.id, { loanId: id, amountPaise: amount, reason });
            await auditUser(ctx.tx, ctx.p, 'library.waiver_requested', 'library_loan', id, { amountPaise: amount });
          },
        },
        lost: {
          label: 'Report lost',
          tone: 'danger',
          params: z.object({ note: z.string().trim().min(3, 'Say what happened').max(300), amount: Rupees.optional() }),
          apply: async (ctx, id, raw) => {
            const { note, amount } = raw as { note: string; amount?: number };
            const l = await settleLoan(ctx.tx, ctx.p, this.clock.now(), id, 'lost', note, amount || undefined);
            return `Fine ₹${(l.finePaise / 100).toFixed(2)}`;
          },
        },
        damaged: {
          label: 'Returned damaged',
          params: z.object({ note: z.string().trim().min(3, 'Describe the damage').max(300), amount: Rupees.optional() }),
          apply: async (ctx, id, raw) => {
            const { note, amount } = raw as { note: string; amount?: number };
            const l = await settleLoan(ctx.tx, ctx.p, this.clock.now(), id, 'damaged', note, amount);
            return `Fine ₹${(l.finePaise / 100).toFixed(2)}`;
          },
        },
      },
    };
  }

  waivers(): RecordEntity {
    const waiverBorrower = sql<string | null>`coalesce((select m.full_name from library_members m where m.id = ${qual(waiverLoan.memberId)}), (select s.full_name from students s where s.id = ${qual(waiverLoan.studentId)}))`;
    const decide = (approve: boolean) => async (ctx: KitCtx, id: string, raw: unknown) => {
      const { note } = (raw ?? {}) as { note?: string };
      const [w] = await ctx.tx.select().from(libraryFineWaivers).where(eq(libraryFineWaivers.id, id)).for('update');
      if (w.status !== 'pending') throw new ConflictException('This waiver has already been decided');
      if (w.requestedBy === ctx.p.userId && approve && !ctx.p.roles.includes('principal')) throw new ConflictException('Someone other than the person who asked must approve the waiver');
      if (approve) {
        const [l] = await ctx.tx.select().from(libraryLoans).where(eq(libraryLoans.id, w.loanId)).for('update');
        if (l.finePaidAt || l.fineInvoiceTitle) throw new ConflictException('The fine was settled meanwhile');
        const due = l.finePaise - l.fineWaivedPaise;
        const amount = Math.min(w.amountPaise, due);
        await ctx.tx.update(libraryLoans).set({ fineWaivedPaise: l.fineWaivedPaise + amount }).where(eq(libraryLoans.id, l.id));
        await auditUser(ctx.tx, ctx.p, 'library.fine_waived', 'library_loan', l.id, { amountPaise: amount, changes: { fineWaivedPaise: { before: l.fineWaivedPaise, after: l.fineWaivedPaise + amount } } });
      }
      const status = approve ? 'approved' : 'rejected';
      await ctx.tx.update(libraryFineWaivers).set({ status, decidedBy: ctx.p.userId, decidedAt: this.clock.now(), decisionNote: note ?? '' }).where(eq(libraryFineWaivers.id, id));
      await auditUser(ctx.tx, ctx.p, `library_fine_waiver.${status}`, 'library_fine_waiver', id, { note, changes: { status: { before: 'pending', after: status } } });
    };
    return {
      key: 'library-fine-waivers',
      module: 'library',
      table: libraryFineWaivers,
      subjectType: 'library_fine_waiver',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.title} · ₹${Number(r.amountRupees ?? 0).toFixed(2)}`,
      list: {
        select: {
          id: libraryFineWaivers.id,
          loanId: libraryFineWaivers.loanId,
          title: libraryBooks.title,
          borrower: waiverBorrower,
          amountRupees: rupeesOf(libraryFineWaivers.amountPaise),
          fineRupees: rupeesOf(waiverLoan.finePaise),
          reason: libraryFineWaivers.reason,
          status: libraryFineWaivers.status,
          requestedByName: requester.fullName,
          decidedByName: decider.fullName,
          decidedAt: libraryFineWaivers.decidedAt,
          decisionNote: libraryFineWaivers.decisionNote,
          createdAt: libraryFineWaivers.createdAt,
        },
        joins: (q) => q.innerJoin(waiverLoan, eq(waiverLoan.id, libraryFineWaivers.loanId)).innerJoin(libraryBooks, eq(libraryBooks.id, waiverLoan.bookId)).leftJoin(requester, eq(requester.id, libraryFineWaivers.requestedBy)).leftJoin(decider, eq(decider.id, libraryFineWaivers.decidedBy)),
        search: [libraryBooks.title, libraryFineWaivers.reason, requester.fullName],
        filters: { status: choiceFilter('Status', libraryFineWaivers.status, WAIVER_STATUSES) },
        sorts: { asked: libraryFineWaivers.createdAt, amount: libraryFineWaivers.amountPaise, status: libraryFineWaivers.status, decided: libraryFineWaivers.decidedAt },
        defaultSort: { id: 'asked', dir: 'desc' },
      },
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'borrower', header: 'Borrower' },
        { key: 'fineRupees', header: 'Fine (₹)' },
        { key: 'amountRupees', header: 'Waiver asked (₹)' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: wordsOf(WAIVER_STATUSES, 'status') },
        { key: 'requestedByName', header: 'Asked by' },
        { key: 'decidedByName', header: 'Decided by' },
        { key: 'decisionNote', header: 'Decision note' },
      ],
      actions: {
        approve: { label: 'Approve', roles: [...APPROVERS], params: z.object({ note: z.string().trim().max(300).optional() }).default({}), apply: decide(true) },
        reject: { label: 'Reject', roles: [...APPROVERS], tone: 'danger', params: z.object({ note: z.string().trim().max(300).optional() }).default({}), apply: decide(false) },
      },
    };
  }

  clearances(): RecordEntity {
    const issuer = alias(users, 'issuer');
    return {
      key: 'library-clearances',
      module: 'library',
      table: libraryClearances,
      subjectType: 'library_clearance',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.cardNo} ${r.fullName}`,
      list: {
        select: { id: libraryClearances.id, memberId: libraryClearances.memberId, cardNo: libraryMembers.cardNo, fullName: libraryMembers.fullName, kind: libraryMembers.kind, purpose: libraryClearances.purpose, note: libraryClearances.note, issuedByName: issuer.fullName, createdAt: libraryClearances.createdAt },
        joins: (q) => q.innerJoin(libraryMembers, eq(libraryMembers.id, libraryClearances.memberId)).leftJoin(issuer, eq(issuer.id, libraryClearances.issuedBy)),
        search: [libraryMembers.cardNo, libraryMembers.fullName, libraryClearances.purpose],
        sorts: { issued: libraryClearances.createdAt, name: libraryMembers.fullName },
        defaultSort: { id: 'issued', dir: 'desc' },
      },
      columns: [
        { key: 'cardNo', header: 'Card' },
        { key: 'fullName', header: 'Name' },
        { key: 'purpose', header: 'For' },
        { key: 'note', header: 'Note' },
        { key: 'issuedByName', header: 'Issued by' },
        { key: 'createdAt', header: 'Issued on' },
      ],
    };
  }
}

export { APPROVERS as LIBRARY_APPROVERS };
