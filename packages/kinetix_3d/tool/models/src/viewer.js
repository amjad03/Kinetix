// KINETIX 3D viewer: one model at a time, driven by the app.
//
// The app loads index.html?model=<id>&lang=<en|hi|kn>, then sends commands
// with kx.cmd({...}) (WebView, WebView2) or postMessage({kxcmd: {...}})
// (web). The viewer answers with JSON messages through the KX channel
// (Android WebView), window.chrome.webview (WebView2 on Windows) or
// postMessage({kx: '...'}) to the parent page (web). The protocol is
// written down in lib/src/viewer/protocol.dart.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { procedural } from './procedural.js';
import { createSceneRuntime } from './scenes/runtime.js';
import { cloneMaterial } from './scenes/kit.js';

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
  peeled: new Set(), // outer layers taken off ("peel")
  cut: null, // the last cut command (half, wedge, slab, depth, peel), for the mirror and state
  sweep: null, // a depth cut moving through the model: {t0, from, ms, c}
};

// Which viewer this is, when a page holds several (the web build).
const channel = params.get('ch');

function send(msg) {
  if (channel) msg.ch = channel;
  const text = JSON.stringify(msg);
  if (window.KX && window.KX.postMessage) window.KX.postMessage(text);
  else if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage({ kx: text }, '*');
  // Opened on its own in a browser (checking a scene): errors go to the console.
  else if (msg.event === 'error') console.error(`kx: ${msg.message} ${msg.where || ''} ${msg.stack || ''}`);
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
// A fill light from the other side; only scenes turn it on.
const fill = new THREE.DirectionalLight(0xcfe0ff, 0);
fill.position.set(-4, 1.5, 2.5);
scene.add(fill);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
// A slab (a slice of the model between two planes) keeps only what is in front
// of both planes instead: the planes clip as a union.
const cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
const cut2 = new THREE.Plane(new THREE.Vector3(0, 0, -1), -1e6);
const planes = [cut, cut2];
const clip = { clippingPlanes: planes, clipIntersection: true };
let unionClip = false;
// The same cut a hair further out, for what is drawn on a cut face (notes' strokes).
const slackPlanes = [new THREE.Plane(), new THREE.Plane()];
function placeSlack() {
  planes.forEach((p, i) => slackPlanes[i].copy(p).translate(p.normal.clone().multiplyScalar(-modelSize * 0.008)));
}

/** Whether a point of the model is drawn with the cut as it is. [slack] keeps points just on a cut face. */
function kept(v, slack = 0) {
  const a = cut.distanceToPoint(v) >= -slack, b = cut2.distanceToPoint(v) >= -slack;
  return unionClip ? a && b : a || b;
}

function setClipUnion(on) {
  if (on === unionClip) return;
  unionClip = on;
  root.traverse((o) => {
    const m = o.material;
    if (m && (m.clippingPlanes === planes || m.clippingPlanes === slackPlanes)) {
      m.clipIntersection = !on;
      m.needsUpdate = true;
    }
  });
}

/** part id -> {info, group (Group), front (Mesh), back (Mesh), material, base (Vector3 pivot)} */
const parts = new Map();
let manifest = null;
let modelSize = 0.1;

function resize() {
  const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  if (sceneRt?.active) sceneRt.frame(w, h);
  overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
  drawInk();
}
window.addEventListener('resize', resize);

/** Whether a part is on screen, from the teacher's choices and the variant. */
function shouldShow(p) {
  const v = p.info.variant;
  if (v && v !== state.variant) return false;
  if (state.hidden.has(p.info.id) || state.peeled.has(p.info.id)) return false;
  return !p.info.hidden || state.shown.has(p.info.id);
}

function applyVisibility() {
  for (const p of parts.values()) {
    if (p.scene) for (const i of p.instances) i.wrapper.visible = shouldShow(p);
    else p.group.visible = shouldShow(p);
  }
}

// ------------------------------------------------------------------ labels

const overlay = document.getElementById('lines');
const labelLayer = document.getElementById('labels');
const name = (p) => (p.name && (p.name[state.lang] || p.name.en)) || p.id;

/** Whether [p] is on screen: its own switch and, for a scene's part, everything above it. */
function isShown(p) {
  if (!p.scene) return p.group.visible;
  return p.instances.some(instanceShown);
}

function visibleParts() {
  return [...parts.values()].filter(isShown);
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
  if (p.anchorFn) return p.anchorFn();
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
  else if (state.labels === 'picked' && state.picked && parts.get(state.picked) && isShown(parts.get(state.picked))) shown = [parts.get(state.picked)];
  // A scene names the parts its step is about.
  if (sceneRt?.active && state.labels !== 'none') {
    for (const id of sceneRt.labelParts()) {
      const p = parts.get(id);
      if (p && isShown(p) && !shown.includes(p)) shown.push(p);
    }
  }
  // The part under the laser is named whatever the label setting.
  const lit = laser.part && parts.get(laser.part);
  if (lit && isShown(lit) && !shown.includes(lit)) shown.push(lit);
  const o = (sceneRt?.active ? controls.target.clone() : new THREE.Vector3(0, 0, 0)).project(camera);
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
    el.className = `label ${i.side < 0 ? 'left' : 'right'}${i.dim ? ' dim' : ''}${i.p.info.id === state.picked ? ' picked' : ''}${i.p.info.id === laser.part ? ' laser' : ''}`;
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
  placeSlack();
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
 * Solid cut faces ("caps"). For each part and each cut plane, a stencil pass
 * counts how often each pixel's ray goes into and out of the part beyond the
 * plane (the part clipped by that plane alone); where the count is odd the
 * plane is inside the part, and a flat face of the part's inside colour is
 * drawn there. A cap is clipped by the other plane, so a wedge or a slab shows
 * two faces. Solids (caps: 'flat', made of open faces) are counted as one, in
 * the lesson's yellow. Parts that are not closed keep the old look (their
 * inside walls), which a cap would get wrong.
 */
const capClip = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e6), new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e6)];
const capGeometry = new THREE.PlaneGeometry(1, 1);
const capSets = []; // {parts: [p], items: [{j, stencil: [Mesh, Mesh], cap: Mesh}]}
let capsBuilt = false;
let capOrder = 10;

