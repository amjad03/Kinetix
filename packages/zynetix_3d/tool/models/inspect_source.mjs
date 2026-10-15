// Lists what is inside a source model before writing a recipe for it:
//   node inspect_source.mjs path/to/model.glb|.gltf|.stl|.obj
// Every node with a mesh (its path in the tree), each primitive's triangles,
// attributes and material (base colour, texture size), and the size of the whole.
import { ImageUtils } from '@gltf-transform/core';
import { readSource, worldPrimitives } from './lib/importer.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node inspect_source.mjs <file>');
const doc = await readSource(file);
const prims = worldPrimitives(doc);
let tris = 0;
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const p of prims) {
  const t = p.indices.length / 3;
  tris += t;
  for (let i = 0; i < p.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p.positions[i + k]);
      hi[k] = Math.max(hi[k], p.positions[i + k]);
    }
  }
  const m = p.material;
  const attrs = ['uvs', 'colors'].filter((a) => p[a]).join(',');
  const tex = m.texture ? ` tex ${ImageUtils.getSize(m.texture.data, m.texture.mime)?.join('x') ?? '?'} ${m.texture.mime}` : '';
  console.log(`${p.path.padEnd(50)} ${String(t).padStart(7)} tris  ${attrs.padEnd(10)} ${m.name ?? ''} ${m.color.map((c) => c.toFixed(2)).join(' ')}${tex}`);
}
console.log(`${prims.length} primitives, ${tris} triangles, size ${hi.map((v, k) => (v - lo[k]).toFixed(3)).join(' x ')}, min ${lo.map((v) => v.toFixed(3)).join(' ')}`);
