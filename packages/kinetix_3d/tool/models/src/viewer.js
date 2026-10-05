// KINETIX 3D viewer: one model at a time, driven by the app.
//
// The app loads index.html?model=<id>&lang=<en|hi|kn>, then sends commands
// with kx.cmd({...}) (WebView) or postMessage({kxcmd: {...}}) (web). The
// viewer answers with JSON messages through the KX channel (WebView) or
// postMessage({kx: '...'}) to the parent page (web).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { procedural } from './procedural.js';

const params = new URLSearchParams(location.search);
const state = {
  lang: params.get('lang') || 'en',
  labels: 'picked', // 'none' | 'picked' | 'all'
  picked: null,
  explode: 0,
  hidden: new Set(),
  slice: null, // {normal: Vector3, offset}
  anim: null, // {id, kind, step, t0}
  autoRotate: false,
  shown: new Set(), // hidden-by-default parts the teacher turned on
  variant: null, // for models with versions (each element's atom, each solid)
};

// Which viewer this is, when a page holds several (the web build).
const channel = params.get('ch');

function send(msg) {
  if (channel) msg.ch = channel;
  const text = JSON.stringify(msg);
  if (window.KX && window.KX.postMessage) window.KX.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage({ kx: text }, '*');
}

window.addEventListener('error', (e) => send({ event: 'error', message: String(e.message || e), where: `${e.filename || ''}:${e.lineno || ''}` }));

// ------------------------------------------------------------------ scene

const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

// Android can take the GPU away from a page (low memory, app in the
// background). Say so; three.js rebuilds everything when it comes back.
let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  send({ event: 'error', message: 'WebGL context lost' });
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  send({ event: 'restored' });
});

const scene = new THREE.Scene();
const dark = params.get('theme') !== 'light';
scene.background = new THREE.Color(dark ? 0x16191e : 0xf4f1ea);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(1, 1.6, 2.2);
scene.add(key);
const sky = new THREE.HemisphereLight(0xffffff, 0x302020, 0.3);
scene.add(sky);
// A cool rim light from behind outlines the model against the dark board.
const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
rim.position.set(-1.5, 0.8, -2);
scene.add(rim);

/**
 * Space models are lit by their Sun: a light where the Sun is and very
 * little from anywhere else, so every planet has a day side and a night side.
 */
function sunlight(at) {
  key.visible = false;
  rim.visible = false;
  sky.intensity = 0.03;
  scene.environmentIntensity = 0.035;
  const sun = new THREE.PointLight(0xfff2dc, 4.5, 0, 0);
  sun.position.set(...at);
  scene.add(sun);
}

const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.9;
controls.zoomToCursor = true;

const root = new THREE.Group();
scene.add(root);

// The cut: fragments on the negative side of the plane are not drawn. When
// no cut is on, the plane sits far away and clips nothing. A wedge cut (like
// the textbook picture of the Earth with a slice taken out) removes only what
// is behind both planes; for a plain cut the second plane is behind
// everything, so the first plane alone decides.
const cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
const cut2 = new THREE.Plane(new THREE.Vector3(0, 0, -1), -1e6);
const planes = [cut, cut2];
const clip = { clippingPlanes: planes, clipIntersection: true };

/** part id -> {info, group (Group), front (Mesh), back (Mesh), material, base (Vector3 pivot)} */
const parts = new Map();
let manifest = null;
let modelSize = 0.1;

function resize() {
  const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
}
window.addEventListener('resize', resize);

/** Whether a part is on screen, from the teacher's choices and the variant. */
function shouldShow(p) {
  const v = p.info.variant;
  if (v && v !== state.variant) return false;
  if (state.hidden.has(p.info.id)) return false;
  return !p.info.hidden || state.shown.has(p.info.id);
}

function applyVisibility() {
  for (const p of parts.values()) p.group.visible = shouldShow(p);
}

// ------------------------------------------------------------------ labels

const overlay = document.getElementById('lines');
const labelLayer = document.getElementById('labels');
const name = (p) => (p.name && (p.name[state.lang] || p.name.en)) || p.id;

function visibleParts() {
  return [...parts.values()].filter((p) => p.group.visible);
}

/** The label point of [p] on the side facing the camera. */
/**
 * Where a cut puts a part's label (on its ring of the cut face, say): a
 * point, null for no label while that cut is on, or undefined when the cut
 * says nothing about the part.
 */
function cutAnchor(p) {
  const fixed = state.slice?.anchors;
  if (!fixed || !(p.info.id in fixed)) return undefined;
  return fixed[p.info.id] ? new THREE.Vector3(...fixed[p.info.id]) : null;
}

