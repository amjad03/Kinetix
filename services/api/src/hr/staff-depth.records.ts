import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { staffQualifications } from '../db/schema-depth.js';
import { staffDocuments, staffExperience, staffPublications } from '../db/schema-hr2.js';
import { designations } from '../db/schema.js';
import { fail, lc, outcome } from '../import/row-helpers.js';
import { RecordRegistry, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, OptionalText, Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { HR_ROLES, PAYROLL_ROLES } from './hr.access.js';
import { choiceFilter, DateOnly, labelOf, OptionalNumber, opts, Rupees, rupeesOf, staffChildEntity, taken, Year } from './kit-shared.js';

export const CADRES = opts([
  ['professor', 'Professor'],
  ['associate_professor', 'Associate professor'],
  ['assistant_professor', 'Assistant professor'],
  ['lecturer', 'Lecturer'],
  ['principal', 'Principal'],
  ['librarian', 'Librarian'],
  ['physical_director', 'Physical director'],
  ['lab_staff', 'Laboratory staff'],
  ['administrative', 'Administrative'],
  ['support', 'Support staff'],
  ['other', 'Other'],
]);
export const STAFF_CATEGORIES = opts([
  ['teaching', 'Teaching'],
  ['non_teaching', 'Non-teaching'],
]);
const QUAL_KINDS = opts([
  ['degree', 'Degree'],
  ['certification', 'Certification'],
  ['skill', 'Skill'],
  ['experience', 'Experience'],
]);
const QUAL_LEVELS = opts([
  ['School', 'School'],
  ['Diploma', 'Diploma'],
  ['UG', 'Undergraduate'],
  ['PG', 'Postgraduate'],
  ['M.Phil.', 'M.Phil.'],
  ['Ph.D.', 'Ph.D.'],
  ['Post-doctoral', 'Post-doctoral'],
  ['NET', 'UGC NET'],
  ['SET', 'State eligibility test'],
  ['Other', 'Other'],
]);
const DIVISIONS = opts([
  ['distinction', 'Distinction'],
  ['first', 'First class'],
  ['second', 'Second class'],
  ['pass', 'Pass'],
  ['grade', 'Grade / CGPA'],
]);
export const EXPERIENCE_KINDS = opts([
  ['teaching', 'Teaching'],
  ['industry', 'Industry'],
  ['research', 'Research'],
  ['administrative', 'Administrative'],
]);
export const PUBLICATION_KINDS = opts([
  ['journal', 'Journal article'],
  ['conference', 'Conference paper'],
  ['book', 'Book'],
  ['chapter', 'Book chapter'],
  ['patent', 'Patent'],
  ['other', 'Other'],
]);
export const INDEXING = opts([
  ['scopus', 'Scopus'],
  ['wos', 'Web of Science'],
  ['ugc_care', 'UGC-CARE'],
  ['peer_reviewed', 'Peer reviewed'],
  ['none', 'Not indexed'],
]);
const AUTHOR_ROLES = opts([
  ['sole', 'Sole author'],
  ['first', 'First author'],
  ['corresponding', 'Corresponding author'],
  ['co_author', 'Co-author'],
]);
const PUB_STATUS = opts([
  ['published', 'Published'],
  ['accepted', 'Accepted'],
  ['filed', 'Filed (patent)'],
  ['granted', 'Granted (patent)'],
]);
export const DOCUMENT_KINDS = opts([
  ['aadhaar', 'Aadhaar'],
  ['pan', 'PAN card'],
  ['photo', 'Photograph'],
  ['degree', 'Degree certificate'],
  ['marks_card', 'Marks card'],
  ['experience', 'Experience certificate'],
  ['appointment', 'Appointment order'],
  ['relieving', 'Relieving letter'],
  ['address_proof', 'Address proof'],
  ['bank', 'Bank proof'],
  ['caste', 'Caste certificate'],
  ['disability', 'Disability certificate'],
  ['other', 'Other'],
]);

const sel = (o: { value: string; label: string }[]) => z.enum(o.map((x) => x.value) as [string, ...string[]]);
const Opt = (max: number) => OptionalText(max).transform((v) => v ?? '');

function qualificationsEntity(): RecordEntity {
  const q = staffQualifications;
  return staffChildEntity({
    key: 'staff-qualifications',
    subjectType: 'staff_qualification',
    table: q,
    select: { kind: q.kind, title: q.title, level: q.level, specialisation: q.specialisation, institution: q.institution, university: q.university, year: q.year, percentage: q.percentage, division: q.division },
    label: (r) => `${r.title ?? ''}${r.year ? ` (${r.year})` : ''}`,
    search: [q.title, q.institution, q.university, q.specialisation],
    filters: { kind: choiceFilter('Kind', QUAL_KINDS, q.kind), level: choiceFilter('Level', QUAL_LEVELS, q.level) },
    sorts: { title: q.title, year: q.year, level: q.level },
    defaultSort: { id: 'year', dir: 'desc' },
    fields: {
      kind: { label: 'Kind', type: 'select', schema: sel(QUAL_KINDS), column: q.kind, options: QUAL_KINDS, required: true, bulk: true, importExample: 'degree' },
      title: { label: 'Qualification', type: 'text', schema: Text(200), column: q.title, required: true, importExample: 'M.Com.' },
      level: { label: 'Level', type: 'select', schema: z.union([sel(QUAL_LEVELS), z.literal('')]), column: q.level, options: QUAL_LEVELS, bulk: true, importExample: 'PG' },
      specialisation: { label: 'Specialisation', type: 'text', schema: Opt(200), column: q.specialisation, importExample: 'Finance' },
      institution: { label: 'College or institution', type: 'text', schema: Opt(200), column: q.institution },
      university: { label: 'University or board', type: 'text', schema: Opt(200), column: q.university, importExample: 'Bangalore University' },
      year: { label: 'Year of passing', type: 'number', schema: z.union([Year, z.literal(''), z.null()]).transform((v) => (v === '' ? null : v)), column: q.year, importExample: '2012' },
      percentage: { label: 'Percentage or CGPA', type: 'number', schema: OptionalNumber(0, 100), column: q.percentage, importExample: '68.5' },
      division: { label: 'Class', type: 'select', schema: z.union([sel(DIVISIONS), z.literal('')]), column: q.division, options: DIVISIONS },
    },
    columns: [
      { key: 'kind', header: 'Kind', value: (r) => labelOf(QUAL_KINDS, r.kind) },
      { key: 'title', header: 'Qualification' },
      { key: 'level', header: 'Level' },
      { key: 'specialisation', header: 'Specialisation' },
      { key: 'institution', header: 'Institution' },
      { key: 'university', header: 'University' },
      { key: 'year', header: 'Year' },
      { key: 'percentage', header: 'Percentage' },
      { key: 'division', header: 'Class', value: (r) => labelOf(DIVISIONS, r.division) },
    ],
  });
}

function experienceEntity(): RecordEntity {
  const x = staffExperience;
  const years = sql<number>`round(((${x.toDate} - ${x.fromDate}) + 1) / 365.25, 1)::float8`;
  return staffChildEntity({
    key: 'staff-experience',
    subjectType: 'staff_experience',
    table: x,
    select: { organisation: x.organisation, designation: x.designation, kind: x.kind, fromDate: x.fromDate, toDate: x.toDate, years, lastPay: rupeesOf(x.lastPayPaise), reasonForLeaving: x.reasonForLeaving },
    label: (r) => `${r.designation ? `${r.designation}, ` : ''}${r.organisation ?? ''}`,
    search: [x.organisation, x.designation],
    filters: { kind: choiceFilter('Kind', EXPERIENCE_KINDS, x.kind) },
    sorts: { organisation: x.organisation, from: x.fromDate, years },
    defaultSort: { id: 'from', dir: 'desc' },
    check: (v) => {
      if (v.fromDate && v.toDate && String(v.toDate) < String(v.fromDate)) throw new BadRequestException('The end date is before the start date');
    },
    fields: {
      organisation: { label: 'Organisation', type: 'text', schema: Text(200), column: x.organisation, required: true, importExample: 'St. Joseph’s College' },
      designation: { label: 'Designation', type: 'text', schema: Opt(120), column: x.designation, importExample: 'Assistant professor' },
      kind: { label: 'Kind', type: 'select', schema: sel(EXPERIENCE_KINDS), column: x.kind, options: EXPERIENCE_KINDS, required: true, bulk: true, importExample: 'teaching' },
      fromDate: { label: 'From', type: 'date', schema: DateOnly, column: x.fromDate, required: true, importExample: '2015-06-01' },
      toDate: { label: 'To', type: 'date', schema: DateOnly, column: x.toDate, required: true, importExample: '2020-05-31' },
      lastPayPaise: { label: 'Last monthly pay (₹)', type: 'number', schema: Rupees, column: x.lastPayPaise, rowKey: 'lastPay', importExample: '45000' },
      reasonForLeaving: { label: 'Reason for leaving', type: 'text', schema: Opt(300), column: x.reasonForLeaving },
    },
    columns: [
      { key: 'organisation', header: 'Organisation' },
      { key: 'designation', header: 'Designation' },
      { key: 'kind', header: 'Kind', value: (r) => labelOf(EXPERIENCE_KINDS, r.kind) },
      { key: 'fromDate', header: 'From' },
      { key: 'toDate', header: 'To' },
      { key: 'years', header: 'Years' },
      { key: 'lastPay', header: 'Last monthly pay (₹)' },
      { key: 'reasonForLeaving', header: 'Reason for leaving' },
    ],
  });
}

function publicationsEntity(): RecordEntity {
  const p = staffPublications;
  return staffChildEntity({
    key: 'staff-publications',
    subjectType: 'staff_publication',
    table: p,
    select: { kind: p.kind, title: p.title, authors: p.authors, venue: p.venue, year: p.year, volume: p.volume, pages: p.pages, issnIsbn: p.issnIsbn, doi: p.doi, indexing: p.indexing, impactFactor: p.impactFactor, authorRole: p.authorRole, status: p.status },
    label: (r) => String(r.title ?? ''),
    search: [p.title, p.authors, p.venue, p.doi, p.issnIsbn],
    filters: {
      kind: choiceFilter('Kind', PUBLICATION_KINDS, p.kind),
      indexing: choiceFilter('Indexed in', INDEXING, p.indexing),
      year: { label: 'Year', where: (v) => (/^\d{4}$/.test(v) ? eq(p.year, Number(v)) : undefined) },
      fy: { label: 'Academic year', where: (v) => (/^\d{4}$/.test(v) ? sql`${p.year} in (${Number(v)}, ${Number(v) + 1})` : undefined) },
    },
    sorts: { title: p.title, year: p.year, venue: p.venue, impact: p.impactFactor },
    defaultSort: { id: 'year', dir: 'desc' },
    fields: {
      kind: { label: 'Kind', type: 'select', schema: sel(PUBLICATION_KINDS), column: p.kind, options: PUBLICATION_KINDS, required: true, bulk: true, importExample: 'journal' },
      title: { label: 'Title', type: 'textarea', schema: Text(500), column: p.title, required: true, importExample: 'GST and small retailers in Karnataka' },
      authors: { label: 'Authors', type: 'text', schema: Opt(500), column: p.authors, help: 'In the order printed', importExample: 'A. Rao, S. Kumar' },
      venue: { label: 'Journal, conference or publisher', type: 'text', schema: Opt(300), column: p.venue, importExample: 'Indian Journal of Commerce' },
      year: { label: 'Year', type: 'number', schema: Year, column: p.year, required: true, importExample: '2025' },
      volume: { label: 'Volume and issue', type: 'text', schema: Opt(60), column: p.volume, importExample: '12(3)' },
      pages: { label: 'Pages', type: 'text', schema: Opt(40), column: p.pages, importExample: '45-58' },
      issnIsbn: { label: 'ISSN / ISBN / patent no.', type: 'text', schema: Opt(60), column: p.issnIsbn, importExample: '0019-512X' },
      doi: { label: 'DOI or link', type: 'text', schema: Opt(300), column: p.doi },
      indexing: { label: 'Indexed in', type: 'select', schema: sel(INDEXING), column: p.indexing, options: INDEXING, required: true, bulk: true, importExample: 'ugc_care' },
      impactFactor: { label: 'Impact factor', type: 'number', schema: OptionalNumber(0, 1000), column: p.impactFactor },
      authorRole: { label: 'Author role', type: 'select', schema: sel(AUTHOR_ROLES), column: p.authorRole, options: AUTHOR_ROLES, required: true, importExample: 'first' },
      status: { label: 'Status', type: 'select', schema: sel(PUB_STATUS), column: p.status, options: PUB_STATUS, required: true, bulk: true, importExample: 'published' },
    },
    columns: [
      { key: 'kind', header: 'Kind', value: (r) => labelOf(PUBLICATION_KINDS, r.kind) },
      { key: 'title', header: 'Title' },
      { key: 'authors', header: 'Authors' },
      { key: 'venue', header: 'Journal / conference / publisher' },
      { key: 'year', header: 'Year' },
      { key: 'volume', header: 'Volume' },
      { key: 'pages', header: 'Pages' },
      { key: 'issnIsbn', header: 'ISSN / ISBN' },
      { key: 'doi', header: 'DOI' },
      { key: 'indexing', header: 'Indexed in', value: (r) => labelOf(INDEXING, r.indexing) },
      { key: 'impactFactor', header: 'Impact factor' },
      { key: 'authorRole', header: 'Author role', value: (r) => labelOf(AUTHOR_ROLES, r.authorRole) },
      { key: 'status', header: 'Status', value: (r) => labelOf(PUB_STATUS, r.status) },
    ],
  });
}

function documentsEntity(): RecordEntity {
  const d = staffDocuments;
  const e = staffChildEntity({
    key: 'staff-documents',
    subjectType: 'staff_document',
    table: d,
    select: { kind: d.kind, title: d.title, number: d.number, issuedOn: d.issuedOn, expiresOn: d.expiresOn, hasFile: sql<boolean>`(${d.fileKey} is not null)`, fileName: d.fileName },
    label: (r) => String(r.title ?? ''),
    search: [d.title, d.number],
    filters: {
      kind: choiceFilter('Kind', DOCUMENT_KINDS, d.kind),
      file: { label: 'Scan', options: opts([['yes', 'Scan attached'], ['no', 'No scan yet']]), where: (v) => (v === 'yes' ? sql`${d.fileKey} is not null` : v === 'no' ? sql`${d.fileKey} is null` : undefined) },
      expiring: { label: 'Expiry', options: opts([['soon', 'Expires within 60 days'], ['expired', 'Expired']]), where: (v) => (v === 'soon' ? sql`${d.expiresOn} between current_date and current_date + 60` : v === 'expired' ? sql`${d.expiresOn} < current_date` : undefined) },
    },
    sorts: { title: d.title, kind: d.kind, expires: d.expiresOn },
    defaultSort: { id: 'kind', dir: 'asc' },
    check: (v) => {
      if (v.issuedOn && v.expiresOn && String(v.expiresOn) < String(v.issuedOn)) throw new BadRequestException('The expiry date is before the issue date');
    },
    fields: {
      kind: { label: 'Kind', type: 'select', schema: sel(DOCUMENT_KINDS), column: d.kind, options: DOCUMENT_KINDS, required: true, bulk: true, importExample: 'degree' },
      title: { label: 'Title', type: 'text', schema: Text(200), column: d.title, required: true, importExample: 'M.Com. degree certificate' },
      number: { label: 'Document number', type: 'text', schema: Opt(60), column: d.number, help: 'Only the last four digits of an Aadhaar number are needed' },
      issuedOn: { label: 'Issued on', type: 'date', schema: DateText, column: d.issuedOn },
      expiresOn: { label: 'Valid until', type: 'date', schema: DateText, column: d.expiresOn },
    },
    columns: [
      { key: 'kind', header: 'Kind', value: (r) => labelOf(DOCUMENT_KINDS, r.kind) },
      { key: 'title', header: 'Title' },
      { key: 'number', header: 'Number' },
      { key: 'issuedOn', header: 'Issued on' },
      { key: 'expiresOn', header: 'Valid until' },
      { key: 'hasFile', header: 'Scan attached', value: (r) => (r.hasFile ? 'Yes' : 'No') },
    ],
  });
  // A full Aadhaar number never goes into a document's number.
  const numberField = e.fields!.number;
  e.fields!.number = { ...numberField, schema: Opt(60).refine((v) => !/^\d{12}$/.test(v.replace(/\s/g, '')), 'Keep only the last four digits of an Aadhaar number') };
  return e;
}

function designationsEntity(): RecordEntity {
  const t = designations;
  const staffCount = sql<number>`(select count(*)::int from staff_profiles sp where sp.designation_id = designations.id and sp.status <> 'exited')`;
  return {
    key: 'designations',
    module: 'hr',
    table: t,
    subjectType: 'designation',
    roles: { read: PAYROLL_ROLES, write: HR_ROLES },
    label: (r) => String(r.name),
    list: {
      select: { id: t.id, name: t.name, grade: t.grade, cadre: t.cadre, staffCategory: t.staffCategory, sortOrder: t.sortOrder, staffCount, createdAt: t.createdAt },
      search: [t.name, t.grade],
      filters: { cadre: choiceFilter('Cadre', CADRES, t.cadre), category: choiceFilter('Category', STAFF_CATEGORIES, t.staffCategory) },
      sorts: { name: t.name, grade: t.grade, cadre: t.cadre, staff: staffCount },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(80), column: t.name, required: true },
      grade: { label: 'Grade or pay level', type: 'text', schema: OptionalText(20), column: t.grade, bulk: true },
      cadre: { label: 'Cadre', type: 'select', schema: z.union([sel(CADRES), z.literal(''), z.null()]).transform((v) => v || null), column: t.cadre, options: CADRES, bulk: true, help: 'Used for the faculty cadre ratio and NAAC/AICTE reports' },
      staffCategory: { label: 'Category', type: 'select', schema: sel(STAFF_CATEGORIES), column: t.staffCategory, options: STAFF_CATEGORIES, required: true, bulk: true },
    },
    order: { column: t.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, t, t.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Designation' },
      { key: 'grade', header: 'Grade' },
      { key: 'cadre', header: 'Cadre', value: (r) => labelOf(CADRES, r.cadre) },
      { key: 'staffCategory', header: 'Category', value: (r) => labelOf(STAFF_CATEGORIES, r.staffCategory) },
      { key: 'staffCount', header: 'Staff' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Designation', required: true, help: 'Rows are matched on the name', example: 'Assistant professor' },
        { key: 'grade', header: 'Grade', example: 'AGP 6000' },
        { key: 'cadre', header: 'Cadre', options: CADRES.map((c) => c.value), example: 'assistant_professor' },
        { key: 'category', header: 'Category', options: STAFF_CATEGORIES.map((c) => c.value), example: 'teaching' },
      ],
      key: ['name'],
      exists: async (ctx, r) => taken(ctx, t, t.name, t.id, r.get('name')),
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = r.get('name') || fail('This value is required', 'name');
          const cadre = r.get('cadre') || null;
          if (cadre && !CADRES.some((c) => c.value === cadre)) fail('Choose one of the listed values', cadre);
          const category = r.get('category') || 'teaching';
          if (!STAFF_CATEGORIES.some((c) => c.value === category)) fail('Choose one of the listed values', category);
          const [found] = await tx.select().from(t).where(sql`lower(${t.name}) = ${lc(name)}`).limit(1);
          if (!found) {
            await tx.insert(t).values({ tenantId: ctx.p.tenantId, name, grade: r.get('grade') || null, cadre, staffCategory: category, sortOrder: 1_000_000 });
            return outcome(true, false, [name]);
          }
          const patch = { grade: r.get('grade') || found.grade, cadre: cadre ?? found.cadre, staffCategory: r.get('category') ? category : found.staffCategory };
          const changed = patch.grade !== found.grade || patch.cadre !== found.cadre || patch.staffCategory !== found.staffCategory;
          if (changed) await tx.update(t).set(patch).where(eq(t.id, found.id));
          return outcome(false, changed, [name]);
        }),
    },
  };
}

/** The staff record's lists (qualifications, experience, publications, documents) and designations, on the record kit. */
@Injectable()
export class StaffDepthRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [qualificationsEntity(), experienceEntity(), publicationsEntity(), documentsEntity(), designationsEntity()]) this.registry.register(e);
  }
}
