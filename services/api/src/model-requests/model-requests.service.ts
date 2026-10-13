import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { BoardPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { modelRequests, users } from '../db/schema.js';

export interface ModelRequestView {
  id: string;
  name: string;
  subject: string | null;
  classLevel: string | null;
  note: string | null;
  status: string;
  teacherName: string | null;
  createdAt: Date;
  /** Requests at this school for the same model (by name, ignoring case and spaces), this one included. */
  votes: number;
}

/** The same model asked for in different words of case and spacing counts as one. */
export const modelKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** 3D model requests from the boards, kept per school (tenant) for the content team. */
@Injectable()
export class ModelRequestsService {
  /** Saves a board's request (idempotent by id: the outbox may send it again). */
  async save(tx: Tx, p: BoardPrincipal, id: string, input: { name: string; subject?: string | null; classLevel?: string | null; note?: string | null }): Promise<ModelRequestView> {
    const [had] = await tx.select().from(modelRequests).where(eq(modelRequests.id, id));
    if (had && had.deviceId !== p.deviceId) throw new NotFoundException('Request not found');
    if (!had) {
      await tx.insert(modelRequests).values({
        id,
        tenantId: p.tenantId,
        campusId: p.campusId,
        deviceId: p.deviceId,
        teacherId: p.teacherId,
        name: input.name.trim(),
        subject: input.subject?.trim() || null,
        classLevel: input.classLevel?.trim() || null,
        note: input.note?.trim() || null,
      });
      await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'modelRequest.create', subjectType: 'model_request', subjectId: id });
    }
    const view = (await this.list(tx)).find((r) => r.id === id);
    if (!view) throw new NotFoundException('Request not found');
    return view;
  }

  /** Every request at the school, newest first. */
  async list(tx: Tx, limit = 500): Promise<ModelRequestView[]> {
    const rows = await tx
      .select({ r: modelRequests, teacherName: users.fullName })
      .from(modelRequests)
      .leftJoin(users, eq(users.id, modelRequests.teacherId))
      .orderBy(desc(modelRequests.createdAt))
      .limit(limit);
    const votes = new Map<string, number>();
    for (const { r } of rows) votes.set(modelKey(r.name), (votes.get(modelKey(r.name)) ?? 0) + 1);
    return rows.map(({ r, teacherName }) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      classLevel: r.classLevel,
      note: r.note,
      status: r.status,
      teacherName: teacherName ?? null,
      createdAt: r.createdAt,
      votes: votes.get(modelKey(r.name)) ?? 1,
    }));
  }
}
