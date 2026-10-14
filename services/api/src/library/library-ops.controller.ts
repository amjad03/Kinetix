import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, HttpException, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, ServiceUnavailableException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { qual } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans, students } from '../db/schema.js';
import { libraryEresourceAccess, libraryEresources } from '../db/schema-depth.js';
import { libraryAcquisitions, libraryAlertSubscriptions, libraryBranches, libraryClearances, libraryCopies, libraryFineWaivers, libraryGateLog, libraryIll, libraryMembers, libraryPeriodicalIssues, libraryRepository, libraryRepositoryAccess } from '../db/schema-lht.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addCopies, ensureStudentMember, findCopy, findMember, issueCopy, memberStanding, returnLoan, syncCopies, tenantToday } from './circulation.js';
import { IsbnLookup } from './isbn-lookup.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { callNumber, marcToBook, normaliseIsbn, parseMarc, writeIso2709 } from './marc.js';

const Codes = z.array(z.string().trim().min(1).max(60)).min(1).max(30);
const IssueBody = z.object({ memberCode: z.string().trim().min(1).max(60), copyCodes: Codes, dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), bookBank: z.boolean().default(false), branchId: z.uuid().optional() });
const ReturnBody = z.object({ copyCodes: Codes, branchId: z.uuid().optional() });
const DropBody = z.object({ codes: Codes, droppedAt: z.iso.datetime().optional(), branchId: z.uuid().optional() });
const SelfBody = z.object({ copyCode: z.string().trim().min(1).max(60) });
const AlertBody = z.object({ topics: z.string().trim().max(300).default('') });
const NotifyBody = z.object({ days: z.number().int().min(1).max(90).default(7) });
const SuggestBody = z.object({ title: z.string().trim().min(2).max(300), author: z.string().trim().max(200).default(''), isbn: z.string().trim().max(20).default(''), reason: z.string().trim().max(500).default(''), departmentId: z.uuid().optional(), quantity: z.number().int().min(1).max(50).default(1) });
const ClearBody = z.object({ purpose: z.string().trim().min(2).max(80).default('exit'), note: z.string().trim().max(300).default('') });
const SwipeBody = z.object({ memberCode: z.string().trim().min(1).max(60), branchId: z.uuid().optional(), purpose: z.enum(['reading', 'borrow', 'reference', 'eresources', 'other']).default('reading') });
const EnrolBody = z.object({ sectionId: z.uuid().optional(), categoryId: z.uuid().optional() });
const READERS = ['student', 'guardian', 'teacher', 'hod', 'principal', 'tenant_admin', 'librarian'] as const;

/** A reason a code could not be handled, for a desk report row. */
const why = (e: unknown) => (e instanceof HttpException ? String((e.getResponse() as { message?: unknown }).message ?? e.message) : (e as Error).message);

/**
 * The circulation desk and the reader-facing library: issue and return by scanning, the overnight drop box,
 * self-checkout, the OPAC with availability, new arrivals and alerts, ISBN lookup, MARC21 import and export,
 * book suggestions, no-dues clearance, the gate swipe, enrolling a class and the library dashboard.
 */