const stencilMaterials = [0, 1].map((j) =>
  [[THREE.BackSide, THREE.IncrementWrapStencilOp], [THREE.FrontSide, THREE.DecrementWrapStencilOp]].map(
    ([side, op]) => new THREE.MeshBasicMaterial({ side, clippingPlanes: [planes[j]], colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op }),
  ),
);

/** Whether a part's surface is closed (nearly every edge shared by two triangles), from its positions. */
function closedSurface(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const tris = (index ? index.count : pos.count) / 3;
  if (!tris || tris > 400000) return false;
  const q = modelSize * 1e-5;
  const ids = new Map();
  const vid = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    vid[i] = id;
  }
  const edges = new Map();
  const at = (t, c) => vid[index ? index.getX(t * 3 + c) : t * 3 + c];
  for (let t = 0; t < tris; t++) {
    for (let c = 0; c < 3; c++) {
      const a = at(t, c), b = at(t, (c + 1) % 3);
      const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n !== 2) open++;
  return open <= edges.size * 0.004;
}

function addCapSet(list, colour) {
  const set = { parts: list, items: [] };
  for (const j of [0, 1]) {
    const base = capOrder++;
    const stencil = [];
    for (const p of list) {
      for (const [k, m] of stencilMaterials[j].entries()) {
        const s = new THREE.Mesh(p.front.geometry, m);
        s.applyMatrix4(p.front.matrix);
        s.frustumCulled = false;
        s.visible = false;
        s.renderOrder = base + k * 0.1;
        p.group.add(s);
        stencil.push(s);
      }
    }
    const mat = new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [capClip[j]],
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
    });
    const cap = new THREE.Mesh(capGeometry, mat);
    cap.renderOrder = base + 0.2;
    cap.visible = false;
    cap.frustumCulled = false;
    // The next set counts afresh.
    cap.onAfterRender = (r) => r.clearStencil();
    scene.add(cap);
    set.items.push({ j, stencil, cap });
  }
  capSets.push(set);
}

function buildCaps() {
  if (capsBuilt) return;
  capsBuilt = true;
  const all = [...parts.values()];
  if (manifest?.kind === 'scene') {
    // A scene's closed parts that its script marks (a heart's chambers, the blood in them).
    for (const p of all) {
      if (!p.info.cap || !p.object?.isMesh) continue;
      const c = new THREE.Color(p.info.inside || p.info.color);
      if (!p.info.inside) c.multiplyScalar(0.72);
      addCapSet([p], c);
    }
    return;
  }
  if (manifest.caps === 'flat') {
    addCapSet(all, new THREE.Color(0xf2b33d));
    return;
  }
  // Parts that make one solid together (the Earth's crust: land, sea and its
  // underside) say so with capWith: the id of the part whose colour it shows.
  const sets = new Map();
  for (const p of all) {
    if (p.info.opacity || p.info.cap === false) continue;
    const key = p.info.capWith || p.info.id;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(p);
  }
  for (const [key, list] of sets) {
    if (list.length === 1 && !closedSurface(list[0].front.geometry)) continue;
    addCapSet(list, (parts.get(key) || list[0]).back.material.color.clone());
  }
}

/** Shows the caps of the planes in use, on their planes. */
function placeCaps() {
  const two = !!state.slice && state.slice.planes === 2;
  if (state.slice) {
    if (!two) capClip[0].set(new THREE.Vector3(0, 0, 1), 1e6);
    else if (unionClip) {
      capClip[0].copy(cut2);
      capClip[1].copy(cut);
    } else {
      capClip[0].copy(cut2).negate();
      capClip[1].copy(cut).negate();
    }
  }
  const faded = state.anim && (state.anim.kind === 'flow' || state.anim.kind === 'tour');
  for (const set of capSets) {
    const shown = set.parts.some((p) => (p.scene ? isShown(p) : p.group.visible));
    for (const it of set.items) {
      const on = !!state.slice && !faded && shown && (it.j === 0 || two);
      it.cap.visible = on;
      for (const s of it.stencil) s.visible = on;
      if (!on) continue;
      const pl = planes[it.j];
      it.cap.scale.setScalar(modelSize * 8);
      it.cap.position.copy(pl.normal).multiplyScalar(-pl.constant);
      it.cap.lookAt(it.cap.position.clone().sub(pl.normal));
    }
  }
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
  if (sceneRt?.active) return sceneRt.viewFrom(dir);
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
  return visibleParts().flatMap((p) => p.meshes || [p.front]);
}

/** A hit counts only on the kept side of the cut. */
const visibleHit = (h) => kept(h.point);

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  stopAutoRotate();
  sceneRt?.touched();
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
  for (const p of parts.values()) setGlow(p, glowFor(p));
  send({ event: 'pick', part: id });
}

/** How brightly [p] glows: picked, under the laser, or lit by an animation step. */
function glowFor(p) {
  return Math.max(p.info.id === state.picked ? 0.35 : 0, p.info.id === laser.part ? 0.55 : 0, p.animGlow || 0);
}

