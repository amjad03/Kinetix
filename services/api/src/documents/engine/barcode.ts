/**
 * Code 128 (ISO/IEC 15417) for roll, admission and employee numbers: code set B for text, code
 * set C (two digits per symbol) when the value is all digits of even length. Returns the module
 * pattern as alternating bar/space widths, starting with a bar.
 */

// Bar/space widths of symbol values 0..106 (106 is the stop pattern, with its final bar).
const PATTERNS = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 ' +
  '232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 ' +
  '313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 ' +
  '111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 ' +
  '114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'
)
  .split(' ')
  .map((p) => [...p].map(Number));

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Symbol values for `text` (start, data, checksum, stop). Characters outside ASCII 32-126 become "?". */
export function code128Values(text: string): number[] {
  const digits = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 2;
  const values = digits ? [START_C, ...(text.match(/\d\d/g) ?? []).map(Number)] : [START_B, ...[...text].map((c) => {
    const cp = c.charCodeAt(0);
    return cp >= 32 && cp <= 126 ? cp - 32 : 31;
  })];
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, check, STOP];
}

/** Alternating bar and space widths in modules (first is a bar), without quiet zones. */
export function code128(text: string): number[] {
  return code128Values(text).flatMap((v) => PATTERNS[v]);
}

/** Total width in modules. */
export const code128Width = (text: string) => code128(text).reduce((a, b) => a + b, 0);

export const CODE128_PATTERNS = PATTERNS;
