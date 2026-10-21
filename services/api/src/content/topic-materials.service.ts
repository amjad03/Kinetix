import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, max, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import type { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { AUDIENCES, MATERIAL_KINDS, topicMaterials, type Audience } from '../db/schema-zynetix.js';
import { ANIMATIONS, isAnimation } from './animations.js';

const Url = z.url({ protocol: /^https?$/ }).max(1000);
const Base = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  url: Url.nullable().optional(),
  ref: z.string().trim().min(1).max(100).nullable().optional(),
  author: z.string().trim().max(200).nullable().optional(),
  bookChapter: z.string().trim().max(200).nullable().optional(),
  pageFrom: z.number().int().min(1).max(100_000).nullable().optional(),
  pageTo: z.number().int().min(1).max(100_000).nullable().optional(),
  language: z.enum(['en', 'hi', 'kn']).optional(),
  audience: z.array(z.enum(AUDIENCES)).min(1).max(4).optional(),
});

/** A new material: what each kind needs is checked by {@link checkMaterial}. */
export const MaterialBody = Base.extend({ kind: z.enum(MATERIAL_KINDS) });
export const MaterialEdit = Base.refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change');
export const MaterialOrder = z.object({ ids: z.array(z.uuid()).min(1).max(200) });
export const ReviewBody = z.object({ approve: z.boolean(), reason: z.string().trim().max(500).optional() });
export type MaterialInput = z.infer<typeof MaterialBody>;

/** Each kind's required fields: a link for documents, a catalogue id for an animation, a link or id for 3D models and sims. */
export function checkMaterial(m: Partial<MaterialInput> & { kind: MaterialInput['kind'] }): { title: string } {
  const need = (ok: unknown, msg: string) => {
    if (!ok) throw new BadRequestException(msg);
  };
  switch (m.kind) {
    case 'pdf':
    case 'syllabus':
    case 'link':
      need(m.url, 'Give the link (url) for this material');
      break;
    case 'book':
      need(m.title, "Give the book's title");
      break;
    case 'animation':
      need(m.ref && isAnimation(m.ref), 'Choose one of the built-in animations (ref)');
      break;
    case 'model3d':
    case 'sim':
      need(m.ref || m.url, 'Give the model or sim id (ref) or a link (url)');
      break;
  }
  if (m.pageFrom && m.pageTo && m.pageFrom > m.pageTo) throw new BadRequestException('The first page must come before the last page');
  const title = m.title ?? (m.kind === 'animation' && m.ref ? ANIMATIONS[m.ref] : undefined);
  if (!title) throw new BadRequestException('Give a title');
  return { title };
}

export const MATERIAL = {
  id: topicMaterials.id,
  topicId: topicMaterials.topicId,
  source: topicMaterials.scope,
  kind: topicMaterials.kind,
  title: topicMaterials.title,
  url: topicMaterials.url,
  ref: topicMaterials.ref,
  author: topicMaterials.author,
  bookChapter: topicMaterials.bookChapter,
  pageFrom: topicMaterials.pageFrom,
  pageTo: topicMaterials.pageTo,
  language: topicMaterials.language,
  audience: topicMaterials.audience,
  status: topicMaterials.status,
  reviewReason: topicMaterials.reviewReason,
  position: topicMaterials.position,
  createdBy: topicMaterials.createdBy,
  createdAt: topicMaterials.createdAt,
};

type Db = Tx | DbService['system'];

/** Topic materials: the global library's (platform) and the institution's own, in their set order. */
@Injectable()
export class TopicMaterialsService {
  /** A topic's materials, platform first then the institution's, each in position order. */
  list(db: Db, topicIds: string[], where?: SQL) {
    if (topicIds.length === 0) return Promise.resolve([]);
    return db
      .select({ ...MATERIAL, createdByName: users.fullName })
      .from(topicMaterials)
      .leftJoin(users, eq(users.id, topicMaterials.createdBy))
      .where(and(inArray(topicMaterials.topicId, topicIds), where))
      .orderBy(sql`${topicMaterials.scope} <> 'platform'`, asc(topicMaterials.position), asc(topicMaterials.createdAt));
  }

