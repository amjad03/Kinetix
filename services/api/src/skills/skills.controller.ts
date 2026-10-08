import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { clubs, courseOutcomes, skillEvidence, skillMaps, skills, students, subjects } from '../db/schema.js';
import { found } from '../placements/placements.access.js';
import { SKILL_ADMIN, SKILL_STAFF } from './skills.access.js';
import { EVENT_TYPES, MAP_KINDS, SKILL_CATEGORIES, type MapKind } from './skills.logic.js';

const SkillBody = z.object({ code: z.string().trim().min(2).max(40), name: z.string().trim().min(2).max(120), category: z.enum(SKILL_CATEGORIES).default('skill'), description: z.string().trim().max(2000).default('') });
const SkillPatch = z.object({ name: z.string().trim().min(2).max(120), category: z.enum(SKILL_CATEGORIES), description: z.string().trim().max(2000), active: z.boolean() }).partial();
const MapBody = z.object({ kind: z.enum(MAP_KINDS), ref: z.string().trim().max(80).optional() });
const EvidenceBody = z.object({ studentId: z.uuid(), level: z.number().int().min(1).max(5), title: z.string().trim().min(2).max(160), note: z.string().trim().max(2000).default('') });

/** Sources that need no reference (all placements, all internships, all research projects). */
const NO_REF: MapKind[] = ['placement', 'internship', 'research'];

/** The skill framework: skills with a category, the sources that evidence them, and evidence staff record by hand. */
@Controller('v1/skills')
export class SkillsController {
  constructor(private readonly db: DbService) {}

