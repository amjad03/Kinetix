// Writes a model as a compact GLB: one node per part (named by its id),
// quantized and meshopt-compressed (the viewer bundles the decoder). Parts
// taken from other people's models keep their look: normals, UVs, vertex
// colours and the colour texture (made at most [maxTexture] pixels across).
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { normals } from './mesh.mjs';

const hex = (c) => {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};

/** A texture at most [max] pixels across: JPEG, or PNG where it has see-through pixels. */
async function shrink(texture, max) {
  const img = sharp(Buffer.from(texture.data));
  const meta = await img.metadata();
  const alpha = meta.hasAlpha && (await img.stats()).channels[3]?.min < 250;
  const resized = img.resize(max, max, { fit: 'inside', withoutEnlargement: true });
  const data = alpha ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return { data, mime: alpha ? 'image/png' : 'image/jpeg' };
}

/**
 * [parts]: [{id, mesh, color, rich?}] in metres; [rich] is a mesh from
 * lib/importer.mjs (its own normals, UVs, colours and material). Returns the GLB bytes.
 */
export async function writeGlb(parts, { maxTexture = 1024 } = {}) {
  await MeshoptEncoder.ready;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('model');
  const textures = new Map();
  for (const p of parts) {
    // A part with several textures has one primitive per texture (the viewer joins them again).
    const list = Array.isArray(p.rich) ? p.rich : [p.rich];
    const mesh = doc.createMesh(p.id);
    for (const [i, r] of list.entries()) {
      const id = list.length > 1 ? `${p.id}-${i}` : p.id;
      const geo = r || p.mesh;
      const position = doc.createAccessor(`${id}-position`).setType('VEC3').setArray(geo.positions).setBuffer(buffer);
      const normal = doc.createAccessor(`${id}-normal`).setType('VEC3').setArray(r?.normals || normals(geo)).setBuffer(buffer);
      const indices = doc.createAccessor(`${id}-indices`).setType('SCALAR').setArray(geo.indices).setBuffer(buffer);
      const prim = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normal).setIndices(indices);
      const material = doc.createMaterial(id);
      if (r) {
        const m = r.material;
        material.setBaseColorFactor(m.color).setRoughnessFactor(m.roughness ?? 0.6).setMetallicFactor(m.metalness ?? 0).setDoubleSided(!!m.doubleSided);
        if (m.alpha && m.alpha !== 'OPAQUE') material.setAlphaMode(m.alpha);
        if (r.uvs && m.texture) {
          prim.setAttribute('TEXCOORD_0', doc.createAccessor(`${id}-uv`).setType('VEC2').setArray(r.uvs).setBuffer(buffer));
          const key = m.texture.source || m.texture.data;
          if (!textures.has(key)) {
            const small = await shrink(m.texture, p.maxTexture ?? maxTexture);
            textures.set(key, doc.createTexture(`${id}-colour`).setImage(new Uint8Array(small.data)).setMimeType(small.mime));
          }
          material.setBaseColorTexture(textures.get(key));
        }
        if (r.colors) prim.setAttribute('COLOR_0', doc.createAccessor(`${id}-colour`).setType('VEC4').setArray(r.colors).setBuffer(buffer));
      } else {
        material.setBaseColorFactor(hex(p.color)).setRoughnessFactor(0.55).setMetallicFactor(0);
      }
      prim.setMaterial(material);
      mesh.addPrimitive(prim);
    }
    scene.addChild(doc.createNode(p.id).setMesh(mesh));
  }
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizeTexcoord: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return io.writeBinary(doc);
}
