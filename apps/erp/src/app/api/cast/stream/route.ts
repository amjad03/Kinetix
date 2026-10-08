import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { io } from 'socket.io-client';
import { API_URL } from '@/lib/config';
import { CastEvents, type CastSignalData, type CastStreamMessage, type IceServer } from '@/lib/cast/events';
import { castToken, relays } from '@/lib/cast/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Screen sharing from a laptop: asks the API to cast to a board **from this server** with the person's token
 * (kept in its httpOnly cookie) and streams the answers, approval and WebRTC signalling to the page as
 * server-sent events. The page posts its own signalling to /api/cast/send. Closing the page ends the cast.
 */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('deviceId') ?? '';
  if (!UUID.test(deviceId)) return new Response('Unknown board', { status: 404 });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = await castToken();
  if (!token) return new Response('Sign in again', { status: 401 });

  const encoder = new TextEncoder();
  const conn = randomUUID();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (m: CastStreamMessage) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
      };
      const socket = io(`${API_URL}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false });
      const relay = { socket, token, castId: null as string | null };
      relays.set(conn, relay);
      const ping = setInterval(() => open && controller.enqueue(encoder.encode(': ping\n\n')), 15_000);

      const close = (final?: CastStreamMessage) => {
        if (!open) return;
        if (final) send(final);
        open = false;
        clearInterval(ping);
        relays.delete(conn);
        if (socket.connected && relay.castId) socket.emit(CastEvents.Stop, { castId: relay.castId });
        // Let the stop go out before the socket closes.
        setTimeout(() => socket.disconnect(), 100);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = () => close();

      send({ t: 'conn', conn });
      socket.on('connect', async () => {
        try {
          const ack = (await socket.timeout(10_000).emitWithAck(CastEvents.Request, { deviceId })) as { ok: boolean; error?: string; castId?: string; approved?: boolean; iceServers?: IceServer[] };
          if (!ack?.ok || !ack.castId) return close({ t: 'refused', error: ack?.error ?? 'This board cannot be cast to right now' });
          relay.castId = ack.castId;
          send({ t: 'ack', castId: ack.castId, approved: ack.approved === true, iceServers: ack.iceServers ?? [] });
        } catch {
          close({ t: 'refused', error: 'KINETIX Cloud did not answer. Try again.' });
        }
      });
      socket.on('error', (e: { message?: string }) => {
        if (e?.message === 'unauthorized') close({ t: 'refused', error: 'Your session has ended. Sign in again.' });
      });
      socket.on('connect_error', () => close({ t: 'refused', error: "Can't reach KINETIX Cloud." }));
      socket.on('disconnect', () => close({ t: 'ended', reason: 'stopped' }));
      socket.on(CastEvents.Approved, (e: { castId?: string; iceServers?: IceServer[] }) => {
        if (e?.castId === relay.castId) send({ t: 'approved', iceServers: e.iceServers ?? [] });
      });
      socket.on(CastEvents.Signal, (e: { castId?: string; data?: CastSignalData }) => {
        if (e?.castId === relay.castId && e.data) send({ t: 'signal', data: e.data });
      });
      socket.on(CastEvents.Ended, (e: { castId?: string; reason?: string }) => {
        if (e?.castId === relay.castId) close({ t: 'ended', reason: e.reason ?? 'stopped' });
      });
      req.signal.addEventListener('abort', () => close());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