@Controller('v1/library')
export class LibraryOpsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly isbn: IsbnLookup,
  ) {}

  // ---- the desk -----------------------------------------------------------------------------------------------

  /** What a scanned or typed code is: a member (with what they have out and owe) or a copy (with who has it). */
  @Get('desk/lookup')
  @Auth('user', LIBRARY_ROLES)
  lookup(@CurrentPrincipal() p: UserPrincipal, @Query('code') code = '') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock.now());
      const member = await findMember(tx, p.tenantId, code).catch(() => null);
      const copy = await findCopy(tx, code).catch(() => null);
      if (!member && !copy) throw new NotFoundException('No member or copy has this code');
      const out: Record<string, unknown> = {};
      if (member) {
        const standing = await memberStanding(tx, member, today);
        const loans = await tx
          .select({ id: libraryLoans.id, title: libraryBooks.title, accessionNo: libraryCopies.accessionNo, dueOn: libraryLoans.dueOn, overdue: sql<boolean>`${libraryLoans.dueOn} < ${today}::date` })
          .from(libraryLoans)
          .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
          .leftJoin(libraryCopies, eq(libraryCopies.id, libraryLoans.copyId))
          .where(and(member.studentId ? or(eq(libraryLoans.memberId, member.id), eq(libraryLoans.studentId, member.studentId)) : eq(libraryLoans.memberId, member.id), isNull(libraryLoans.returnedAt)))
          .orderBy(asc(libraryLoans.dueOn));
        out.member = { id: member.id, cardNo: member.cardNo, fullName: member.fullName, kind: member.kind, status: member.status, validUntil: member.validUntil, blockedReason: member.blockedReason, ...standing, loans };
      }
      if (copy) {
        const [book] = await tx.select({ title: libraryBooks.title, author: libraryBooks.author, callNo: libraryBooks.callNo }).from(libraryBooks).where(eq(libraryBooks.id, copy.bookId));
        const [loan] = await tx
          .select({ id: libraryLoans.id, dueOn: libraryLoans.dueOn, borrower: sql<string>`coalesce((select full_name from library_members m where m.id = ${qual(libraryLoans.memberId)}), (select full_name from students s where s.id = ${qual(libraryLoans.studentId)}))` })
          .from(libraryLoans)
          .where(and(eq(libraryLoans.copyId, copy.id), isNull(libraryLoans.returnedAt)));
        out.copy = { id: copy.id, accessionNo: copy.accessionNo, status: copy.status, ...book, loan: loan ?? null };
      }
      return out;
    });
  }

  /** Issues one or more scanned copies to a member; each copy is reported on its own. */
  @Post('desk/issue')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const member = await findMember(tx, p.tenantId, b.memberCode);
      if (b.bookBank) await this.assertBookBank(tx, member.categoryId);
      const results = [];
      for (const code of b.copyCodes) {
        try {
          const loan = await tx.transaction(async (sp) => issueCopy(sp, p, this.clock.now(), this.notifications, { member, copy: await findCopy(sp, code), dueOn: b.dueOn, bookBank: b.bookBank, branchId: b.branchId }));
          results.push({ code, ok: true, loanId: loan.id, dueOn: loan.dueOn });
        } catch (e) {
          results.push({ code, ok: false, message: why(e) });
        }
      }
      return { member: { id: member.id, cardNo: member.cardNo, fullName: member.fullName }, results };
    });
  }

  /** Takes scanned copies back (fines are worked out per copy). */
  @Post('desk/return')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  giveBack(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReturnBody)) b: z.infer<typeof ReturnBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.returnCodes(tx, p, b.copyCodes, { branchId: b.branchId, via: 'desk' }));
  }

  /** The overnight drop box: books found in it are returned as of the time they were dropped (default: now). */
  @Post('dropbox')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  dropbox(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DropBody)) b: z.infer<typeof DropBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.returnCodes(tx, p, b.codes, { branchId: b.branchId, via: 'dropbox', at: b.droppedAt ? new Date(b.droppedAt) : undefined }));
  }

  private async returnCodes(tx: Tx, p: UserPrincipal, codes: string[], o: { branchId?: string; via: 'desk' | 'dropbox'; at?: Date }) {
    const results = [];
    for (const code of codes) {
      try {
        const done = await tx.transaction(async (sp) => {
          const copy = await findCopy(sp, code);
          const [loan] = await sp.select({ id: libraryLoans.id }).from(libraryLoans).where(and(eq(libraryLoans.copyId, copy.id), isNull(libraryLoans.returnedAt)));
          if (!loan) throw new ConflictException('This copy is not out on loan');
          const l = await returnLoan(sp, p, this.clock.now(), loan.id, { branchId: o.branchId ?? null, via: o.via, at: o.at });
          const [c] = await sp.select({ status: libraryCopies.status }).from(libraryCopies).where(eq(libraryCopies.id, copy.id));
          return { loanId: l.id, finePaise: l.finePaise, inTransit: c.status === 'in_transit' };
        });
        results.push({ code, ok: true, ...done });
      } catch (e) {
        results.push({ code, ok: false, message: why(e) });
      }
    }
    return { results };
  }

  /** A student borrows a copy themselves at the self-checkout station (their own card's rules apply). */
  @Post('self-checkout')
  @Auth('user', ['student'])
  selfCheckout(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SelfBody)) b: z.infer<typeof SelfBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
      if (!me) throw new ForbiddenException('Self-checkout is for students');
      const member = await ensureStudentMember(tx, p.tenantId, me.id);
      const loan = await issueCopy(tx, p, this.clock.now(), this.notifications, { member, copy: await findCopy(tx, b.copyCode), via: 'self' });
      const [book] = await tx.select({ title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.id, loan.bookId));
      return { loanId: loan.id, title: book.title, dueOn: loan.dueOn };
    });
  }

  private async assertBookBank(tx: Tx, categoryId: string | null) {
    const [c] = categoryId ? await tx.execute<{ kind: string }>(sql`select kind from library_member_categories where id = ${categoryId}::uuid`).then((r) => r.rows) : [];
    if (c?.kind !== 'book_bank') throw new ConflictException('Book bank loans are for members in a book bank category (for example SC/ST students under the scheme)');
  }

  // ---- OPAC and alerts ------------------------------------------------------------------------------------------

  /** The online catalogue for every reader: search by title, author, subject or ISBN, with copies on the shelf per branch. */
  @Get('opac')
  @Auth('user')
  opac(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '', @Query('available') available?: string, @Query('page') pageText = '1') {
    const page = Math.max(1, Math.min(500, Number(pageText) || 1));
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6).map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const shelf = sql<number>`(select count(*)::int from library_copies c where c.book_id = ${qual(libraryBooks.id)} and c.status = 'available')`;
      const where = and(eq(libraryBooks.status, 'active'), ...words.map((w) => or(ilike(libraryBooks.title, w), ilike(libraryBooks.author, w), ilike(libraryBooks.subject, w), ilike(libraryBooks.keywords, w), ilike(libraryBooks.isbn, w), ilike(libraryBooks.callNo, w))), available === 'true' ? sql`${shelf} > 0` : undefined);
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(libraryBooks).where(where);
      const rows = await tx
        .select({ id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, isbn: libraryBooks.isbn, callNo: libraryBooks.callNo, subject: libraryBooks.subject, publisher: libraryBooks.publisher, pubYear: libraryBooks.pubYear, edition: libraryBooks.edition, copies: libraryBooks.copies, available: shelf })
        .from(libraryBooks)
        .where(where)
        .orderBy(asc(libraryBooks.title))
        .limit(20)
        .offset((page - 1) * 20);
      const ids = rows.map((r) => r.id);
      const byBranch = ids.length
        ? await tx
            .select({ bookId: libraryCopies.bookId, branch: sql<string>`coalesce(${libraryBranches.name}, '')`, available: sql<number>`count(*) filter (where ${libraryCopies.status} = 'available')::int`, copies: sql<number>`count(*)::int` })
            .from(libraryCopies)
            .leftJoin(libraryBranches, eq(libraryBranches.id, libraryCopies.atBranchId))
            .where(and(inArray(libraryCopies.bookId, ids), sql`${libraryCopies.status} in ('available', 'on_loan', 'in_transit')`))
            .groupBy(libraryCopies.bookId, libraryBranches.name)
        : [];
      return { total, page, rows: rows.map((r) => ({ ...r, branches: byBranch.filter((b) => b.bookId === r.id).map(({ branch, available: a, copies }) => ({ branch, available: a, copies })), reservable: r.available === 0 && r.copies > 0 })) };
    });
  }

  /** Titles added in the last `days` days. */
  @Get('new-arrivals')
  @Auth('user')
  arrivals(@CurrentPrincipal() p: UserPrincipal, @Query('days') daysText = '30') {
    const days = Math.max(1, Math.min(365, Number(daysText) || 30));
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, subject: libraryBooks.subject, callNo: libraryBooks.callNo, createdAt: libraryBooks.createdAt })
        .from(libraryBooks)
        .where(and(eq(libraryBooks.status, 'active'), sql`${libraryBooks.createdAt} > ${new Date(this.clock.now().getTime() - days * 86_400_000).toISOString()}::timestamptz`))
        .orderBy(desc(libraryBooks.createdAt))
        .limit(100),
    );
  }

  @Get('alerts/me')
  @Auth('user')
  myAlerts(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(libraryAlertSubscriptions).where(eq(libraryAlertSubscriptions.userId, p.userId)))[0] ?? null);
  }

  /** Subscribe to new-arrival alerts, on topics (comma-separated) or everything (empty). */
  @Put('alerts/me')
  @Auth('user')
  subscribe(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AlertBody)) b: z.infer<typeof AlertBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(libraryAlertSubscriptions).values({ tenantId: p.tenantId, userId: p.userId, topics: b.topics }).onConflictDoUpdate({ target: libraryAlertSubscriptions.userId, set: { topics: b.topics } }).returning();
      return row;
    });
  }

  @Delete('alerts/me')
  @HttpCode(200)
  @Auth('user')
  unsubscribe(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.delete(libraryAlertSubscriptions).where(eq(libraryAlertSubscriptions.userId, p.userId));
      return { ok: true };
    });
  }

  /** Tells each subscriber about the titles added in the last `days` days that match their topics (once per title). */
  @Post('new-arrivals/notify')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  notify(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(NotifyBody)) b: z.infer<typeof NotifyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const since = new Date(this.clock.now().getTime() - b.days * 86_400_000).toISOString();
      const books = await tx.select({ id: libraryBooks.id, title: libraryBooks.title, subject: libraryBooks.subject, keywords: libraryBooks.keywords }).from(libraryBooks).where(and(eq(libraryBooks.status, 'active'), sql`${libraryBooks.createdAt} > ${since}::timestamptz`));
      const subs = await tx.select().from(libraryAlertSubscriptions);
      let notified = 0;
      for (const s of subs) {
        const topics = s.topics.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const match = books.filter((bk) => !topics.length || topics.some((t) => `${bk.title} ${bk.subject} ${bk.keywords}`.toLowerCase().includes(t)));
        if (!match.length) continue;
        const list = match.slice(0, 5).map((m) => m.title).join(', ') + (match.length > 5 ? ` +${match.length - 5}` : '');
        await this.notifications.notifyUsers(tx, [s.userId], {
          kind: 'announcement',
          text: {
            en: { title: `New in the library: ${match.length} titles`, body: list },
            hi: { title: `पुस्तकालय में नई किताबें: ${match.length}`, body: list },
            kn: { title: `ಗ್ರಂಥಾಲಯಕ್ಕೆ ಹೊಸ ಪುಸ್ತಕಗಳು: ${match.length}`, body: list },
          },
          data: { bookIds: match.map((m) => m.id).slice(0, 20).join(',') },
          dedupeKey: `library-arrivals:${match.map((m) => m.id).sort().join(',').slice(0, 180)}`,
        });
        await tx.update(libraryAlertSubscriptions).set({ lastSentAt: this.clock.now() }).where(eq(libraryAlertSubscriptions.id, s.id));
        notified++;
      }
      await auditUser(tx, p, 'library.arrivals_notified', 'library_book', undefined, { books: books.length, notified });
      return { books: books.length, notified };
    });
  }

  // ---- cataloguing ------------------------------------------------------------------------------------------------

  /** An ISBN: the title if the catalogue has it, else the open catalogue's record to prefill the form. */
  @Get('isbn/:isbn')
  @Auth('user', LIBRARY_ROLES)
  async lookupIsbn(@CurrentPrincipal() p: UserPrincipal, @Param('isbn') raw: string) {
    const isbn = normaliseIsbn(raw);
    if (!isbn) throw new BadRequestException('This is not a valid ISBN (check the last digit)');
    const local = await this.db.withTenant(p.tenantId, async (tx) => (await tx.select({ id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, copies: libraryBooks.copies }).from(libraryBooks).where(eq(libraryBooks.isbn, isbn)).limit(1))[0] ?? null);
    if (local) return { isbn, inCatalogue: local, found: null, source: 'catalogue' };
    if (!this.isbn.enabled) return { isbn, inCatalogue: null, found: null, source: 'none' };
    try {
      return { isbn, inCatalogue: null, found: await this.isbn.lookup(isbn), source: 'openlibrary' };
    } catch {
      throw new ServiceUnavailableException('The book lookup service cannot be reached; type the details in');
    }
  }

  /** Reads a MARC21 file (ISO 2709 or MARCXML) and shows what would be added, marking titles the catalogue already has. */
  @Post('marc/preview')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  previewMarc(@CurrentPrincipal() p: UserPrincipal, @UploadedFile() file: { buffer: Buffer } | undefined) {
    const books = this.readMarc(file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const isbns = books.map((b) => b.isbn).filter(Boolean);
      const have = new Set(isbns.length ? (await tx.select({ isbn: libraryBooks.isbn }).from(libraryBooks).where(inArray(libraryBooks.isbn, isbns))).map((r) => r.isbn) : []);
      return { records: books.length, books: books.slice(0, 300).map((b) => ({ ...b, inCatalogue: !!b.isbn && have.has(b.isbn), valid: b.title.length > 0 })) };
    });
  }

  /** Adds the titles of a MARC21 file to the catalogue with `copies` copies each; titles already there (same ISBN) are skipped. */
  @Post('marc/import')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  importMarc(@CurrentPrincipal() p: UserPrincipal, @UploadedFile() file: { buffer: Buffer } | undefined, @Query('copies') copiesText = '1', @Query('branchId') branchId?: string) {
    const copies = Math.max(0, Math.min(100, Number(copiesText) || 0));
    const books = this.readMarc(file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const branch = branchId && z.uuid().safeParse(branchId).success ? branchId : ((await tx.select({ id: libraryBranches.id }).from(libraryBranches).orderBy(sql`${libraryBranches.isMain} desc`).limit(1))[0]?.id ?? null);
      const today = await tenantToday(tx, this.clock.now());
      let created = 0;
      let skipped = 0;
      for (const b of books) {
        if (!b.title) {
          skipped++;
          continue;
        }
        if (b.isbn && (await tx.select({ id: libraryBooks.id }).from(libraryBooks).where(eq(libraryBooks.isbn, b.isbn)).limit(1))[0]) {
          skipped++;
          continue;
        }
        const [row] = await tx.insert(libraryBooks).values({ tenantId: p.tenantId, title: b.title.slice(0, 300), author: b.author.slice(0, 200), isbn: b.isbn || null, publisher: b.publisher, edition: b.edition, pubYear: b.pubYear, ddc: b.ddc, callNo: b.callNo || null, subject: b.subject, keywords: b.keywords.slice(0, 500), pages: b.pages, language: b.language, copies: 0 }).returning({ id: libraryBooks.id });
        if (copies > 0) await addCopies(tx, p.tenantId, row.id, copies, { branchId: branch, acquiredOn: today });
        created++;
      }
      await auditUser(tx, p, 'library.marc_imported', 'library_book', undefined, { records: books.length, created, skipped, copies });
      return { records: books.length, created, skipped };
    });
  }

  private readMarc(file: { buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a MARC21 file (.mrc or .xml)');
    const records = parseMarc(file.buffer);
    if (!records.length) throw new BadRequestException('No MARC21 records were found in this file');
    return records.slice(0, 5000).map(marcToBook);
  }

  /** The catalogue as a MARC21 exchange file, for Koha and union catalogues. */
  @Get('marc/export')
  @Auth('user', LIBRARY_ROLES)
  async exportMarc(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response) {
    const books = await this.db.withTenant(p.tenantId, (tx) => tx.select().from(libraryBooks).where(eq(libraryBooks.status, 'active')).orderBy(asc(libraryBooks.title)).limit(50_000));
    const parts = books.map((b) =>
      writeIso2709(
        [
          { tag: '001', value: b.id },
          b.isbn ? { tag: '020', value: `$a ${b.isbn}` } : null,
          b.ddc ? { tag: '082', value: `$a ${b.ddc}` } : null,
          b.callNo ? { tag: '090', value: `$a ${b.callNo}` } : null,
          b.author ? { tag: '100', value: `$a ${b.author}` } : null,
          { tag: '245', value: `$a ${b.title}` },
          b.edition ? { tag: '250', value: `$a ${b.edition}` } : null,
          b.publisher || b.pubYear ? { tag: '264', value: `${b.publisher ? `$b ${b.publisher}` : ''} ${b.pubYear ? `$c ${b.pubYear}` : ''}`.trim() } : null,
          b.pages ? { tag: '300', value: `$a ${b.pages} p.` } : null,
          ...b.keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 10).map((k) => ({ tag: '650', value: `$a ${k}` })),
        ].filter((f): f is { tag: string; value: string } => !!f),
      ),
    );
    res.setHeader('content-type', 'application/marc');
    res.setHeader('content-disposition', 'attachment; filename="catalogue.mrc"');
    res.end(Buffer.concat(parts));
  }

  // ---- suggestions from faculty and students ---------------------------------------------------------------------------

  /** A teacher, head of department or student suggests a book for the library to buy. */
  @Post('suggestions')
  @Auth('user', [...READERS])
  suggest(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SuggestBody)) b: z.infer<typeof SuggestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const isbn = b.isbn ? normaliseIsbn(b.isbn) : '';
      if (b.isbn && !isbn) throw new BadRequestException('This is not a valid ISBN (check the last digit)');
      const [row] = await tx.insert(libraryAcquisitions).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'ACQ'), title: b.title, author: b.author, isbn: isbn ?? '', quantity: b.quantity, reason: b.reason, departmentId: b.departmentId ?? null, suggestedBy: p.userId }).returning();
      await auditUser(tx, p, 'library_acquisition.created', 'library_acquisition', row.id, { suggestion: true });
      return row;
    });
  }

  @Get('suggestions/mine')
  @Auth('user')
  mySuggestions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: libraryAcquisitions.id, number: libraryAcquisitions.number, title: libraryAcquisitions.title, status: libraryAcquisitions.status, decisionNote: libraryAcquisitions.decisionNote, createdAt: libraryAcquisitions.createdAt }).from(libraryAcquisitions).where(eq(libraryAcquisitions.suggestedBy, p.userId)).orderBy(desc(libraryAcquisitions.createdAt)).limit(100));
  }

  // ---- no-dues --------------------------------------------------------------------------------------------------------

  /** Whether a student owes the library anything: books out, unpaid fines, inter-library loans, a deposit to refund. */
  @Get('no-dues/:studentId')
  @Auth('user')
  noDues(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, LIBRARY_ROLES);
      return this.dues(tx, p.tenantId, studentId);
    });
  }

  private async dues(tx: Tx, tenantId: string, studentId: string) {
    const member = await ensureStudentMember(tx, tenantId, studentId);
    const s = await memberStanding(tx, member, await tenantToday(tx, this.clock.now()));
    const [ill] = await tx.select({ n: sql<number>`count(*)::int` }).from(libraryIll).where(and(eq(libraryIll.memberId, member.id), eq(libraryIll.status, 'in_hand')));
    const depositHeld = member.depositPaise > 0 && !member.depositRefundedOn ? member.depositPaise : 0;
    const [last] = await tx.select().from(libraryClearances).where(eq(libraryClearances.memberId, member.id)).orderBy(desc(libraryClearances.createdAt)).limit(1);
    return { member: { id: member.id, cardNo: member.cardNo, fullName: member.fullName }, booksOut: s.out, overdue: s.overdue, unpaidPaise: s.unpaidPaise, interLibraryOut: ill.n, depositHeldPaise: depositHeld, clear: s.out === 0 && s.unpaidPaise === 0 && ill.n === 0, lastClearance: last ?? null };
  }

  /** Records the library's no-dues clearance (refused while anything is owed); the card is closed. */
  @Post('no-dues/:studentId/clear')
  @Auth('user', LIBRARY_ROLES)
  clear(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(ClearBody)) b: z.infer<typeof ClearBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.dues(tx, p.tenantId, studentId);
      if (!d.clear) throw new ConflictException(`Not clear: ${[d.booksOut && `${d.booksOut} books out`, d.unpaidPaise && `fines of ₹${(d.unpaidPaise / 100).toFixed(2)}`, d.interLibraryOut && 'an inter-library loan'].filter(Boolean).join(', ')}`);
      const [row] = await tx.insert(libraryClearances).values({ tenantId: p.tenantId, memberId: d.member.id, purpose: b.purpose, note: b.note, issuedBy: p.userId }).returning();
      await tx.update(libraryMembers).set({ status: 'left' }).where(eq(libraryMembers.id, d.member.id));
      await auditUser(tx, p, 'library_clearance.created', 'library_clearance', row.id, { studentId, purpose: b.purpose, depositHeldPaise: d.depositHeldPaise });
      return { ...row, depositHeldPaise: d.depositHeldPaise };
    });
  }

  // ---- the gate, enrolment and the dashboard --------------------------------------------------------------------------

  /** A card swiped at the gate: signs the member in, or out if they are inside. */
  @Post('gate/swipe')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  swipe(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SwipeBody)) b: z.infer<typeof SwipeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const member = await findMember(tx, p.tenantId, b.memberCode);
      const now = this.clock.now();
      const [open] = await tx.select().from(libraryGateLog).where(and(eq(libraryGateLog.memberId, member.id), isNull(libraryGateLog.outAt))).orderBy(desc(libraryGateLog.inAt)).limit(1);
      if (open) {
        await tx.update(libraryGateLog).set({ outAt: now }).where(eq(libraryGateLog.id, open.id));
        return { direction: 'out', name: member.fullName, cardNo: member.cardNo, entryId: open.id };
      }
      const [row] = await tx.insert(libraryGateLog).values({ tenantId: p.tenantId, memberId: member.id, purpose: b.purpose, branchId: b.branchId ?? null, inAt: now, recordedBy: p.userId }).returning();
      return { direction: 'in', name: member.fullName, cardNo: member.cardNo, entryId: row.id };
    });
  }

  /** Gives every active student of a class (or of the institution) a library card. */
  @Post('members/enrol')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  enrol(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EnrolBody)) b: z.infer<typeof EnrolBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const list = await tx.select({ id: students.id }).from(students).where(and(eq(students.status, 'active'), b.sectionId ? eq(students.sectionId, b.sectionId) : undefined, sql`not exists (select 1 from library_members m where m.student_id = ${qual(students.id)})`));
      for (const s of list) {
        const m = await ensureStudentMember(tx, p.tenantId, s.id);
        if (b.categoryId) await tx.update(libraryMembers).set({ categoryId: b.categoryId }).where(eq(libraryMembers.id, m.id));
      }
      await auditUser(tx, p, 'library.members_enrolled', 'library_member', undefined, { sectionId: b.sectionId ?? null, enrolled: list.length });
      return { enrolled: list.length };
    });
  }

  /** The library at a glance: stock, circulation, footfall and what is waiting for the librarian. */
  @Get('dashboard')
  @Auth('user', LIBRARY_ROLES)
  dashboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock.now());
      const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
      const n = sql<number>`count(*)::int`;
      return {
        today,
        titles: await one(tx.select({ n }).from(libraryBooks).where(eq(libraryBooks.status, 'active'))),
        copies: await one(tx.select({ n }).from(libraryCopies).where(sql`${libraryCopies.status} not in ('withdrawn', 'lost')`)),
        onShelf: await one(tx.select({ n }).from(libraryCopies).where(eq(libraryCopies.status, 'available'))),
        onLoan: await one(tx.select({ n }).from(libraryLoans).where(isNull(libraryLoans.returnedAt))),
        overdue: await one(tx.select({ n }).from(libraryLoans).where(and(isNull(libraryLoans.returnedAt), sql`${libraryLoans.dueOn} < ${today}::date`))),
        issuedToday: await one(tx.select({ n }).from(libraryLoans).where(sql`(${libraryLoans.issuedAt} at time zone 'Asia/Kolkata')::date = ${today}::date`)),
        returnedToday: await one(tx.select({ n }).from(libraryLoans).where(sql`(${libraryLoans.returnedAt} at time zone 'Asia/Kolkata')::date = ${today}::date`)),
        footfallToday: await one(tx.select({ n }).from(libraryGateLog).where(sql`(${libraryGateLog.inAt} at time zone 'Asia/Kolkata')::date = ${today}::date`)),
        insideNow: await one(tx.select({ n }).from(libraryGateLog).where(and(isNull(libraryGateLog.outAt), sql`${libraryGateLog.inAt} > now() - interval '16 hours'`))),
        members: await one(tx.select({ n }).from(libraryMembers).where(eq(libraryMembers.status, 'active'))),
        unpaidFinesPaise: Number((await tx.select({ n: sql<number>`coalesce(sum(greatest(0, ${libraryLoans.finePaise} - ${libraryLoans.fineWaivedPaise})), 0)::bigint` }).from(libraryLoans).where(and(isNull(libraryLoans.finePaidAt), isNull(libraryLoans.fineInvoiceTitle))))[0].n),
        suggestions: await one(tx.select({ n }).from(libraryAcquisitions).where(eq(libraryAcquisitions.status, 'suggested'))),
        onOrder: await one(tx.select({ n }).from(libraryAcquisitions).where(inArray(libraryAcquisitions.status, ['approved', 'ordered']))),
        waivers: await one(tx.select({ n }).from(libraryFineWaivers).where(eq(libraryFineWaivers.status, 'pending'))),
        issuesLate: await one(tx.select({ n }).from(libraryPeriodicalIssues).where(and(eq(libraryPeriodicalIssues.status, 'expected'), sql`${libraryPeriodicalIssues.expectedOn} < ${today}::date - 7`))),
        inTransit: await one(tx.select({ n }).from(libraryCopies).where(eq(libraryCopies.status, 'in_transit'))),
        illOut: await one(tx.select({ n }).from(libraryIll).where(eq(libraryIll.status, 'in_hand'))),
        eresourceOpens30: await one(tx.select({ n }).from(libraryEresourceAccess).where(sql`${libraryEresourceAccess.accessedAt} > now() - interval '30 days'`)),
        eresources: await one(tx.select({ n }).from(libraryEresources).where(eq(libraryEresources.status, 'active'))),
      };
    });
  }

  // ---- the repository for readers -------------------------------------------------------------------------------------

  /** Published repository items a reader may open (open and campus items; restricted ones for the desk only). */
  @Get('repository')
  @Auth('user')
  repository(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '') {
    const desk = p.roles.some((r) => LIBRARY_ROLES.includes(r));
    const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: libraryRepository.id, title: libraryRepository.title, authors: libraryRepository.authors, kind: libraryRepository.kind, year: libraryRepository.year, abstract: libraryRepository.abstract, access: libraryRepository.access })
        .from(libraryRepository)
        .where(and(eq(libraryRepository.status, 'published'), desk ? undefined : sql`${libraryRepository.access} <> 'restricted'`, q.trim() ? or(ilike(libraryRepository.title, like), ilike(libraryRepository.authors, like), ilike(libraryRepository.keywords, like)) : undefined))
        .orderBy(desc(libraryRepository.createdAt))
        .limit(100),
    );
  }

  /** Opens a repository item: the link, with the view counted and logged. */
  @Post('repository/:id/open')
  @HttpCode(200)
  @Auth('user')
  openItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const desk = p.roles.some((r) => LIBRARY_ROLES.includes(r));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(libraryRepository).where(eq(libraryRepository.id, id));
      if (!r || r.status !== 'published' || (r.access === 'restricted' && !desk)) throw new NotFoundException('Not found');
      await tx.update(libraryRepository).set({ views: sql`${libraryRepository.views} + 1` }).where(eq(libraryRepository.id, id));
      await tx.insert(libraryRepositoryAccess).values({ tenantId: p.tenantId, itemId: id, userId: p.userId, accessedAt: this.clock.now() });
      return { url: r.url, title: r.title };
    });
  }

  /** Copies of a book in the register (for the desk's quick look). */
  @Get('books/:id/copies')
  @Auth('user', LIBRARY_ROLES)
  copies(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await syncCopies(tx, id);
      return tx.select({ id: libraryCopies.id, accessionNo: libraryCopies.accessionNo, status: libraryCopies.status, shelf: libraryCopies.shelf, branch: libraryBranches.name }).from(libraryCopies).leftJoin(libraryBranches, eq(libraryBranches.id, libraryCopies.branchId)).where(eq(libraryCopies.bookId, id)).orderBy(asc(libraryCopies.accessionNo));
    });
  }

  /** The call number a DDC number and author would give. */
  @Get('call-number')
  @Auth('user', LIBRARY_ROLES)
  callNo(@Query('ddc') ddc = '', @Query('author') author = '') {
    return { callNo: callNumber(ddc, author) };
  }
}
