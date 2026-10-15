// Writes the app's catalogue of narrated scenes (lib/src/viewer/scene_catalogue_data.dart)
// from the scene scripts in src/scenes, so the app and the page tell the same story:
//
//   node write_scenes.mjs          write it
//   node write_scenes.mjs --check  fail if it is out of date (tests run this)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes } from './src/scenes/index.js';

const here = dirname(fileURLToPath(import.meta.url));
export const target = join(here, '../../lib/src/viewer/scene_catalogue_data.dart');

const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, '\\n')}'`;
const text = (t) => `LocalText({${['en', 'hi', 'kn'].filter((l) => t?.[l] != null).map((l) => `'${l}': ${str(t[l])}`).join(', ')}})`;
const list = (xs, f = str) => `[${xs.map(f).join(', ')}]`;

export function dart() {
  const out = [
    '// Written by tool/models/write_scenes.mjs from the scene scripts in tool/models/src/scenes.',
    '// Do not edit by hand: change the script and run `node write_scenes.mjs`.',
    "part of 'scenes.dart';",
    '',
    '/// Every narrated scene ([ProcessScene.all]).',
    'const processScenes = <ProcessScene>[',
  ];
  for (const { script: s } of Object.values(scenes)) {
    out.push('  ProcessScene(');
    out.push(`    id: ${str(s.id)},`);
    out.push(`    subject: ${str(s.subject)},`);
    out.push(`    classes: ${list(s.classes || [], String)},`);
    out.push(`    keywords: ${list(s.keywords || [])},`);
    out.push(`    title: ${text(s.title)},`);
    out.push(`    summary: ${text(s.summary)},`);
    out.push('    groups: [');
    for (const g of s.groups || []) out.push(`      ViewerGroup(${str(g.id)}, ${text(g.name)}),`);
    out.push('    ],');
    out.push('    parts: [');
    for (const p of s.parts) {
      out.push(`      ViewerPart(id: ${str(p.id)}, group: ${str(p.group || '')}, color: ${str(p.color || '#888888')}, name: ${text(p.name)}, info: ${text(p.info || {})}),`);
    }
    out.push('    ],');
    out.push('    steps: [');
    for (const st of s.steps) {
      out.push('      ProcessSceneStep(');
      out.push(`        id: ${str(st.id)},`);
      out.push(`        stage: ${str(st.stage || '')},`);
      out.push(`        seconds: ${Number(st.seconds).toFixed(1)},`);
      out.push(`        title: ${text(st.title)},`);
      out.push(`        caption: ${text(st.caption)},`);
      if (st.highlight?.length) out.push(`        highlight: ${list(st.highlight)},`);
      if (st.labels?.length) out.push(`        labels: ${list(st.labels)},`);
      out.push('      ),');
    }
    out.push('    ],');
    out.push('  ),');
  }
  out.push('];', '');
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = dart();
  if (process.argv.includes('--check')) {
    let have = '';
    try {
      have = readFileSync(target, 'utf8');
    } catch {}
    if (have !== want) {
      console.error('scene_catalogue_data.dart is out of date: run node tool/models/write_scenes.mjs');
      process.exit(1);
    }
    console.log('scene catalogue up to date');
  } else {
    writeFileSync(target, want);
    console.log(`wrote ${target} (${Object.keys(scenes).length} scenes)`);
  }
}
