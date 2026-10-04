var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RealtimeGateway_1;
import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, } from '@nestjs/websockets';
import { RealtimeEvents } from '@kinetix/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AuthGuard } from '../auth/auth.guard.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, sections, students, subjects, tenants, users } from '../db/schema.js';
export const deviceRoom = (deviceId) => `device:${deviceId}`;
const liveRoom = (deviceId) => `live:${deviceId}`;
/** Who may look into a classroom (when the institution has live view turned on). */
export const LIVE_VIEW_ROLES = ['principal', 'tenant_admin', 'hod'];
/** Largest live frame relayed; bigger ones (a huge paste) wait for the next snapshot. */
const MAX_FRAME_EVENTS = 5000;
/**
 * Socket.IO namespace `/realtime`.
 *
 * - Boards connect with their device (or board-session) token and join their own room for
 *   pairing, session and broadcast events.
 * - School leaders connect with their user token to watch a class live: the board streams
 *   its ink as lesson events only while someone is watching, and the server relays them.
 *   Every viewing is audited, and the board can show that it is being viewed.
 *
 * TODO: add the Redis adapter before running more than one API instance (the viewer counts
 * below are per process).
 */
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    constructor(auth, db, clock) {
        this.auth = auth;
        this.db = db;
        this.clock = clock;
        this.log = new Logger(RealtimeGateway_1.name);
        /** Open sockets per device, for the dashboard's "online" indicator. */
        this.connected = new Map();
        /** Viewer sockets per watched device, and whether each is a school leader or a student. */
        this.viewers = new Map();
    }
    isOnline(deviceId) {
        return (this.connected.get(deviceId) ?? 0) > 0;
    }
    viewerCount(deviceId) {
        return this.viewers.get(deviceId)?.size ?? 0;
    }
    async handleConnection(socket) {
        try {
            const token = socket.handshake.auth?.token;
            if (typeof token !== 'string')
                throw new Error('missing token');
            const principal = await this.auth.resolve(token);
            socket.data.principal = principal;
            if (principal.kind === 'user') {
                if (!principal.roles.some((r) => LIVE_VIEW_ROLES.includes(r) || r === 'student'))
                    throw new Error('role cannot watch classes');
                socket.data.watches = new Map();
                socket.emit('ready', { userId: principal.userId });
                return;
            }
            await socket.join(deviceRoom(principal.deviceId));
            this.connected.set(principal.deviceId, (this.connected.get(principal.deviceId) ?? 0) + 1);
            socket.emit('ready', { deviceId: principal.deviceId });
            // Reconnected while people are watching: carry on streaming.
            if (this.viewerCount(principal.deviceId) > 0)
                await this.tellBoard(principal.tenantId, principal.deviceId, true);
        }
        catch (e) {
            this.log.debug(`Rejected socket: ${e.message}`);
            socket.emit('error', { message: 'unauthorized' });
            socket.disconnect(true);
        }
    }
    async handleDisconnect(socket) {
        const principal = socket.data.principal;
        if (!principal)
            return;
        if (principal.kind === 'user') {
            for (const deviceId of [...(socket.data.watches?.keys() ?? [])]) {
                // Also runs during shutdown, when the database may already be closed.
                await this.unwatch(socket, deviceId).catch((e) => this.log.warn(`Unwatch failed: ${e.message}`));
            }
            return;
        }
        const id = principal.deviceId;
        const n = (this.connected.get(id) ?? 1) - 1;
        if (n <= 0) {
            this.connected.delete(id);
            this.server.to(liveRoom(id)).emit(RealtimeEvents.LiveEnded, { deviceId: id, reason: 'offline' });
        }
        else
            this.connected.set(id, n);
    }
    toDevices(deviceIds, event, payload) {
        if (deviceIds.length === 0)
            return;
        this.server.to(deviceIds.map(deviceRoom)).emit(event, payload);
    }
    /** Tells viewers a class is over (called when a board session ends). */
    liveEnded(deviceId, reason) {
        this.server?.to(liveRoom(deviceId)).emit(RealtimeEvents.LiveEnded, { deviceId, reason });
    }
    async watch(socket, body) {
        const p = socket.data.principal;
        if (p?.kind !== 'user')
            return { ok: false, error: 'Only school leaders and students can watch classes' };
        const deviceId = body?.deviceId;
        if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId))
            return { ok: false, error: 'Unknown board' };
        const role = p.roles.some((r) => LIVE_VIEW_ROLES.includes(r)) ? 'leader' : 'student';
        const found = await this.db.withTenant(p.tenantId, async (tx) => {
            const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants);
            if (role === 'leader' && !tenant?.settings.liveViewEnabled)
                return { error: 'Live view is turned off for your institution' };
            const [device] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
            if (!device)
                return { error: 'Unknown board' };
            const [session] = await tx
                .select({
                teacher: users.fullName,
                section: sections.displayName,
                sectionId: boardSessions.sectionId,
                subject: subjects.name,
                startedAt: boardSessions.startedAt,
                liveForClass: boardSessions.liveForClass,
            })
                .from(boardSessions)
                .innerJoin(users, eq(users.id, boardSessions.teacherId))
                .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
                .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
                .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
            if (!session)
                return { error: 'No class is being taught on this board right now' };
            if (role === 'student') {
                const [me] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
                if (!me || me.sectionId !== session.sectionId)
                    return { error: 'This is not your class' };
                if (!session.liveForClass)
                    return { error: 'Your teacher has not started a live class' };
            }
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: role === 'leader' ? 'live_view.start' : 'live_class.join', subjectType: 'device', subjectId: deviceId });
            const { sectionId: _s, liveForClass: _l, ...shown } = session;
            return { session: { ...shown, startedAt: session.startedAt.toISOString() } };
        });
        if ('error' in found)
            return { ok: false, error: found.error };
        if (!this.isOnline(deviceId))
            return { ok: false, error: 'This board is offline' };
        const watches = socket.data.watches;
        if (!watches.has(deviceId)) {
            watches.set(deviceId, { deviceId, since: Date.now(), role });
            await socket.join(liveRoom(deviceId));
            const set = this.viewers.get(deviceId) ?? new Map();
            set.set(socket.id, role);
            this.viewers.set(deviceId, set);
        }
        await this.tellBoard(p.tenantId, deviceId, true);
        return { ok: true, session: found.session };
    }
    /** The teacher stopped the live class: students watching are sent away; leaders stay. */
    async endClassLive(tenantId, deviceId) {
        for (const [socketId, role] of [...(this.viewers.get(deviceId) ?? [])]) {
            if (role !== 'student')
                continue;
            // This gateway is a namespace, so its socket table is keyed by socket id.
            const socket = this.server.sockets.get(socketId);
            if (!socket)
                continue;
            socket.emit(RealtimeEvents.LiveEnded, { deviceId, reason: 'live_off' });
            await this.unwatch(socket, deviceId).catch(() => undefined);
        }
        await this.tellBoard(tenantId, deviceId, false).catch(() => undefined);
    }
    async unwatchMessage(socket, body) {
        if (typeof body?.deviceId === 'string')
            await this.unwatch(socket, body.deviceId);
        return { ok: true };
    }
    /** From the board: relayed to whoever is watching it. */
    frame(socket, body) {
        const p = socket.data.principal;
        if (!p || p.kind === 'user' || this.viewerCount(p.deviceId) === 0)
            return;
        if (!body || !Array.isArray(body.events) || body.events.length > MAX_FRAME_EVENTS)
            return;
        socket.to(liveRoom(p.deviceId)).emit(RealtimeEvents.LiveFrame, { ...body, deviceId: p.deviceId });
    }
    async unwatch(socket, deviceId) {
        const p = socket.data.principal;
        const watches = socket.data.watches;
        const w = watches?.get(deviceId);
        if (!w || p.kind !== 'user')
            return;
        watches.delete(deviceId);
        await socket.leave(liveRoom(deviceId));
        const set = this.viewers.get(deviceId);
        set?.delete(socket.id);
        if (set && set.size === 0)
            this.viewers.delete(deviceId);
        if (w.role === 'student') {
            await this.tellBoard(p.tenantId, deviceId, false);
            return;
        }
        await this.db
            .withTenant(p.tenantId, (tx) => audit(tx, {
            tenantId: p.tenantId,
            actorType: 'user',
            actorId: p.userId,
            action: 'live_view.end',
            subjectType: 'device',
            subjectId: deviceId,
            data: { seconds: Math.round((Date.now() - w.since) / 1000) },
        }))
            .catch((e) => this.log.warn(`Audit failed: ${e.message}`));
        await this.tellBoard(p.tenantId, deviceId, false);
    }
    /** Viewer count to the board; a new viewer also needs a full snapshot. */
    async tellBoard(tenantId, deviceId, wantSnapshot) {
        const [tenant] = await this.db.withTenant(tenantId, (tx) => tx.select({ settings: tenants.settings }).from(tenants));
        const roles = [...(this.viewers.get(deviceId)?.values() ?? [])];
        const event = {
            count: roles.length,
            leaders: roles.filter((r) => r === 'leader').length,
            students: roles.filter((r) => r === 'student').length,
            indicator: tenant?.settings.liveViewIndicator ?? true,
        };
        this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveViewers, event);
        if (wantSnapshot && event.count > 0)
            this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveSnapshotRequest, {});
    }
};
__decorate([
    WebSocketServer(),
    __metadata("design:type", Function)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    SubscribeMessage(RealtimeEvents.LiveWatch),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "watch", null);
__decorate([
    SubscribeMessage(RealtimeEvents.LiveUnwatch),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "unwatchMessage", null);
__decorate([
    SubscribeMessage(RealtimeEvents.LiveFrame),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "frame", null);
RealtimeGateway = RealtimeGateway_1 = __decorate([
    WebSocketGateway({ namespace: '/realtime', cors: { origin: true } }),
    __metadata("design:paramtypes", [AuthGuard,
        DbService,
        Clock])
], RealtimeGateway);
export { RealtimeGateway };
//# sourceMappingURL=realtime.gateway.js.map