function setGlow(p, amount) {
  // A scene's parts glow through their materials' highlight, set each frame.
  if (p.scene) return;
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

/**
 * Sets the cut planes: [a] alone (a half), [a] and [b] taking out what is
 * behind both (a wedge), or with [union] keeping only what is in front of
 * both (a slab). Each plane is {n, q}: its normal (the kept side) and a point.
 */
function applyPlanes(a, b, opt = {}) {
  setClipUnion(!!(a && b && opt.union));
  if (!a) {
    cut.set(new THREE.Vector3(0, 0, -1), 1e6);
    cut2.set(new THREE.Vector3(0, 0, -1), -1e6);
    state.slice = null;
  } else {
    cut.setFromNormalAndCoplanarPoint(a.n.clone().normalize(), a.q);
    if (b) cut2.setFromNormalAndCoplanarPoint(b.n.clone().normalize(), b.q);
    else cut2.set(new THREE.Vector3(0, 0, -1), -1e6);
    state.slice = { normal: cut.normal.clone(), offset: -cut.constant, planes: b ? 2 : 1, wedge: !!b && !opt.union, slab: !!b && !!opt.union, anchors: opt.anchors || null };
  }
  if (state.slice) buildCaps();
  if (manifest?.kind === 'scene') sceneSides(!!state.slice);
  placeSlack();
  planeHint.show();
  placeCaps();
  lastLabels = 0;
}

/** A ready-made cut from the manifest (or the older free cut): normal and offset, normal2 for a wedge. */
function setSlice(s) {
  clearPeel();
  state.sweep = null;
  state.cut = null;
  if (!s) return applyPlanes(null);
  const plane = (n, offset) => {
    const v = new THREE.Vector3(...n).normalize();
    return { n: v, q: v.clone().multiplyScalar(offset || 0) };
  };
  const anchors = (s.id && manifest?.slices?.find((x) => x.id === s.id)?.anchors) || null;
  applyPlanes(plane(s.normal, s.offset), s.normal2 ? plane(s.normal2, s.offset2) : null, { anchors });
}

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
// Two directions across each axis; a wedge's slice is measured round from the first towards the second.
const ACROSS = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };

/** Where the visible model reaches along [axis] (at rest, before take-apart). */
function reachAlong(axis) {
  const box = new THREE.Box3();
  for (const p of parts.values()) {
    if (!p.group.visible) continue;
    if (!p.box) p.box = new THREE.Box3().setFromBufferAttribute(p.front.geometry.attributes.position).applyMatrix4(p.front.matrix);
    box.union(p.box);
  }
  if (box.isEmpty()) return [-modelSize / 2, modelSize / 2];
  return [box.min[axis], box.max[axis]];
}

/**
 * The kinds of cut the teacher picks from (c.mode):
 * - half: one plane across [axis] at [at] (-0.5..0.5 of the model's size); [flip] keeps the other half;
 * - wedge: a slice of [angle] degrees (30..180) taken out round [axis], like a cake, turned [turn] degrees;
 * - slab: only a slice [thickness] thick (0..1 of the size) at [at] is left;
 * - depth: a plane swept through the model, [depth] 0 (nothing cut) to 1, from the front of [axis]; [play] sweeps it;
 * - peel: the [peel] outermost layers of parts taken off;
 * - off.
 */
function setCut(c) {
  const mode = c.mode || 'off';
  if (mode !== 'depth' || !c.sweeping) state.sweep = null;
  if (mode !== 'peel') clearPeel();
  if (mode === 'off') {
    state.cut = null;
    applyPlanes(null);
    return send({ event: 'cut', mode: 'off' });
  }
  state.cut = { ...c };
  const axis = AXES[c.axis] ? c.axis : 'z';
  const a = AXES[axis];
  // A scene is cut through what the camera is looking at, at the size of the view.
  const scened = manifest?.kind === 'scene';
  const size = scened ? modelSize : manifest?.size || modelSize;
  const c0 = scened ? controls.target.clone() : new THREE.Vector3();
  if (mode === 'half') {
    const n = a.clone().multiplyScalar(c.flip ? 1 : -1);
    applyPlanes({ n, q: a.clone().multiplyScalar((c.at || 0) * size).add(c0) });
  } else if (mode === 'wedge') {
    const angle = Math.max(30, Math.min(180, c.angle ?? 90));
    if (angle >= 179.5) {
      applyPlanes({ n: a.clone().negate(), q: c0.clone() });
    } else {
      const [u, v] = ACROSS[axis].map((k) => AXES[k]);
      const mid = ((45 + (c.turn || 0)) * Math.PI) / 180;
      const half = (angle * Math.PI) / 360;
      // The normal of an edge at angle t, turned a quarter towards v.
      const perp = (t) => u.clone().multiplyScalar(-Math.sin(t)).addScaledVector(v, Math.cos(t));
      const o = c0.clone();
      applyPlanes({ n: perp(mid + half), q: o }, { n: perp(mid - half).negate(), q: o });
    }
  } else if (mode === 'slab') {
    const t = Math.max(0.01, Math.min(1, c.thickness ?? 0.2)) * size;
    const centre = a.clone().multiplyScalar((c.at || 0) * size).add(c0);
    applyPlanes({ n: a.clone(), q: centre.clone().addScaledVector(a, -t / 2) }, { n: a.clone().negate(), q: centre.clone().addScaledVector(a, t / 2) }, { union: true });
  } else if (mode === 'depth') {
    const d = Math.max(0, Math.min(0.98, c.depth ?? 0.5));
    const [lo, hi] = scened ? [c0[axis] - size / 2, c0[axis] + size / 2] : reachAlong(axis);
    const pad = (hi - lo) * 0.002;
    // From the front (the + side) inwards, or from the back with flip.
    const at = c.flip ? lo - pad + d * (hi - lo + 2 * pad) : hi + pad - d * (hi - lo + 2 * pad);
    applyPlanes({ n: a.clone().multiplyScalar(c.flip ? 1 : -1), q: a.clone().multiplyScalar(at) });
    if (c.play) state.sweep = { t0: performance.now(), from: c.depth > 0.9 ? 0 : c.depth || 0, ms: c.ms || 6000, c: { ...c, play: false } };
  } else if (mode === 'peel') {
    applyPlanes(null);
    const layers = peelLayers();
    const k = Math.max(0, Math.min(layers.length - 1, c.peel | 0));
    state.peeled = new Set(layers.slice(0, k).flat());
    applyVisibility();
    if (state.picked && state.peeled.has(state.picked)) pick(null);
    return send({ event: 'cut', mode, layers: layers.length, peel: k, peeled: [...state.peeled] });
  }
  if (!c.sweeping) send({ event: 'cut', mode, depth: mode === 'depth' ? c.depth ?? 0.5 : undefined });
}

