import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { io } from 'socket.io-client';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Attendance changes as they happen: listens to the signed-in user's `/realtime` socket on this server (the token stays in its
 * httpOnly cookie) and passes each `attendance.updated` on to the page as a server-sent event, so the attendance page can refresh.
 */
export async function GET(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (data: unknown) => open && controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const socket = io(`${API_URL}/realtime`, { auth: { token }, transports: ['websocket'], reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
      const ping = setInterval(() => open && controller.enqueue(encoder.encode(': ping\n\n')), 15_000);
      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        socket.disconnect();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = close;
      socket.on('ready', () => send({ type: 'ready' }));
      socket.on('attendance.updated', (e: { date?: string; sectionId?: string | null }) => send({ type: 'attendance', date: e?.date ?? null, sectionId: e?.sectionId ?? null }));
      socket.on('error', (e: { message?: string }) => {
        if (e?.message === 'unauthorized') close();
      });
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-store, no-transform', 'x-accel-buffering': 'no', connection: 'keep-alive' } });
}
