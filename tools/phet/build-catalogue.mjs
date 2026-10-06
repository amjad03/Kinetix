#!/usr/bin/env node
// Builds the board's bundled PhET catalogue (apps/board/assets/phet/catalogue.json) and its
// small thumbnails (apps/board/assets/phet/thumbs/<id>.jpg). Reproducible: the same sources
// give the same file. See docs/operations/phet.md.
//
//   NODE_USE_ENV_PROXY=1 node tools/phet/build-catalogue.mjs [--offline] [--no-thumbs]
//
// Sources, in order:
//  1. PhET's public metadata (https://phet.colorado.edu/services/metadata/1.3/simulations),
//     for the published HTML5 sims, their titles in every locale and their locales.
//  2. If that is unreachable: PhET's open-source repositories on GitHub. The sims are
//     perennial/data/active-sims that have translations in phetsims/babel (i.e. are published);
//     English titles from each sim's strings file, hi/kn titles and the locale list from babel.
// Subjects, topics, keywords and our class levels (6–12, UG) always come from
// tools/phet/classification.json (PhET's grade bands are American; ours follow the Indian
// syllabus). Sizes come from tools/phet/sizes.json, which mirror.mjs writes after measuring the
// real files; until a sim has been mirrored its size is an estimate and marked so.
//
// Needs Node 22+, git and ImageMagick (`convert`) for thumbnails.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, 'apps/board/assets/phet');
const cache = join(here, '.cache');
const args = new Set(process.argv.slice(2));
const LOCALES = ['en', 'hi', 'kn'];
const LEVELS = ['6', '7', '8', '9', '10', '11', '12', 'UG'];
const SUBJECTS = ['physics', 'chemistry', 'biology', 'maths', 'earth-science'];
/** Until mirror.mjs has measured a sim: a typical _all.html (PhET sims are 2–10 MB). */
const ESTIMATED_BYTES = 6_000_000;

mkdirSync(cache, { recursive: true });

async function get(url, { binary = false } = {}) {
  if (args.has('--offline')) throw new Error('offline');
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Fetches through a file cache under tools/phet/.cache (ignored by git). */
async function cached(name, url, opts) {
  const f = join(cache, name.replaceAll('/', '__'));
  if (existsSync(f)) return opts?.binary ? readFileSync(f) : readFileSync(f, 'utf8');
  const body = await get(url, opts);
  writeFileSync(f, body);
  return body;
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        results[k] = await fn(items[k], k);
      }
    }),
  );
  return results;
}

/** Source 1: PhET's metadata service. */
async function fromMetadata() {
  const meta = JSON.parse(await get('https://phet.colorado.edu/services/metadata/1.3/simulations?format=json&type=html&summary'));
  const sims = new Map();
  for (const project of meta.projects ?? []) {
    for (const sim of project.simulations ?? []) {
      const titles = {};
      const locales = new Set();
      for (const ls of sim.localizedSimulations ?? []) {
        locales.add(ls.locale);
        titles[ls.locale] = ls.title;
      }
      if (titles.en) sims.set(sim.name, { titles, locales: [...locales].sort() });
    }
  }
  return { source: 'phet-metadata-1.3', sims };
}

