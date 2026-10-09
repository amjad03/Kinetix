import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { accreditationCriteria, accreditationFrameworks } from '../db/schema-depth.js';
import { feeStructures } from '../db/schema-g1.js';
import { coOutcomeMap, coSets, courseOutcomes, examSessions, libraryBooks, placementCompanies, programOutcomes, programs, publications, subjects, users } from '../db/schema.js';
import { fail, int, lc, outcome, required, type Outcome, type Row } from './row-helpers.js';

/** What a handler needs of the import run (a subset of the service's context). */
export interface OnboardingCtx {
  tenantId: string;
  userId: string;
  yearId: string;
  seen: Set<string>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (text: string, name: string): string => {
  if (!DAY.test(text) || Number.isNaN(Date.parse(text))) fail('This value is not valid', `${name}: ${text || '(empty)'}`);
  return text;
};
const rupeesToPaise = (text: string, name: string): number => {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) fail('This value is not valid', `${name}: ${text || '(empty)'}`);
  return Math.round(Number(text) * 100);
};
const programNamed = async (tx: Tx, name: string) => {
  const [p] = await tx.select().from(programs).where(sql`lower(${programs.name}) = ${lc(name)}`).limit(1);
  return p ?? fail('No program has this name (import programs first)', name);
};
const noRepeat = (ctx: OnboardingCtx, key: string) => {
  if (ctx.seen.has(key)) fail('This row repeats an earlier row', key);
  ctx.seen.add(key);
};

/** Program outcomes (po, pso) and course outcomes (co) with their mapping to program outcomes, e.g. `PO1:3;PO2:2` (strength 1 low to 3 high). */
export async function outcomesRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const type = lc(required(r, 'type'));
  const code = required(r, 'code');
  const statement = required(r, 'statement');
  const prog = await programNamed(tx, required(r, 'program'));
  noRepeat(ctx, `outcome:${prog.id}:${type}:${lc(code)}`);
  if (type === 'po' || type === 'pso') {
    const [have] = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, prog.id), eq(programOutcomes.kind, type), sql`lower(${programOutcomes.code}) = ${lc(code)}`));
    if (!have) {
      await tx.insert(programOutcomes).values({ tenantId: ctx.tenantId, programId: prog.id, kind: type, code, statement });
      return outcome(true, false, [`${type.toUpperCase()} ${code}`, prog.name]);
    }
    if (have.statement === statement) return outcome(false, false, [`${type.toUpperCase()} ${code}`, prog.name]);
    await tx.update(programOutcomes).set({ statement }).where(eq(programOutcomes.id, have.id));
    return outcome(false, true, [`${type.toUpperCase()} ${code}`, prog.name]);
  }
  if (type !== 'co') fail('The type must be po, pso or co', type);
  const subjectCode = required(r, 'subject_code');
  const [sub] = await tx.select().from(subjects).where(and(eq(subjects.programId, prog.id), sql`lower(${subjects.code}) = ${lc(subjectCode)}`));
  if (!sub) fail('No subject has this code in the program', subjectCode);
  const sets = await tx.select().from(coSets).where(eq(coSets.subjectId, sub!.id));
  let set = sets.find((s) => s.status === 'draft');
  if (!set) {
    [set] = await tx.insert(coSets).values({ tenantId: ctx.tenantId, subjectId: sub!.id, version: sets.reduce((m, s) => Math.max(m, s.version), 0) + 1, status: 'draft', note: 'Imported', createdBy: ctx.userId }).returning();
  }
  const bloom = r.get('bloom_level') || null;
  const [have] = await tx.select().from(courseOutcomes).where(and(eq(courseOutcomes.coSetId, set!.id), sql`lower(${courseOutcomes.code}) = ${lc(code)}`));
  let created = false;
  let changed = false;
  let coId = have?.id;
  if (!have) {
    const [row] = await tx.insert(courseOutcomes).values({ tenantId: ctx.tenantId, coSetId: set!.id, code, statement, bloomLevel: bloom, ord: sets.length }).returning();
    coId = row.id;
    created = true;
  } else if (have.statement !== statement || have.bloomLevel !== bloom) {
    await tx.update(courseOutcomes).set({ statement, bloomLevel: bloom }).where(eq(courseOutcomes.id, have.id));
    changed = true;
  }
  for (const part of r.get('maps_to').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [poCode, strengthText] = part.split(':').map((x) => x.trim());
    const strength = int(strengthText ?? '', 1, 3, 'The mapping strength must be 1, 2 or 3');
    const [po] = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, prog.id), sql`lower(${programOutcomes.code}) = ${lc(poCode ?? '')}`));
    if (!po) fail('No program outcome has this code (list it earlier in the file)', poCode);
    const [mapped] = await tx.select().from(coOutcomeMap).where(and(eq(coOutcomeMap.coId, coId!), eq(coOutcomeMap.outcomeId, po!.id)));
    if (mapped?.strength === strength) continue;
    await tx.delete(coOutcomeMap).where(and(eq(coOutcomeMap.coId, coId!), eq(coOutcomeMap.outcomeId, po!.id)));
    await tx.insert(coOutcomeMap).values({ tenantId: ctx.tenantId, coId: coId!, outcomeId: po!.id, strength });
    changed = true;
  }
  return outcome(created, changed, [`CO ${code}`, sub!.code]);
}

