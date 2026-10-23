import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeEvents, type DeviceActionEvent, type DeviceActionType, type DeviceHealth } from '@kinetix/shared';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql, type AnyColumn } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, devices, rooms, sections, subjects, tenants, users } from '../db/schema.js';
import { deviceTelemetry } from '../db/schema-zynetix.js';
import { deviceActions } from '../db/schema-foundation.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

/** Queued actions older than this are dropped rather than run on a board that comes back much later. */
export const ACTION_TTL_MS = 24 * 3600_000;
/** An action sent live but never acknowledged is offered again after this long (the board missed it). */
const RESEND_AFTER_MS = 60_000;
export const DEFAULT_OFFLINE_HOURS = 4;

/** Disk use in percent: as reported, else from free and total storage. */
const diskPctOf = (h: Partial<DeviceHealth>): number | null =>
  h.diskPct ?? (h.storageTotalMb && h.storageFreeMb !== undefined ? Math.round((1 - h.storageFreeMb / h.storageTotalMb) * 1000) / 10 : null);

export interface ActionRequest {
  type: DeviceActionType;
  params: Record<string, unknown>;
}

/** IT's side of the fleet: what boards report and the remote actions sent to them. */
@Injectable()
export class FleetService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** A board's periodic report. The app version also updates the device record; compute figures are kept as a telemetry sample. */
  report(tenantId: string, deviceId: string, h: DeviceHealth): Promise<void> {
    const now = this.clock.now();
    return this.db.withTenant(tenantId, async (tx) => {
      await tx
        .update(devices)
        .set({ health: { ...h }, healthAt: now, lastSeenAt: now, ...(h.appVersion ? { appVersion: h.appVersion } : {}) })
        .where(eq(devices.id, deviceId));
      const compute = [h.cpuPct, h.gpuPct, h.npuPct, h.ramPct, h.diskPct, h.cpuTempC, h.gpuTempC, h.aiInferences, h.aiInferenceMs].some((v) => v !== undefined);
      if (!compute) return;
      await tx.insert(deviceTelemetry).values({
        tenantId,
        deviceId,
        at: now,
        cpuPct: h.cpuPct ?? null,
        gpuPct: h.gpuPct ?? null,
        npuPct: h.npuPct ?? null,
        ramPct: h.ramPct ?? null,
        diskPct: diskPctOf(h),
        cpuTempC: h.cpuTempC ?? null,
        gpuTempC: h.gpuTempC ?? null,
        aiInferences: h.aiInferences ?? 0,
        aiInferenceMs: h.aiInferenceMs ?? 0,
        appVersion: h.appVersion ?? null,
      });
    });
  }

  /** Every device's compute now (its last report) with on-device AI over the last 24 hours. */
  async computeStatus(tx: Tx) {
    const now = this.clock.now();
    const rows = await tx
      .select({ id: devices.id, name: devices.name, room: rooms.name, platform: devices.platform, appVersion: devices.appVersion, lastSeenAt: devices.lastSeenAt, health: devices.health, healthAt: devices.healthAt, enrolledAt: devices.enrolledAt })
      .from(devices)
      .leftJoin(rooms, eq(rooms.id, devices.roomId))
      .orderBy(asc(devices.name));
    const ids = rows.map((r) => r.id);
    const day = ids.length
      ? await tx
          .select({ deviceId: deviceTelemetry.deviceId, inferences: sql<number>`coalesce(sum(${deviceTelemetry.aiInferences}), 0)::int`, inferenceMs: sql<number>`coalesce(sum(${deviceTelemetry.aiInferenceMs}), 0)::float8` })
          .from(deviceTelemetry)
          .where(and(inArray(deviceTelemetry.deviceId, ids), gt(deviceTelemetry.at, new Date(now.getTime() - 86400_000))))
          .groupBy(deviceTelemetry.deviceId)
      : [];
    const live = await this.realtime.boardStatus(ids);
    const out = rows.map((r) => {
      const h = (r.health ?? {}) as Partial<DeviceHealth>;
      const online = (live.get(r.id)?.online ?? false) || (r.lastSeenAt != null && now.getTime() - r.lastSeenAt.getTime() < 180_000);
      const d = day.find((x) => x.deviceId === r.id);
      const inferences = d?.inferences ?? 0;
      const inferenceMs = d?.inferenceMs ?? 0;
      return {
        id: r.id,
        name: r.name,
        room: r.room,
        kind: h.deviceKind ?? 'board',
        platform: r.platform,
        enrolled: r.enrolledAt != null,
        online,
        lastSeenAt: r.lastSeenAt,
        appVersion: r.appVersion,
        os: h.os ?? null,
        osVersion: h.osVersion ?? null,
        reportedAt: r.healthAt,
        cpuPct: h.cpuPct ?? null,
        gpuPct: h.gpuPct ?? null,
        npuPct: h.npuPct ?? null,
        ramPct: h.ramPct ?? null,
        ramTotalMb: h.ramTotalMb ?? null,
        diskPct: diskPctOf(h),
        cpuTempC: h.cpuTempC ?? null,
        gpuTempC: h.gpuTempC ?? null,
        uptimeS: h.uptimeS ?? null,
        ai24h: { inferences, inferenceMs, avgMs: inferences ? Math.round(inferenceMs / inferences) : null },
      };
    });
    return { online: out.filter((d) => d.online).length, total: out.length, devices: out };
  }

  /** Compute samples per device and day or hour, in the institution's time zone. */
  async computeUsage(tx: Tx, q: { from: Date; to: Date; bucket: 'day' | 'hour'; deviceId?: string }) {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    // Inlined (not parameters) so the same expression can be selected and grouped by.
    const tz = /^[A-Za-z0-9_/+-]+$/.test(t?.tz ?? '') ? t!.tz : 'Asia/Kolkata';
    const at = sql<string>`to_char(date_trunc(${sql.raw(`'${q.bucket}'`)}, ${deviceTelemetry.at} at time zone ${sql.raw(`'${tz}'`)}), 'YYYY-MM-DD"T"HH24:MI')`;
    const avg = (c: AnyColumn) => sql<number | null>`round(avg(${c})::numeric, 1)::float8`;
    const peak = (c: AnyColumn) => sql<number | null>`max(${c})::float8`;
    const rows = await tx
      .select({
        deviceId: deviceTelemetry.deviceId,
        device: devices.name,
        at,
        samples: sql<number>`count(*)::int`,
        cpuAvg: avg(deviceTelemetry.cpuPct),
        cpuMax: peak(deviceTelemetry.cpuPct),
        gpuAvg: avg(deviceTelemetry.gpuPct),
        gpuMax: peak(deviceTelemetry.gpuPct),
        npuAvg: avg(deviceTelemetry.npuPct),
        npuMax: peak(deviceTelemetry.npuPct),
        ramAvg: avg(deviceTelemetry.ramPct),
        ramMax: peak(deviceTelemetry.ramPct),
        diskMax: peak(deviceTelemetry.diskPct),
        cpuTempMax: peak(deviceTelemetry.cpuTempC),
        gpuTempMax: peak(deviceTelemetry.gpuTempC),
        aiInferences: sql<number>`coalesce(sum(${deviceTelemetry.aiInferences}), 0)::int`,
        aiInferenceMs: sql<number>`coalesce(sum(${deviceTelemetry.aiInferenceMs}), 0)::float8`,
      })
      .from(deviceTelemetry)
      .innerJoin(devices, eq(devices.id, deviceTelemetry.deviceId))
      .where(and(gte(deviceTelemetry.at, q.from), lt(deviceTelemetry.at, q.to), q.deviceId ? eq(deviceTelemetry.deviceId, q.deviceId) : undefined))
      .groupBy(deviceTelemetry.deviceId, devices.name, at)
      .orderBy(at, devices.name);
    const totals = { aiInferences: rows.reduce((n, r) => n + r.aiInferences, 0), aiInferenceMs: rows.reduce((n, r) => n + r.aiInferenceMs, 0) };
    return { from: q.from, to: q.to, timezone: tz, bucket: q.bucket, totals, rows: rows.map((r) => ({ ...r, aiAvgMs: r.aiInferences ? Math.round(r.aiInferenceMs / r.aiInferences) : null })) };
  }

  /** Every board with its health, whether it is online and whether it has been offline longer than [hours]. */
  async fleet(tx: Tx, hours: number) {
    const now = this.clock.now();
    const rows = await tx
      .select({
        id: devices.id,
        name: devices.name,
        roomId: devices.roomId,
        room: rooms.name,
        platform: devices.platform,
        appVersion: devices.appVersion,
        enrolledAt: devices.enrolledAt,
        lastSeenAt: devices.lastSeenAt,
        health: devices.health,
        healthAt: devices.healthAt,
        locked: devices.locked,
        kioskOverride: devices.kioskOverride,
        updateChannel: devices.updateChannel,
      })
      .from(devices)
      .leftJoin(rooms, eq(rooms.id, devices.roomId))
      .orderBy(asc(devices.name));
    const ids = rows.map((r) => r.id);
    const sessions = ids.length
      ? await tx
          .select({ deviceId: boardSessions.deviceId, teacher: users.fullName, section: sections.displayName, subject: subjects.name })
          .from(boardSessions)
          .innerJoin(users, eq(users.id, boardSessions.teacherId))
          .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
          .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
          .where(and(inArray(boardSessions.deviceId, ids), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, now)))
      : [];
    const bySession = new Map(sessions.map((s) => [s.deviceId, s]));
    const live = await this.realtime.boardStatus(ids);
    const boards = rows.map((r) => {
      const online = (live.get(r.id)?.online ?? false) || (r.lastSeenAt != null && now.getTime() - r.lastSeenAt.getTime() < 180_000);
      const since = r.lastSeenAt ?? r.enrolledAt;
      const offlineHours = !r.enrolledAt || online || !since ? 0 : Math.floor(((now.getTime() - since.getTime()) / 3600_000) * 10) / 10;
      const s = bySession.get(r.id);
      return {
        ...r,
        enrolled: r.enrolledAt != null,
        online,
        offlineHours,
        alert: r.enrolledAt != null && !online && offlineHours >= hours,
        currentClass: s ? [s.subject, s.section].filter(Boolean).join(' · ') || s.teacher : null,
      };
    });
    return { offlineAlertHours: hours, alerts: boards.filter((b) => b.alert).length, boards };
  }

  /** Records an action, applies what the server owns (lock state, kiosk override, name/room) and sends it to the board. */
  async dispatch(tx: Tx, p: UserPrincipal, deviceId: string, a: ActionRequest) {
    const [d] = await tx.select({ id: devices.id, enrolledAt: devices.enrolledAt }).from(devices).where(eq(devices.id, deviceId));
    if (!d) throw new NotFoundException('Board not found');
    if (!d.enrolledAt) throw new BadRequestException('This board is not enrolled yet');

    switch (a.type) {
      case 'lock':
      case 'unlock':
        await tx.update(devices).set({ locked: a.type === 'lock' }).where(eq(devices.id, deviceId));
        break;
      case 'kiosk_policy':
        await tx.update(devices).set({ kioskOverride: a.params.enabled as boolean | null }).where(eq(devices.id, deviceId));
        break;
      case 'rename_move': {
        const roomId = a.params.roomId as string | null | undefined;
        if (roomId) {
          const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId));
          if (!room) throw new NotFoundException('Room not found');
        }
        await tx
          .update(devices)
          .set({ ...(a.params.name ? { name: a.params.name as string } : {}), ...(roomId !== undefined ? { roomId } : {}) })
          .where(eq(devices.id, deviceId));
        break;
      }
      default:
        break;
    }

    const online = (await this.realtime.boardStatus([deviceId])).get(deviceId)?.online ?? false;
    const now = this.clock.now();
    const [row] = await tx
      .insert(deviceActions)
      .values({ tenantId: p.tenantId, deviceId, type: a.type, params: a.params, requestedBy: p.userId, status: online ? 'sent' : 'queued', sentAt: online ? now : null })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `device.action.${a.type}`, subjectType: 'device', subjectId: deviceId, data: { actionId: row.id, params: a.type === 'message' ? { length: String(a.params.text ?? '').length } : a.params } });
    const event: DeviceActionEvent = { id: row.id, type: a.type, params: a.params };
    if (online) this.realtime.toDevices([deviceId], RealtimeEvents.DeviceAction, event);

    if (a.type === 'unpair') {
      // The token dies with the revocation; the board was told first and wipes its copy.
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'device.unpaired', subjectType: 'device', subjectId: deviceId });
      await tx.update(devices).set({ tokenVersion: sql`${devices.tokenVersion} + 1`, enrolledAt: null, locked: false, kioskOverride: null }).where(eq(devices.id, deviceId));
      await tx.update(deviceActions).set({ status: online ? 'done' : 'failed', error: online ? null : 'Board was offline; its token is revoked', doneAt: now }).where(eq(deviceActions.id, row.id));
    }
    return { id: row.id, status: online ? 'sent' : 'queued', online };
  }

  /** Recent actions for a board (or all boards), newest first. */
  history(tx: Tx, deviceId: string | null, limit = 50) {
    return tx
      .select({
        id: deviceActions.id,
        deviceId: deviceActions.deviceId,
        device: devices.name,
        type: deviceActions.type,
        params: deviceActions.params,
        status: deviceActions.status,
        error: deviceActions.error,
        by: users.fullName,
        createdAt: deviceActions.createdAt,
        doneAt: deviceActions.doneAt,
      })
      .from(deviceActions)
      .innerJoin(devices, eq(devices.id, deviceActions.deviceId))
      .leftJoin(users, eq(users.id, deviceActions.requestedBy))
      .where(deviceId ? eq(deviceActions.deviceId, deviceId) : undefined)
      .orderBy(desc(deviceActions.createdAt))
      .limit(Math.min(limit, 200));
  }

  /** Actions a board missed while offline (or never acknowledged). They are marked sent. */
  pending(tenantId: string, deviceId: string): Promise<DeviceActionEvent[]> {
    const now = this.clock.now();
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(deviceActions)
        .where(
          and(
            eq(deviceActions.deviceId, deviceId),
            gt(deviceActions.createdAt, new Date(now.getTime() - ACTION_TTL_MS)),
            or(eq(deviceActions.status, 'queued'), and(eq(deviceActions.status, 'sent'), sql`${deviceActions.sentAt} < ${new Date(now.getTime() - RESEND_AFTER_MS)}`)),
          ),
        )
        .orderBy(asc(deviceActions.createdAt));
      const live = rows.filter((r) => r.type !== 'unpair');
      if (live.length) await tx.update(deviceActions).set({ status: 'sent', sentAt: now }).where(inArray(deviceActions.id, live.map((r) => r.id)));
      return live.map((r) => ({ id: r.id, type: r.type as DeviceActionType, params: r.params }));
    });
  }

  async ack(tenantId: string, deviceId: string, id: string, ok: boolean, error?: string): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      await tx
        .update(deviceActions)
        .set({ status: ok ? 'done' : 'failed', error: ok ? null : (error ?? 'Failed').slice(0, 300), doneAt: this.clock.now() })
        .where(and(eq(deviceActions.id, id), eq(deviceActions.deviceId, deviceId)));
    });
  }
}