/** Moves a playing depth cut on. */
function tickSweep(now) {
  const s = state.sweep;
  if (!s) return;
  const u = Math.min(1, (now - s.t0) / s.ms);
  const depth = s.from + (0.95 - s.from) * u;
  setCut({ ...s.c, depth, sweeping: true });
  if (u >= 1) {
    state.sweep = null;
    state.cut.depth = depth;
    send({ event: 'cut', mode: 'depth', depth, done: true });
  }
}

/** How far a part reaches from the middle of the model (sampled). */
function reachOf(p) {
  if (p.scene) {
    const box = new THREE.Box3().setFromObject(p.group);
    return box.isEmpty() ? 0 : box.distanceToPoint(controls.target) + box.getSize(new THREE.Vector3()).length() / 2;
  }
  const pos = p.front.geometry.attributes.position;
  const v = new THREE.Vector3();
  const step = Math.max(1, Math.floor(pos.count / 5000));
  let r = 0;
  for (let i = 0; i < pos.count; i += step) r = Math.max(r, v.fromBufferAttribute(pos, i).applyMatrix4(p.front.matrix).length());
  return r;
}

/**
 * The parts on show in layers, outermost first (the manifest's own "peel"
 * order if it has one): parts that reach about as far out peel together.
 */
function peelLayers() {
  const showing = (p) => {
    const v = p.info.variant;
    return (!v || v === state.variant) && !state.hidden.has(p.info.id) && (!p.info.hidden || state.shown.has(p.info.id));
  };
  if (manifest?.peel) return manifest.peel.map((ids) => ids.filter((id) => parts.has(id) && showing(parts.get(id)))).filter((l) => l.length);
  const list = [...parts.values()].filter(showing);
  for (const p of list) if (p.reach == null) p.reach = reachOf(p);
  list.sort((x, y) => y.reach - x.reach);
  const layers = [];
  for (const p of list) {
    const last = layers.at(-1);
    if (last && last.top - p.reach < modelSize * 0.02) last.ids.push(p.info.id);
    else layers.push({ top: p.reach, ids: [p.info.id] });
  }
  return layers.map((l) => l.ids);
}

function clearPeel() {
  if (!state.peeled.size) return;
  state.peeled = new Set();
  applyVisibility();
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
      if (!state.slice || state.slice.planes === 2) {
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
      mesh.visible = a > 0;
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
    p.animGlow = 0;
    setGlow(p, glowFor(p));
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
    p.animGlow = lit ? (tour ? 0.25 : 0.45) : 0;
    setGlow(p, glowFor(p));
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

// ------------------------------------------------------------------ laser

// The teacher points with a laser over the model. The app draws the trail
// (it answers the finger at once) and sends its points here: the part under
// the tip lights up and is named, and the trail goes into the pictures for
// the students' screen. The tip is looked at again every few frames, so the
// part under it changes as the model turns or moves under a still finger.
const laser = { tip: null, trail: [], part: null, fade: 1200, lastPick: 0, until: 0 };

/** The part (id) under the screen point [x], [y] (CSS pixels), if any. */
function partAt(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickables(), false).filter(visibleHit)[0];
  return hit ? hit.object.userData.part : null;
}

function setLaserPart(id) {
  if (id === laser.part) return;
  const was = laser.part && parts.get(laser.part);
  laser.part = id;
  if (was) setGlow(was, glowFor(was));
  const now = id && parts.get(id);
  if (now) setGlow(now, glowFor(now));
  lastLabels = 0; // name it on the next frame
  send({ event: 'laser', part: id });
}

/** [c.pts]: new points of the trail ([x, y] from 0 to 1 across the view), the last one the tip; [c.up]: the finger lifted; [c.off]: laser put away. */
function laserCommand(c) {
  const now = performance.now();
  if (c.fade) laser.fade = c.fade;
  if (c.off) {
    laser.tip = null;
    laser.trail = [];
    setLaserPart(null);
    return;
  }
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const [x, y] of c.pts || []) {
    laser.tip = { x: x * w, y: y * h };
    laser.trail.push([x * w, y * h, now, true]);
  }
  if (c.up) {
    laser.tip = null;
    // A break in the trail: the next stroke does not join this one.
    if (laser.trail.length) laser.trail[laser.trail.length - 1][3] = false;
  }
  laser.until = now + laser.fade;
  laserTick(now, true);
}

function laserTick(now, force = false) {
  laser.trail = laser.trail.filter((p) => now - p[2] < laser.fade);
  if (laser.tip) {
    if (force || now - laser.lastPick > 80) {
      laser.lastPick = now;
      setLaserPart(partAt(laser.tip.x, laser.tip.y));
    }
  } else if (laser.part && now > laser.until) {
    // The part stays lit while the trail fades, then goes back.
    setLaserPart(null);
  }
}

/** The trail, drawn into a picture [s] times the size of the screen. */
function drawLaser2d(g, s, now) {
  const pts = laser.trail;
  if (!pts.length) return;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a[3] === false) continue; // the finger lifted here
    const life = Math.max(0, 1 - (now - b[2]) / laser.fade);
    g.strokeStyle = `rgba(255, 46, 46, ${life * 0.35})`;
    g.lineWidth = 14 * s * life + 2;
    g.beginPath();
    g.moveTo(a[0] * s, a[1] * s);
    g.lineTo(b[0] * s, b[1] * s);
    g.stroke();
    g.strokeStyle = `rgba(255, 70, 60, ${life})`;
    g.lineWidth = 4 * s;
    g.stroke();
  }
  if (laser.tip) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(laser.tip.x * s, laser.tip.y * s, 4 * s, 0, Math.PI * 2);
    g.fill();
  }
}

// ------------------------------------------------------------------ notes

// The teacher writes on the model: notes pinned to a point of a part (they
// follow it as the model turns, comes apart or beats), strokes drawn on its
// surface (tubes stuck to the part), and ink drawn over the view (fixed to the
// screen). The app keeps them (lib/src/viewer/annotations.dart): every change
// is sent back whole as an `annotations` event, and `annotate` {op: 'set'}
// puts a saved set back. Pin and stroke points are in their part's own frame.
const notes = { pins: [], strokes: [], ink: [], draft: null, show: true, version: 0, seq: 0 };

