import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campusEvents, clubMembers, clubs, eventRegistrations, projectMembers, researchProjects, sdgGoals, sdgTags, subjects } from '../db/schema.js';
import { found } from '../placements/placements.access.js';
import { SKILL_ADMIN, SKILL_STAFF } from './skills.access.js';

const ITEM_TYPES = ['course', 'research', 'project', 'event', 'club'] as const;
type ItemType = (typeof ITEM_TYPES)[number];
const TagBody = z.object({ sdgNumber: z.number().int().min(1).max(17), itemType: z.enum(ITEM_TYPES), itemId: z.uuid(), note: z.string().trim().max(500).default('') });

/** UN Sustainable Development Goals: the 17 goals, tagging of institution items to them, and the impact dashboard. */
@Controller('v1/sdg')
export class SdgController {
  constructor(private readonly db: DbService) {}

  @Get('goals')
  @Auth('user')
  goals(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(sdgGoals).orderBy(asc(sdgGoals.number)));
  }

  /** Tags a course (subject), research project, project, event or club to a goal. */
  @Post('tags')
  @Auth('user', SKILL_STAFF)
  tag(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TagBody)) b: z.infer<typeof TagBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const title = (await this.titles(tx, b.itemType, [b.itemId])).get(b.itemId);
      if (title === undefined) found(undefined, b.itemType === 'course' ? 'Course' : b.itemType === 'event' ? 'Event' : b.itemType === 'club' ? 'Club' : 'Project');
      const [row] = await orConflict('This item is already tagged to the goal', () => tx.insert(sdgTags).values({ tenantId: p.tenantId, ...b, taggedBy: p.userId }).returning());
      await auditUser(tx, p, 'sdg.tagged', b.itemType, b.itemId, { sdgNumber: b.sdgNumber });
      return { ...row, title };
    });
  }

  @Delete('tags/:id')
  @Auth('user', SKILL_ADMIN)
  @HttpCode(200)
  untag(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(sdgTags).where(eq(sdgTags.id, id)).returning();
      found(gone[0], 'Tag');
      await auditUser(tx, p, 'sdg.untagged', gone[0].itemType, gone[0].itemId, { sdgNumber: gone[0].sdgNumber });
      return { removed: true };
    });
  }

  /** Tags, optionally for one goal or one item, with item titles. */
  @Get('tags')
  @Auth('user', SKILL_STAFF)
  tags(@CurrentPrincipal() p: UserPrincipal, @Query('sdgNumber') sdgNumber?: string, @Query('itemType') itemType?: string, @Query('itemId') itemId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(sdgTags)
        .where(and(sdgNumber ? eq(sdgTags.sdgNumber, Number(sdgNumber)) : undefined, itemType ? eq(sdgTags.itemType, itemType) : undefined, itemId ? eq(sdgTags.itemId, itemId) : undefined))
        .orderBy(asc(sdgTags.sdgNumber), asc(sdgTags.createdAt));
      return this.withTitles(tx, rows);
    });
  }

  /**
   * The institution's impact dashboard: for each of the 17 goals the number of tagged items, the
   * people reached (club members, event attendees, student project members) and the tagged items.
   */
  @Get('dashboard')
  @Auth('user', SKILL_STAFF)
  dashboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const goals = await tx.select().from(sdgGoals).orderBy(asc(sdgGoals.number));
      const tagged = await this.withTitles(tx, await tx.select().from(sdgTags).orderBy(asc(sdgTags.createdAt)));
      const reach = await this.reach(tx, tagged);
      const perGoal = goals.map((g) => {
        const items = tagged.filter((t) => t.sdgNumber === g.number);
        const byType = Object.fromEntries(ITEM_TYPES.map((k) => [k, items.filter((i) => i.itemType === k).length]));
        return { number: g.number, name: g.name, count: items.length, byType, participation: items.reduce((s, i) => s + (reach.get(`${i.itemType}:${i.itemId}`) ?? 0), 0), items: items.map((i) => ({ id: i.id, itemType: i.itemType, itemId: i.itemId, title: i.title, note: i.note, participation: reach.get(`${i.itemType}:${i.itemId}`) ?? 0 })) };
      });
      return {
        goals: perGoal,
        totals: { tags: tagged.length, goalsCovered: perGoal.filter((g) => g.count > 0).length, distinctItems: new Set(tagged.map((t) => `${t.itemType}:${t.itemId}`)).size },
      };
    });
  }

  /** Titles by id for one item type; an id that does not exist is missing from the map. */
  private async titles(tx: Tx, type: ItemType, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows =
      type === 'course'
        ? await tx.select({ id: subjects.id, t: subjects.name }).from(subjects).where(inArray(subjects.id, ids))
        : type === 'event'
          ? await tx.select({ id: campusEvents.id, t: campusEvents.title }).from(campusEvents).where(inArray(campusEvents.id, ids))
          : type === 'club'
            ? await tx.select({ id: clubs.id, t: clubs.name }).from(clubs).where(inArray(clubs.id, ids))
            : await tx.select({ id: researchProjects.id, t: researchProjects.title }).from(researchProjects).where(inArray(researchProjects.id, ids));
    return new Map(rows.map((r) => [r.id, r.t]));
  }

  private async withTitles<T extends { itemType: string; itemId: string }>(tx: Tx, rows: T[]) {
    const names = new Map<string, string>();
    for (const type of ITEM_TYPES) {
      const found = await this.titles(tx, type, rows.filter((r) => r.itemType === type).map((r) => r.itemId));
      for (const [id, t] of found) names.set(`${type}:${id}`, t);
    }
    return rows.map((r) => ({ ...r, title: names.get(`${r.itemType}:${r.itemId}`) ?? '' }));
  }

  /** People reached per tagged item: active club members, checked-in event attendees, student members of a project. */
  private async reach(tx: Tx, tagged: { itemType: string; itemId: string }[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const ids = (type: ItemType) => [...new Set(tagged.filter((t) => t.itemType === type).map((t) => t.itemId))];
    const clubIds = ids('club');
    if (clubIds.length) {
      for (const r of await tx.select({ id: clubMembers.clubId, n: sql<number>`count(*)::int` }).from(clubMembers).where(and(inArray(clubMembers.clubId, clubIds), eq(clubMembers.status, 'active'))).groupBy(clubMembers.clubId)) out.set(`club:${r.id}`, r.n);
    }
    const eventIds = ids('event');
    if (eventIds.length) {
      for (const r of await tx.select({ id: eventRegistrations.eventId, n: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(inArray(eventRegistrations.eventId, eventIds), isNotNull(eventRegistrations.checkedInAt))).groupBy(eventRegistrations.eventId)) out.set(`event:${r.id}`, r.n);
    }
    for (const type of ['research', 'project'] as const) {
      const pids = ids(type);
      if (!pids.length) continue;
      for (const r of await tx.select({ id: projectMembers.projectId, n: sql<number>`count(*)::int` }).from(projectMembers).where(and(inArray(projectMembers.projectId, pids), isNotNull(projectMembers.studentId))).groupBy(projectMembers.projectId)) out.set(`${type}:${r.id}`, r.n);
    }
    return out;
  }
}
