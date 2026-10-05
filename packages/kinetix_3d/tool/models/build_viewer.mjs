// Bundles the viewer (three.js and all) into one offline file:
// assets/viewer3d/viewer.js. Run after editing src/.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'src/viewer.js')],
  outfile: join(here, '../../assets/viewer3d/viewer.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome80', 'safari14'],
  legalComments: 'none',
  banner: { js: '/* KINETIX 3D viewer. Includes three.js (MIT License, Copyright 2010-2025 three.js authors). */' },
  logLevel: 'info',
});