const noteStyle = document.createElement('style');
noteStyle.textContent = `
  #notes { position: absolute; inset: 0; pointer-events: none; }
  #ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  #ink polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .pin { position: absolute; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, calc(-100% + 7px)); pointer-events: auto; cursor: pointer; }
  .pin .text { font: 600 14px/1.25 system-ui, -apple-system, "Noto Sans", "Noto Sans Devanagari", "Noto Sans Kannada", sans-serif;
    max-width: 14em; padding: 4px 9px; border-radius: 8px; margin-bottom: 4px; white-space: pre-wrap; box-shadow: 0 2px 8px rgba(0,0,0,0.45); }
  .pin .text:empty { display: none; }
  .pin .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 6px rgba(0,0,0,0.6); }
  .pin.dim { opacity: 0.4; }`;
document.head.appendChild(noteStyle);
const inkLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
inkLayer.id = 'ink';
const noteLayer = document.createElement('div');
noteLayer.id = 'notes';
document.body.append(inkLayer, noteLayer);

const newId = (k) => `${k}${Date.now().toString(36)}${(notes.seq++).toString(36)}`;
const round5 = (v) => Math.round(v * 1e5) / 1e5;
const darkText = (hex) => {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.55;
};

/** The cut planes in use. */
const activePlanes = () => (!state.slice ? [] : state.slice.planes === 2 ? [cut, cut2] : [cut]);

/**
 * The surface under a screen point (CSS pixels): {part, point, normal} in
 * world space, or null. Seen through a cut, it is the point on the cut face.
 */
function surfaceAt(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), camera);
  const objects = visibleParts().flatMap((p) => p.meshes || [p.front, p.back]);
  const h = raycaster.intersectObjects(objects, false).filter(visibleHit)[0];
  if (!h) return null;
  const part = h.object.userData.part;
  if (h.object.userData.back && state.slice) {
    let best = null;
    for (const pl of activePlanes()) {
      const q = raycaster.ray.intersectPlane(pl, new THREE.Vector3());
      if (!q) continue;
      const d = q.distanceTo(raycaster.ray.origin);
      if (d <= h.distance + 1e-9 && (!best || d > best.d)) best = { d, q, n: pl.normal.clone().negate() };
    }
    if (best) return { part, point: best.q, normal: best.n };
  }
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : raycaster.ray.direction.clone().negate();
  if (h.object.userData.back) n.negate();
  return { part, point: h.point.clone(), normal: n };
}

function strokeMesh(s) {
  const p = parts.get(s.part);
  if (!p || !s.pts.length) return null;
  const r = modelSize * 0.0022 * (s.width || 2);
  const pts = s.pts.map((a) => new THREE.Vector3(...a));
  let geo;
  if (pts.length < 2) {
    geo = new THREE.SphereGeometry(r * 1.6, 10, 8);
    geo.translate(pts[0].x, pts[0].y, pts[0].z);
  } else {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    geo = new THREE.TubeGeometry(curve, Math.min(800, pts.length * 3), r, 6, false);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color || '#e53935'), clippingPlanes: slackPlanes, clipIntersection: !unionClip }));
  mesh.renderOrder = 1;
  mesh.userData.note = s.id;
  p.group.add(mesh);
  return mesh;
}

function dropMesh(s) {
  if (!s.mesh) return;
  s.mesh.removeFromParent();
  s.mesh.geometry.dispose();
  s.mesh.material.dispose();
  s.mesh = null;
}

function rebuildStroke(s) {
  dropMesh(s);
  s.mesh = strokeMesh(s);
  if (s.mesh) s.mesh.visible = notes.show;
}

function notesJson() {
  return {
    v: 1,
    pins: notes.pins.map((n) => ({ id: n.id, part: n.part, at: n.at, text: n.text, color: n.color })),
    strokes: notes.strokes.map((s) => ({ id: s.id, part: s.part, color: s.color, width: s.width, pts: s.pts })),
    ink: notes.ink.map((s) => ({ id: s.id, color: s.color, width: s.width, pts: s.pts })),
  };
}

function setNotes(data) {
  for (const s of notes.strokes) dropMesh(s);
  if (notes.draft) dropMesh(notes.draft);
  notes.draft = null;
  const list = (k) => (Array.isArray(data?.[k]) ? data[k] : []);
  notes.pins = list('pins').filter((n) => n && n.id && Array.isArray(n.at)).map((n) => ({ ...n, text: n.text || '', color: n.color || '#f2b33d' }));
  notes.strokes = list('strokes').filter((s) => s && s.id && Array.isArray(s.pts)).map((s) => ({ ...s }));
  notes.ink = list('ink').filter((s) => s && s.id && Array.isArray(s.pts)).map((s) => ({ ...s }));
  for (const s of notes.strokes) rebuildStroke(s);
  notesChanged(null, false);
}

function notesChanged(pin, tell = true) {
  notes.version++;
  drawInk();
  pinEls.clear();
  noteLayer.innerHTML = '';
  if (tell) send({ event: 'annotations', data: notesJson(), pin: pin ?? undefined });
}

function findNote(id) {
  for (const k of ['pins', 'strokes', 'ink']) {
    const i = notes[k].findIndex((n) => n.id === id);
    if (i >= 0) return { list: notes[k], i, note: notes[k][i], kind: k };
  }
  return null;
}