function anchorOf(p) {
  const fixed = cutAnchor(p);
  if (fixed) return fixed;
  const list = p.info.anchors;
  if (!list) return new THREE.Vector3(...p.info.anchor);
  const view = camera.position.clone().sub(controls.target).normalize();
  let best = list[0], score = -Infinity;
  for (const a of list) {
    const s = a[0] * view.x + a[1] * view.y + a[2] * view.z;
    if (s > score) {
      score = s;
      best = a;
    }
  }
  return new THREE.Vector3(best[3], best[4], best[5]);
}

/** Screen position of a model-space point (after take-apart). */
function toScreen(p, v) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const q = v.clone().applyMatrix4(p.group.matrixWorld).project(camera);
  return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h, behind: q.z > 1 };
}

const raycaster = new THREE.Raycaster();

/** Is the anchor of [p] hidden behind another part from the camera? A ray
 * through a detailed model is costly on a tablet, so only a couple of labels
 * are checked each frame and each answer is kept for a moment: turning stays
 * smooth (and the page keeps answering) with every label on. */
const hiddenAnchors = new Map();
const occlusion = { frame: -1, budget: 0 };
function occludedCached(p, now) {
  const known = hiddenAnchors.get(p.info.id);
  if (known && now - known.at < 700) return known.hidden;
  if (occlusion.frame !== now) {
    occlusion.frame = now;
    occlusion.budget = 2;
  }
  if (occlusion.budget <= 0) return known ? known.hidden : false;
  occlusion.budget--;
  const hidden = occluded(p);
  hiddenAnchors.set(p.info.id, { hidden, at: now });
  return hidden;
}

function occluded(p) {
  const a = anchorOf(p).applyMatrix4(p.group.matrixWorld);
  const dir = a.clone().sub(camera.position);
  const dist = dir.length();
  raycaster.set(camera.position, dir.normalize());
  const hits = raycaster.intersectObjects(pickables(), false).filter(visibleHit);
  return hits.length > 0 && hits[0].distance < dist - modelSize * 0.02 && hits[0].object.userData.part !== p.info.id;
}

/** The labels to draw, laid out on the left and right of the model. */
function layoutLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  let shown = [];
  // All labels: the main parts, plus a minor one if it is the one picked.
  if (state.labels === 'all') shown = visibleParts().filter((p) => (!p.info.minor || p.info.id === state.picked || state.shown.has(p.info.id)) && cutAnchor(p) !== null);
  else if (state.labels === 'picked' && state.picked && parts.get(state.picked)?.group.visible) shown = [parts.get(state.picked)];
  const o = new THREE.Vector3(0, 0, 0).project(camera);
  const centre = { x: (o.x * 0.5 + 0.5) * w, y: (-o.y * 0.5 + 0.5) * h };
  const now = performance.now();
  const items = shown.map((p) => {
    const s = toScreen(p, anchorOf(p));
    return { p, ax: s.x, ay: s.y, side: s.x < centre.x ? -1 : 1, dim: state.labels === 'all' && occludedCached(p, now) };
  });
  const gap = Math.max(26, h / 22);
  for (const side of [-1, 1]) {
    const col = items.filter((i) => i.side === side).sort((a, b) => a.ay - b.ay);
    let y = -Infinity;
    for (const i of col) {
      i.ly = Math.max(i.ay, y + gap);
      y = i.ly;
    }
    // Pull the column back up if it ran off the bottom.
    const over = col.length ? col[col.length - 1].ly - (h - 16) : 0;
    if (over > 0) for (const i of col) i.ly -= over;
    for (const i of col) {
      // All labels: two tidy columns beside the model. One label: next to its part.
      i.lx = state.labels === 'all' ? centre.x + side * (modelScreenRadius() + 24) : i.ax + side * 44;
      i.lx = Math.max(8, Math.min(w - 8, i.lx));
    }
  }
  return items;
}

function modelScreenRadius() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const d = camera.position.distanceTo(controls.target);
  const r = (modelSize * 0.5) / (d * Math.tan((camera.fov * Math.PI) / 360));
  return r * Math.min(w, h) * 0.5;
}

function drawLabels() {
  const items = layoutLabels();
  overlay.innerHTML = '';
  labelLayer.innerHTML = '';
  for (const i of items) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', `${i.ax},${i.ay} ${i.lx - i.side * 6},${i.ly} ${i.lx},${i.ly}`);
    line.setAttribute('class', i.dim ? 'dim' : '');
    overlay.appendChild(line);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', i.ax);
    dot.setAttribute('cy', i.ay);
    dot.setAttribute('r', 3.5);
    dot.setAttribute('class', i.dim ? 'dim' : '');
    overlay.appendChild(dot);
    const el = document.createElement('div');
    el.className = `label ${i.side < 0 ? 'left' : 'right'}${i.dim ? ' dim' : ''}${i.p.info.id === state.picked ? ' picked' : ''}`;
    el.textContent = name(i.p.info);
    el.style.top = `${i.ly}px`;
    el.style.left = `${i.lx}px`;
    el.dataset.part = i.p.info.id;
    labelLayer.appendChild(el);
    // Keep the whole label on screen.
    const w = renderer.domElement.clientWidth;
    const lw = el.offsetWidth + 8;
    if (i.side > 0 && i.lx + lw > w) el.style.left = `${Math.max(4, w - lw)}px`;
    if (i.side < 0 && i.lx - lw < 0) el.style.left = `${lw}px`;
  }
  return items;
}