/** Exam sessions of the current year: one per program, term and name. */
export async function examsRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const prog = await programNamed(tx, required(r, 'program'));
  const term = int(required(r, 'term'), 1, prog.termCount, 'The term is outside the program');
  const name = required(r, 'name');
  const kind = lc(r.get('kind') || 'regular');
  if (kind !== 'regular' && kind !== 'supplementary') fail('The kind must be regular or supplementary', kind);
  const startsOn = day(required(r, 'starts_on'), 'starts_on');
  const endsOn = day(required(r, 'ends_on'), 'ends_on');
  if (endsOn < startsOn) fail('The exam ends before it starts', `${startsOn} - ${endsOn}`);
  noRepeat(ctx, `exam:${prog.id}:${term}:${lc(name)}`);
  const [have] = await tx.select().from(examSessions).where(and(eq(examSessions.programId, prog.id), eq(examSessions.academicYearId, ctx.yearId), eq(examSessions.term, term), sql`lower(${examSessions.name}) = ${lc(name)}`));
  if (!have) {
    await tx.insert(examSessions).values({ tenantId: ctx.tenantId, academicYearId: ctx.yearId, programId: prog.id, term, name, kind: kind as 'regular' | 'supplementary', startsOn, endsOn, createdBy: ctx.userId });
    return outcome(true, false, [name, prog.name]);
  }
  if (have.status !== 'draft') fail('This exam is past the draft stage and cannot be changed by import', name);
  if (have.startsOn === startsOn && have.endsOn === endsOn && have.kind === kind) return outcome(false, false, [name, prog.name]);
  await tx.update(examSessions).set({ startsOn, endsOn, kind: kind as 'regular' | 'supplementary' }).where(eq(examSessions.id, have.id));
  return outcome(false, true, [name, prog.name]);
}

/** Fee structures: one row per head; rows with the same name (and program) form one structure. Amounts in rupees. */
export async function feesRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const name = required(r, 'structure');
  const head = required(r, 'head');
  const amountPaise = rupeesToPaise(required(r, 'amount'), 'amount');
  const dueInDays = r.get('due_in_days') ? int(r.get('due_in_days'), 0, 365) : 30;
  const prog = r.get('program') ? await programNamed(tx, r.get('program')) : null;
  noRepeat(ctx, `fee:${prog?.id ?? ''}:${lc(name)}:${lc(head)}`);
  const [have] = await tx.select().from(feeStructures).where(and(sql`lower(${feeStructures.name}) = ${lc(name)}`, prog ? eq(feeStructures.programId, prog.id) : sql`${feeStructures.programId} is null`));
  if (!have) {
    await tx.insert(feeStructures).values({ tenantId: ctx.tenantId, programId: prog?.id ?? null, name, items: [{ head, amountPaise }], dueInDays, createdBy: ctx.userId });
    return outcome(true, false, [name, head]);
  }
  const items = [...have.items];
  const at = items.findIndex((i) => lc(i.head) === lc(head));
  if (at >= 0 && items[at]!.amountPaise === amountPaise && have.dueInDays === dueInDays) return outcome(false, false, [name, head]);
  if (at >= 0) items[at] = { head, amountPaise };
  else items.push({ head, amountPaise });
  await tx.update(feeStructures).set({ items, dueInDays }).where(eq(feeStructures.id, have.id));
  return outcome(false, true, [name, head]);
}

/** Library books: matched by accession code, else ISBN, else title and author. Price in rupees. */
export async function libraryRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const title = required(r, 'title');
  const author = r.get('author');
  const isbn = r.get('isbn').replace(/[\s-]/g, '') || null;
  if (isbn && !/^(\d{9}[\dX]|\d{13})$/i.test(isbn)) fail('This value is not valid', `isbn: ${isbn}`);
  const barcode = r.get('barcode') || null;
  const copies = r.get('copies') ? int(r.get('copies'), 1, 500) : 1;
  const pricePaise = r.get('price') ? rupeesToPaise(r.get('price'), 'price') : 0;
  noRepeat(ctx, `book:${barcode ?? isbn ?? lc(title + author)}`);
  const match = barcode ? eq(libraryBooks.barcode, barcode) : isbn ? eq(libraryBooks.isbn, isbn) : and(sql`lower(${libraryBooks.title}) = ${lc(title)}`, sql`lower(${libraryBooks.author}) = ${lc(author)}`);
  const [have] = await tx.select().from(libraryBooks).where(match);
  const values = { title, author, isbn, callNo: r.get('call_no') || null, copies, barcode, pricePaise };
  if (!have) {
    await tx.insert(libraryBooks).values({ tenantId: ctx.tenantId, ...values });
    return outcome(true, false, [title]);
  }
  const same = have.title === title && have.author === author && have.copies === copies && have.pricePaise === pricePaise && (have.callNo ?? null) === values.callNo && (have.isbn ?? null) === isbn && (have.barcode ?? null) === barcode;
  if (same) return outcome(false, false, [title]);
  await tx.update(libraryBooks).set(values).where(eq(libraryBooks.id, have.id));
  return outcome(false, true, [title]);
}

