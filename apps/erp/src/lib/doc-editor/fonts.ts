/**
 * The document fonts in the browser: @font-face rules for each curated family (the same TrueType
 * files the API embeds in PDFs, served by GET /v1/documents/designs/fonts/:file through the ERP),
 * with the matching Noto Devanagari and Kannada faces for Hindi and Kannada text, so the editor
 * canvas sets text as the print does.
 */
import { cssFamily } from './render';
import type { FontFamilyId } from './schema';

type Weight = 400 | 600 | 700;

const FAMILIES: Record<FontFamilyId, { latin: Partial<Record<Weight, string>> & { italic?: string }; indic: 'serif' | 'sans' }> = {
  'noto-serif': { latin: { 400: 'NotoSerif-Regular', 600: 'NotoSerif-SemiBold', 700: 'NotoSerif-Bold', italic: 'NotoSerif-Italic' }, indic: 'serif' },
  'noto-sans': { latin: { 400: 'NotoSans-Regular', 600: 'NotoSans-SemiBold', 700: 'NotoSans-Bold' }, indic: 'sans' },
  playfair: { latin: { 400: 'PlayfairDisplay-Regular', 700: 'PlayfairDisplay-Bold', italic: 'PlayfairDisplay-Italic' }, indic: 'serif' },
  'eb-garamond': { latin: { 400: 'EBGaramond-Regular', 700: 'EBGaramond-Bold', italic: 'EBGaramond-Italic' }, indic: 'serif' },
  cinzel: { latin: { 400: 'Cinzel-Regular', 700: 'Cinzel-Bold' }, indic: 'serif' },
  poppins: { latin: { 400: 'Poppins-Regular', 600: 'Poppins-SemiBold', 700: 'Poppins-Bold', italic: 'Poppins-Italic' }, indic: 'sans' },
};

const INDIC = {
  serif: { dev: ['NotoSerifDevanagari-Regular', 'NotoSerifDevanagari-Bold'], kn: ['NotoSerifKannada-Regular', 'NotoSerifKannada-Bold'] },
  sans: { dev: ['NotoSansDevanagari-Regular', 'NotoSansDevanagari-Bold'], kn: ['NotoSansKannada-Regular', 'NotoSansKannada-Bold'] },
} as const;

const DEVANAGARI = 'U+0900-097F, U+1CD0-1CF6, U+1CF8-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF';
const KANNADA = 'U+0C80-0CFF, U+1CD0, U+1CD2, U+1CDA, U+1CF2, U+1CF4, U+200C-200D, U+20B9, U+25CC';

const url = (file: string) => `/api/doc-image?kind=font&file=${file}.ttf`;
const face = (family: FontFamilyId, file: string, weight: string, style = 'normal', range?: string) =>
  `@font-face{font-family:"${cssFamily(family)}";src:url("${url(file)}") format("truetype");font-weight:${weight};font-style:${style};font-display:block${range ? `;unicode-range:${range}` : ''}}`;

/** The @font-face rules for every document font (browsers download a face only when text uses it). */
export function fontFaceCss(): string {
  const out: string[] = [];
  for (const [id, spec] of Object.entries(FAMILIES) as [FontFamilyId, (typeof FAMILIES)[FontFamilyId]][]) {
    const indic = INDIC[spec.indic];
    // Every weight gets the same descriptors for its Latin and its Indic faces, so the browser
    // treats them as one font and picks the face by unicode-range (Indic after Latin, so it wins
    // for those scripts). A missing weight (600 in some families) takes the bold.
    for (const w of [400, 600, 700] as Weight[]) {
      const file = spec.latin[w] ?? spec.latin[700]!;
      const bold = w >= 600 ? 1 : 0;
      out.push(face(id, file, String(w)), face(id, indic.dev[bold], String(w), 'normal', DEVANAGARI), face(id, indic.kn[bold], String(w), 'normal', KANNADA));
    }
    if (spec.latin.italic) out.push(face(id, spec.latin.italic, '400 700', 'italic'), face(id, indic.dev[0], '400 700', 'italic', DEVANAGARI), face(id, indic.kn[0], '400 700', 'italic', KANNADA));
  }
  return out.join('\n');
}

/**
 * Loads the faces a layout uses (Latin, plus Devanagari or Kannada when the text has them) and
 * resolves when they are ready, so text is measured with the real fonts.
 */
export async function loadFonts(families: FontFamilyId[], sampleText: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const probe = `Ag${/[ऀ-ॿ]/.test(sampleText) ? 'क' : ''}${/[ಀ-೿]/.test(sampleText) ? 'ಕ' : ''}`;
  const loads: Promise<unknown>[] = [];
  for (const f of new Set(families))
    for (const w of [400, 600, 700]) {
      loads.push(document.fonts.load(`${w} 16px "${cssFamily(f)}"`, probe));
      if (FAMILIES[f].latin.italic && w === 400) loads.push(document.fonts.load(`italic 400 16px "${cssFamily(f)}"`, 'Ag'));
    }
  await Promise.allSettled(loads);
}

/** Every family a layout's text uses (`heading` and `body` resolved). */
export function familiesIn(layoutJson: string, fonts: { heading: FontFamilyId; body: FontFamilyId }): FontFamilyId[] {
  const out = new Set<FontFamilyId>([fonts.heading, fonts.body]);
  for (const id of Object.keys(FAMILIES) as FontFamilyId[]) if (layoutJson.includes(`"${id}"`)) out.add(id);
  return [...out];
}