  @Post()
  @Auth('user', SKILL_ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SkillBody)) b: z.infer<typeof SkillBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A skill with this code already exists', () => tx.insert(skills).values({ tenantId: p.tenantId, ...b, code: b.code.toUpperCase() }).returning());
      await auditUser(tx, p, 'skill.created', 'skill', row.id, { code: row.code });
      return row;
    });
  }

  @Patch(':id')
  @Auth('user', SKILL_ADMIN)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SkillPatch)) b: z.infer<typeof SkillPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(skills).set(b).where(eq(skills.id, id)).returning();
      found(row, 'Skill');
      await auditUser(tx, p, 'skill.updated', 'skill', id, b);
      return row;
    });
  }

  /** Every skill with how many sources are mapped to it and how many manual entries exist. */
  @Get()
  @Auth('user', SKILL_STAFF)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(skills).orderBy(asc(skills.name));
      const maps = await tx.select({ skillId: skillMaps.skillId, n: sql<number>`count(*)::int` }).from(skillMaps).groupBy(skillMaps.skillId);
      const manual = await tx.select({ skillId: skillEvidence.skillId, n: sql<number>`count(*)::int` }).from(skillEvidence).groupBy(skillEvidence.skillId);
      return rows.map((s) => ({ ...s, sources: maps.find((m) => m.skillId === s.id)?.n ?? 0, manualEvidence: manual.find((m) => m.skillId === s.id)?.n ?? 0 }));
    });
  }

  /** One skill with its mapped sources, named. */
  @Get(':id')
  @Auth('user', SKILL_STAFF)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const skill = found((await tx.select().from(skills).where(eq(skills.id, id)))[0], 'Skill');
      const maps = await tx.select().from(skillMaps).where(eq(skillMaps.skillId, id)).orderBy(asc(skillMaps.kind));
      return { ...skill, maps: await Promise.all(maps.map(async (m) => ({ id: m.id, kind: m.kind, ref: m.ref, label: await this.label(tx, m.kind as MapKind, m.ref) }))) };
    });
  }

  /** Maps a source to the skill: a subject, course outcome or club (by id), an event type, or all placements, internships, research or certificates. */
  @Post(':id/maps')
  @Auth('user', SKILL_ADMIN)
  addMap(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MapBody)) b: z.infer<typeof MapBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: skills.id }).from(skills).where(eq(skills.id, id)))[0], 'Skill');
      const ref = b.ref ?? '';
      await this.checkRef(tx, b.kind, ref);
      const [row] = await orConflict('This source is already mapped to the skill', () => tx.insert(skillMaps).values({ tenantId: p.tenantId, skillId: id, kind: b.kind, ref }).returning());
      await auditUser(tx, p, 'skill.mapped', 'skill', id, { kind: b.kind, ref });
      return { ...row, label: await this.label(tx, b.kind, ref) };
    });
  }

  @Delete(':id/maps/:mapId')
  @Auth('user', SKILL_ADMIN)
  @HttpCode(200)
  removeMap(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('mapId', ParseUUIDPipe) mapId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(skillMaps).where(and(eq(skillMaps.id, mapId), eq(skillMaps.skillId, id))).returning({ id: skillMaps.id });
      found(gone[0], 'Mapping');
      await auditUser(tx, p, 'skill.unmapped', 'skill', id, { mapId });
      return { removed: true };
    });
  }

  /** A staff member records evidence the system cannot see (a project, a talk, a mentor's observation). */
  @Post(':id/evidence')
  @Auth('user', SKILL_STAFF)
  addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EvidenceBody)) b: z.infer<typeof EvidenceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: skills.id }).from(skills).where(and(eq(skills.id, id), eq(skills.active, true))))[0], 'Skill');
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      const [row] = await tx.insert(skillEvidence).values({ tenantId: p.tenantId, skillId: id, ...b, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'skill.evidence_recorded', 'skill', id, { studentId: b.studentId, level: b.level });
      return row;
    });
  }

  @Get(':id/evidence')
  @Auth('user', SKILL_STAFF)
  evidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: skillEvidence.id, studentId: skillEvidence.studentId, fullName: students.fullName, rollNo: students.rollNo, level: skillEvidence.level, title: skillEvidence.title, note: skillEvidence.note, createdAt: skillEvidence.createdAt })
        .from(skillEvidence)
        .innerJoin(students, eq(students.id, skillEvidence.studentId))
        .where(eq(skillEvidence.skillId, id))
        .orderBy(asc(skillEvidence.createdAt)),
    );
  }

  @Delete('evidence/:evidenceId')
  @Auth('user', SKILL_ADMIN)
  @HttpCode(200)
  removeEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(skillEvidence).where(eq(skillEvidence.id, evidenceId)).returning({ id: skillEvidence.id, skillId: skillEvidence.skillId });
      found(gone[0], 'Evidence');
      await auditUser(tx, p, 'skill.evidence_removed', 'skill', gone[0].skillId, { evidenceId });
      return { removed: true };
    });
  }

  private async checkRef(tx: Tx, kind: MapKind, ref: string) {
    if (NO_REF.includes(kind)) {
      if (ref) throw new BadRequestException(`A ${kind} mapping takes no reference`);
      return;
    }
    if (kind === 'certificate') {
      if (ref && !z.uuid().safeParse(ref).success) throw new BadRequestException('Use a certificate template id, or leave it empty for any certificate');
      return;
    }
    if (kind === 'event_type') {
      if (!(EVENT_TYPES as readonly string[]).includes(ref)) throw new BadRequestException('Pick an event type');
      return;
    }
    if (!z.uuid().safeParse(ref).success) throw new BadRequestException('A reference id is needed');
    const table = kind === 'subject' ? subjects : kind === 'course_outcome' ? courseOutcomes : clubs;
    found((await tx.select({ id: table.id }).from(table).where(eq(table.id, ref)))[0], kind === 'course_outcome' ? 'Course outcome' : kind === 'subject' ? 'Subject' : 'Club');
  }

  private async label(tx: Tx, kind: MapKind, ref: string): Promise<string> {
    if (kind === 'subject') return (await tx.select({ n: subjects.name }).from(subjects).where(eq(subjects.id, ref)))[0]?.n ?? '';
    if (kind === 'course_outcome') {
      const c = (await tx.select({ code: courseOutcomes.code, statement: courseOutcomes.statement }).from(courseOutcomes).where(eq(courseOutcomes.id, ref)))[0];
      return c ? `${c.code}: ${c.statement}` : '';
    }
    if (kind === 'club') return (await tx.select({ n: clubs.name }).from(clubs).where(eq(clubs.id, ref)))[0]?.n ?? '';
    return ref;
  }
}
