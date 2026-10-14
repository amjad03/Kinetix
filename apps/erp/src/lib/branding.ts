import 'server-only';
import { api } from './api';
import type { PublicBranding } from './doc-designs';

/** ERP paths for an institution's public images (proxied by /api/branding/[slug]/[kind]). */
const local = (p?: string) => (p ? p.replace(/^\/v1\/public\/branding\//, '/api/branding/') : null);

/**
 * An institution's public look for the shell, sign-in and verification pages: its name, palette
 * and logo (the logo for light backgrounds, else the crest). Null when it cannot be read.
 */
export async function publicBranding(slug: string): Promise<{ name: string; logo: string | null; logoDark: string | null; favicon: string | null; palette: PublicBranding['palette'] } | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  try {
    const b = await api<PublicBranding>(`/v1/public/branding/${slug}`, { anonymous: true, timeoutMs: 4000 });
    return { name: b.name, logo: local(b.assets.logo ?? b.assets.emblem), logoDark: local(b.assets.logo_dark ?? b.assets.logo), favicon: local(b.assets.favicon), palette: b.palette };
  } catch {
    return null;
  }
}
