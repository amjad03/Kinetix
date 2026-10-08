import type { NextRequest } from 'next/server';
import { CastEvents, parseSend } from '@/lib/cast/events';
import { castToken, relays } from '@/lib/cast/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The page's side of a cast: its WebRTC offer and ICE candidates, or a request to stop. Only the person who opened the stream may send. */
export async function POST(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = await castToken();
  const body = parseSend(await req.json().catch(() => null));
  if (!token || !body) return new Response('Bad request', { status: 400 });
  const relay = relays.get(body.conn);
  if (!relay || relay.token !== token || !relay.castId || !relay.socket.connected) return new Response('Not connected', { status: 409 });
  if (body.kind === 'stop') relay.socket.emit(CastEvents.Stop, { castId: relay.castId });
  else relay.socket.emit(CastEvents.Signal, { castId: relay.castId, data: body.data });
  return new Response(null, { status: 204 });
}
