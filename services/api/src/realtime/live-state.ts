import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

/** Leaders look in on a class (live view); students attend a class the teacher took live. */
export type ViewerRole = 'leader' | 'student';

export interface ViewerInfo {
  role: ViewerRole;
  /** May hear class audio. */
  audio: boolean;
}

/**
 * Who is connected to the live classroom: board sockets (online), viewer sockets per board,
 * and boards with class audio on. Kept in process memory with one API instance and in Redis
 * when there are several, so counts and checks are the same whichever instance a socket uses.
 */
export abstract class LiveState {
  /** Returns how many sockets the board now has. */
  abstract boardConnected(deviceId: string, socketId: string): Promise<number>;
  /** Returns how many sockets the board still has. */
  abstract boardDisconnected(deviceId: string, socketId: string): Promise<number>;
  abstract isOnline(deviceIds: string[]): Promise<boolean[]>;
  abstract addViewer(deviceId: string, socketId: string, v: ViewerInfo): Promise<void>;
  abstract removeViewer(deviceId: string, socketId: string): Promise<void>;
  /** Viewer sockets of each board (socket id → viewer). */
  abstract viewers(deviceId: string): Promise<Map<string, ViewerInfo>>;
  abstract viewerCounts(deviceIds: string[]): Promise<number[]>;
  /** Returns whether the flag changed. */
  abstract setAudio(deviceId: string, on: boolean): Promise<boolean>;
  abstract isAudioOn(deviceId: string): Promise<boolean>;
  /** Shutdown: forget this instance's sockets. */
  async close(): Promise<void> {}
}

export class MemoryLiveState extends LiveState {
  private readonly online = new Map<string, Set<string>>();
  private readonly watching = new Map<string, Map<string, ViewerInfo>>();
  private readonly audio = new Set<string>();

  async boardConnected(deviceId: string, socketId: string): Promise<number> {
    const set = this.online.get(deviceId) ?? new Set<string>();
    set.add(socketId);
    this.online.set(deviceId, set);
    return set.size;
  }

  async boardDisconnected(deviceId: string, socketId: string): Promise<number> {
    const set = this.online.get(deviceId);
    set?.delete(socketId);
    if (!set?.size) this.online.delete(deviceId);
    return set?.size ?? 0;
  }

  async isOnline(deviceIds: string[]): Promise<boolean[]> {
    return deviceIds.map((id) => (this.online.get(id)?.size ?? 0) > 0);
  }

  async addViewer(deviceId: string, socketId: string, v: ViewerInfo): Promise<void> {
    const map = this.watching.get(deviceId) ?? new Map<string, ViewerInfo>();
    map.set(socketId, v);
    this.watching.set(deviceId, map);
  }

  async removeViewer(deviceId: string, socketId: string): Promise<void> {
    const map = this.watching.get(deviceId);
    map?.delete(socketId);
    if (map && map.size === 0) this.watching.delete(deviceId);
  }

  async viewers(deviceId: string): Promise<Map<string, ViewerInfo>> {
    return new Map(this.watching.get(deviceId) ?? []);
  }

  async viewerCounts(deviceIds: string[]): Promise<number[]> {
    return deviceIds.map((id) => this.watching.get(id)?.size ?? 0);
  }

  async setAudio(deviceId: string, on: boolean): Promise<boolean> {
    if (on === this.audio.has(deviceId)) return false;
    if (on) this.audio.add(deviceId);
    else this.audio.delete(deviceId);
    return true;
  }

  async isAudioOn(deviceId: string): Promise<boolean> {
    return this.audio.has(deviceId);
  }
}

const HEARTBEAT_MS = 10_000;
const INSTANCE_TTL_MS = 30_000;
/** State of a board nobody touches for a day is dropped (a safety net for crashed instances). */
const KEY_TTL_S = 24 * 3600;

/**
 * Redis: per board a hash of board sockets and a hash of viewer sockets (field = socket id,
 * value names the API instance holding the socket), and a set of boards with audio on.
 * Each instance keeps a heartbeat key alive; entries of an instance whose heartbeat has expired
 * (it crashed) are ignored and cleaned up when read, so counts recover within ~30 s.
 */
