'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { optStr, send } from '@/lib/ops-server';

const PAGE = '/communication';
type V = Record<string, string>;
const whole = (s: string | undefined) => (s && s.trim() ? Number(s) : 0);

/** Saves a channel's registration (DLT entity id and header, WhatsApp number id, from-address), price and caps. */
export async function saveChannel(channel: string, v: V) {
  if (!['sms', 'whatsapp', 'email', 'push'].includes(channel)) return { ok: false as const, error: (await getI18n()).t('msg.err.unknown') };
  return send(
    `/v1/comms/channels/${channel}`,
    { enabled: v.enabled !== 'no', senderId: (v.senderId ?? '').trim(), dltEntityId: (v.dltEntityId ?? '').trim(), unitCostPaise: whole(v.unitCostPaise), hourlyLimit: whole(v.hourlyLimit), dailyLimit: whole(v.dailyLimit), lowBalanceUnits: whole(v.lowBalanceUnits) },
    PAGE,
    'PUT',
  );
}

/** Adds bought credits, or corrects the balance with a reason. `amountPaise` comes from a rupee field. */
export async function topUpCredits(v: V) {
  const units = Number(v.units);
  revalidatePath('/communication/credits');
  return send('/v1/comms/credits', { channel: v.channel, kind: v.kind === 'adjust' ? 'adjust' : 'topup', units: v.kind === 'adjust' && v.direction === 'remove' ? -Math.abs(units) : Math.abs(units), amountPaise: whole(v.amountPaise), reference: optStr(v.reference) ?? '', note: optStr(v.note) ?? '' }, PAGE);
}

/** Records a person's choice made on paper or by phone. */
export async function recordPreference(v: V) {
  return send('/v1/comms/preferences/record', { userId: v.userId, channel: v.channel, granted: v.granted !== 'no', note: v.note ?? '' }, '/communication/consent');
}