/** New points of a stroke ([x, y] 0..1 across the view); [up] ends it. */
function strokeCommand(c) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  let d = notes.draft;
  if (!d) {
    d = notes.draft = { id: newId(c.surface ? 's' : 'i'), surface: !!c.surface, part: null, color: c.color || '#e53935', width: c.width || 2, pts: [], mesh: null };
  }
  let grew = false;
  for (const [x, y] of c.pts || []) {
    if (!d.surface) {
      d.pts.push([round5(x), round5(y)]);
      grew = true;
      continue;
    }
    const hit = surfaceAt(x * w, y * h);
    if (!hit) continue;
    if (!d.part) d.part = hit.part;
    const p = parts.get(d.part);
    p.group.updateMatrixWorld(true);
    const local = p.group.worldToLocal(hit.point.clone().addScaledVector(hit.normal, modelSize * 0.003));
    const last = d.pts.at(-1);
    if (last && local.distanceTo(new THREE.Vector3(...last)) < modelSize * 0.003) continue;
    d.pts.push(local.toArray().map(round5));
    grew = true;
  }
  if (grew && d.surface) rebuildStroke(d);
  if (grew && !d.surface) drawInk();
  if (!c.up) return;
  notes.draft = null;
  if (!d.pts.length) {
    dropMesh(d);
    drawInk();
    return;
  }
  const { surface, ...rest } = d;
  if (surface) notes.strokes.push(rest);
  else notes.ink.push(rest);
  notesChanged();
}

/** The ink over the view, drawn into the overlay. */
function drawInk() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  inkLayer.setAttribute('viewBox', `0 0 ${w} ${h}`);
  inkLayer.innerHTML = '';
  if (!notes.show) return;
  const all = notes.draft && !notes.draft.surface ? [...notes.ink, notes.draft] : notes.ink;
  for (const s of all) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', s.pts.map(([x, y]) => `${x * w},${y * h}`).join(' ') + (s.pts.length === 1 ? ` ${s.pts[0][0] * w + 0.1},${s.pts[0][1] * h}` : ''));
    line.setAttribute('stroke', s.color);
    line.setAttribute('stroke-width', 2 + 2 * (s.width || 2));
    inkLayer.appendChild(line);
  }
}

/** Where each pin is on screen now, and whether it shows: [{n, x, y, dim}]. */
const pinHidden = new Map();
function pinPlaces(now) {
  const out = [];
  if (!notes.show) return out;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const n of notes.pins) {
    const p = parts.get(n.part);
    if (!p || !isShown(p)) continue;
    const world = p.group.localToWorld(new THREE.Vector3(...n.at));
    if (!kept(world, modelSize * 0.003)) continue;
    const q = world.clone().project(camera);
    if (q.z > 1) continue;
    let known = pinHidden.get(n.id);
    if (!known || now - known.at > 600) {
      const dir = world.clone().sub(camera.position);
      const dist = dir.length();
      raycaster.set(camera.position, dir.normalize());
      const hit = raycaster.intersectObjects(pickables(), false).filter(visibleHit)[0];
      known = { at: now, hidden: !!hit && hit.distance < dist - modelSize * 0.02 };
      pinHidden.set(n.id, known);
    }
    out.push({ n, x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h, dim: known.hidden });
  }
  return out;
}

const pinEls = new Map();
function drawPins(now) {
  const places = pinPlaces(now);
  const seen = new Set();
  for (const { n, x, y, dim } of places) {
    seen.add(n.id);
    let el = pinEls.get(n.id);
    if (!el || el.dataset.key !== `${n.text}|${n.color}`) {
      el?.remove();
      el = document.createElement('div');
      el.className = 'pin';
      el.dataset.note = n.id;
      el.dataset.key = `${n.text}|${n.color}`;
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = n.text;
      text.style.background = n.color;
      text.style.color = darkText(n.color) ? '#111' : '#fff';
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.style.background = n.color;
      el.append(text, dot);
      noteLayer.appendChild(el);
      pinEls.set(n.id, el);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.toggle('dim', dim);
  }
  for (const [id, el] of pinEls) {
    if (!seen.has(id)) {
      el.remove();
      pinEls.delete(id);
    }
  }
}

noteLayer.addEventListener('pointerup', (e) => {
  const id = e.target?.closest?.('.pin')?.dataset?.note;
  if (id) send({ event: 'notePicked', id });
});

/** The pins and the ink, drawn into a picture [s] times the size of the screen. */
function drawNotes2d(g, s, width) {
  if (!notes.show) return;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const k of notes.ink) {
    g.strokeStyle = k.color;
    g.lineWidth = (2 + 2 * (k.width || 2)) * s;
    g.beginPath();
    k.pts.forEach(([x, y], i) => (i ? g.lineTo(x * w * s, y * h * s) : g.moveTo(x * w * s, y * h * s)));
    if (k.pts.length === 1) g.lineTo(k.pts[0][0] * w * s + 0.1, k.pts[0][1] * h * s);
    g.stroke();
  }
  g.font = `600 ${14 * s}px system-ui, "Noto Sans", sans-serif`;
  g.textBaseline = 'middle';
  for (const { n, x, y, dim } of pinPlaces(performance.now())) {
    g.globalAlpha = dim ? 0.4 : 1;
    g.fillStyle = n.color;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2 * s;
    g.beginPath();
    g.arc(x * s, y * s, 6 * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (n.text) {
      const lines = String(n.text).split('\n').slice(0, 4);
      const tw = Math.max(...lines.map((l) => g.measureText(l).width));
      const lh = 18 * s;
      const bw = tw + 18 * s, bh = lines.length * lh + 8 * s;
      const bx = Math.max(4 * s, Math.min(width - bw - 4 * s, x * s - bw / 2));
      const by = y * s - 10 * s - bh;
      g.fillStyle = n.color;
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = darkText(n.color) ? '#111111' : '#ffffff';
      lines.forEach((l, i) => g.fillText(l, bx + 9 * s, by + 4 * s + lh * (i + 0.5)));
    }
  }
  g.globalAlpha = 1;
}

/**
 * `annotate`: op 'set' {data} puts saved notes back (no event); 'pin' {x, y,
 * text, color} pins a note on the part under the point (answered by
 * `annotations` with the new pin's id, or `noteMissed`); 'stroke' {pts, up,
 * surface, color, width} draws; 'update' {id, text, color}; 'delete' {id};
 * 'clear'; 'show' {on}.
 */
function annotate(c) {
  switch (c.op) {
    case 'set':
      return setNotes(c.data);
    case 'show':
      notes.show = c.on !== false;
      for (const s of notes.strokes) if (s.mesh) s.mesh.visible = notes.show;
      return notesChanged(null, false);
    case 'pin': {
      const hit = surfaceAt(c.x * renderer.domElement.clientWidth, c.y * renderer.domElement.clientHeight);
      if (!hit) return send({ event: 'noteMissed' });
      const p = parts.get(hit.part);
      p.group.updateMatrixWorld(true);
      const at = p.group.worldToLocal(hit.point.clone()).toArray().map(round5);
      const pin = { id: newId('p'), part: hit.part, at, text: c.text || '', color: c.color || '#f2b33d' };
      notes.pins.push(pin);
      return notesChanged(pin.id);
    }
    case 'stroke':
      return strokeCommand(c);
    case 'update': {
      const f = findNote(c.id);
      if (!f) return;
      if (typeof c.text === 'string' && f.kind === 'pins') f.note.text = c.text;
      if (c.color) {
        f.note.color = c.color;
        if (f.kind === 'strokes') rebuildStroke(f.note);
      }
      return notesChanged();
    }
    case 'delete': {
      const f = findNote(c.id);
      if (!f) return;
      dropMesh(f.note);
      f.list.splice(f.i, 1);
      return notesChanged();
    }
    case 'clear':
      for (const s of notes.strokes) dropMesh(s);
      notes.pins = [];
      notes.strokes = [];
      notes.ink = [];
      return notesChanged();
    default:
      throw new Error(`unknown annotate op ${c.op}`);
  }
}

// ------------------------------------------------------------------ scenes

// A narrated process scene (src/scenes): its parts join `parts` like a
// model's, so picking, labels, the laser, cuts and notes all work on it.
let sceneRt = null;

async function loadScene(id) {
  sceneRt = createSceneRuntime({
    scene, root, camera, controls, renderer, send, parts, planes, pmrem,
    lights: { key, fill, rim, sky },
    lang: () => state.lang,
    glowFor,
    labelsChanged: () => (lastLabels = 0),
    setPixelRatio: (r) => {
      renderer.setPixelRatio(r);
      resize();
    },
    // The size of what the camera frames, for cuts, notes and labels.
    focus: (pose) => {
      modelSize = Math.max(1e-3, pose.pos.distanceTo(pose.target) * 0.7);
      placeSlack();
    },
    registerPart: registerScenePart,
    // A cut the scene's step asks for (a heart opened down the middle): {normal, point}, or null.
    sceneCut: (c) => {
      state.cut = null;
      state.sweep = null;
      clearPeel();
      applyPlanes(c ? { n: new THREE.Vector3(...c.normal), q: new THREE.Vector3(...(c.point || [0, 0, 0])) } : null);
    },
    prepare: () => {},
    loadModel: loadModelParts,
  });
  const script = await sceneRt.load(id, state.lang);
  manifest = { kind: 'scene', id, size: modelSize, parts: script.parts.filter((p) => parts.has(p.id)).map((p) => parts.get(p.id).info), views: [], peel: script.peel };
  resize();
  send({ event: 'loaded', model: id, scene: id, parts: manifest.parts.map((p) => p.id), steps: script.steps.length });
  // For render checks in a browser.
  window.__kxSteps = script.steps.length;
  window.__kxDebug = () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, ...sceneRt.state() });
}

