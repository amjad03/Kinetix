// Development: triangles per part of a built model (node count_tris.mjs heart).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../assets/viewer3d/models');
for (const id of process.argv.slice(2)) {
  const doc = await io.read(join(dir, `${id}.glb`));
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    let n = 0;
    for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    total += n;
    console.log(id, mesh.getName(), n);
  }
  console.log(id, 'total', total);
}
