import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { AUTH_META, type AuthRequirement } from '../../src/auth/auth.decorators.js';
import type { RoleName } from '../../src/auth/principal.js';

/**
 * Every API route read from the Nest metadata of the running module graph (not from the source text): its method, path,
 * the @Auth principal kinds and roles, extra guards, and flags for review (docs/security/AUTHZ_MATRIX.md).
 */
export interface Route {
  method: string;
  path: string;
  controller: string;
  handler: string;
  kinds: string[] | null;
  roles: RoleName[];
  guards: string[];
  flags: string[];
  /** Whether the handler (or the service methods it calls) reads the caller's identity, so it can scope rows to them. */
  principalScoped: boolean;
}

/** Roles held by people who are not staff: anything they reach must be limited to their own records. */
export const NON_STAFF: RoleName[] = ['student', 'guardian', 'alumni', 'external_examiner'];

/**
 * Public routes and why they are public. Anything else without @Auth is a finding. Patterns match the full path.
 */
export const PUBLIC_ALLOWED: [RegExp, string][] = [
  // Every entry is anchored to its own namespace, and each must still match a public route (authz-matrix.spec):
  // a broad pattern (any path containing "webhook", "verify" or "/public/") would let a staff route that forgot
  // @Auth through unreviewed. Guarded routes (PlatformAdminGuard, the device guards) are never counted as public.
  [/^\/(health|ready|live|metrics)(\/|$)|^\/v1\/(health|ready)/, 'health and readiness probes (/metrics needs METRICS_TOKEN, constant-time)'],
  [/^\/v1\/auth\/(login|otp\/(request|verify)|mfa\/verify|sso\/(providers|start|callback|exchange))$/, 'sign-in, OTP, the MFA step (5-minute mfa token) and SSO (state, nonce, PKCE); per-IP and per-account limits, lockout'],
  [/^\/v1\/devices\/enroll$/, 'board enrolment with a one-time code (rate limited)'],
  [/^\/v1\/(fees|comms)\/webhooks\//, 'payment gateway webhooks (provider signature, timing-safe) and messaging delivery reports (per-institution secret in the path, timing-safe); every event applied once'],
  [/^\/v1\/public\//, 'public pages: certificate, degree, ID and hall-ticket verification (unguessable codes), admission forms and applicant portal (applicant token), careers, recruiters (recruiter token), disclosure, events, branding, signed pay links and BI export links; per-IP limit PUBLIC_PER_IP_PER_MINUTE'],
  [/^\/v1\/chat\/inbound$/, 'email relay and WhatsApp replies: shared x-zynetix-inbound-secret (timing-safe), signed reply address'],
  [/^\/v1\/class-notes\/:token$/, 'shared class notes: unguessable share token, revocable'],
  [/^\/v1\/content\/sims\/phet\/:id$/, 'open-licence PhET simulations (no personal data)'],
  [/^\/v1\/device-ingest\//, 'biometric attendance devices: per-device ingest key in the path or header'],
  [/^\/v1\/digilocker\/pull\/:tenantId$/, 'DigiLocker pull URI: HMAC-SHA256 signature with the client secret'],
  [/^\/v1\/library\/sip2$/, 'SIP2 self-check kiosks: SIP2 login with the kiosk credentials'],
  [/^\/v1\/lti\//, 'LTI 1.3 launches: OIDC state, nonce and platform JWKS signature'],
  [/^\/v1\/odata(\/|$)/,'OData feed for Power BI: scoped kxo. API token (hashed, revocable)'],
  [/^\/v1\/scorm\//, 'SCORM player: signed, expiring launch token'],
  [/^\/v1\/xapi\//, 'cmi5 xAPI for a sandboxed unit: one-use signed fetch link, then a signed credential for one learner and package (Basic auth)'],
  [/^\/v1\/fees\/gateway-return\/(:provider|cashfree)\/:tenantSlug$/, 'hosted-checkout browser return: the post is signature-checked like the webhook, Cashfree is re-queried with the account keys'],
  [/^\/v1\/transport\/gps\/:tenantSlug$/, 'GPS tracker webhook: per-institution shared secret'],
];

/**
 * Routes flagged by the heuristics that were read by hand and are safe, with the check that protects them.
 * A newly flagged route that is not here fails test/authz-matrix.spec.ts until someone reviews it.
 */
export const REVIEWED: [RegExp, string][] = [
  [/^\/v1\/academic-audit\/non-conformities\/:id/, 'ncAccess(): the owner or the department head only'],
  [/^\/v1\/alumni-portal\//, 'rows filtered by the alumnus (own donations, stories, sign-ups)'],
  [/^\/v1\/campus-life\/(clubs|events|media)\//, 'club and event pages visible to the whole institution; media limited to published galleries'],
  [/^\/v1\/careers\//, 'own attempts / resumes via assertCanSeeStudent'],
  [/^\/v1\/chat\/threads\/:id/, 'member(): only thread members; role and settings changes need a thread admin'],
  [/^\/v1\/content\/(courses|topics)\/:id$/, 'syllabus content shared by the institution (no personal data)'],
  [/^\/v1\/conversations\/:id/, 'conversation participants only'],
  [/^\/v1\/documents\/vault\/files\/:id/, 'canRead(): owner-visible files of the caller or their child, or a manager'],
  [/^\/v1\/evaluation\/allocations\/:id/, 'allocation must belong to the examiner'],
  [/^\/v1\/exam-sessions\/:id\/registration-window$/, 'dates of the window only (no personal data)'],
  [/^\/v1\/examiner-portal\/assignments\/:id/, 'mine(): the examiner\'s own assignment and role'],
  [/^\/v1\/grievances\//, 'complainant, assigned officer or committee only'],
  [/^\/v1\/homework\/:id/, 'teacher of the class, or the student\'s own submission'],
  [/^\/v1\/hostel\/gate-passes\/:id\/parent-/, 'guardian of the pass holder only'],
  [/^\/v1\/houses\/:id$/, 'house names and points (institution-wide)'],
  [/^\/v1\/hr\/evaluations$/, 'rater kind checked against the caller (self, student of the teacher, peer, head)'],
  [/^\/v1\/library\/topics\/:topicId\/resources$/, 'library resources (no personal data)'],
  [/^\/v1\/lms\//, 'ownAttempt() / course enrolment'],
  [/^\/v1\/parent\/children\//, 'child(): guardian of the child, or the student themself'],
  [/^\/v1\/passport\/students\//, 'assertCanSeeStudent'],
  [/^\/v1\/placements\/internships\/:id/, 'the intern or placement staff'],
  [/^\/v1\/platform\//, 'PlatformAdminGuard'],
  [/^\/v1\/projects\//, 'project members, guides and coordinators only'],
  [/^\/v1\/recordings\/:id/, 'teacher of the class or enrolled students only'],
  [/^\/v1\/records\//, 'record kit: each entity\'s read and write roles (RecordsService.assertRead/assertWrite)'],
  [/^\/v1\/recycle-bin\/:id$/, 'entries of entities the caller may write only'],
  [/^\/v1\/research\/theses\/:id$/, 'scholar, guide or research staff'],
  [/^\/v1\/users\/:id\/photo$/, 'maySee(): same class, family, or staff'],
  [/^\/v1\/welfare\/requests\/:id\/withdraw$/, 'the requester only'],
  [/^\/v1\/whiteboards\/:id/, 'the board\'s owner'],
  [/^\/v1\/year-plans\/:id\/items$/, 'the plan\'s teacher or the head of department'],
];

const METHOD_NAME: Record<number, string> = Object.fromEntries(Object.entries(RequestMethod).filter(([, v]) => typeof v === 'number').map(([k, v]) => [v, k])) as Record<number, string>;

const joinPath = (...parts: (string | string[] | undefined)[]): string => {
  const flat = parts.flatMap((p) => (Array.isArray(p) ? [p[0]] : [p])).filter((p): p is string => !!p && p !== '/');
  return ('/' + flat.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')).replace(/\/+/g, '/');
};

/** Collects every controller reachable from the root module (imports, dynamic modules, forwardRef). */
export function controllersOf(root: unknown): Function[] {
  const seen = new Set<unknown>();
  const out = new Set<Function>();
  const visit = (m: unknown) => {
    if (!m) return;
    const mod = typeof m === 'object' && m !== null && 'forwardRef' in m ? (m as { forwardRef: () => unknown }).forwardRef() : m;
    if (seen.has(mod)) return;
    seen.add(mod);
    const target = typeof mod === 'object' && mod !== null && 'module' in mod ? (mod as { module: Function }).module : (mod as Function);
    const dyn = typeof mod === 'object' && mod !== null ? (mod as { controllers?: Function[]; imports?: unknown[] }) : {};
    for (const c of [...((Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target) as Function[]) ?? []), ...(dyn.controllers ?? [])]) out.add(c);
    for (const i of [...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, target) as unknown[]) ?? []), ...(dyn.imports ?? [])]) visit(i);
  };
  visit(root);
  return [...out];
}

/** The service method bodies a handler calls (`this.svc.method(`), one level deep. */
function calledSources(ctrl: Function, handlerSrc: string): string {
  const classSrc = ctrl.toString();
  const ctorTypes: Function[] = Reflect.getMetadata('design:paramtypes', ctrl) ?? [];
  const ctor = /constructor\s*\(([^)]*)\)/.exec(classSrc)?.[1] ?? '';
  const names = ctor.split(',').map((a) => a.trim().replace(/=.*$/, '').trim()).filter(Boolean);
  let out = '';
  // The controller's own helpers (`this.member(tx, p, id)`).
  for (const m of handlerSrc.matchAll(/this\.(\w+)\(/g)) {
    const own = (ctrl.prototype as Record<string, unknown>)[m[1]];
    if (typeof own === 'function') out += own.toString();
  }
  for (const m of (handlerSrc + out).matchAll(/this\.(\w+)\.(\w+)\(/g)) {
    const idx = names.indexOf(m[1]);
    const svc = ctorTypes[idx];
    const fn = svc?.prototype?.[m[2]];
    if (typeof fn === 'function') {
      const src = fn.toString();
      out += src;
      // One more hop inside the service (private helpers that do the scoping).
      for (const h of src.matchAll(/this\.(\w+)\(/g)) {
        const inner = svc.prototype[h[1]];
        if (typeof inner === 'function') out += inner.toString();
      }
    }
  }
  return out;
}

const SCOPED = /assertCanSee\w*|assert\w*(Own|Access|Member|Participant|Guardian|Family|Child|Student)\w*|childrenOf|myStudent|ownStudent|studentIdsFor|studentsOf|\bguardians\b|\.userId\b|userId:\s*p\.|p\.userId|principal\.userId|isStaff|canSee|seesAll|visibleTo|scopeFor|forPrincipal/;

const STAFF_ONLY_PATH = /payroll|salar|payslip|\/staff\b|\/hr\/|bank|audit|export|settings|roles?\b|\/admin|impersonat|refund|write-?off|ledger|\/publish|\/lock|bulk|import/i;
const ID_PARAM = /:(\w*[iI]d|student\w*|child\w*|user\w*)\b/;

export function scanRoutes(root: unknown): Route[] {
  const routes: Route[] = [];
  for (const ctrl of controllersOf(root)) {
    const base = Reflect.getMetadata(PATH_METADATA, ctrl) as string | string[] | undefined;
    const classAuth = Reflect.getMetadata(AUTH_META, ctrl) as AuthRequirement | undefined;
    const classGuards = ((Reflect.getMetadata(GUARDS_METADATA, ctrl) as Function[]) ?? []).map((g) => g.name);
    const proto = ctrl.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      if (typeof fn !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
      const sub = Reflect.getMetadata(PATH_METADATA, fn) as string | string[] | undefined;
      if (method === undefined || sub === undefined) continue;
      const auth = (Reflect.getMetadata(AUTH_META, fn) as AuthRequirement | undefined) ?? classAuth;
      const guards = [...classGuards, ...((Reflect.getMetadata(GUARDS_METADATA, fn) as Function[]) ?? []).map((g) => g.name)];
      const path = joinPath(base, sub);
      const verb = METHOD_NAME[method] ?? String(method);
      const roles = auth?.roles ?? [];
      const handlerSrc = fn.toString();
      const principalScoped = SCOPED.test(handlerSrc) || SCOPED.test(calledSources(ctrl, handlerSrc));
      const flags: string[] = [];
      const userAny = !!auth?.kinds.includes('user') && roles.length === 0;
      const nonStaff = userAny || roles.some((r) => NON_STAFF.includes(r));
      if (!auth && !guards.length) {
        if (!PUBLIC_ALLOWED.some(([re]) => re.test(path))) flags.push('PUBLIC?');
      }
      if (nonStaff && STAFF_ONLY_PATH.test(path) && verb !== 'GET') flags.push('BROAD');
      if (nonStaff && ID_PARAM.test(path) && !principalScoped) flags.push('OWNERSHIP?');
      if (flags.some((f) => f !== 'PUBLIC?') && REVIEWED.some(([re]) => re.test(path))) flags.push('reviewed');
      routes.push({ method: verb, path, controller: ctrl.name, handler: name, kinds: auth?.kinds ?? null, roles, guards, flags, principalScoped });
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

const who = (r: Route) => {
  if (!r.kinds) return r.guards.length ? `guard: ${r.guards.join(', ')}` : 'PUBLIC';
  const k = r.kinds.filter((x) => x !== 'user');
  const u = r.kinds.includes('user') ? (r.roles.length ? [...r.roles].sort().join(', ') : 'any signed-in user') : '';
  return [u, ...k.map((x) => `${x} token`)].filter(Boolean).join('; ') + (r.guards.length ? ` (+${r.guards.join(', ')})` : '');
};

/** docs/security/AUTHZ_MATRIX.md */
export function renderMatrix(routes: Route[]): string {
  const pub = routes.filter((r) => !r.kinds && !r.guards.length);
  const flagged = routes.filter((r) => r.flags.length);
  const anyUser = routes.filter((r) => r.kinds?.includes('user') && !r.roles.length);
  const lines: string[] = [];
  lines.push('# API authorization matrix', '');
  lines.push('Generated from the Nest route metadata (`@Auth` principal kinds and roles, guards) by `test/authz/scan.ts`.');
  lines.push('Regenerate: `cd services/api && UPDATE_AUTHZ=1 ./node_modules/.bin/vitest run test/authz-matrix.spec.ts`. The test fails when this file is stale or a route is flagged `PUBLIC?`.', '');
  lines.push('## Summary', '');
  lines.push(`- Routes: ${routes.length}`);
  lines.push(`- Public (no @Auth, no guard): ${pub.length} (all on the allow list below unless flagged)`);
  lines.push(`- Any signed-in user (no role list): ${anyUser.length}; open to students and families, so each must scope to the caller`);
  lines.push(`- Flagged for review: ${flagged.length}`, '');
  lines.push('Flags: `PUBLIC?` no @Auth and not on the public allow list; `BROAD` a write on a staff-sounding path open to students, families or any user; `OWNERSHIP?` an id in the path, open to non-staff, and no sign that the handler or its service reads the caller (each was reviewed: see *Reviewed* below and docs/security/SECURITY_AUDIT.md).', '');
  lines.push('## Public routes allowed', '');
  for (const [re, why] of PUBLIC_ALLOWED) lines.push(`- \`${re.source}\`: ${why}`);
  lines.push('', '## Reviewed', '', 'Flagged routes read by hand, and what protects them. IDOR is also exercised on 40 high-risk routes by `test/idor.e2e.spec.ts`.', '');
  for (const [re, why] of REVIEWED) lines.push(`- \`${re.source}\`: ${why}`);
  lines.push('', '## Routes', '');
  lines.push('| Method | Path | Who | Flags |', '| --- | --- | --- | --- |');
  for (const r of routes) lines.push(`| ${r.method} | \`${r.path}\` | ${who(r)} | ${r.flags.join(' ')} |`);
  lines.push('');
  return lines.join('\n');
}
