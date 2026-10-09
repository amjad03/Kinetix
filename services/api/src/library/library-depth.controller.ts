import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { PdfWriter } from '../common/pdf.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chapters, libraryBooks, libraryLoans, students, tenants, topics } from '../db/schema.js';
import { libraryEresourceAccess, libraryEresources, libraryReservations, resourceTopicLinks } from '../db/schema-depth.js';
import { addDays } from '../teacher/teacher.service.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { copiesHeld, copiesOut, expireHolds, MAX_RENEWALS, promoteNext } from './reservations.js';

const LOAN_DAYS = 14;
const FINE_PAISE_PER_DAY = 200;
const SEAT_WINDOW_MINUTES = 30;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const ConditionBody = z.object({ note: z.string().trim().min(3).max(300), amountPaise: z.number().int().min(0).max(100_000_00).optional() });
const ReserveBody = z.object({ bookId: z.uuid(), studentId: z.uuid().optional() });
const EresourceBody = z.object({ title: z.string().trim().min(2).max(240), kind: z.enum(['ebook', 'journal', 'database', 'video', 'other']).default('ebook'), publisher: z.string().trim().max(160).default(''), url: z.url(), licenceUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), seats: z.number().int().min(1).max(10000).nullish() });
const TopicLinkBody = z.object({ topicId: z.uuid(), resourceKind: z.enum(['book', 'eresource']), resourceId: z.uuid() });