export class RedisLiveState extends LiveState {
  private readonly log = new Logger(RedisLiveState.name);
  readonly instance = randomUUID();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'kx:live:',
  ) {
    super();
    const beat = () => void this.redis.set(this.instanceKey(this.instance), '1', 'PX', INSTANCE_TTL_MS).catch((e: Error) => this.log.warn(`Heartbeat failed: ${e.message}`));
    beat();
    this.timer = setInterval(beat, HEARTBEAT_MS);
    this.timer.unref();
  }

  private instanceKey = (id: string) => `${this.prefix}instance:${id}`;
  private onlineKey = (deviceId: string) => `${this.prefix}online:${deviceId}`;
  private viewersKey = (deviceId: string) => `${this.prefix}viewers:${deviceId}`;
  private audioKey = () => `${this.prefix}audio`;

  async boardConnected(deviceId: string, socketId: string): Promise<number> {
    const key = this.onlineKey(deviceId);
    await this.redis.multi().hset(key, socketId, this.instance).expire(key, KEY_TTL_S).exec();
    return (await this.alive(key)).size;
  }

  async boardDisconnected(deviceId: string, socketId: string): Promise<number> {
    await this.redis.hdel(this.onlineKey(deviceId), socketId);
    return (await this.alive(this.onlineKey(deviceId))).size;
  }

  async isOnline(deviceIds: string[]): Promise<boolean[]> {
    return Promise.all(deviceIds.map(async (id) => (await this.alive(this.onlineKey(id))).size > 0));
  }

  async addViewer(deviceId: string, socketId: string, v: ViewerInfo): Promise<void> {
    const key = this.viewersKey(deviceId);
    await this.redis.multi().hset(key, socketId, JSON.stringify({ ...v, i: this.instance })).expire(key, KEY_TTL_S).exec();
  }

  async removeViewer(deviceId: string, socketId: string): Promise<void> {
    await this.redis.hdel(this.viewersKey(deviceId), socketId);
  }

  async viewers(deviceId: string): Promise<Map<string, ViewerInfo>> {
    const out = new Map<string, ViewerInfo>();
    for (const [socketId, raw] of await this.alive(this.viewersKey(deviceId))) {
      const { role, audio } = JSON.parse(raw) as ViewerInfo;
      out.set(socketId, { role, audio });
    }
    return out;
  }

  async viewerCounts(deviceIds: string[]): Promise<number[]> {
    return Promise.all(deviceIds.map(async (id) => (await this.alive(this.viewersKey(id))).size));
  }

  async setAudio(deviceId: string, on: boolean): Promise<boolean> {
    const n = on ? await this.redis.sadd(this.audioKey(), deviceId) : await this.redis.srem(this.audioKey(), deviceId);
    return n > 0;
  }

  async isAudioOn(deviceId: string): Promise<boolean> {
    return (await this.redis.sismember(this.audioKey(), deviceId)) === 1;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.redis.del(this.instanceKey(this.instance)).catch(() => undefined);
  }

  /** Hash entries whose instance is still alive (value is the instance id, or JSON with `i`); drops the rest. */
  private async alive(key: string): Promise<Map<string, string>> {
    const all = await this.redis.hgetall(key);
    const entries = Object.entries(all);
    if (entries.length === 0) return new Map();
    const instanceOf = (v: string) => (v.startsWith('{') ? (JSON.parse(v) as { i: string }).i : v);
    const ids = [...new Set(entries.map(([, v]) => instanceOf(v)))];
    const beats = await this.redis.mget(ids.map((id) => this.instanceKey(id)));
    const live = new Set(ids.filter((_, i) => beats[i] !== null));
    const dead = entries.filter(([, v]) => !live.has(instanceOf(v))).map(([k]) => k);
    if (dead.length) await this.redis.hdel(key, ...dead);
    return new Map(entries.filter(([, v]) => live.has(instanceOf(v))));
  }
}