labelLayer.addEventListener('pointerup', (e) => {
  const id = e.target?.dataset?.part;
  if (id) pick(id);
});

// ------------------------------------------------------------------ materials

function frontMaterial(info) {
  // Rock and soil are matte; tissue and plastic-like models keep a sheen.
  const matte = info.matte ?? manifest?.matte;
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(info.color),
    roughness: matte ? 0.9 : info.group === 'valves' ? 0.6 : 0.42,
    metalness: 0,
    clearcoat: matte ? 0 : 0.55,
    clearcoatRoughness: 0.3,
    transparent: !!info.opacity,
    opacity: info.opacity || 1,
    depthWrite: !info.opacity,
    ...clip,
  });
}

/** The inside of a part, seen only where it is cut: a flat, darker colour. */
function backMaterial(info) {
  // A part can say what it is made of inside (the Earth's crust is rock, not sea).
  const c = new THREE.Color(info.inside || info.color);
  const hsl = {};
  c.getHSL(hsl);
  if (!info.inside) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.72);
  // A see-through part stays see-through from inside too.
  const clear = info.opacity ? { transparent: true, opacity: info.opacity * 0.6, depthWrite: false } : {};
  return new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, ...clip, ...clear });
}

// ------------------------------------------------------------------ loading

async function load(id) {
  const base = params.get('base') || 'models/';
  manifest = await (await fetch(`${base}${id}.json`)).json();
  let scenes;
  if (manifest.kind === 'procedural') {
    scenes = procedural(manifest);
  } else {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${base}${manifest.file}`);
    // Quantized positions are scaled back by each node's transform.
    gltf.scene.updateMatrixWorld(true);
    scenes = {};
    gltf.scene.traverse((o) => {
      if (o.isMesh) scenes[o.name] = o;
    });
  }
  modelSize = manifest.size || 0.1;
  for (const info of manifest.parts) {
    const src = scenes[info.id];
    if (!src) {
      send({ event: 'error', message: `part ${info.id} missing from ${manifest.file}` });
      continue;
    }
    const geometry = src.geometry;
    const group = new THREE.Group();
    group.name = info.id;
    const front = new THREE.Mesh(geometry, src.userData.material || frontMaterial(info));
    front.userData.part = info.id;
    front.renderOrder = info.opacity ? 2 : 0;
    const back = new THREE.Mesh(geometry, backMaterial(info));
    back.userData.part = info.id;
    back.userData.back = true;
    for (const m of [front, back]) m.applyMatrix4(src.matrixWorld);
    group.add(back, front);
    group.visible = !info.hidden;
    root.add(group);
    const pivot = new THREE.Box3().setFromObject(front).getCenter(new THREE.Vector3());
    parts.set(info.id, { info, group, front, back, base: pivot, restColor: front.material.color.clone() });
    if (info.glow) setGlow(parts.get(info.id), 0);
    if (src.userData.animate) parts.get(info.id).animate = src.userData.animate;
  }
  if (manifest.edges) addEdges();
  if (manifest.caps === 'flat') addFlatCap();
  if (manifest.light) sunlight(manifest.light);
  state.variant = manifest.variants?.[0]?.id ?? null;
  applyVisibility();
  resize();
  view(manifest.views?.[0]?.dir || [0, 0, 1], true);
  send({ event: 'loaded', model: id, parts: manifest.parts.map((p) => p.id) });
}

/** Crisp edges on shapes with flat faces (maths solids). */
function addEdges() {
  for (const p of parts.values()) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(p.front.geometry, 25), new THREE.LineBasicMaterial({ color: 0x14202e, ...clip }));
    lines.applyMatrix4(p.front.matrix);
    lines.renderOrder = 1;
    p.group.add(lines);
  }
}

/**
 * A flat, filled face where the cut is (for maths, where the shape of the
 * cross-section is the lesson): the stencil counts how often each pixel is
 * inside the solid, and a plane is drawn only there.
 */
let capPlane = null;
function addFlatCap() {
  for (const p of parts.values()) {
    for (const [side, op] of [[THREE.BackSide, THREE.IncrementWrapStencilOp], [THREE.FrontSide, THREE.DecrementWrapStencilOp]]) {
      const m = new THREE.MeshBasicMaterial({ side, ...clip, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
      const mesh = new THREE.Mesh(p.front.geometry, m);
      mesh.applyMatrix4(p.front.matrix);
      mesh.renderOrder = 4;
      p.group.add(mesh);
    }
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2b33d, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp });
  capPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  capPlane.renderOrder = 5;
  capPlane.visible = false;
  capPlane.onAfterRender = (r) => r.clearStencil();
  scene.add(capPlane);
}

function placeCap() {
  if (!capPlane) return;
  capPlane.visible = !!state.slice && !state.slice.wedge;
  if (!state.slice) return;
  capPlane.scale.setScalar(modelSize * 4);
  capPlane.position.copy(state.slice.normal).multiplyScalar(-cut.constant);
  capPlane.lookAt(capPlane.position.clone().sub(state.slice.normal));
}

// ------------------------------------------------------------------ camera

let flight = null;

/** How wide and tall the model looks from [d] (its box, seen along d). */
function extentFrom(d) {
  // Where the parts are going (take-apart is applied over the next frames).
  const box = new THREE.Box3();
  const folding = hasHinges();
  for (const p of parts.values()) {
    if (!p.group.visible) continue;
    if (folding) {
      // A net: where the faces are once unfolded as far as the slider says.
      p.group.updateMatrixWorld(true);
      p.group.matrix.copy(hingeMatrix(p.info.id));
      box.union(new THREE.Box3().setFromBufferAttribute(p.front.geometry.attributes.position).applyMatrix4(p.front.matrix).applyMatrix4(hingeMatrix(p.info.id)));
      continue;
    }
    if (!p.box) p.box = new THREE.Box3().setFromBufferAttribute(p.front.geometry.attributes.position).applyMatrix4(p.front.matrix);
    box.union(p.box.clone().translate(p.explodeOffset || new THREE.Vector3()));
  }
  if (box.isEmpty()) return { w: modelSize, h: modelSize, depth: modelSize / 2 };
  const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, d).normalize();
  const top = new THREE.Vector3().crossVectors(d, right).normalize();
  let w = 0, h = 0, depth = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = new THREE.Vector3(x, y, z);
    w = Math.max(w, Math.abs(v.dot(right)) * 2);
    h = Math.max(h, Math.abs(v.dot(top)) * 2);
    depth = Math.max(depth, v.dot(d));
  }
  return { w, h, depth };
}

/** Looks at the model from [dir], at a distance that fits it. */
/** Where the camera looks from: where it is flying to, if it is on the way. */
function heading() {
  return (flight ? flight.to.clone() : camera.position.clone().sub(controls.target)).normalize().toArray();
}

function view(dir, instant = false) {
  const d = new THREE.Vector3(...dir).normalize();
  const e = extentFrom(d);
  const tan = Math.tan((camera.fov * Math.PI) / 360);
  const size = Math.max(e.h, e.w / camera.aspect);
  const room = state.labels === 'all' ? 1.35 : 1;
  // Far enough to fit the model, and never inside it when it is long in the
  // direction we look along (DNA seen down its axis).
  const fit = Math.max((size * 0.6 * room) / tan, (size * 0.45) / tan + e.depth);
  const to = d.multiplyScalar(fit);
  if (instant) {
    camera.position.copy(to);
    controls.target.set(0, 0, 0);
    controls.update();
    return;
  }
  flight = { from: camera.position.clone(), to, target: controls.target.clone(), t0: performance.now() };
}

// ------------------------------------------------------------------ interaction

function pickables() {
  return visibleParts().map((p) => p.front);
}

/** A hit counts only on the kept side of the cut. */
const visibleHit = (h) => cut.distanceToPoint(h.point) >= 0 || cut2.distanceToPoint(h.point) >= 0;

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  stopAutoRotate();
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 350;
  down = null;
  if (moved > 8 || !quick) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickables(), false).filter(visibleHit)[0];
  pick(hit ? hit.object.userData.part : null);
});

function pick(id) {
  state.picked = id;
  for (const p of parts.values()) setGlow(p, p.info.id === id ? 0.35 : 0);
  send({ event: 'pick', part: id });
}

function setGlow(p, amount) {
  const m = p.front.material;
  if (!m.emissive) return;
  // A part that gives light (the Sun, lava) always glows at least this much.
  m.emissive.copy(p.restColor).multiplyScalar(Math.max(amount, p.info.glow || 0));
}

function stopAutoRotate() {
  if (state.autoRotate) {
    state.autoRotate = false;
    controls.autoRotate = false;
    send({ event: 'autoRotate', on: false });
  }
}

// ------------------------------------------------------------------ take apart, slice

/**
 * A face of a solid folds about its hinge ({point, axis, angle, parent}):
 * "take apart" unfolds the solid into its net. A face hinged on another
 * face moves with it.
 */
function hingeMatrix(id, seen = 0) {
  const p = parts.get(id);
  const h = p?.info.hinge;
  if (!h || seen > 12) return new THREE.Matrix4();
  const u = state.explode;
  const pivot = new THREE.Vector3(...h.point);
  const rot = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...h.axis).normalize(), h.angle * u);
  const local = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  return h.parent ? hingeMatrix(h.parent, seen + 1).multiply(local) : local;
}

/** Whether the shape on screen folds (a solid with a net). */
const hasHinges = () => [...parts.values()].some((p) => p.info.hinge && shouldShow(p));

function applyExplode() {
  if (hasHinges()) {
    // Solids unfold into their nets instead of flying apart.
    for (const p of parts.values()) p.explodeOffset = new THREE.Vector3();
    return;
  }
  for (const p of parts.values()) {
    const e = p.info.explode || [0, 0, 0];
    p.explodeOffset = new THREE.Vector3(...e).multiplyScalar(state.explode * modelSize * 0.4);
  }
  // Once the teacher stops sliding, step back (or in) so every part is in view.
  clearTimeout(applyExplode.refit);
  applyExplode.refit = setTimeout(() => view(heading()), 350);
}

function setSlice(s) {
  cut2.set(new THREE.Vector3(0, 0, -1), -1e6);
  if (!s) {
    cut.set(new THREE.Vector3(0, 0, -1), 1e6);
    state.slice = null;
  } else {
    const n = new THREE.Vector3(...s.normal).normalize();
    cut.set(n, -(s.offset || 0) * 1);
    state.slice = { normal: n, offset: s.offset || 0, anchors: (s.id && manifest?.slices?.find((x) => x.id === s.id)?.anchors) || null };
    if (s.normal2) {
      const n2 = new THREE.Vector3(...s.normal2).normalize();
      cut2.set(n2, -(s.offset2 || 0));
      state.slice.wedge = true;
    }
  }
  planeHint.show();
  placeCap();
}

/** A faint frame showing where the cut is, for a moment after it moves. */
const planeHint = (() => {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf2b33d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xf2b33d, transparent: true, opacity: 0 }));
  mesh.add(edge);
  scene.add(mesh);
  let until = 0;
  return {
    show() {
      if (!state.slice || state.slice.wedge) {
        mat.opacity = 0;
        edge.material.opacity = 0;
        return;
      }
      mesh.scale.setScalar(modelSize * 1.3);
      mesh.position.copy(state.slice.normal).multiplyScalar(-cut.constant);
      mesh.lookAt(mesh.position.clone().add(state.slice.normal));
      until = performance.now() + 1400;
    },
    hide() {
      until = 0;
      mat.opacity = 0;
      edge.material.opacity = 0;
    },
    tick(now) {
      const a = Math.max(0, Math.min(1, (until - now) / 500));
      mat.opacity = 0;
      edge.material.opacity = 0.8 * a;
    },
  };
})();

// ------------------------------------------------------------------ animations

const particles = (() => {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, 240);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  root.add(mesh);
  return mesh;
})();
let curves = [];

function startAnimation(id, step = 0) {
  stopAnimation();
  const a = manifest.animations?.find((x) => x.id === id);
  if (!a) return;
  state.anim = { ...a, step, t0: performance.now() };
  if (a.kind === 'flow' || a.kind === 'tour') showFlowStep(step);
  send({ event: 'animation', id, step, steps: a.steps?.length || 0 });
}

function stopAnimation() {
  if (!state.anim) return;
  const was = state.anim;
  state.anim = null;
  particles.count = 0;
  curves = [];
  for (const p of parts.values()) {
    p.beat = null;
    p.orbit = null;
    p.group.scale.setScalar(1);
    p.group.quaternion.identity();
    p.group.visible = shouldShow(p);
    const m = p.front.material;
    m.transparent = !!p.info.opacity;
    m.opacity = p.info.opacity || 1;
    m.depthWrite = !p.info.opacity;
    m.needsUpdate = true;
    p.back.visible = true;
    setGlow(p, p.info.id === state.picked ? 0.35 : 0);
  }
  if (was.steps) send({ event: 'animation', id: null });
}

function showFlowStep(step) {
  const a = state.anim;
  const s = a.steps[step];
  a.step = step;
  a.t0 = performance.now();
  curves = (s.paths || []).map((path) => new THREE.CatmullRomCurve3(path.map((q) => new THREE.Vector3(...q)), false, 'centripetal'));
  particles.material.color.set(s.color || '#ffffff');
  const tour = a.kind === 'tour';
  for (const p of parts.values()) {
    const id = p.info.id;
    const blood = p.info.group === 'blood';
    const lit = s.highlight?.includes(id);
    p.group.visible = blood ? s.show?.includes(id) : (shouldShow(p) || lit) && (!p.info.variant || p.info.variant === state.variant);
    const m = p.front.material;
    if (tour) {
      // A tour lights up parts in turn; the rest fade back but stay solid enough to place them.
      m.transparent = !lit;
      m.depthWrite = !!lit;
      m.opacity = lit ? 1 : 0.22;
      p.back.visible = !!lit;
    } else {
      m.transparent = true;
      m.depthWrite = false;
      m.opacity = blood ? p.info.opacity || 0.55 : lit ? 0.5 : 0.16;
      p.back.visible = false;
    }
    m.needsUpdate = true;
    setGlow(p, lit ? (tour ? 0.25 : 0.45) : 0);
  }
  send({ event: 'animation', id: a.id, step, steps: a.steps.length });
}

function tickAnimation(now) {
  const a = state.anim;
  if (!a) return;
  // A frame's timestamp can be a little earlier than the moment the step began.
  const t = Math.max(0, (now - a.t0) / 1000);
  if (a.kind === 'beat') {
    const period = 60 / (a.bpm || 72);
    const ph = (t % period) / period;
    const pulse = (from, to) => (ph >= from && ph <= to ? Math.sin(((ph - from) / (to - from)) * Math.PI) : 0);
    const atria = 1 - 0.06 * pulse(0.0, 0.16);
    const ventricles = 1 - 0.07 * pulse(0.16, 0.5);
    for (const [ids, s] of [[a.atria, atria], [a.ventricles, ventricles]]) {
      for (const id of ids || []) {
        const p = parts.get(id);
        if (p) p.beat = { s, pivot: groupPivot(ids) };
      }
    }
  } else if (a.kind === 'breathe') {
    const period = 60 / (a.bpm || 14);
    const s = (1 - Math.cos((2 * Math.PI * t) / period)) / 2; // 0 breathed out .. 1 breathed in
    for (const id of a.expand || []) {
      const p = parts.get(id);
      if (p) p.beat = { s: 1 + 0.06 * s, pivot: groupPivot(a.expand) };
    }
    for (const id of a.lower || []) {
      const p = parts.get(id);
      if (p) p.beat = { s: 1, pivot: new THREE.Vector3(), shift: new THREE.Vector3(0, -modelSize * 0.035 * s, 0) };
    }
  } else if (a.kind === 'flow') {
    const n = 22;
    let k = 0;
    const r = modelSize * 0.011;
    const m = new THREE.Matrix4();
    for (const c of curves) {
      for (let i = 0; i < n; i++) {
        const u = (((t * 0.28 + i / n) % 1) + 1) % 1;
        const q = c.getPointAt(u);
        m.makeScale(r, r, r).setPosition(q);
        particles.setMatrixAt(k++, m);
      }
    }
    particles.count = k;
    particles.instanceMatrix.needsUpdate = true;
  } else if (a.kind === 'orbit') {
    // Parts with "spin": {axis, speed (degrees a second), centre} turn about the centre.
    for (const p of parts.values()) {
      const sp = p.info.spin;
      if (!sp) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...sp.axis).normalize(), (sp.speed * t * Math.PI) / 180);
      p.orbit = { q, centre: new THREE.Vector3(...(sp.centre || [0, 0, 0])) };
    }
  }
}

const pivots = new Map();
function groupPivot(ids) {
  const key = ids.join();
  if (!pivots.has(key)) {
    const box = new THREE.Box3();
    for (const id of ids) {
      const p = parts.get(id);
      if (p) box.expandByObject(p.front);
    }
    pivots.set(key, box.getCenter(new THREE.Vector3()));
  }
  return pivots.get(key);
}

// ------------------------------------------------------------------ snapshot

/** The view as the students see it, labels drawn in, as a PNG data URL. */
function snapshot(maxWidth = 1600) {
  planeHint.hide();
  render(performance.now());
  // Draw the view again into an off-screen target and read that: the
  // screen's own buffer can hold an older frame when Android is not taking
  // the page's frames (seen on the emulator).
  const src = renderer.domElement;
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace, stencilBuffer: true });
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const px = new Uint8ClampedArray(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  target.dispose();
  const flipped = new ImageData(w, h);
  for (let y = 0; y < h; y++) flipped.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  full.getContext('2d').putImageData(flipped, 0, 0);
  const k = Math.min(1, maxWidth / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.drawImage(full, 0, 0, c.width, c.height);
  drawLabels2d(g, c.width / src.clientWidth, c.width);
  return c.toDataURL('image/png');
}
/** The labels, drawn into a picture [s] times the size of the screen. */
function drawLabels2d(g, s, width) {
  const items = layoutLabels();
  g.lineWidth = 1.6 * s;
  g.font = `600 ${15 * s}px system-ui, "Noto Sans", sans-serif`;
  g.textBaseline = 'middle';
  for (const i of items) {
    g.strokeStyle = g.fillStyle = dark ? '#f2f2f2' : '#1c1c1c';
    g.globalAlpha = i.dim ? 0.5 : 1;
    g.beginPath();
    g.moveTo(i.ax * s, i.ay * s);
    g.lineTo((i.lx - i.side * 6) * s, i.ly * s);
    g.lineTo(i.lx * s, i.ly * s);
    g.stroke();
    g.beginPath();
    g.arc(i.ax * s, i.ay * s, 3.5 * s, 0, Math.PI * 2);
    g.fill();
    const text = name(i.p.info);
    const tw = g.measureText(text).width;
    // Inside the picture, whichever side the label is on.
    const x = Math.max(6 * s, Math.min(width - tw - 6 * s, i.side < 0 ? i.lx * s - tw - 6 * s : i.lx * s + 6 * s));
    g.fillStyle = dark ? 'rgba(20,22,26,0.75)' : 'rgba(255,255,255,0.8)';
    g.fillRect(x - 5 * s, i.ly * s - 11 * s, tw + 10 * s, 22 * s);
    g.fillStyle = dark ? '#ffffff' : '#111111';
    g.fillText(text, x, i.ly * s);
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ mirror

// The students' screen shows the teacher's 3D view as pictures: a small JPEG
// whenever the view changes (and a moment after, while things settle), or
// all the time while an animation runs, at most three a second.
const mirror = { on: false, maxWidth: 960, last: 0, key: '', until: 0 };
let mirrorTarget = null;

function mirrorTick(now) {
  if (!mirror.on || !manifest || now - mirror.last < 320) return;
  const key = [
    ...camera.position.toArray(), ...controls.target.toArray(),
    state.labels, state.picked, state.explode, state.variant, state.lang,
    state.slice ? [...state.slice.normal.toArray(), state.slice.offset, !!state.slice.wedge].join() : '',
    [...state.hidden].join(), [...state.shown].join(), renderer.domElement.width, renderer.domElement.height,
  ].map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v))).join('|');
  if (key !== mirror.key) {
    mirror.key = key;
    mirror.until = now + 1500;
  }
  if (!state.anim && !state.autoRotate && now > mirror.until) return;
  mirror.last = now;
  send({ event: 'frame', jpg: mirrorFrame(mirror.maxWidth) });
}

function mirrorFrame(maxWidth) {
  const gl = renderer.getContext();
  const k = Math.min(1, maxWidth / gl.drawingBufferWidth);
  const w = Math.round(gl.drawingBufferWidth * k), h = Math.round(gl.drawingBufferHeight * k);
  if (!mirrorTarget || mirrorTarget.width !== w || mirrorTarget.height !== h) {
    mirrorTarget?.dispose();
    mirrorTarget = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace, stencilBuffer: true });
  }
  renderer.setRenderTarget(mirrorTarget);
  renderer.render(scene, camera);
  const px = new Uint8ClampedArray(w * h * 4);
  renderer.readRenderTargetPixels(mirrorTarget, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.putImageData(img, 0, 0);
  drawLabels2d(g, w / renderer.domElement.clientWidth, w);
  return c.toDataURL('image/jpeg', 0.72);
}

// ------------------------------------------------------------------ loop

let lastLabels = 0;
function render(now) {
  if (flight) {
    const u = Math.min(1, (now - flight.t0) / 700);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const r = flight.from.length() + (flight.to.length() - flight.from.length()) * e;
    const dir = flight.from.clone().normalize().lerp(flight.to.clone().normalize(), e).normalize();
    camera.position.copy(dir.multiplyScalar(r));
    controls.target.lerpVectors(flight.target, new THREE.Vector3(), e);
    if (u >= 1) flight = null;
  }
  for (const p of parts.values()) {
    const off = p.explodeOffset || new THREE.Vector3();
    if (p.orbit && state.anim?.kind === 'orbit') {
      p.group.quaternion.copy(p.orbit.q);
      p.group.scale.setScalar(1);
      p.group.position.copy(p.orbit.centre).sub(p.orbit.centre.clone().applyQuaternion(p.orbit.q)).add(off);
      continue;
    }
    if (p.info.hinge) {
      const m = hingeMatrix(p.info.id);
      p.group.matrixAutoUpdate = true;
      m.decompose(p.group.position, p.group.quaternion, p.group.scale);
      continue;
    }
    if (p.beat && (state.anim?.kind === 'beat' || state.anim?.kind === 'breathe')) {
      p.group.scale.setScalar(p.beat.s);
      p.group.position.copy(p.beat.pivot).multiplyScalar(1 - p.beat.s).add(off);
      if (p.beat.shift) p.group.position.add(p.beat.shift);
    } else {
      p.group.scale.setScalar(1);
      p.group.position.copy(off);
    }
  }
  tickAnimation(now);
  planeHint.tick(now);
  controls.update();
  renderer.render(scene, camera);
  if (now - lastLabels > 90) {
    lastLabels = now;
    drawLabels();
  }
}

function loop(now) {
  render(now);
  mirrorTick(now);
  adaptQuality(now);
  requestAnimationFrame(loop);
}

// Big classroom panels often have weak graphics chips driving many pixels.
// When frames come too slowly, draw fewer pixels (down to one per screen
// pixel, or a little under on very large screens) so turning the model
// stays smooth. Snapshots for the board are drawn at their own size.
const pace = { t0: 0, frames: 0 };
function adaptQuality(now) {
  if (document.visibilityState !== 'visible') {
    pace.t0 = 0;
    return;
  }
  if (!pace.t0) {
    pace.t0 = now;
    pace.frames = 0;
    return;
  }
  pace.frames++;
  const spent = now - pace.t0;
  if (spent < 2000 || pace.frames < 3) return;
  const fps = (pace.frames * 1000) / spent;
  pace.t0 = now;
  pace.frames = 0;
  const ratio = renderer.getPixelRatio();
  const floor = renderer.domElement.clientWidth > 1600 ? 0.75 : 1;
  if (fps < 24 && ratio > floor) {
    renderer.setPixelRatio(Math.max(floor, ratio - 0.5));
    resize();
  }
}

// ------------------------------------------------------------------ commands

const commands = {
  lang: (c) => (state.lang = c.lang),
  labels: (c) => {
    const before = state.labels;
    state.labels = c.mode;
    // Step back to make room for the label columns (or come closer again).
    if ((before === 'all') !== (c.mode === 'all')) view(heading());
  },
  pick: (c) => pick(c.part ?? null),
  view: (c) => view(c.dir),
  reset: () => {
    state.explode = 0;
    applyExplode();
    setSlice(null);
    stopAnimation();
    view(manifest.views?.[0]?.dir || [0, 0, 1]);
  },
  explode: (c) => {
    state.explode = Math.max(0, Math.min(1, c.amount));
    applyExplode();
  },
  slice: (c) => setSlice(c.normal ? c : null),
  hide: (c) => {
    state.hidden = new Set(c.parts || []);
    state.shown = new Set(c.shown || []);
    applyVisibility();
  },
  variant: (c) => {
    state.variant = c.id;
    if (state.picked && parts.get(state.picked)?.info.variant && parts.get(state.picked).info.variant !== c.id) pick(null);
    applyVisibility();
    applyExplode();
    view(heading());
  },
  animate: (c) => (c.id ? startAnimation(c.id, c.step || 0) : stopAnimation()),
  step: (c) => {
    if (state.anim?.steps) showFlowStep(Math.max(0, Math.min(state.anim.steps.length - 1, c.step)));
  },
  autoRotate: (c) => {
    state.autoRotate = !!c.on;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 1.2;
  },
  snapshot: (c) => send({ event: 'snapshot', png: snapshot(c.maxWidth || 1600) }),
  // Pictures of the view for the students' screen.
  mirror: (c) => {
    mirror.on = !!c.on;
    mirror.maxWidth = c.maxWidth || 960;
    mirror.key = '';
  },
  // For tests (and hidden pages, which get no animation frames): draw
  // [frames] frames [ms] apart, now.
  frames: (c) => {
    const t = performance.now();
    for (let i = 0; i < (c.frames || 1); i++) render(t + i * (c.ms || 16));
    send({ event: 'framed' });
  },
  // For tests: where a part's label anchor is on screen, to tap it.
  locate: (c) => {
    const p = parts.get(c.part);
    const s = p ? toScreen(p, new THREE.Vector3(...p.info.centroid)) : null;
    send({ event: 'located', part: c.part, x: s?.x, y: s?.y });
  },
  // For device tests: what the renderer is actually doing.
  debug: () =>
    send({
      event: 'debug',
      frame: renderer.info.render.frame,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      camera: camera.position.toArray().map((v) => Math.round(v * 1e4) / 1e4),
      cut: Math.round(cut.constant * 1e4) / 1e4,
      explode: state.explode,
      animation: state.anim?.id ?? null,
      lost: contextLost,
      canvas: [renderer.domElement.width, renderer.domElement.height],
      pixelRatio: renderer.getPixelRatio(),
      visibility: document.visibilityState,
    }),
  state: () =>
    send({
      event: 'state',
      picked: state.picked,
      labels: state.labels,
      explode: state.explode,
      slice: state.slice ? { normal: state.slice.normal.toArray(), offset: state.slice.offset } : null,
      animation: state.anim ? { id: state.anim.id, step: state.anim.step } : null,
      visible: visibleParts().map((p) => p.info.id),
      lang: state.lang,
    }),
};

window.kx = {
  cmd(c) {
    try {
      const f = commands[c.cmd];
      if (!f) throw new Error(`unknown command ${c.cmd}`);
      f(c);
    } catch (e) {
      send({ event: 'error', message: String(e?.message || e) });
    }
  },
};
window.addEventListener('message', (e) => {
  if (e.data && e.data.kxcmd) window.kx.cmd(e.data.kxcmd);
});

resize();
requestAnimationFrame(loop);
send({ event: 'ready' });
const model = params.get('model');
if (model) load(model).catch((e) => send({ event: 'error', message: `Could not open ${model}: ${e?.message || e}` }));