/** Source 2: GitHub (perennial + babel + each sim's English strings). */
async function fromGitHub() {
  const active = (await cached('active-sims', 'https://raw.githubusercontent.com/phetsims/perennial/main/data/active-sims'))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const babel = join(cache, 'babel');
  if (!existsSync(babel)) execFileSync('git', ['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--no-checkout', 'https://github.com/phetsims/babel.git', babel]);
  const files = execFileSync('git', ['-C', babel, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n');
  const localesOf = new Map();
  for (const f of files) {
    const m = /^([a-z0-9-]+)\/\1-strings_([A-Za-z_]+)\.json$/.exec(f);
    if (!m) continue;
    if (!localesOf.has(m[1])) localesOf.set(m[1], new Set(['en']));
    localesOf.get(m[1]).add(m[2]);
  }
  const ids = active.filter((id) => localesOf.has(id)).sort();
  const sims = new Map();
  await pool(ids, 8, async (id) => {
    const titles = {};
    const title = (json) => JSON.parse(json)[`${id}.title`]?.value?.trim();
    try {
      titles.en = title(await cached(`${id}-en.json`, `https://raw.githubusercontent.com/phetsims/${id}/main/${id}-strings_en.json`));
    } catch {
      /* not a sim with a title */
    }
    if (!titles.en) return;
    for (const l of ['hi', 'kn']) {
      if (!localesOf.get(id).has(l)) continue;
      const t = title(await cached(`${id}-${l}.json`, `https://raw.githubusercontent.com/phetsims/babel/main/${id}/${id}-strings_${l}.json`));
      if (t) titles[l] = t;
    }
    sims.set(id, { titles, locales: [...localesOf.get(id)].sort() });
  });
  return { source: 'github-phetsims', sims };
}

async function thumbnail(id) {
  const dest = join(out, 'thumbs', `${id}.jpg`);
  if (existsSync(dest) || args.has('--no-thumbs')) return existsSync(dest);
  const urls = [`https://phet.colorado.edu/sims/html/${id}/latest/${id}-600.png`, `https://raw.githubusercontent.com/phetsims/${id}/main/assets/${id}-screenshot.png`];
  for (const [k, url] of urls.entries()) {
    try {
      const png = await cached(`${id}-thumb-${k}.png`, url, { binary: true });
      const src = join(cache, `${id}-thumb-${k}.png`);
      // 160 × 105, the sims' 1024 × 672 shape; small JPEGs keep ~130 sims well under 1 MB.
      execFileSync('convert', [src, '-strip', '-resize', '160x105^', '-gravity', 'center', '-extent', '160x105', '-quality', '70', dest]);
      return true;
    } catch {
      /* try the next source */
    }
  }
  return false;
}

/** "9-12" or "11-UG" → ['9', '10', '11', '12']; an array is taken as it is. */
function levelRange(levels, id) {
  if (Array.isArray(levels)) return levels;
  const [a, b = a] = String(levels).split('-');
  const i = LEVELS.indexOf(a), j = LEVELS.indexOf(b);
  if (i < 0 || j < i) throw new Error(`${id}: bad levels ${levels}`);
  return LEVELS.slice(i, j + 1);
}

const classification = JSON.parse(readFileSync(join(here, 'classification.json'), 'utf8'));
const sizes = existsSync(join(here, 'sizes.json')) ? JSON.parse(readFileSync(join(here, 'sizes.json'), 'utf8')) : {};

let found;
try {
  found = await fromMetadata();
} catch (e) {
  console.warn(`PhET metadata unreachable (${e.message}); building from GitHub.`);
  found = await fromGitHub();
}

for (const [id, c] of Object.entries(classification)) if (c?.exclude) found.sims.delete(id);
const missing = [...found.sims.keys()].filter((id) => !classification[id]);
if (missing.length) {
  console.error(`Classify these sims in tools/phet/classification.json first:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

mkdirSync(join(out, 'thumbs'), { recursive: true });
const ids = [...found.sims.keys()].sort();
const thumbs = await pool(ids, 6, thumbnail);
const sims = ids.map((id, k) => {
  const s = found.sims.get(id);
  const c = classification[id];
  const levels = levelRange(c.levels, id);
  if (!SUBJECTS.includes(c.subject)) throw new Error(`${id}: unknown subject ${c.subject}`);
  return {
    id,
    title: Object.fromEntries(LOCALES.filter((l) => s.titles[l]).map((l) => [l, s.titles[l]])),
    subject: c.subject,
    topics: c.topics,
    levels,
    keywords: c.keywords ?? [],
    locales: s.locales,
    sizeBytes: sizes[id] ?? ESTIMATED_BYTES,
    ...(sizes[id] ? {} : { sizeEstimated: true }),
    thumb: thumbs[k] ? `assets/phet/thumbs/${id}.jpg` : null,
  };
});

writeFileSync(
  join(out, 'catalogue.json'),
  `${JSON.stringify(
    {
      source: found.source,
      attribution: 'PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0',
      licence: 'https://creativecommons.org/licenses/by/4.0/',
      file: '{id}_all.html',
      sims,
    },
    null,
    1,
  )}\n`,
);
console.log(`${sims.length} sims (${found.source}); ${thumbs.filter(Boolean).length} thumbnails.`);
