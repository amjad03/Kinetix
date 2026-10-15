#!/usr/bin/env node
// Signs in to the ERP as each demo login and loads every sidebar page; prints any page that errors.
// Usage: node scripts/demo-crawl.mjs [erpUrl] [apiUrl]
import { readFileSync } from 'node:fs';
const ERP = process.argv[2] ?? 'http://localhost:3000';
const API = process.argv[3] ?? 'http://localhost:4000';
const nav = readFileSync(new URL('../apps/erp/src/lib/nav.ts', import.meta.url), 'utf8');
const routes = [...new Set([...nav.matchAll(/href: '(\/[^']*)'/g)].map((m) => m[1]))];
const logins = [
  ['soundarya', 'principal@soundarya.demo.zynetix.in'],
  ['soundarya', 'hod.commerce@soundarya.demo.zynetix.in'],
  ['soundarya', 'accounts@soundarya.demo.zynetix.in'],
  ['soundarya', 'controller@soundarya.demo.zynetix.in'],
  ['vidyaniketan', 'principal@vidyaniketan.demo.zynetix.in'],
  ['vidyaniketan', 'accounts@vidyaniketan.demo.zynetix.in'],
  ['vidyaniketan', 'controller@vidyaniketan.demo.zynetix.in'],
  ['vidyaniketan', 'hod.science@vidyaniketan.demo.zynetix.in'],
];
const only = process.env.ONLY;
let bad = 0;
let total = 0;
let skippedForRole = 0;
for (const [tenant, login] of logins) {
  if (only && !login.includes(only)) continue;
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant, login, password: 'zynetix123' }) });
  const body = await r.json();
  const token = body.accessToken ?? body.access_token;
  if (!token) { console.log(`LOGIN FAILED ${login}: ${r.status} ${JSON.stringify(body).slice(0, 200)}`); bad++; continue; }
  const extra = (process.env.EXTRA ?? '').split(',').filter(Boolean);
  for (const path of [...routes, ...extra]) {
    total++;
    const t0 = Date.now();
    let res, html;
    try {
      res = await fetch(ERP + path, { headers: { cookie: `kx_session=${token}` }, redirect: 'manual' });
      html = await res.text();
    } catch (e) { console.log(`ERR  ${login} ${path} ${e.message}`); bad++; continue; }
    const ms = Date.now() - t0;
    const redirect = res.status >= 300 && res.status < 400 ? res.headers.get('location') : '';
    // A digest marks a server error; NEXT_HTTP_ERROR_FALLBACK (403/404) and redirects are a page the role may not open.
    const digests = [...html.matchAll(/(?:data-dgst=|\\?"digest\\?":\\?)"([^"\\]+)/g)].map((m) => m[1]).filter((d) => !/NEXT_HTTP_ERROR_FALLBACK|NEXT_REDIRECT|NEXT_NOT_FOUND/.test(d));
    const denied = /NEXT_HTTP_ERROR_FALLBACK;40[34]/.test(html) || (res.status >= 300 && res.status < 400);
    if (denied) { skippedForRole++; continue; }
    const broken = res.status >= 500 || res.status === 404 || digests.length > 0 || html.includes('id="__next_error__"');
    if (broken) { bad++; console.log(`FAIL ${res.status} ${login} ${path} ${[...new Set(digests)].slice(0, 3).join(',')}`); }
    else if (ms > 8000) console.log(`SLOW ${ms}ms ${login} ${path}`);
  }
}
console.log(`\n${total} page loads, ${skippedForRole} not open to that role, ${bad} failures`);
process.exitCode = bad ? 1 : 0;
