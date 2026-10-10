'use server';

import { optStr, send } from '@/lib/ops-server';

const PAGE = '/sso';
type V = Record<string, string>;
const lines = (s: string | undefined) => (s ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export async function saveProvider(v: V) {
  return send(
    '/v1/admin/sso/providers',
    {
      kind: v.kind,
      name: v.name,
      clientId: v.clientId,
      clientSecret: v.clientSecret,
      ...(optStr(v.directoryId) ? { directoryId: v.directoryId } : {}),
      ...(optStr(v.issuer) ? { issuer: v.issuer } : {}),
      allowedDomains: lines(v.domains),
      redirectAllowlist: lines(v.redirects),
    },
    PAGE,
  );
}

export async function toggleProvider(id: string, enabled: boolean) {
  return send(`/v1/admin/sso/providers/${encodeURIComponent(id)}`, { enabled }, PAGE, 'PATCH');
}

export async function removeProvider(id: string) {
  return send(`/v1/admin/sso/providers/${encodeURIComponent(id)}`, undefined, PAGE, 'DELETE');
}