/** Makes [object] part [info.id] of the scene: a group round it (the teacher can hide it) and its meshes pickable. */
function registerScenePart(info, object, { anchor } = {}) {
  const wrapper = new THREE.Group();
  wrapper.name = info.id;
  const parent = object.parent;
  if (!parent) throw new Error(`scene part ${info.id} must be added to the scene first`);
  parent.add(wrapper);
  wrapper.add(object);
  const meshes = [];
  const mats = new Set();
  object.traverse((o) => {
    // Atoms drawn as sprites light up with their part too.
    if (o.isPoints && o.material.userData.kx) mats.add(o.material);
    if (!o.isMesh || o.userData.decor) return;
    o.userData.part = info.id;
    meshes.push(o);
    // Each part lights up alone: a material another part already uses is copied.
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const own = ms.map((m) => {
      if (m.userData.kxOwner && m.userData.kxOwner !== info.id) {
        const c = cloneMaterial(m);
        c.userData.kxOwner = info.id;
        return c;
      }
      m.userData.kxOwner = info.id;
      return m;
    });
    o.material = Array.isArray(o.material) ? own : own[0];
    own.forEach((m) => mats.add(m));
  });
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  // The anchor is kept in the wrapper's space (its parent's).
  wrapper.updateWorldMatrix(true, false);
  const local = wrapper.worldToLocal(centre.clone());
  const fixed = Array.isArray(anchor) ? new THREE.Vector3(...anchor) : null;
  const instance = {
    wrapper,
    object,
    anchorFn: typeof anchor === 'function' ? anchor : fixed ? () => fixed.clone() : () => local.clone(),
  };
  // The same part can appear in several stages (CO₂ on the leaf and in the
  // stroma): one part, an instance in each; the one on screen is used.
  let p = parts.get(info.id);
  if (!p?.scene) {
    p = {
      info: { ...info, anchor: (fixed || local).toArray(), centroid: (fixed || local).toArray() },
      instances: [],
      front: meshes[0] || new THREE.Mesh(),
      back: new THREE.Object3D(),
      meshes: [],
      materials: [],
      scene: true,
      base: centre,
      restColor: new THREE.Color(info.color || '#888888'),
      get current() {
        return this.instances.find(instanceShown) || this.instances[0];
      },
      get group() {
        return this.current.wrapper;
      },
      get object() {
        return this.current.object;
      },
      get anchorFn() {
        return this.current.anchorFn;
      },
    };
    parts.set(info.id, p);
  }
  p.instances.push(instance);
  p.meshes.push(...meshes);
  for (const m of mats) if (!p.materials.includes(m)) p.materials.push(m);
  return wrapper;
}