/** Recruiting companies and their contact. */
export async function placementRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const name = required(r, 'company');
  const email = r.get('contact_email').toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('This value is not valid', `contact_email: ${email}`);
  noRepeat(ctx, `company:${lc(name)}`);
  const values = { sector: r.get('sector'), website: r.get('website') || null, contactName: r.get('contact_name') || null, contactEmail: email, contactPhone: r.get('contact_phone') || null };
  const [have] = await tx.select().from(placementCompanies).where(sql`lower(${placementCompanies.name}) = ${lc(name)}`);
  if (!have) {
    await tx.insert(placementCompanies).values({ tenantId: ctx.tenantId, name, ...values });
    return outcome(true, false, [name]);
  }
  const same = have.sector === values.sector && have.website === values.website && have.contactName === values.contactName && have.contactEmail === values.contactEmail && have.contactPhone === values.contactPhone;
  if (same) return outcome(false, false, [name]);
  await tx.update(placementCompanies).set(values).where(eq(placementCompanies.id, have.id));
  return outcome(false, true, [name]);
}

const PUBLICATION_KINDS = ['journal', 'conference', 'book', 'book_chapter'];

/** Publications owned by a staff member (found by email). */
export async function researchRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const email = required(r, 'owner_email').toLowerCase();
  const [owner] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (!owner) fail('No staff member has this email (import staff first)', email);
  const title = required(r, 'title');
  const kind = lc(r.get('kind') || 'journal');
  if (!PUBLICATION_KINDS.includes(kind)) fail('The kind must be journal, conference, book or book_chapter', kind);
  const venue = required(r, 'venue');
  const year = int(required(r, 'year'), 1950, 2100);
  const doi = r.get('doi') || null;
  noRepeat(ctx, `pub:${doi ?? email + lc(title)}`);
  const [have] = await tx.select().from(publications).where(doi ? eq(publications.doi, doi) : and(eq(publications.ownerUserId, owner!.id), sql`lower(${publications.title}) = ${lc(title)}`));
  const values = { title, kind, venue, year, doi, issn: r.get('issn') || null };
  if (!have) {
    await tx.insert(publications).values({ tenantId: ctx.tenantId, ownerUserId: owner!.id, ...values });
    return outcome(true, false, [title]);
  }
  const same = have.title === title && have.kind === kind && have.venue === venue && have.year === year && (have.issn ?? null) === values.issn;
  if (same) return outcome(false, false, [title]);
  await tx.update(publications).set(values).where(eq(publications.id, have.id));
  return outcome(false, true, [title]);
}

const BODIES = ['naac', 'nba', 'nirf', 'iqac', 'custom'];

/** Quality (accreditation) criteria under a framework that is created on first use. */
export async function qualityRow(tx: Tx, ctx: OnboardingCtx, r: Row): Promise<Outcome> {
  const fname = required(r, 'framework');
  const body = lc(r.get('body') || 'custom');
  if (!BODIES.includes(body)) fail('The body must be naac, nba, nirf, iqac or custom', body);
  const code = required(r, 'code');
  const title = required(r, 'title');
  const target = r.get('target');
  if (target && !/^\d+(\.\d+)?$/.test(target)) fail('This value is not valid', `target: ${target}`);
  noRepeat(ctx, `crit:${lc(fname)}:${lc(code)}`);
  let created = false;
  let [fw] = await tx.select().from(accreditationFrameworks).where(sql`lower(${accreditationFrameworks.name}) = ${lc(fname)}`);
  if (!fw) {
    [fw] = await tx.insert(accreditationFrameworks).values({ tenantId: ctx.tenantId, body, name: fname, version: r.get('version'), status: 'active', createdBy: ctx.userId }).returning();
    created = true;
  }
  const values = { title, metric: r.get('metric'), unit: r.get('unit'), target: target ? Number(target) : null };
  const [have] = await tx.select().from(accreditationCriteria).where(and(eq(accreditationCriteria.frameworkId, fw!.id), sql`lower(${accreditationCriteria.code}) = ${lc(code)}`));
  if (!have) {
    await tx.insert(accreditationCriteria).values({ tenantId: ctx.tenantId, frameworkId: fw!.id, code, ...values });
    return outcome(true, false, [fname, code]);
  }
  const same = have.title === title && have.metric === values.metric && have.unit === values.unit && have.target === values.target;
  if (same) return outcome(created, false, [fname, code]);
  await tx.update(accreditationCriteria).set(values).where(eq(accreditationCriteria.id, have.id));
  return outcome(false, true, [fname, code]);
}
