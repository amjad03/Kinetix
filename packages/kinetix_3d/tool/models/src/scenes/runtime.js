// Scene mode: narrated, step-by-step process animations (photosynthesis,
// the heart's cycle, the water cycle…) in the same viewer page as the models.
//
// A scene (src/scenes/<id>.js) is a script and a builder. The script is
// plain data: titles, parts and steps, each step with a caption in English,
// Hindi and Kannada, a camera (where it looks from and at), the parts it
// lights up and names, how long it lasts and which stage (a place in the
// scene: the leaf, the cell, the chloroplast) it is in. The builder makes the
// objects and returns update(s), which poses everything for a moment of the
// timeline: it is a pure function of time, so playing, stepping and
// scrubbing all show the same thing at the same moment.
//
// The runtime plays the timeline (play, pause, step, seek, speed), flies the
// camera between the steps' framings (dipping to the background between
// stages), pulses the parts the narration names and reports progress to the
// app with `scene` events. Parts are registered with the viewer like a
// model's parts, so tapping, labels, the laser, cuts and notes work as they
// do for models.
import * as THREE from 'three';
import { easeInOut, clamp01, highlight } from './kit.js';
import { scenes } from './index.js';

const V = (a) => new THREE.Vector3(...a);
const DESIGN_ASPECT = 16 / 9;