  /** What an app shows: approved materials meant for this audience (an administrator sees every audience). */
  visible(db: Db, topicIds: string[], audience: Audience | 'all') {
    return this.list(db, topicIds, and(eq(topicMaterials.status, 'approved'), audience === 'all' ? undefined : sql`${audience} = any(${topicMaterials.audience})`));
  }

  async add(db: Db, topicId: string, m: MaterialInput, row: { scope: 'platform' | 'institution'; tenantId: string | null; userId: string; approved: boolean; language: 'en' | 'hi' | 'kn' }) {
    const { title } = checkMaterial(m);
    const [{ last }] = await db
      .select({ last: max(topicMaterials.position) })
      .from(topicMaterials)
      .where(and(eq(topicMaterials.topicId, topicId), eq(topicMaterials.scope, row.scope)));
    const [created] = await db
      .insert(topicMaterials)
      .values({
        topicId,
        scope: row.scope,
        tenantId: row.tenantId,
        kind: m.kind,
        title,
        url: m.url ?? null,
        ref: m.ref ?? null,
        author: m.author ?? null,
        bookChapter: m.bookChapter ?? null,
        pageFrom: m.pageFrom ?? null,
        pageTo: m.pageTo ?? null,
        language: m.language ?? row.language,
        ...(m.audience ? { audience: [...new Set(m.audience)] } : {}),
        status: row.approved ? 'approved' : 'pending',
        position: (last ?? 0) + 1,
        createdBy: row.userId,
      })
      .returning(MATERIAL);
    return created;
  }

  /** Edits a material of the given scope. `asTeacher`: only their own, and the edit goes back for approval. */
  async edit(db: Db, id: string, scope: 'platform' | 'institution', b: z.infer<typeof MaterialEdit>, asTeacher: string | null) {
    const [m] = await db.select().from(topicMaterials).where(and(eq(topicMaterials.id, id), eq(topicMaterials.scope, scope)));
    if (!m) throw new NotFoundException('Material not found');
    if (asTeacher && m.createdBy !== asTeacher) throw new ForbiddenException('You can only change materials you added');
    const merged = { ...m, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) } as MaterialInput & { kind: MaterialInput['kind'] };
    const { title } = checkMaterial({ ...merged, title: merged.title });
    const set = { ...b, title, ...(b.audience ? { audience: [...new Set(b.audience)] } : {}), ...(asTeacher ? { status: 'pending' as const, reviewReason: null } : {}) };
    const [row] = await db.update(topicMaterials).set(set).where(eq(topicMaterials.id, id)).returning(MATERIAL);
    return row;
  }

  async remove(db: Db, id: string, scope: 'platform' | 'institution', asTeacher: string | null) {
    const [m] = await db.select().from(topicMaterials).where(and(eq(topicMaterials.id, id), eq(topicMaterials.scope, scope)));
    if (!m) throw new NotFoundException('Material not found');
    if (asTeacher && m.createdBy !== asTeacher) throw new ForbiddenException('You can only remove materials you added');
    await db.delete(topicMaterials).where(eq(topicMaterials.id, id));
    return m;
  }

  /** A new order for the topic's materials of one scope: each of them once. */
  async reorder(db: Db, topicId: string, scope: 'platform' | 'institution', ids: string[]) {
    const current = await db.select({ id: topicMaterials.id }).from(topicMaterials).where(and(eq(topicMaterials.topicId, topicId), eq(topicMaterials.scope, scope)));
    const set = new Set(ids);
    if (set.size !== ids.length || set.size !== current.length || current.some((c) => !set.has(c.id))) throw new BadRequestException("List each of the topic's materials once");
    for (const [i, mid] of ids.entries()) await db.update(topicMaterials).set({ position: i + 1 }).where(eq(topicMaterials.id, mid));
    return this.list(db, [topicId], eq(topicMaterials.scope, scope));
  }
}
