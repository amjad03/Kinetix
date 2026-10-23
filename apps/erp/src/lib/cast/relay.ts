import 'server-only';
import { cookies } from 'next/headers';
import type { Socket } from 'socket.io-client';
import { CAST_COOKIE, CAST_GUEST_COOKIE, SESSION_COOKIE } from '@/lib/config';
import { parseGuestCookie, type GuestCast } from './events';

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

/** The guest who joined with the board's code, while their token lasts. */
export async function castGuest(): Promise<GuestCast | null> {
  return parseGuestCookie((await cookies()).get(CAST_GUEST_COOKIE)?.value);
}

/** Who casts from this browser: a guest (board code) first, else the signed-in person. */
export async function castCredential(): Promise<{ token: string; guest: GuestCast | null } | undefined> {
  const guest = await castGuest();
  if (guest) return { token: guest.token, guest };
  const token = await castToken();
  return token ? { token, guest: null } : undefined;
}
