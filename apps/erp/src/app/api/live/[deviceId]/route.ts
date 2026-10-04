import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { io } from 'socket.io-client';
import { canSee } from '@/lib/access';
import { API_URL, SESSION_COOKIE } from '@/lib/config';
import { LiveEvents, refusalCode, type LiveFrame, type LiveWatchAck, type StreamMessage } from '@/lib/live/events';
import type { Me } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLASS_OVER = new Set(['class_ended', 'teacher_ended', 'period_over', 'idle', 'taken_over', 'admin_revoked']);

/**
 * Live view relay: watches a board on KINETIX Cloud's `/realtime` socket **from this server**
 * with the session token, and streams what arrives to the page as server-sent events.
 *
 * The user's token stays in its httpOnly cookie and never reaches the browser (as for every
 * other page), and the browser needs no route to the API. The API audits the viewing against
 * the signed-in user; closing the page (or losing it) stops the watch.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  if (!UUID.test(deviceId)) return new Response('Unknown board', { status: 404 });
  // Same-origin page requests only (EventSource from our own pages).
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  let me: Me;
  try {
    const res = await fetch(`${API_URL}/v1/me`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) return new Response('Sign in again', { status: 401 });
    if (!res.ok) return new Response('KINETIX Cloud error', { status: 502 });
    me = (await res.json()) as Me;
  } catch {
    return new Response("Can't reach KINETIX Cloud", { status: 502 });
  }
  if (!canSee(me.roles, 'live')) return new Response('Forbidden', { status: 403 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (m: StreamMessage) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
      };
      const socket = io(`${API_URL}/realtime`, {
        auth: { token },
        transports: ['websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      // Keeps proxies from closing a quiet stream.
      const ping = setInterval(() => open && controller.enqueue(encoder.encode(': ping\n\n')), 15_000);

      const close = (final?: StreamMessage) => {
        if (!open) return;
        if (final) send(final);
        open = false;
        clearInterval(ping);
        if (socket.connected) socket.emit(LiveEvents.Unwatch, { deviceId });
        // Let the unwatch go out before the socket closes.
        setTimeout(() => socket.disconnect(), 50);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = () => close();

      socket.on('connect', async () => {
        try {
          const ack = (await socket.timeout(10_000).emitWithAck(LiveEvents.Watch, { deviceId })) as LiveWatchAck;
          if (ack?.ok) send({ type: 'watching', session: ack.session ?? null });
          else close({ type: 'refused', error: ack?.error ?? 'This class cannot be watched right now', code: refusalCode(ack?.error) });
        } catch {
          close({ type: 'refused', error: 'KINETIX Cloud did not answer. Try again.', code: 'unavailable' });
        }
      });
      // The API rejects a socket whose token has expired with an `error` event, then disconnects.
      socket.on('error', (e: { message?: string }) => {
        if (e?.message === 'unauthorized') close({ type: 'refused', error: 'Your session has ended. Sign in again.', code: 'expired' });
      });
      socket.on('connect_error', () => send({ type: 'reconnecting' }));
      socket.on('disconnect', (reason) => {
        // The server closed us out (an expired token is reported by `error` first): no reconnecting.
        if (reason === 'io server disconnect') close({ type: 'refused', error: 'KINETIX Cloud closed the connection. Try again.', code: 'unavailable' });
        else send({ type: 'reconnecting' });
      });
      socket.on(LiveEvents.Frame, (frame: LiveFrame) => {
        if (frame?.deviceId === deviceId) send({ type: 'frame', frame });
      });
      socket.on(LiveEvents.Ended, (e: { deviceId?: string; reason?: string }) => {
        if (e?.deviceId !== deviceId) return;
        const reason = e.reason ?? 'class_ended';
        // An offline board keeps its viewers: it streams again (with a snapshot) when it is back.
        if (CLASS_OVER.has(reason)) close({ type: 'ended', reason });
        else send({ type: 'offline' });
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
      // no-transform: keeps compression from buffering the stream.
      'cache-control': 'no-cache, no-store, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
