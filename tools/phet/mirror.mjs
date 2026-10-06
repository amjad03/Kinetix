#!/usr/bin/env node
// Mirrors the PhET sims in the board's catalogue to our bucket in India (ap-south-1), so boards
// download them from Mumbai rather than from Colorado. See docs/operations/phet.md.
//
//   NODE_USE_ENV_PROXY=1 node tools/phet/mirror.mjs --bucket <phet-mirror-bucket> [--only id,id] [--dry-run] [--locales en,hi,kn]
//
// For each sim it downloads https://phet.colorado.edu/sims/html/<id>/latest/<id>_all.html (every
// locale in one file; the board opens it with ?locale=hi) and, with --locales, the per-locale
// <id>_<locale>.html for those the sim has, into tools/phet/.cache/mirror, then uploads them to
// s3://<bucket>/phet/<id>/ with:
//   Content-Type: text/html; charset=utf-8
//   Cache-Control: public, max-age=86400, stale-while-revalidate=604800  (a day; "latest" moves)
// It also uploads phet/LICENSE.txt (the CC BY 4.0 notice and attribution) and phet/catalogue.json,
// and writes the measured sizes to tools/phet/sizes.json for the next catalogue build.
// Needs the AWS CLI with credentials that may write the bucket (the CI deploy role does).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const bucket = opt('bucket');
const dryRun = argv.includes('--dry-run');
const only = opt('only')?.split(',');
const locales = opt('locales')?.split(',') ?? [];
const source = opt('source') ?? 'https://phet.colorado.edu/sims/html';
if (!bucket && !dryRun) {
  console.error('Usage: mirror.mjs --bucket <bucket> [--only id,id] [--locales en,hi,kn] [--dry-run]');
  process.exit(2);
}

const catalogue = JSON.parse(readFileSync(join(root, 'apps/board/assets/phet/catalogue.json'), 'utf8'));
const dir = join(here, '.cache', 'mirror');
mkdirSync(dir, { recursive: true });
const sizesFile = join(here, 'sizes.json');
const sizes = existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, 'utf8')) : {};
const CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return statSync(dest).size;
}

function upload(file, key, type = 'text/html; charset=utf-8', cache = CACHE) {
  const args = ['s3', 'cp', file, `s3://${bucket}/${key}`, '--content-type', type, '--cache-control', cache, '--only-show-errors'];
  if (dryRun) return console.log(`  aws ${args.join(' ')}`);
  execFileSync('aws', args, { stdio: 'inherit' });
}

const failed = [];
for (const sim of catalogue.sims) {
  if (only && !only.includes(sim.id)) continue;
  const files = [`${sim.id}_all.html`, ...locales.filter((l) => sim.locales.includes(l)).map((l) => `${sim.id}_${l}.html`)];
  for (const f of files) {
    try {
      const local = join(dir, f);
      const bytes = await download(`${source}/${sim.id}/latest/${f}`, local);
      if (f.endsWith('_all.html')) sizes[sim.id] = bytes;
      upload(local, `phet/${sim.id}/${f}`);
      console.log(`${f}: ${(bytes / 1e6).toFixed(1)} MB`);
    } catch (e) {
      failed.push(`${f}: ${e.message}`);
    }
  }
}

const licence = join(dir, 'LICENSE.txt');
writeFileSync(
  licence,
  `${catalogue.attribution}
https://phet.colorado.edu

The simulations under phet/ are unmodified copies of PhET Interactive Simulations, published by
the University of Colorado Boulder under the Creative Commons Attribution 4.0 International
licence: ${catalogue.licence}

KINETIX mirrors them in India so classroom boards can download them nearby. PhET and the PhET
logo are trademarks of the University of Colorado Boulder; KINETIX is not endorsed by PhET.
`,
);
upload(licence, 'phet/LICENSE.txt', 'text/plain; charset=utf-8');
upload(join(root, 'apps/board/assets/phet/catalogue.json'), 'phet/catalogue.json', 'application/json', 'public, max-age=3600');
writeFileSync(sizesFile, `${JSON.stringify(Object.fromEntries(Object.entries(sizes).sort()), null, 1)}\n`);
if (failed.length) {
  console.error(`\n${failed.length} failed:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
console.log('\nDone. Rebuild the catalogue to pick up the measured sizes: node tools/phet/build-catalogue.mjs');
