// A pretend classroom board for the live-view tests: enrols a new board through the API,
// pairs a teacher, and answers the API's snapshot requests with lesson events, as the
// KINETIX Board app does (services/api/test/helpers.ts pairBoard).
import { io, type Socket } from 'socket.io-client';
import { PASSWORD, TENANT } from './helpers';

export const API_URL = (process.env.KINETIX_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function apiLogin(login: string): Promise<string> {
  return (await call<{ accessToken: string }>('/v1/auth/login', { body: { tenant: TENANT, login, password: PASSWORD } })).accessToken;
}

export interface SimBoard {
  id: string;
  name: string;
  socket: Socket;
  /** The lesson events sent as the snapshot when someone starts watching. */
  snapshot: unknown[][];
  /** Ink sent right after the snapshot. */
  events: unknown[][];
  /** Sends more ink to whoever is watching. */
  draw(events: unknown[][]): void;
  /** Turns class audio on or off, as the teacher does on the board. */
  setAudio(on: boolean): Promise<void>;
  /** Sends one chunk of class audio (base64 IMA ADPCM, `LiveAudioChunk`). */
  sendAudio(seq: number, data: string): void;
  /** Ends the class from the board. */
  endClass(): Promise<void>;
  close(): void;
}

/** A new board, enrolled and with `teacher` signed in on it (an ad-hoc class). */
export async function startBoard(opts: { name: string; adminToken: string; teacherToken: string; snapshot?: unknown[][]; events?: unknown[][] }): Promise<SimBoard> {
  const structure = await call<{ campuses: { id: string }[] }>('/v1/admin/structure', { token: opts.adminToken });
  const created = await call<{ id: string; enrollmentCode: string }>('/v1/devices', { token: opts.adminToken, body: { name: opts.name, campusId: structure.campuses[0].id } });
  const { deviceToken } = await call<{ deviceToken: string }>('/v1/devices/enroll', { body: { code: created.enrollmentCode, platform: 'android' } });

  const socket = io(`${API_URL}/realtime`, { auth: { token: deviceToken }, transports: ['websocket'] });
  await new Promise((r) => socket.once('ready', r));
  const { code } = await call<{ code: string }>('/v1/devices/me/pairing-codes', { token: deviceToken, body: {} });
  const claimed = new Promise<{ sessionToken: string }>((r) => socket.once('pairing.claimed', r));
  await call('/v1/pairing/claim', { token: opts.teacherToken, body: { code } });
  const { sessionToken } = await claimed;

  const board: SimBoard = {
    id: created.id,
    name: opts.name,
    socket,
    snapshot: opts.snapshot ?? [[0, 'L', [[]], 0]],
    events: opts.events ?? [],
    draw: (events) => socket.emit('live.frame', { events }),
    setAudio: async (on) => {
      await socket.timeout(5000).emitWithAck('live.audio.state', { on });
    },
    sendAudio: (seq, data) => socket.emit('live.audio', { seq, rate: 16000, codec: 'ima-adpcm', data }),
    endClass: async () => {
      await call('/v1/sessions/current/end', { token: sessionToken, body: {} });
    },
    close: () => socket.disconnect(),
  };
  socket.on('live.snapshot.request', () => {
    socket.emit('live.frame', { snapshot: { canvas: { w: 1920, h: 1080 }, background: 'plain', events: board.snapshot }, events: board.events });
  });
  return board;
}

/** A few strokes in the lesson format: a heading underline, a highlighter, an arrow. */
export const SAMPLE_INK: unknown[][] = [
  [0, 'a', 1, { t: 'pen', c: 0xff0b57d0, w: 6, p: [200, 200, 400, 220, 600, 210, 800, 230] }],
  [0, 'a', 2, { t: 'highlighter', c: 0xfffbbc04, w: 8, p: [200, 320, 900, 320] }],
  [0, 'a', 3, { t: 'shape', c: 0xffd93025, w: 5, s: 'arrow', p: [300, 600, 900, 500] }],
];
