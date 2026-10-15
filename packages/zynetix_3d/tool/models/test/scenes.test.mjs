// Smoke tests for the narrated scenes (src/scenes), in node without a browser:
// every script is complete in three languages, every builder builds, every
// step poses without an error, and no stage goes over the triangle budget a
// mid-range Android panel can draw at 60 fps.
//
//   cd tool/models && node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The builders paint textures on canvases: a stand-in 2D context that draws nothing.
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
  set: () => true,
});
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? { width: 1, height: 1, getContext: () => ctx2d, style: {} } : { style: {}, append() {}, appendChild() {} }),
};

const THREE = await import('three');
const { scenes } = await import('../src/scenes/index.js');
const { dart, target } = await import('../write_scenes.mjs');

const LANGS = ['en', 'hi', 'kn'];

/** A built model's geometry per part, as the page's loadModel gives it (read with glTF-Transform). */
async function loadModel(id) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const dir = new URL('../../../assets/viewer3d/models/', import.meta.url);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(new URL(`${id}.glb`, dir).pathname);
  const manifest = JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
  const geometries = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const arr = new Float32Array(pos.getCount() * 3);
      const e = [];
      for (let i = 0; i < pos.getCount(); i++) arr.set(pos.getElement(i, e), i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const idx = prim.getIndices();
      if (idx) g.setIndex(Array.from(idx.getArray()));
      g.applyMatrix4(m);
      g.computeVertexNormals();
      geometries[node.getName() || mesh.getName()] = g;
    }
  }
  return { manifest, geometries };
}
const BUDGET = 150000; // triangles a stage may draw at once

/** What a scene's builder gets from the runtime, without a page. */
function fakeKit(script) {
  const root = new THREE.Group();
  const stages = new Map();
  const parts = new Map();
  const markers = [];
  const k = {
    THREE,
    root,
    quality: 'high',
    script,
    stage(id) {
      if (!stages.has(id)) {
        const g = new THREE.Group();
        g.name = id;
        root.add(g);
        stages.set(id, g);
      }
      return stages.get(id);
    },
    part(id, object) {
      assert.ok(script.parts.some((p) => p.id === id), `${script.id}: part ${id} is in the script`);
      assert.ok(object.parent, `${script.id}: part ${id} is in the scene`);
      parts.set(id, object);
      return object;
    },
    marker(id, parent, at) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6));
      parent.add(m);
      markers.push(() => at(new THREE.Vector3()));
      return k.part(id, m);
    },
    loadModel,
  };
  return { k, root, stages, parts, markers };
}

/** Triangles drawn for [o] and what is visible under it. */
function triangles(o) {
  let n = 0;
  o.traverseVisible((x) => {
    if (!x.isMesh) return;
    const g = x.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += tris * (x.isInstancedMesh ? x.count : 1);
  });
  return n;
}

const text3 = (t, what) => {
  for (const l of LANGS) assert.ok(typeof t?.[l] === 'string' && t[l].trim().length > 0, `${what} in ${l}`);
};

test('the app\'s catalogue is written from these scripts', () => {
  assert.equal(readFileSync(target, 'utf8'), dart(), 'run node write_scenes.mjs');
});

for (const [id, mod] of Object.entries(scenes)) {
  const s = mod.script;
  test(`${id}: the script is complete in English, Hindi and Kannada`, () => {
    assert.equal(s.id, id);
    text3(s.title, 'title');
    text3(s.summary, 'summary');
    const parts = new Set(s.parts.map((p) => p.id));
    assert.equal(parts.size, s.parts.length, 'part ids are unique');
    for (const p of s.parts) text3(p.name, `part ${p.id}`);
    assert.ok(s.steps.length >= 5);
    const ids = new Set();
    for (const st of s.steps) {
      assert.ok(!ids.has(st.id), `step ${st.id} once`);
      ids.add(st.id);
      text3(st.title, `${st.id} title`);
      text3(st.caption, `${st.id} caption`);
      assert.ok(/[ऀ-ॿ]/.test(st.caption.hi), `${st.id}: Hindi in Devanagari`);
      assert.ok(/[ಀ-೿]/.test(st.caption.kn), `${st.id}: Kannada in Kannada script`);
      assert.ok(st.seconds >= 4 && st.seconds <= 30, `${st.id} length`);
      assert.ok(st.stage, `${st.id} stage`);
      for (const v of [st.camera.pos, st.camera.target]) assert.ok(Array.isArray(v) && v.length === 3 && v.every(Number.isFinite), `${st.id} camera`);
      assert.ok(new THREE.Vector3(...st.camera.pos).distanceTo(new THREE.Vector3(...st.camera.target)) > 0.1, `${st.id}: the camera is not on its target`);
      for (const p of [...(st.highlight || []), ...(st.labels || [])]) assert.ok(parts.has(p), `${st.id} names ${p}`);
    }
  });

  test(`${id}: builds, poses every step, and keeps within ${BUDGET / 1000}k triangles a stage`, async () => {
    const { k, root, stages, markers } = fakeKit(s);
    const api = await mod.build(k);
    assert.equal(typeof api.update, 'function');
    let T = 0;
    for (const [i, st] of s.steps.entries()) {
      for (const [g, grp] of stages) grp.visible = g === st.stage;
      assert.ok(stages.has(st.stage), `stage ${st.stage} is built`);
      const starts = s.steps.slice(0, i).reduce((a, x) => a + x.seconds, 0);
      for (const u of [0, 0.3, 0.7, 0.99]) {
        T = starts + u * st.seconds;
        const progress = (sid) => {
          const j = s.steps.findIndex((x) => x.id === sid);
          const t0 = s.steps.slice(0, j).reduce((a, x) => a + x.seconds, 0);
          return Math.min(1, Math.max(0, (T - t0) / s.steps[j].seconds));
        };
        api.update({ T, dt: 1 / 60, step: i, id: st.id, t: u * st.seconds, u, stage: st.stage, quality: 'high', playing: true, p: progress, is: (...l) => l.includes(st.id) });
        for (const m of markers) m();
      }
      root.updateMatrixWorld(true);
      const tris = triangles(stages.get(st.stage));
      assert.ok(tris < BUDGET, `${st.id}: ${Math.round(tris / 1000)}k triangles`);
    }
  });
}
