import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { projectMembers, researchProjects, students } from '../db/schema.js';

/** Staff who see and manage every project. */
export const PROJECT_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'research_coordinator', 'hod'];
/** Everyone who can take part in a project workspace. */
export const PROJECT_PARTICIPANTS: RoleName[] = [...PROJECT_ADMIN, 'teacher', 'student'];

export const hasAny = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));

/** The caller's own student record, if they are a student. */
export async function ownStudent(tx: Tx, p: UserPrincipal) {
  const [s] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.userId, p.userId));
  return s;
}

export type ProjectRole = 'admin' | 'pi' | 'supervisor' | 'member';

/** The caller's part in a project, or null when they have none (404 for the project then). */
export async function projectRole(tx: Tx, p: UserPrincipal, projectId: string): Promise<{ project: typeof researchProjects.$inferSelect; role: ProjectRole | null; studentId?: string }> {
  const [project] = await tx.select().from(researchProjects).where(eq(researchProjects.id, projectId));
  if (!project) throw new NotFoundException('Project not found');
  const stu = await ownStudent(tx, p);
  if (hasAny(p, PROJECT_ADMIN)) return { project, role: 'admin', studentId: stu?.id };
  if (project.piUserId === p.userId) return { project, role: 'pi', studentId: stu?.id };
  const members = await tx.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
  const mine = members.find((m) => m.userId === p.userId || (stu && m.studentId === stu.id));
  if (!mine) return { project, role: null, studentId: stu?.id };
  return { project, role: mine.role === 'supervisor' || mine.role === 'co_supervisor' ? 'supervisor' : 'member', studentId: stu?.id };
}

/** A participant of the project, or 404. */
export async function requireParticipant(tx: Tx, p: UserPrincipal, projectId: string) {
  const r = await projectRole(tx, p, projectId);
  if (!r.role) throw new NotFoundException('Project not found');
  return { ...r, role: r.role };
}

/** A mentor (PI, supervisor or staff admin), or 403/404. */
export async function requireMentor(tx: Tx, p: UserPrincipal, projectId: string) {
  const r = await requireParticipant(tx, p, projectId);
  if (r.role === 'member') throw new ForbiddenException('Only the project mentor can do this');
  return r;
}

