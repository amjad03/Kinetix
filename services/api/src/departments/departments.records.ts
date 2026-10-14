import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import { departments, userRoles, users } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalRef, Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

/** People who may head a department: active staff with the HOD role. */
async function headOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'hod')))
    .where(eq(users.status, 'active'))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

const staffCount = sql<number>`(select count(*)::int from department_staff ds where ds.department_id = ${departments.id})`;
const subjectCount = sql<number>`(select count(*)::int from subjects s where s.department_id = ${departments.id})`;

/** Departments as a record kit entity: add, edit, head, reorder, duplicate, delete to the bin, import and export. */
export function departmentsEntity(): RecordEntity {
  return {
    key: 'departments',
    module: 'academics',
    table: departments,
    subjectType: 'department',
    roles: { read: [...STAFF_ADMIN_ROLES, 'hod', 'hr_manager'], write: STAFF_ADMIN_ROLES },
    label: (r) => String(r.name),
    list: {
      select: { id: departments.id, name: departments.name, headUserId: departments.headUserId, headName: users.fullName, sortOrder: departments.sortOrder, staffCount, subjectCount, createdAt: departments.createdAt },
      joins: (q) => q.leftJoin(users, eq(users.id, departments.headUserId)),
      search: [departments.name, users.fullName],
      filters: {
        head: { label: 'Head', options: [{ value: 'none', label: 'No head' }, { value: 'set', label: 'Has a head' }], where: (v) => (v === 'none' ? sql`${departments.headUserId} is null` : v === 'set' ? sql`${departments.headUserId} is not null` : undefined) },
      },
      sorts: { name: departments.name, head: users.fullName, staff: staffCount, subjects: subjectCount, created: departments.createdAt },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(120), column: departments.name, required: true },
      headUserId: { label: 'Head of department', type: 'select', schema: OptionalRef, column: departments.headUserId, options: headOptions, bulk: true, help: 'Staff with the HOD role' },
    },
    order: { column: departments.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, departments, departments.name, String(row.name)), head_user_id: null }),
    columns: [
      { key: 'name', header: 'Department' },
      { key: 'headName', header: 'Head' },
      { key: 'staffCount', header: 'Staff' },
      { key: 'subjectCount', header: 'Subjects' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Department', required: true, help: 'The department name; rows are matched on it', example: 'Commerce' },
        { key: 'head_email', header: 'Head email', help: "Optional: the head's email (a member of staff with the HOD role)" },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: departments.id }).from(departments).where(sql`lower(${departments.name}) = ${lc(r.get('name'))}`).limit(1))[0],
      run: async (ctx, rows) => {
        const heads = await headOptions(ctx);
        const seen = new Set<string>();
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          if (seen.has(lc(name))) fail('This row repeats an earlier row', name);
          seen.add(lc(name));
          let headUserId: string | null | undefined;
          const email = r.get('head_email').toLowerCase();
          if (email) {
            const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
            if (!u) fail('No member of staff with this email or phone', email);
            if (!heads.some((h) => h.value === u!.id)) fail('Give this person the HOD role before making them head of a department', email);
            headUserId = u!.id;
          }
          const [found] = await tx.select().from(departments).where(sql`lower(${departments.name}) = ${lc(name)}`).limit(1);
          if (!found) {
            await tx.insert(departments).values({ tenantId: ctx.p.tenantId, name, headUserId: headUserId ?? null, sortOrder: 1_000_000 });
            return outcome(true, false, [name]);
          }
          const changed = headUserId !== undefined && found.headUserId !== headUserId;
          if (changed) await tx.update(departments).set({ headUserId }).where(eq(departments.id, found.id));
          return outcome(false, changed, [name]);
        });
      },
    },
  };
}

@Injectable()
export class DepartmentRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(departmentsEntity());
  }
}
