import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { DbService, type Tx } from '../db/db.service.js';
import { campusEvents, eventRegistrations, tenants } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { CampusLifeService } from './campus-life.service.js';

/** The public page of an open event: what, where, when, the fee and how many places are left. Registration itself happens in the KINETIX app. */
@Controller('v1/public/events/:slug')
export class PublicEventsController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly svc: CampusLifeService,
  ) {}

  private async tenant(slug: string) {
    const t = await this.system.tenantBySlug(slug);
    if (!t) throw new NotFoundException('Institution not found');
    return t;
  }

  private async view(tx: Tx, rows: (typeof campusEvents.$inferSelect)[]) {
    const counts = rows.length
      ? await tx
          .select({ eventId: eventRegistrations.eventId, n: sql<number>`count(*)::int` })
          .from(eventRegistrations)
          .where(and(inArray(eventRegistrations.eventId, rows.map((r) => r.id)), eq(eventRegistrations.status, 'registered')))
          .groupBy(eventRegistrations.eventId)
      : [];
    const taken = new Map(counts.map((c) => [c.eventId, c.n]));
    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      eventType: e.eventType,
      venue: e.venue,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      capacity: e.capacity,
      seatsLeft: Math.max(0, e.capacity - (taken.get(e.id) ?? 0)),
      feePaise: e.feePaise,
    }));
  }

  /** Upcoming published events meant for everyone. */
  @Get()
  async list(@Param('slug') slug: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      const rows = await tx
        .select()
        .from(campusEvents)
        .where(and(eq(campusEvents.status, 'published'), eq(campusEvents.audience, 'all'), gt(campusEvents.endsAt, this.svc.now())))
        .orderBy(asc(campusEvents.startsAt))
        .limit(50);
      return { institution: inst?.name ?? '', events: await this.view(tx, rows) };
    });
  }

  @Get(':id')
  async one(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      const rows = await tx.select().from(campusEvents).where(and(eq(campusEvents.id, id), eq(campusEvents.status, 'published'), eq(campusEvents.audience, 'all')));
      if (rows.length === 0) throw new NotFoundException('This event is not open to the public');
      const [event] = await this.view(tx, rows);
      return { institution: inst?.name ?? '', event };
    });
  }
}
