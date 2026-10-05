// Writes a model as a compact GLB: one node per part (named by its id),
// quantized and meshopt-compressed (the viewer bundles the decoder).
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { normals } from './mesh.mjs';

const hex = (c) => {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};

/** [parts]: [{id, mesh, color}] in metres. Returns the GLB bytes. */
export async function writeGlb(parts) {
  await MeshoptEncoder.ready;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('model');
  for (const p of parts) {
    const position = doc.createAccessor(`${p.id}-position`).setType('VEC3').setArray(p.mesh.positions).setBuffer(buffer);
    const normal = doc.createAccessor(`${p.id}-normal`).setType('VEC3').setArray(normals(p.mesh)).setBuffer(buffer);
    const indices = doc.createAccessor(`${p.id}-indices`).setType('SCALAR').setArray(p.mesh.indices).setBuffer(buffer);
    const material = doc.createMaterial(p.id).setBaseColorFactor(hex(p.color)).setRoughnessFactor(0.55).setMetallicFactor(0);
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normal).setIndices(indices).setMaterial(material);
    const mesh = doc.createMesh(p.id).addPrimitive(prim);
    scene.addChild(doc.createNode(p.id).setMesh(mesh));
  }
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return io.writeBinary(doc);
}