/** Whether one instance of a scene's part is on screen (it and everything above it). */
function instanceShown(inst) {
  if (!inst.object.visible) return false;
  for (let o = inst.wrapper; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** While a scene is cut, its surfaces show their insides (the cut face of a hollow cell). */
function sceneSides(cut) {
  root.traverse((o) => {
    if (!o.material || o.userData.glowPoints) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const side = cut ? THREE.DoubleSide : m.userData.side0 ?? THREE.FrontSide;
      if (m.side !== side) {
        m.side = side;
        m.needsUpdate = true;
      }
    }
  });
}

/** A model's geometry (heart, lungs…) for a scene to build with: {manifest, geometries: {partId: BufferGeometry}}. */
async function loadModelParts(id) {
  const base = params.get('base') || 'models/';
  const m = await (await fetch(`${base}${id}.json`)).json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${base}${m.file}`);
  gltf.scene.updateMatrixWorld(true);
  const geometries = {};
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      geometries[o.name] = g;
    }
  });
  return { manifest: m, geometries };
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
  drawNotes2d(g, c.width / src.clientWidth, c.width);
  drawLabels2d(g, c.width / src.clientWidth, c.width);
  if (sceneRt?.active) sceneRt.drawCaption2d(g, c.width / src.clientWidth, c.width, c.height);
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
    state.slice ? [...cut.normal.toArray(), cut.constant, ...cut2.normal.toArray(), cut2.constant, unionClip].join() : '',
    [...state.peeled].join(), notes.version, notes.draft?.pts.length ?? 0,
    [...state.hidden].join(), [...state.shown].join(), renderer.domElement.width, renderer.domElement.height, sceneRt?.active ? sceneRt.key : '',
  ].map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v))).join('|');
  if (key !== mirror.key) {
    mirror.key = key;
    mirror.until = now + 1500;
  }
  if (!state.anim && !state.autoRotate && !laser.trail.length && !sceneRt?.playing && now > mirror.until) return;
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
  drawNotes2d(g, w / renderer.domElement.clientWidth, w);
  drawLabels2d(g, w / renderer.domElement.clientWidth, w);
  drawLaser2d(g, w / renderer.domElement.clientWidth, performance.now());
  if (sceneRt?.active) sceneRt.drawCaption2d(g, w / renderer.domElement.clientWidth, w, h);
  return c.toDataURL('image/jpeg', 0.72);
}

// ------------------------------------------------------------------ loop

let lastLabels = 0;
function render(now) {
  if (sceneRt?.active) return renderScene(now);
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
  tickSweep(now);
  placeCaps();
  laserTick(now);
  planeHint.tick(now);
  controls.update();
  renderer.render(scene, camera);
  if (now - lastLabels > 90) {
    lastLabels = now;
    drawLabels();
  }
  drawPins(now);
}

/** A frame of a scene: its timeline moves on and poses everything. */
function renderScene(now) {
  sceneRt.tick(now);
  tickSweep(now);
  laserTick(now);
  planeHint.tick(now);
  controls.update();
  renderer.render(scene, camera);
  if (now - lastLabels > 90) {
    lastLabels = now;
    drawLabels();
  }
  drawPins(now);
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
  // Turning the model without touching it (two fingers while the laser is
  // out): [dx] round the vertical axis and [dy] up or down, in radians;
  // [scale] above 1 comes closer.
  orbit: (c) => {
    flight = null;
    stopAutoRotate();
    sceneRt?.touched();
    const off = camera.position.clone().sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta -= c.dx || 0;
    s.phi = Math.max(0.05, Math.min(Math.PI - 0.05, s.phi - (c.dy || 0)));
    if (c.scale) s.radius = Math.max(modelSize * 0.1, Math.min(modelSize * 30, s.radius / c.scale));
    off.setFromSpherical(s);
    camera.position.copy(controls.target).add(off);
    controls.update();
  },
  laser: laserCommand,
  // For tests: which part is at a point of the view ([x], [y] from 0 to 1).
  partAt: (c) => send({ event: 'partAt', part: partAt(c.x * renderer.domElement.clientWidth, c.y * renderer.domElement.clientHeight) }),
  reset: () => {
    state.explode = 0;
    state.cut = null;
    applyExplode();
    setSlice(null);
    stopAnimation();
    if (sceneRt?.active) sceneRt.reset();
    else view(manifest.views?.[0]?.dir || [0, 0, 1]);
  },
  explode: (c) => {
    state.explode = Math.max(0, Math.min(1, c.amount));
    applyExplode();
  },
  slice: (c) => setSlice(c.normal ? c : null),
  // The kinds of cut: half, wedge (a cake slice), slab, depth, peel, off.
  cut: setCut,
  // Notes, drawing on the model and ink over the view.
  annotate: (c) => annotate(c),
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
  // A narrated scene's timeline: op play | pause | toggle | next | prev | step | seek | speed | replay | captions.
  scene: (c) => sceneRt?.command(c),
  // Drawing quality: 'high', or 'low' for weak graphics chips (fewer pixels and particles).
  quality: (c) => {
    if (sceneRt?.active) sceneRt.applyQuality(c.level);
    else {
      renderer.setPixelRatio(c.level === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      resize();
    }
  },
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
      caps: capSets.reduce((n, s) => n + s.items.filter((i) => i.cap.visible).length, 0),
      explode: state.explode,
      animation: state.anim?.id ?? null,
      scene: sceneRt?.active ? sceneRt.state() : null,
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
      variant: state.variant,
      laser: laser.part,
      cut: state.cut?.mode ?? (state.slice ? 'slice' : null),
      peeled: [...state.peeled],
      notes: { pins: notes.pins.length, strokes: notes.strokes.length, ink: notes.ink.length },
      scene: sceneRt?.active ? sceneRt.state() : null,
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
const sceneId = params.get('scene');
if (sceneId) loadScene(sceneId).catch((e) => send({ event: "error", message: `Could not open scene ${sceneId}: ${e?.message || e}`, stack: String(e?.stack || "").slice(0, 600) }));
else if (model) load(model).catch((e) => send({ event: 'error', message: `Could not open ${model}: ${e?.message || e}` }));
