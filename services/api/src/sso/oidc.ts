import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';

/** OpenID Connect pieces: PKCE, the authorization URL, and id_token verification against the provider's JWKS. */

const b64u = (b: Buffer) => b.toString('base64url');

export interface Pkce { verifier: string; challenge: string }
export function newPkce(): Pkce {
  const verifier = b64u(randomBytes(48));
  return { verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) };
}
export const newNonce = () => b64u(randomBytes(16));

export interface ProviderEndpoints {
  kind: 'google' | 'microsoft' | 'generic';
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

/** The well-known endpoints for Google Workspace and Microsoft Entra (a directory id is needed for Entra). */
export function presetEndpoints(kind: 'google' | 'microsoft', directoryId?: string): ProviderEndpoints {
  if (kind === 'google') {
    return { kind, issuer: 'https://accounts.google.com', authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token', jwksUri: 'https://www.googleapis.com/oauth2/v3/certs' };
  }
  const t = directoryId?.trim() || 'organizations';
  return {
    kind,
    // With the multi-tenant "organizations" authority the issuer carries each user's own directory id.
    issuer: t === 'organizations' ? 'https://login.microsoftonline.com/{tenantid}/v2.0' : `https://login.microsoftonline.com/${t}/v2.0`,
    authorizationEndpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
    jwksUri: `https://login.microsoftonline.com/${t}/discovery/v2.0/keys`,
  };
}

export function authorizationUrl(p: { endpoint: string; clientId: string; redirectUri: string; scopes: string; state: string; nonce: string; challenge: string; loginHint?: string; hostedDomain?: string }): string {
  const u = new URL(p.endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('scope', p.scopes);
  u.searchParams.set('state', p.state);
  u.searchParams.set('nonce', p.nonce);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (p.loginHint) u.searchParams.set('login_hint', p.loginHint);
  if (p.hostedDomain) u.searchParams.set('hd', p.hostedDomain);
  return u.toString();
}

export interface IdClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  tid?: string;
}

interface Jwk { kid?: string; kty: string; n?: string; e?: string; alg?: string; use?: string }
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

async function jwks(uri: string, force = false): Promise<Jwk[]> {
  const hit = jwksCache.get(uri);
  if (hit && !force && Date.now() - hit.at < 10 * 60_000) return hit.keys;
  const res = await fetch(uri, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`The sign-in provider's keys could not be read (${res.status})`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  jwksCache.set(uri, { at: Date.now(), keys });
  return keys;
}

/** Checks the signature (RS256 only), issuer, audience, expiry and nonce of an id_token and returns its claims. */
export async function verifyIdToken(token: string, o: { jwksUri: string; issuer: string; clientId: string; nonce: string; now: Date }): Promise<IdClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('The id token is malformed');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error('Unsupported id token algorithm');
  let keys = await jwks(o.jwksUri);
  let jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) {
    keys = await jwks(o.jwksUri, true);
    jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  }
  if (!jwk) throw new Error('The id token was signed with an unknown key');
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('The id token signature is wrong');
  const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdClaims;
  const issuer = o.issuer.includes('{tenantid}') ? o.issuer.replace('{tenantid}', c.tid ?? '') : o.issuer;
  if (c.iss !== issuer) throw new Error('The id token is from a different issuer');
  if (!(Array.isArray(c.aud) ? c.aud : [c.aud]).includes(o.clientId)) throw new Error('The id token is for a different application');
  if (!c.exp || c.exp * 1000 < o.now.getTime() - 60_000) throw new Error('The id token has expired');
  if (!c.nonce || c.nonce !== o.nonce) throw new Error('The id token nonce does not match');
  return c;
}

/** The address a claims set vouches for: email (verified when the provider says so), else Entra's preferred_username or upn. */
export function claimEmail(c: IdClaims): string | null {
  const verified = c.email_verified === undefined ? true : c.email_verified === true || c.email_verified === 'true';
  const e = (c.email && verified ? c.email : (c.email === undefined ? (c.preferred_username ?? c.upn) : undefined)) ?? null;
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e.toLowerCase() : null;
}
