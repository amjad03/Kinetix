// Shared by the earth and space scenes: a procedural Earth and Moon (data
// textures, no image files) and a material lit by the Sun alone, so day and
// night, phases and eclipses come out right whatever the studio lights do.
import { THREE, fbm, clamp01, glowTexture } from './kit.js';

const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

let earthTex = null;
/** Earth as an equirectangular data texture: oceans, continents, deserts, ice. */
export function earthTexture(w = 768) {
  if (earthTex) return earthTex;
  const h = w / 2;
  const data = new Uint8Array(w * h * 4);
  const deep = hex('#1b416d'), shallow = hex('#2f6e9c'), green = hex('#4f7238'), dry = hex('#b49a62'), high = hex('#8a7c63'), ice = hex('#e9eef2');
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      const dx = Math.cos(lat) * Math.cos(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.sin(lon);
      const e = fbm(dx * 1.5 + 3.1, dy * 1.5, dz * 1.5 - 1.7, 5) + 0.12 * fbm(dx * 6, dy * 6, dz * 6, 2);
      const coast = 0.05;
      const sea = mix(deep, shallow, smoothstep(coast - 0.22, coast, e));
      const desert = smoothstep(0.5, 0.0, Math.abs(Math.abs(lat) - 0.42)) * (0.5 + 0.5 * fbm(dx * 4, dy * 4, dz * 4, 2));
      let c = mix(green, dry, clamp01(desert * 1.2));
      c = mix(c, high, smoothstep(0.25, 0.45, e));
      // A soft coastline, so the texture stays smooth when magnified.
      c = mix(sea, c, smoothstep(coast - 0.012, coast + 0.012, e));
      const polar = smoothstep(1.12, 1.25, Math.abs(lat) + 0.06 * fbm(dx * 5, dy * 5, dz * 5, 2));
      c = mix(c, ice, polar);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  earthTex = new THREE.DataTexture(data, w, h);
  earthTex.colorSpace = THREE.SRGBColorSpace;
  earthTex.wrapS = THREE.RepeatWrapping;
  earthTex.magFilter = THREE.LinearFilter;
  earthTex.minFilter = THREE.LinearMipmapLinearFilter;
  earthTex.generateMipmaps = true;
  earthTex.needsUpdate = true;
  return earthTex;
}

let moonTex = null;
/** The Moon: grey highlands, darker seas, a scatter of craters. */
export function moonTexture(w = 256) {
  if (moonTex) return moonTex;
  const h = w / 2;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      const dx = Math.cos(lat) * Math.cos(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.sin(lon);
      const maria = smoothstep(0.05, 0.25, fbm(dx * 1.4 + 7, dy * 1.4, dz * 1.4, 3));
      const grain = fbm(dx * 9, dy * 9, dz * 9, 3);
      const crater = Math.abs(fbm(dx * 18 + 2, dy * 18, dz * 18, 2));
      let v = 168 - 62 * maria + 26 * grain - (crater < 0.04 ? 20 : 0);
      v = Math.max(40, Math.min(230, v));
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v * 0.98;
      data[i + 2] = v * 0.95;
      data[i + 3] = 255;
    }
  }
  moonTex = new THREE.DataTexture(data, w, h);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  moonTex.wrapS = THREE.RepeatWrapping;
  moonTex.magFilter = THREE.LinearFilter;
  moonTex.minFilter = THREE.LinearMipmapLinearFilter;
  moonTex.generateMipmaps = true;
  moonTex.needsUpdate = true;
  return moonTex;
}

/**
 * A surface lit by the Sun at [sun] (a world position, shared and updated by
 * the scene): a soft day–night line, a faint ambient so the night side is
 * not black, an optional atmosphere glow at the rim, and the viewer's
 * highlight. For eclipses, set uniforms occA/occB (x, y, z, radius of a
 * sphere that can hide the Sun) and sunR (the Sun's radius); [umbra] is the
 * light that still reaches the shadow.
 */
export function sunlitMaterial({ map, color = '#ffffff', sun, ambient = 0.06, atmosphere = 0, night = '#0b1830', tint = '#ffffff', umbra = '#000000' }) {
  const uniforms = {
    map: { value: map },
    useMap: { value: map ? 1 : 0 },
    color: { value: new THREE.Color(color) },
    sun: { value: sun },
    ambient: { value: ambient },
    atmo: { value: atmosphere },
    night: { value: new THREE.Color(night) },
    tint: { value: new THREE.Color(tint) },
    kxHl: { value: new THREE.Color(0, 0, 0) },
    occA: { value: new THREE.Vector4(0, 0, 0, 0) },
    occB: { value: new THREE.Vector4(0, 0, 0, 0) },
    sunR: { value: 1 },
    umbra: { value: new THREE.Color(umbra) },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv;
      #include <clipping_planes_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float useMap; uniform vec3 color; uniform vec3 sun; uniform float ambient;
      uniform float atmo; uniform vec3 night; uniform vec3 tint; uniform vec3 kxHl; uniform vec4 occA; uniform vec4 occB; uniform float sunR; uniform vec3 umbra;
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv;
      #include <clipping_planes_pars_fragment>
      // How much of the Sun a sphere (xyz centre, w radius) hides, seen from p: a soft disc overlap.
      float occlude(vec4 o, vec3 p) {
        if (o.w <= 0.0) return 0.0;
        vec3 toSun = sun - p; float dS = length(toSun); vec3 d = toSun / dS;
        vec3 toO = o.xyz - p; float t = dot(toO, d);
        if (t <= 0.0 || t >= dS) return 0.0;
        float sep = length(toO - d * t) / t;   // angle between the Sun and the sphere
        float rs = sunR / dS, ro = o.w / t;      // their angular radii
        return clamp((rs + ro - sep) / (2.0 * min(rs, ro)), 0.0, 1.0) * min(1.0, (ro * ro) / (rs * rs));
      }
      void main() {
        #include <clipping_planes_fragment>
        vec3 n = normalize(vN);
        vec3 l = normalize(sun - vPos);
        float d = dot(n, l);
        float lit = smoothstep(-0.06, 0.2, d) * (0.35 + 0.65 * max(d, 0.0));
        float shade = 1.0 - max(occlude(occA, vPos), occlude(occB, vPos));
        float lit0 = lit;
        lit *= shade;
        vec3 albedo = color * (useMap > 0.5 ? texture2D(map, vUv).rgb : vec3(1.0));
        vec3 c = albedo * tint * lit + albedo * night * ambient * 4.0 * (1.0 - lit);
        // In a shadow, a little light bent through an atmosphere (a lunar eclipse's red).
        c += albedo * umbra * (1.0 - shade) * lit0;
        vec3 v = normalize(cameraPosition - vPos);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        c += atmo * vec3(0.35, 0.6, 1.0) * rim * smoothstep(-0.3, 0.4, d) * shade;
        c += kxHl * (0.35 + 0.65 * rim);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    clipping: true,
  });
  m.userData.kx = uniforms;
  m.userData.sunlit = true;
  return m;
}

/** The Sun: a bright disc with a soft corona. */
export function sunMesh(radius) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1c8').multiplyScalar(1.6), toneMapped: false })));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf70', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.scale.setScalar(radius * 6);
  g.add(sprite);
  return g;
}

/** A field of faint stars far away, as a backdrop. */
export function starfield(n, radius, rnd) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * radius, u * radius, Math.sin(a) * r * radius], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#c8d4ff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  p.userData.decor = true;
  return p;
}
