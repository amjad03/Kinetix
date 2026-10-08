import 'server-only';
import { cookies } from 'next/headers';
import type { Socket } from 'socket.io-client';
import { CAST_COOKIE, SESSION_COOKIE } from '@/lib/config';

interface Relay {
  socket: Socket;
  token: string;
  castId: string | null;
}

/** The open cast connections of this server process, by the id the page was given. Use one ERP instance per cast (sticky routing) when scaled out. */
export const relays = new Map<string, Relay>();

/** The token a cast uses: the cast sign-in's, or an ERP session (a principal may cast too). */
export async function castToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CAST_COOKIE)?.value ?? jar.get(SESSION_COOKIE)?.value;
}
