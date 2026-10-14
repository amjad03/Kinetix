import sharp from 'sharp';

/**
 * Demonstration branding for the sample documents, the seed and tests: a crest, a logo for
 * light and dark grounds, three signatures and an illustrated portrait. Drawn as SVG (no text, so
 * no fonts are needed) and rasterised to PNG.
 */

const crest = (ink: string, gold: string, paper: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gold}"/><stop offset="1" stop-color="#7a5a1e"/></linearGradient>
  </defs>
  <g fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round">
    <path d="M38 150 C20 120 20 80 40 52"/><path d="M162 150 C180 120 180 80 160 52"/>
  </g>
  <g fill="url(#g)">
    ${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${30 - i * 1.2 + (i > 2 ? 2 : 0)}" cy="${140 - i * 16}" rx="5" ry="10" transform="rotate(${-30 + i * 6} ${30 - i * 1.2} ${140 - i * 16})"/><ellipse cx="${170 + i * 1.2 - (i > 2 ? 2 : 0)}" cy="${140 - i * 16}" rx="5" ry="10" transform="rotate(${30 - i * 6} ${170 + i * 1.2} ${140 - i * 16})"/>`).join('')}
  </g>
  <path d="M100 18 L158 36 L158 96 C158 136 132 162 100 178 C68 162 42 136 42 96 L42 36 Z" fill="${ink}" stroke="url(#g)" stroke-width="6"/>
  <path d="M100 30 L148 45 L148 96 C148 129 127 151 100 165 C73 151 52 129 52 96 L52 45 Z" fill="none" stroke="${gold}" stroke-width="1.5" opacity="0.8"/>
  <path d="M100 60 C112 72 108 82 100 90 C92 82 88 72 100 60 Z" fill="${gold}"/>
  <path d="M100 68 C105 75 104 80 100 85 C96 80 95 75 100 68 Z" fill="${paper}" opacity="0.85"/>
  <rect x="96" y="90" width="8" height="18" fill="${gold}"/>
  <path d="M62 112 C78 104 92 106 100 114 C108 106 122 104 138 112 L138 140 C122 132 108 134 100 142 C92 134 78 132 62 140 Z" fill="${paper}" stroke="${gold}" stroke-width="2"/>
  <path d="M100 114 L100 142" stroke="${gold}" stroke-width="2"/>
  ${[0, 1, 2].map((i) => `<path d="M70 ${118 + i * 6} C80 ${114 + i * 6} 90 ${115 + i * 6} 95 ${119 + i * 6}" stroke="${ink}" stroke-width="1.2" fill="none" opacity="0.5"/><path d="M105 ${119 + i * 6} C110 ${115 + i * 6} 120 ${114 + i * 6} 130 ${118 + i * 6}" stroke="${ink}" stroke-width="1.2" fill="none" opacity="0.5"/>`).join('')}
  ${[-1, 0, 1].map((i) => `<path d="M${100 + i * 22} 36 l3 7 7 0 -6 4 2 7 -6 -4 -6 4 2 -7 -6 -4 7 0 z" fill="${gold}"/>`).join('')}
</svg>`;

const signature = (d: string, ink = '#1d2f6f') => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110">
  <path d="${d}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SIGS = {
  principal: 'M20 74 C34 30 52 22 58 40 C64 60 44 86 40 72 C36 58 74 36 86 52 C94 64 82 80 92 74 C104 66 110 44 118 52 C126 60 116 78 128 72 C140 66 146 50 154 56 C162 62 156 76 168 70 C188 58 200 46 214 52 C232 60 196 84 236 70 C256 62 274 54 300 50 M70 92 C140 82 210 80 290 84',
  registrar: 'M24 70 C30 40 44 30 50 46 C56 62 36 82 52 76 C70 68 80 40 90 46 C100 52 88 76 102 72 C118 66 126 48 136 54 C146 60 134 78 150 72 C170 64 176 42 192 48 C210 56 190 82 214 72 C236 62 250 52 268 56 C280 60 274 74 296 64 M40 88 L250 86',
  controller: 'M30 60 C40 20 70 20 66 50 C62 80 30 84 40 64 C52 42 92 44 100 62 C106 76 92 84 106 76 C124 66 130 40 146 48 C160 56 148 78 166 72 C184 66 192 52 206 58 C220 64 208 80 228 72 C250 62 266 48 292 58 M60 90 C120 80 200 92 280 84',
  finance: 'M26 66 C38 34 60 30 62 50 C64 70 40 80 52 70 C66 58 84 50 94 60 C104 70 92 80 110 74 C130 66 140 44 156 52 C170 60 158 80 178 72 C196 64 206 56 222 60 C240 66 226 80 250 70 C268 62 284 58 300 60',
  hr: 'M28 72 C32 36 56 26 60 48 C64 70 42 84 50 70 C60 52 80 46 92 58 C100 66 90 82 104 76 C122 68 128 48 142 54 C156 60 146 78 164 72 C182 66 190 50 204 56 C220 62 210 78 230 70 C250 62 270 50 298 54',
};

const portrait = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe7f1"/><stop offset="1" stop-color="#b9c7d8"/></linearGradient>
    <linearGradient id="kurta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6b8f"/><stop offset="1" stop-color="#1f4a66"/></linearGradient>
    <radialGradient id="skin" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#d9a77f"/><stop offset="1" stop-color="#b98159"/></radialGradient>
  </defs>
  <rect width="300" height="360" fill="url(#bg)"/>
  <path d="M30 360 C36 286 92 262 150 262 C208 262 264 286 270 360 Z" fill="url(#kurta)"/>
  <path d="M126 262 L150 300 L174 262 Z" fill="#c99a74"/>
  <rect x="128" y="214" width="44" height="54" rx="18" fill="#c08d66"/>
  <path d="M84 120 C82 60 120 40 152 40 C196 40 222 70 218 124 C222 170 214 214 206 250 C196 214 196 170 190 140 L110 140 C104 170 104 214 94 250 C86 214 80 170 84 120 Z" fill="#2a1a12"/>
  <ellipse cx="150" cy="146" rx="52" ry="66" fill="url(#skin)"/>
  <path d="M98 128 C104 84 132 70 156 72 C184 74 202 92 204 130 C184 104 150 92 112 108 Z" fill="#2a1a12"/>
  <ellipse cx="129" cy="148" rx="6" ry="4" fill="#2a1a12"/><ellipse cx="171" cy="148" rx="6" ry="4" fill="#2a1a12"/>
  <path d="M118 136 C124 132 134 132 140 136 M160 136 C166 132 176 132 182 136" stroke="#2a1a12" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M150 150 C148 162 146 170 152 174" stroke="#a5704c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M134 188 C144 196 158 196 168 188" stroke="#8c4b3a" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="150" cy="122" r="3" fill="#a8323e"/>
</svg>`;

const logoDark = (gold: string) => crest('#ffffff00', gold, '#ffffff').replace('fill="#ffffff00"', 'fill="#ffffff" fill-opacity="0.12"');

export interface DemoAssets {
  emblem: Buffer;
  logo: Buffer;
  logoDark: Buffer;
  photo: Buffer;
  signatures: Record<'principal' | 'registrar' | 'controller' | 'finance' | 'hr', Buffer>;
}

let cached: Promise<DemoAssets> | null = null;

const png = (svg: string, width: number) => sharp(Buffer.from(svg), { density: 300 }).resize({ width }).png().toBuffer();

export function demoAssets(): Promise<DemoAssets> {
  cached ??= (async () => ({
    emblem: await png(crest('#1f3a5f', '#c9a24b', '#fdfaf2'), 600),
    logo: await png(crest('#1f3a5f', '#c9a24b', '#fdfaf2'), 400),
    logoDark: await png(logoDark('#e3c57a'), 400),
    photo: await sharp(Buffer.from(portrait), { density: 200 }).resize({ width: 360 }).jpeg({ quality: 88 }).toBuffer(),
    signatures: Object.fromEntries(await Promise.all(Object.entries(SIGS).map(async ([k, d]) => [k, await png(signature(d), 480)]))) as DemoAssets['signatures'],
  }))();
  return cached;
}