/** Renewals, reservations, lost and damaged books, barcode labels and scanning, e-resources with an access log, and topic links (PRD section 36). */
@Controller('v1/library')
export class LibraryDepthController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  // ---- renew --------------------------------------------------------------------------------------------------

  /** Extends a loan by another loan period, up to the renewal limit, unless another student is waiting for the book. The librarian, the student or a guardian can do it. */
  @Post('loans/:id/renew')
  @HttpCode(200)
  @Auth('user')
  renew(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, id)).for('update');
      if (!loan) throw new NotFoundException('Loan not found');
      await assertCanSeeStudent(tx, p, loan.studentId, LIBRARY_ROLES);
      if (loan.returnedAt) throw new ConflictException('This book has already been returned');
      if (loan.renewCount >= MAX_RENEWALS) throw new ConflictException(`A loan can be renewed ${MAX_RENEWALS} times`);
      const today = await this.today(tx);
      if (loan.dueOn < today) throw new ConflictException('Overdue books cannot be renewed; return the book at the desk');
      const [waiting] = await tx.select({ id: libraryReservations.id }).from(libraryReservations).where(and(eq(libraryReservations.bookId, loan.bookId), sql`${libraryReservations.status} in ('waiting', 'ready')`)).limit(1);
      if (waiting) throw new ConflictException('Another student has reserved this book');
      const [row] = await tx.update(libraryLoans).set({ dueOn: addDays(loan.dueOn > today ? loan.dueOn : today, LOAN_DAYS), renewCount: loan.renewCount + 1 }).where(eq(libraryLoans.id, id)).returning();
      await auditUser(tx, p, 'library.renewed', 'library_loan', id, { renewCount: row.renewCount });
      return row;
    });
  }

  // ---- reservations --------------------------------------------------------------------------------------------

  /** Joins the queue for a book whose copies are all out. A student reserves for themselves; a guardian or the desk reserves for a student. */
  @Post('reservations')
  @Auth('user')
  reserve(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReserveBody)) b: z.infer<typeof ReserveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let studentId = b.studentId;
      if (!studentId) {
        const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
        studentId = me?.id;
      }
      if (!studentId) throw new BadRequestException('Say which student the reservation is for');
      await assertCanSeeStudent(tx, p, studentId, LIBRARY_ROLES);
      const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, b.bookId)).for('update');
      if (!book) throw new NotFoundException('Book not found');
      await expireHolds(tx, this.clock.now());
      const [dup] = await tx.select({ id: libraryReservations.id }).from(libraryReservations).where(and(eq(libraryReservations.bookId, b.bookId), eq(libraryReservations.studentId, studentId), sql`${libraryReservations.status} in ('waiting', 'ready')`));
      if (dup) throw new ConflictException('This student already has a reservation for the book');
      const [mine] = await tx.select({ id: libraryLoans.id }).from(libraryLoans).where(and(eq(libraryLoans.bookId, b.bookId), eq(libraryLoans.studentId, studentId), isNull(libraryLoans.returnedAt)));
      if (mine) throw new ConflictException('This student already has the book');
      const free = book.copies - (await copiesOut(tx, b.bookId)) - (await copiesHeld(tx, b.bookId));
      if (free > 0) throw new ConflictException('A copy is on the shelf; ask the desk to issue it');
      const [row] = await tx.insert(libraryReservations).values({ tenantId: p.tenantId, bookId: b.bookId, studentId }).returning();
      await auditUser(tx, p, 'library.reserved', 'library_reservation', row.id);
      return row;
    });
  }

  /** The queue for every book (desk), or one student's reservations (`studentId`; the student and family can ask for their own). */
  @Get('reservations')
  @Auth('user')
  reservations(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string, @Query('bookId') bookId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await expireHolds(tx, this.clock.now());
      let who = studentId && z.uuid().safeParse(studentId).success ? studentId : undefined;
      if (!p.roles.some((r) => LIBRARY_ROLES.includes(r))) {
        if (!who) {
          const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
          who = me?.id;
        }
        if (!who) throw new ForbiddenException('Say which student');
        await assertCanSeeStudent(tx, p, who, LIBRARY_ROLES);
      }
      const rows = await tx
        .select({ r: libraryReservations, title: libraryBooks.title, student: students.fullName })
        .from(libraryReservations)
        .innerJoin(libraryBooks, eq(libraryBooks.id, libraryReservations.bookId))
        .innerJoin(students, eq(students.id, libraryReservations.studentId))
        .where(and(who ? eq(libraryReservations.studentId, who) : undefined, bookId && z.uuid().safeParse(bookId).success ? eq(libraryReservations.bookId, bookId) : undefined, sql`${libraryReservations.status} in ('waiting', 'ready')`))
        .orderBy(asc(libraryReservations.createdAt));
      return rows.map((r) => ({ ...r.r, title: r.title, student: r.student, position: r.r.status === 'waiting' ? rows.filter((x) => x.r.bookId === r.r.bookId && x.r.status === 'waiting' && x.r.createdAt <= r.r.createdAt).length : 0 }));
    });
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  @Auth('user')
  cancelReservation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(libraryReservations).where(eq(libraryReservations.id, id)).for('update');
      if (!r) throw new NotFoundException('Reservation not found');
      await assertCanSeeStudent(tx, p, r.studentId, LIBRARY_ROLES);
      if (r.status !== 'waiting' && r.status !== 'ready') throw new ConflictException('This reservation is closed');
      const [row] = await tx.update(libraryReservations).set({ status: 'cancelled' }).where(eq(libraryReservations.id, id)).returning();
      if (r.status === 'ready') await promoteNext(tx, r.bookId, this.clock.now());
      await auditUser(tx, p, 'library.reservation_cancelled', 'library_reservation', id);
      return row;
    });
  }

  // ---- lost and damaged ------------------------------------------------------------------------------------------

  private async settle(p: UserPrincipal, id: string, kind: 'lost' | 'damaged', b: z.infer<typeof ConditionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, id)).for('update');
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.returnedAt) throw new ConflictException('This book has already been returned');
      const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, loan.bookId)).for('update');
      const charge = b.amountPaise ?? (kind === 'lost' ? book.pricePaise : 0);
      if (kind === 'lost' && charge <= 0) throw new BadRequestException('Give the charge for the lost book (or record the book\'s price)');
      const late = Math.max(0, daysBetween(loan.dueOn, await this.today(tx))) * FINE_PAISE_PER_DAY;
      const [row] = await tx.update(libraryLoans).set({ returnedAt: this.clock.now(), finePaise: late + charge, condition: kind, conditionNote: b.note }).where(eq(libraryLoans.id, id)).returning();
      if (kind === 'lost') await tx.update(libraryBooks).set({ copies: Math.max(0, book.copies - 1) }).where(eq(libraryBooks.id, book.id));
      else await promoteNext(tx, book.id, this.clock.now());
      await auditUser(tx, p, `library.${kind}`, 'library_loan', id, { chargePaise: charge });
      return row;
    });
  }

  /** The book is lost: the loan closes, the fine is the late fine plus the book's price, and the library has one copy fewer. */
  @Post('loans/:id/lost')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  lost(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConditionBody)) b: z.infer<typeof ConditionBody>) {
    return this.settle(p, id, 'lost', b);
  }

  /** The book comes back damaged: the loan closes and the fine adds the assessed charge. */
  @Post('loans/:id/damaged')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  damaged(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConditionBody)) b: z.infer<typeof ConditionBody>) {
    return this.settle(p, id, 'damaged', b);
  }

  // ---- barcode labels and scanning -----------------------------------------------------------------------------------

  @Post('books/barcodes/assign')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  assignBarcodes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const books = await tx.select({ id: libraryBooks.id }).from(libraryBooks).where(isNull(libraryBooks.barcode)).orderBy(asc(libraryBooks.createdAt));
      if (books.length === 0) return { assigned: 0 };
      const [last] = await tx.select({ n: sql<number>`coalesce(max(substring(${libraryBooks.barcode} from 3)::int), 0)::int` }).from(libraryBooks).where(sql`${libraryBooks.barcode} ~ '^LB[0-9]+$'`);
      let n = last?.n ?? 0;
      for (const b of books) await tx.update(libraryBooks).set({ barcode: `LB${String(++n).padStart(6, '0')}` }).where(eq(libraryBooks.id, b.id));
      await auditUser(tx, p, 'library.barcodes_assigned', 'library_book', p.tenantId, { assigned: books.length });
      return { assigned: books.length };
    });
  }

  /** Printable labels (QR code and accession number) for the catalogue. */
  @Get('books/labels.pdf')
  @Auth('user', LIBRARY_ROLES)
  async labels(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response) {
    const books = await this.db.withTenant(p.tenantId, (tx) => tx.select({ title: libraryBooks.title, callNo: libraryBooks.callNo, barcode: libraryBooks.barcode }).from(libraryBooks).where(sql`${libraryBooks.barcode} is not null`).orderBy(asc(libraryBooks.barcode)));
    const pdf = new PdfWriter();
    pdf.text('Library book labels', { size: 14, bold: true });
    pdf.rule();
    for (const b of books) {
      pdf.qr(b.barcode!, 48);
      pdf.text(b.title.slice(0, 70), { bold: true });
      pdf.text(`${b.barcode}${b.callNo ? '   ' + b.callNo : ''}`, { size: 11 });
      pdf.gap(34);
    }
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="library-labels.pdf"');
    res.end(pdf.build());
  }

  /** What a scanned code is: the book, its copies and who has it out. A hand scanner types the code like a keyboard. */
  @Get('scan/:code')
  @Auth('user', LIBRARY_ROLES)
  scan(@CurrentPrincipal() p: UserPrincipal, @Param('code') code: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const clean = code.trim().slice(0, 40);
      const [book] = await tx.select().from(libraryBooks).where(clean.length === 0 ? sql`false` : sql`${libraryBooks.barcode} = ${clean} or ${libraryBooks.isbn} = ${clean}`);
      if (!book) throw new NotFoundException('No book carries that code');
      const out = await tx.select({ id: libraryLoans.id, student: students.fullName, rollNo: students.rollNo, dueOn: libraryLoans.dueOn }).from(libraryLoans).innerJoin(students, eq(students.id, libraryLoans.studentId)).where(and(eq(libraryLoans.bookId, book.id), isNull(libraryLoans.returnedAt))).orderBy(asc(libraryLoans.dueOn));
      const held = await copiesHeld(tx, book.id);
      return { book, available: Math.max(0, book.copies - out.length - held), held, loans: out };
    });
  }

  // ---- e-resources and the access log --------------------------------------------------------------------------------------

  /** The register of e-books, journals and databases. Everyone sees what is active; the desk sees it all with use counts. */
  @Get('eresources')
  @Auth('user')
  eresources(@CurrentPrincipal() p: UserPrincipal) {
    const desk = p.roles.some((r) => LIBRARY_ROLES.includes(r));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: libraryEresources, opens: sql<number>`count(${libraryEresourceAccess.id})::int`, people: sql<number>`count(distinct ${libraryEresourceAccess.userId})::int` })
        .from(libraryEresources)
        .leftJoin(libraryEresourceAccess, eq(libraryEresourceAccess.resourceId, libraryEresources.id))
        .where(desk ? undefined : eq(libraryEresources.status, 'active'))
        .groupBy(libraryEresources.id)
        .orderBy(asc(libraryEresources.title));
      const today = await this.today(tx);
      return rows.map((x) => ({ ...x.r, ...(desk ? { opens: x.opens, readers: x.people } : {}), licenceExpired: !!x.r.licenceUntil && x.r.licenceUntil < today }));
    });
  }

  @Post('eresources')
  @Auth('user', LIBRARY_ROLES)
  addEresource(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EresourceBody)) b: z.infer<typeof EresourceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(libraryEresources).values({ tenantId: p.tenantId, title: b.title, kind: b.kind, publisher: b.publisher, url: b.url, licenceUntil: b.licenceUntil ?? null, seats: b.seats ?? null, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'library.eresource_added', 'library_eresource', row.id);
      return row;
    });
  }

  @Post('eresources/:id/retire')
  @HttpCode(200)
  @Auth('user', LIBRARY_ROLES)
  retire(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(libraryEresources).set({ status: 'retired' }).where(eq(libraryEresources.id, id)).returning();
      if (!row) throw new NotFoundException('E-resource not found');
      await auditUser(tx, p, 'library.eresource_retired', 'library_eresource', id);
      return row;
    });
  }

  /** Opens a resource: checks the licence and the number of seats, records who opened it, and returns the link. */
  @Post('eresources/:id/open')
  @HttpCode(200)
  @Auth('user')
  open(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(libraryEresources).where(eq(libraryEresources.id, id));
      if (!r || r.status !== 'active') throw new NotFoundException('E-resource not found');
      if (r.licenceUntil && r.licenceUntil < (await this.today(tx))) throw new ConflictException('The licence for this resource has expired');
      const now = this.clock.now();
      if (r.seats) {
        const since = new Date(now.getTime() - SEAT_WINDOW_MINUTES * 60_000).toISOString();
        const [busy] = await tx.select({ n: sql<number>`count(distinct ${libraryEresourceAccess.userId})::int` }).from(libraryEresourceAccess).where(and(eq(libraryEresourceAccess.resourceId, id), sql`${libraryEresourceAccess.accessedAt} >= ${since}`, sql`${libraryEresourceAccess.userId} <> ${p.userId}`));
        if (busy.n >= r.seats) throw new ConflictException('All seats are in use; try again in a little while');
      }
      await tx.insert(libraryEresourceAccess).values({ tenantId: p.tenantId, resourceId: id, userId: p.userId, accessedAt: now });
      return { url: r.url, title: r.title };
    });
  }

  /** Who opened a resource and when (desk only). */
  @Get('eresources/:id/access')
  @Auth('user', LIBRARY_ROLES)
  access(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ id: libraryEresourceAccess.id, userId: libraryEresourceAccess.userId, accessedAt: libraryEresourceAccess.accessedAt, name: sql<string>`(select full_name from users u where u.id = ${libraryEresourceAccess.userId})` })
        .from(libraryEresourceAccess)
        .where(eq(libraryEresourceAccess.resourceId, id))
        .orderBy(desc(libraryEresourceAccess.accessedAt))
        .limit(200),
    );
  }

  // ---- topic links ----------------------------------------------------------------------------------------------------------

  @Post('topic-links')
  @Auth('user', [...LIBRARY_ROLES, 'teacher', 'hod'])
  link(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TopicLinkBody)) b: z.infer<typeof TopicLinkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ id: topics.id }).from(topics).where(eq(topics.id, b.topicId));
      if (!t) throw new NotFoundException('Topic not found');
      const [res] = b.resourceKind === 'book' ? await tx.select({ id: libraryBooks.id }).from(libraryBooks).where(eq(libraryBooks.id, b.resourceId)) : await tx.select({ id: libraryEresources.id }).from(libraryEresources).where(eq(libraryEresources.id, b.resourceId));
      if (!res) throw new NotFoundException('Resource not found');
      const [row] = await tx.insert(resourceTopicLinks).values({ tenantId: p.tenantId, topicId: b.topicId, resourceKind: b.resourceKind, resourceId: b.resourceId, createdBy: p.userId }).onConflictDoNothing().returning();
      if (!row) throw new ConflictException('Already linked');
      await auditUser(tx, p, 'library.topic_linked', 'resource_topic_link', row.id);
      return row;
    });
  }

  @Delete('topic-links/:id')
  @HttpCode(200)
  @Auth('user', [...LIBRARY_ROLES, 'teacher', 'hod'])
  unlink(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(resourceTopicLinks).where(eq(resourceTopicLinks.id, id)).returning({ id: resourceTopicLinks.id });
      if (gone.length === 0) throw new NotFoundException('Link not found');
      return { removed: true };
    });
  }

  /** The books and e-resources recommended for a topic: teachers, students and the desk can see them. */
  @Get('topics/:topicId/resources')
  @Auth('user')
  topicResources(@CurrentPrincipal() p: UserPrincipal, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const links = await tx.select().from(resourceTopicLinks).where(eq(resourceTopicLinks.topicId, topicId));
      const books = links.filter((l) => l.resourceKind === 'book');
      const er = links.filter((l) => l.resourceKind === 'eresource');
      const bookRows = books.length ? await tx.select({ id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, callNo: libraryBooks.callNo }).from(libraryBooks).where(inArray(libraryBooks.id, books.map((l) => l.resourceId))) : [];
      const erRows = er.length ? await tx.select({ id: libraryEresources.id, title: libraryEresources.title, kind: libraryEresources.kind }).from(libraryEresources).where(and(inArray(libraryEresources.id, er.map((l) => l.resourceId)), eq(libraryEresources.status, 'active'))) : [];
      return { books: bookRows.map((b) => ({ ...b, linkId: books.find((l) => l.resourceId === b.id)?.id })), eresources: erRows.map((e) => ({ ...e, linkId: er.find((l) => l.resourceId === e.id)?.id })) };
    });
  }

  /** Topics with their chapter, for choosing what to link. */
  @Get('topics')
  @Auth('user', [...LIBRARY_ROLES, 'teacher', 'hod'])
  topicList(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '') {
    const term = q.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    if (term.length < 2) return [];
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: topics.id, title: topics.title, chapter: chapters.title }).from(topics).innerJoin(chapters, eq(chapters.id, topics.chapterId)).where(ilike(topics.title, `%${term}%`)).orderBy(asc(topics.title)).limit(30));
  }
}