export function createSceneRuntime(env) {
  const { scene, root, camera, controls, renderer, send } = env;
  const rt = {
    id: null,
    script: null,
    api: null,
    steps: [],
    starts: [],
    total: 0,
    T: 0,
    playing: false,
    speed: 1,
    step: -1,
    stage: null,
    quality: 'high',
    flight: null,
    dip: null,
    touched: false,
    lastTick: 0,
    lastSent: 0,
    group: new THREE.Group(),
    stages: new Map(),
    markers: [],
    captions: params().get('captions') === '1',
  };
  root.add(rt.group);

  function params() {
    return new URLSearchParams(location.search);
  }

  // The dip between stages: the view fades to the background and back.
  const dipEl = document.createElement('div');
  dipEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 45%, #1c232c 0%, #0c0f13 100%)';
  // A soft vignette over the view, as in film.
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)';
  // The caption (for checking scenes in a browser; the app shows its own).
  const captionEl = document.createElement('div');
  captionEl.style.cssText =
    'position:absolute;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(860px,86%);padding:12px 20px;border-radius:12px;' +
    'background:rgba(12,15,19,0.72);color:#f1f3f5;font:500 19px/1.4 system-ui,"Noto Sans","Noto Sans Devanagari","Noto Sans Kannada",sans-serif;' +
    'text-align:center;pointer-events:none;display:none;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.08)';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font:600 13px/1.2 system-ui,sans-serif;letter-spacing:0.08em;text-transform:uppercase;color:#9fd3a8;margin-bottom:6px';
  const textEl = document.createElement('div');
  captionEl.append(titleEl, textEl);

  // ---------------------------------------------------------------- loading

  async function load(id, lang) {
    const mod = scenes[id];
    if (!mod) throw new Error(`no scene ${id}`);
    rt.id = id;
    rt.script = mod.script;
    rt.steps = mod.script.steps;
    rt.starts = [];
    let t = 0;
    for (const s of rt.steps) {
      rt.starts.push(t);
      t += s.seconds;
    }
    rt.total = t;
    rt.lang = lang;
    setupLook(mod.script.look || {});
    const k = kitFor(mod.script);
    rt.api = (await mod.build(k)) || {};
    for (const p of env.parts.values()) env.prepare(p);
    // Every material can be cut, like a model's.
    rt.group.traverse((o) => {
      for (const m of materials(o)) {
        m.clippingPlanes = env.planes;
        m.clipIntersection = true;
        m.userData.side0 = m.side;
      }
    });
    document.body.append(vignette, dipEl, captionEl);
    if (rt.captions) captionEl.style.display = 'block';
    applyQuality(rt.quality);
    rt.T = 0;
    goToStep(0, true);
    rt.playing = params().get('autoplay') !== '0';
    // For checking a moment of a scene: ?t=<seconds> or ?step=<i>&u=<0..1>.
    const at = params().get('t'), stepParam = params().get('step');
    if (stepParam !== null) {
      const i = Math.max(0, Math.min(rt.steps.length - 1, parseInt(stepParam, 10) || 0));
      seek(rt.starts[i] + clamp01(parseFloat(params().get('u') || '0')) * rt.steps[i].seconds, true);
    } else if (at !== null) {
      seek(parseFloat(at), true);
    } else {
      // Opening: come in towards the first framing.
      const s0 = rt.steps[0], to = poseOf(s0), from = fromPose(s0, to);
      camera.position.copy(from.pos);
      controls.target.copy(from.target);
      fly(to, s0.camera.ms || 2600, from);
    }
    rt.lastTick = performance.now();
    return mod.script;
  }

  function materials(o) {
    if (!o.material) return [];
    return Array.isArray(o.material) ? o.material : [o.material];
  }

  /** What a builder works with. */
  function kitFor(script) {
    const k = {
      THREE,
      root: rt.group,
      quality: rt.quality,
      script,
      camera,
      renderer,
      lights: env.lights,
      /** The group for stage [id] (made on first use). */
      stage(id) {
        if (!rt.stages.has(id)) {
          const g = new THREE.Group();
          g.name = `stage:${id}`;
          g.visible = false;
          rt.group.add(g);
          rt.stages.set(id, g);
        }
        return rt.stages.get(id);
      },
      /**
       * Registers [object] (already added to the scene) as part [id] of the
       * script: it can be tapped, named, pointed at, cut and written on.
       * [anchor]: where its label points, in the object's parent's space
       * (a point or a function giving one each frame).
       */
      part(id, object, { anchor } = {}) {
        const info = script.parts.find((p) => p.id === id);
        if (!info) throw new Error(`scene ${script.id}: part ${id} is not in the script`);
        return env.registerPart(info, object, { anchor });
      },
      /**
       * A part that is a moving thing drawn among many (a CO₂ molecule, an
       * electron): an invisible ball of [radius] in [parent] that follows
       * [at(out)] each frame, so it can be named, tapped and pointed at.
       */
      marker(id, parent, at, radius = 0.1) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        m.renderOrder = -1;
        parent.add(m);
        const out = new THREE.Vector3();
        rt.markers.push(() => {
          const p = at(out);
          m.visible = !!p;
          if (p) m.position.copy(p);
        });
        k.part(id, m, { anchor: () => m.position.clone() });
        return m;
      },
      /** Loads one of the viewer's models (heart, lungs…) and gives its parts' meshes and manifest. */
      loadModel: env.loadModel,
    };
    return k;
  }

  /** The look of a scene: background, light, exposure. */
  function setupLook(look) {
    const { key, fill, rim, sky } = env.lights;
    const bg = look.background || ['#1f2730', '#0b0e12'];
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    dipEl.style.background = `radial-gradient(ellipse at 50% 45%, ${bg[0]} 0%, ${bg[1]} 100%)`;
    rt.look = look;
    scene.environment = studioEnvironment(look);
    renderer.toneMappingExposure = look.exposure ?? 0.9;
    scene.environmentIntensity = look.env ?? 0.6;
    key.intensity = look.key ?? 1.5;
    key.color.set(look.keyColor || '#fff4e6');
    key.position.set(...(look.keyAt || [3, 5, 4]));
    fill.intensity = look.fill ?? 0.45;
    fill.color.set(look.fillColor || '#cfe0ff');
    fill.position.set(...(look.fillAt || [-3, -2.5, 4]));
    rim.intensity = look.rim ?? 1.0;
    rim.color.set(look.rimColor || '#d6e6ff');
    rim.position.set(...(look.rimAt || [-2, 3, -5]));
    sky.intensity = look.hemi ?? 0.25;
    sky.color.set(look.hemiSky || '#dfe9ff');
    sky.groundColor.set(look.hemiGround || '#2a241e');
    camera.near = look.near ?? 0.01;
    camera.far = look.far ?? 400;
    camera.updateProjectionMatrix();
    controls.minDistance = look.minDistance ?? 0.05;
    controls.maxDistance = look.maxDistance ?? 200;
  }

  /**
   * A photographer's studio as the environment the surfaces reflect: a dark
   * room with a large soft key box above, a cool strip light at the side and
   * a rim strip behind. Its reflections read as soft highlights, not the
   * bright walls of a room.
   */
  function studioEnvironment(look) {
    const s = new THREE.Scene();
    const top = new THREE.Color(look.envTop || '#2b3138'), bottom = new THREE.Color(look.envBottom || '#08090b');
    const sphere = new THREE.SphereGeometry(20, 32, 16);
    const col = [];
    const p = sphere.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp(p.getY(i) / 20 * 0.5 + 0.5, 0, 1);
      const c = bottom.clone().lerp(top, Math.pow(t, 1.4));
      col.push(c.r, c.g, c.b);
    }
    sphere.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    s.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
    const box = (w, h, at, power, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
      m.position.set(...at);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    box(9, 6, [-5, 12, 6], look.envKey ?? 4.5, look.keyColor || '#fff4e6');
    box(3, 10, [13, 2, 3], look.envFill ?? 1.4, '#d8e4ff');
    box(12, 2.5, [-2, 5, -13], look.envRim ?? 2.2, '#d0e2ff');
    box(14, 6, [0, -14, 2], 0.18, look.envFloor || '#3a3026');
    const tex = env.pmrem.fromScene(s, 0.035).texture;
    s.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    return tex;
  }

  /** A stage's own light: fog for depth at its scale, and its exposure. */
  function stageLook(id) {
    const look = rt.look || {};
    const st = look.stages?.[id] || {};
    const bg = look.background || ['#1f2730', '#0b0e12'];
    const fog = st.fog || look.fog;
    scene.fog = fog ? new THREE.Fog(new THREE.Color(st.fogColor || look.fogColor || bg[1]).lerp(new THREE.Color(bg[0]), 0.35), fog[0], fog[1]) : null;
    renderer.toneMappingExposure = st.exposure ?? look.exposure ?? 0.9;
    scene.environmentIntensity = st.env ?? look.env ?? 0.6;
  }

  /** Room for the caption: what the camera looks at sits a little above the middle. */
  function frame(w, h) {
    const up = rt.look?.frameUp ?? 0.08;
    if (w > 0 && h > 0) camera.setViewOffset(w, h, 0, Math.round(h * up), w, h);
  }

  // ---------------------------------------------------------------- quality

  /** high: full resolution and every particle; low: one pixel per screen pixel, fewer particles. */
  function applyQuality(level) {
    rt.quality = level === 'low' ? 'low' : 'high';
    env.setPixelRatio(rt.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = rt.quality === 'high' && !!rt.script?.look?.shadows;
    rt.group.traverse((o) => {
      if (o.userData.highOnly) o.visible = rt.quality === 'high';
      // Membranes of packed spheres: about half of them, a little larger.
      if (o.isSphereImpostors) o.density(rt.quality === 'high' ? 1 : 0.55);
    });
  }

  // ---------------------------------------------------------------- camera

  /** The framing of [step], widened on screens narrower than 16:9. */
  function poseOf(step) {
    const c = step.camera;
    const target = V(c.target);
    const off = V(c.pos).sub(target);
    const aspect = camera.aspect || DESIGN_ASPECT;
    if (aspect < DESIGN_ASPECT) off.multiplyScalar(Math.pow(DESIGN_ASPECT / aspect, 0.72));
    return { pos: target.clone().add(off), target, fov: c.fov || 35 };
  }

  function currentPose() {
    return { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  }

  function fly(to, ms, from = currentPose()) {
    rt.flight = { from, to, t0: performance.now(), ms };
  }

  const sph0 = new THREE.Spherical(), sph1 = new THREE.Spherical();
  function tickFlight(now) {
    const f = rt.flight;
    if (!f) return false;
    const u = clamp01((now - f.t0) / f.ms);
    const e = easeInOut(u);
    const target = f.from.target.clone().lerp(f.to.target, e);
    sph0.setFromVector3(f.from.pos.clone().sub(f.from.target));
    sph1.setFromVector3(f.to.pos.clone().sub(f.to.target));
    let dTheta = sph1.theta - sph0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    // The distance changes in proportion (a dolly from far to very near feels even).
    const r = Math.exp(Math.log(Math.max(1e-6, sph0.radius)) + (Math.log(Math.max(1e-6, sph1.radius)) - Math.log(Math.max(1e-6, sph0.radius))) * e);
    const s = new THREE.Spherical(r, sph0.phi + (sph1.phi - sph0.phi) * e, sph0.theta + dTheta * e);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(s));
    controls.target.copy(target);
    const fov = f.from.fov + (f.to.fov - f.from.fov) * e;
    if (Math.abs(fov - camera.fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (u >= 1) rt.flight = null;
    return true;
  }

  /** A slow drift round the framing while a step plays, so the picture never sits dead still. */
  function drift(dt) {
    const s = rt.steps[rt.step];
    const rate = s?.camera?.drift ?? 0.025;
    if (!rate || rt.touched || rt.flight || !rt.playing) return;
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rate * dt * rt.speed);
    camera.position.copy(controls.target).add(off);
  }

  // ---------------------------------------------------------------- steps

  function stepAt(T) {
    let i = 0;
    for (let k = 0; k < rt.starts.length; k++) if (T >= rt.starts[k] - 1e-6) i = k;
    return i;
  }

  function showStage(id) {
    if (id !== rt.stage) stageLook(id);
    rt.stage = id;
    for (const [k, g] of rt.stages) g.visible = k === id;
  }

  /** Moves to step [i]: the camera flies there (or jumps, [instant]); a new stage dips. */
  function goToStep(i, instant = false) {
    const prev = rt.step;
    rt.step = i;
    const s = rt.steps[i];
    const stage = s.stage || rt.steps[0].stage || null;
    const to = poseOf(s);
    rt.touched = false;
    env.focus(to);
    // The step's own cut-away (or none): the teacher can still cut as they like.
    const cutKey = JSON.stringify(s.cut || null);
    if (cutKey !== rt.cutKey) {
      rt.cutKey = cutKey;
      env.sceneCut?.(s.cut || null);
    }
    if (instant || prev < 0) {
      showStage(stage);
      rt.flight = null;
      rt.dip = null;
      camera.position.copy(to.pos);
      controls.target.copy(to.target);
      camera.fov = to.fov;
      camera.updateProjectionMatrix();
    } else if (stage !== rt.stage) {
      // Out of one place and into the next: fade to the background, then come
      // in from further out (the step's camera.from, or along its line).
      rt.dip = { t0: performance.now(), stage, to, s };
      rt.flight = null;
      // Dolly a little into the old stage while it fades.
      const cur = currentPose();
      const towards = cur.target.clone().lerp(cur.pos, 0.55);
      fly({ pos: towards, target: cur.target.clone(), fov: cur.fov }, 420, cur);
    } else {
      fly(to, s.camera.ms || 1900);
    }
    lastLabelsChanged();
    tell(true);
  }

  function fromPose(s, to) {
    if (s.camera.from) return { pos: V(s.camera.from), target: to.target.clone(), fov: to.fov };
    const off = to.pos.clone().sub(to.target).multiplyScalar(2.4);
    return { pos: to.target.clone().add(off), target: to.target.clone(), fov: to.fov };
  }

  function tickDip(now) {
    const d = rt.dip;
    if (!d) {
      dipEl.style.opacity = '0';
      return;
    }
    const t = now - d.t0;
    const half = 380;
    if (t < half) {
      dipEl.style.opacity = String(easeInOut(t / half));
    } else {
      if (!d.swapped) {
        d.swapped = true;
        showStage(d.stage);
        const from = fromPose(d.s, d.to);
        camera.position.copy(from.pos);
        controls.target.copy(from.target);
        fly(d.to, d.s.camera.ms || 2300, from);
      }
      const k = clamp01((t - half) / 650);
      dipEl.style.opacity = String(1 - easeInOut(k));
      if (k >= 1) rt.dip = null;
    }
  }

  // ---------------------------------------------------------------- the clock

  function seek(T, instant = false) {
    rt.T = Math.max(0, Math.min(rt.total - 1e-3, T));
    const i = stepAt(rt.T);
    if (i !== rt.step) goToStep(i, instant);
    tell(true);
  }

  function setPlaying(on) {
    if (on && rt.T >= rt.total - 0.01) seek(0);
    rt.playing = on;
    tell(true);
  }

  function tick(now) {
    if (!rt.api) return;
    const dt = Math.min(0.1, Math.max(0, (now - rt.lastTick) / 1000));
    rt.lastTick = now;
    if (rt.playing) {
      rt.T += dt * rt.speed;
      if (rt.T >= rt.total) {
        rt.T = rt.total - 1e-3;
        rt.playing = false;
        tell(true);
      }
      const i = stepAt(rt.T);
      if (i !== rt.step) goToStep(i);
    }
    tickDip(now);
    if (!tickFlight(now)) drift(dt);
    const s = moment(dt);
    rt.api.update?.(s);
    for (const f of rt.markers) f();
    applyHighlights(s, now);
    updateCaption();
    if (rt.playing && now - rt.lastSent > 250) tell();
  }

  /** The moment the builder poses the scene for. */
  function moment(dt) {
    const i = rt.step;
    const st = rt.steps[i];
    const t = rt.T - rt.starts[i];
    const ids = rt.steps.map((x) => x.id);
    const progress = (id) => {
      const k = ids.indexOf(id);
      if (k < 0) return 0;
      return clamp01((rt.T - rt.starts[k]) / rt.steps[k].seconds);
    };
    return {
      T: rt.T,
      dt: rt.playing ? dt * rt.speed : 0,
      step: i,
      id: st.id,
      t,
      u: clamp01(t / st.seconds),
      stage: rt.stage,
      quality: rt.quality,
      /** How many of a scene's particles to draw: all, or fewer on low quality. */
      density: rt.quality === 'high' ? 1 : 0.6,
      playing: rt.playing,
      /** How far through step [id] the timeline is: 0 before it, 1 after it. */
      p: progress,
      /** Whether the step showing is one of [ids]. */
      is: (...list) => list.includes(st.id),
      camera,
    };
  }

  // ---------------------------------------------------------------- highlights, labels, captions

  function applyHighlights(s, now) {
    const st = rt.steps[rt.step];
    const lit = new Set(st.highlight || []);
    const ramp = clamp01(s.t / 0.8);
    const beat = 0.5 + 0.5 * Math.sin(now / 420);
    for (const p of env.parts.values()) {
      if (!p.scene) continue;
      const step = lit.has(p.info.id) ? ramp * (0.16 + 0.14 * beat) : 0;
      const amount = Math.max(step, env.glowFor(p));
      if (amount === p.lastGlow) continue;
      p.lastGlow = amount;
      for (const m of p.materials) highlight(m, amount);
    }
  }

  let labelsVersion = 0;
  function lastLabelsChanged() {
    labelsVersion++;
    env.labelsChanged();
  }

  /** The parts the step names (shown as labels unless labels are off). */
  function labelParts() {
    const st = rt.steps[rt.step];
    return st?.labels || [];
  }

  const textOf = (o) => (o ? o[env.lang()] || o.en || '' : '');

  function updateCaption() {
    if (!rt.captions) return;
    const st = rt.steps[rt.step];
    const title = textOf(st.title), text = textOf(st.caption);
    if (titleEl.textContent !== title) titleEl.textContent = title;
    if (textEl.textContent !== text) textEl.textContent = text;
  }

  /** The caption, drawn into a picture [s] times the size of the screen (snapshots, the students' screen). */
  function drawCaption2d(g, s, width, height) {
    const st = rt.steps[rt.step];
    if (!st) return;
    const text = textOf(st.caption), title = textOf(st.title);
    g.save();
    g.font = `500 ${17 * s}px system-ui, "Noto Sans", sans-serif`;
    const maxW = Math.min(860 * s, width * 0.86);
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > maxW - 36 * s && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    const lh = 24 * s;
    const boxH = lines.length * lh + 44 * s;
    const boxW = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)) + 40 * s);
    const x = (width - boxW) / 2, y = height - boxH - 22 * s;
    g.fillStyle = 'rgba(12,15,19,0.74)';
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, boxW, boxH, 12 * s) : g.rect(x, y, boxW, boxH);
    g.fill();
    g.fillStyle = '#9fd3a8';
    g.font = `600 ${12 * s}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title.toUpperCase(), width / 2, y + 16 * s);
    g.fillStyle = '#f1f3f5';
    g.font = `500 ${17 * s}px system-ui, "Noto Sans", sans-serif`;
    lines.forEach((l, i) => g.fillText(l, width / 2, y + 36 * s + i * lh + lh / 2 - 2 * s));
    g.restore();
  }

  // ---------------------------------------------------------------- the app

  function tell(force = false) {
    if (!rt.script) return;
    rt.lastSent = performance.now();
    send({ event: 'scene', id: rt.id, step: rt.step, steps: rt.steps.length, time: Math.round(rt.T * 100) / 100, total: rt.total, playing: rt.playing, speed: rt.speed, stage: rt.stage, force: force || undefined });
  }

  /**
   * The `scene` command: op play | pause | toggle | next | prev | step {step} |
   * seek {time} (seconds from the start) | speed {speed} | replay | captions {on}.
   */
  function command(c) {
    if (!rt.script) return;
    switch (c.op) {
      case 'play':
        return setPlaying(true);
      case 'pause':
        return setPlaying(false);
      case 'toggle':
        return setPlaying(!rt.playing);
      case 'next':
        return seek(rt.starts[Math.min(rt.steps.length - 1, rt.step + 1)]);
      case 'prev':
        // Back to the start of this step, or the one before if just begun.
        return seek(rt.T - rt.starts[rt.step] > 1.5 ? rt.starts[rt.step] : rt.starts[Math.max(0, rt.step - 1)]);
      case 'step':
        return seek(rt.starts[Math.max(0, Math.min(rt.steps.length - 1, c.step | 0))]);
      case 'seek':
        return seek(+c.time || 0, !!c.instant);
      case 'speed':
        rt.speed = Math.max(0.25, Math.min(3, +c.speed || 1));
        return tell(true);
      case 'replay':
        seek(0);
        return setPlaying(true);
      case 'captions':
        rt.captions = c.on !== false;
        captionEl.style.display = rt.captions ? 'block' : 'none';
        return;
      default:
        throw new Error(`unknown scene op ${c.op}`);
    }
  }

  /** The user turned or zoomed the view: stop drifting until the next step. */
  function touched() {
    rt.touched = true;
    rt.flight = null;
  }

  /** Flies to look at the step's focus from [dir] (the Views directions). */
  function viewFrom(dir) {
    const target = controls.target.clone();
    const r = camera.position.distanceTo(target);
    fly({ pos: target.clone().add(V(dir).normalize().multiplyScalar(r)), target, fov: camera.fov }, 900);
  }

  function reset() {
    rt.speed = 1;
    seek(0, true);
    goToStep(0, true);
  }

  return {
    rt,
    load,
    tick,
    command,
    touched,
    viewFrom,
    reset,
    applyQuality,
    frame,
    labelParts,
    drawCaption2d,
    get active() {
      return !!rt.script;
    },
    get playing() {
      return rt.playing;
    },
    get key() {
      return `${rt.T.toFixed(2)}|${rt.step}|${rt.playing}|${labelsVersion}`;
    },
    state: () => ({ id: rt.id, step: rt.step, steps: rt.steps.length, time: rt.T, total: rt.total, playing: rt.playing, speed: rt.speed, stage: rt.stage, quality: rt.quality }),
  };
}
