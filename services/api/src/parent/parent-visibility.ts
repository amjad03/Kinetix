import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { students } from '../db/schema.js';
import { parentVisibility } from '../db/schema-pathways.js';

/** The parts of a child's record an institution can switch off for parents. Staff and the student always see their own. */
export const VISIBILITY_SECTIONS = ['attendance', 'diary', 'report_card', 'behaviour', 'activities', 'health'] as const;
export type VisibilitySection = (typeof VISIBILITY_SECTIONS)[number];

export const VISIBILITY_LABELS: Record<VisibilitySection, string> = {
  attendance: 'Attendance',
  diary: 'Class diary',
  report_card: 'Report card',
  behaviour: 'Behaviour and discipline',
  activities: 'Clubs, events and house',
  health: 'Health record',
};

/** Reads and enforces the per-institution parent visibility switches. */
@Injectable()
export class ParentVisibilityService {
  async settings(tx: Tx): Promise<Record<VisibilitySection, boolean>> {
    const rows = await tx.select().from(parentVisibility);
    return Object.fromEntries(VISIBILITY_SECTIONS.map((s) => [s, rows.find((r) => r.section === s)?.visible ?? true])) as Record<VisibilitySection, boolean>;
  }

  /** Whether the caller is looking only as a parent (a student or staff member looking at the same data is not held back). */
  private async parentOnly(tx: Tx, p: UserPrincipal): Promise<boolean> {
    if (!p.roles.includes('guardian')) return false;
    if (p.roles.some((r) => r !== 'guardian')) return false;
    const [own] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    return !own;
  }

  /** Whether the caller may see the section: always for staff and students, per the switch for parents. */
  async allowed(tx: Tx, p: UserPrincipal, section: VisibilitySection): Promise<boolean> {
    if (!(await this.parentOnly(tx, p))) return true;
    return (await this.settings(tx))[section];
  }

  /** Refuses a parent who asks for a section the institution has switched off. */
  async assert(tx: Tx, p: UserPrincipal, section: VisibilitySection): Promise<void> {
    if (!(await this.allowed(tx, p, section))) throw new ForbiddenException({ message: `The school has not made ${VISIBILITY_LABELS[section].toLowerCase()} available to parents`, code: 'PARENT_VISIBILITY_OFF' });
  }
}

@Global()
@Module({ providers: [ParentVisibilityService], exports: [ParentVisibilityService] })
export class ParentVisibilityModule {}
