/**
 * Code 128 (set B) barcodes for library labels: the bar pattern of a text of printable ASCII, with the start code,
 * the modulo-103 check character, the stop code and a quiet zone of ten modules on each side. Pure; the PDF writer
 * draws the bars.
 */

// Bar/space widths of the 107 symbols (0–105 and the stop), each six (stop: seven) widths summing to 11 (stop: 13).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;
const QUIET = 10;

/** The symbol values of a text in code set B, with the check character; throws on a character set B lacks. */
export function code128Values(text: string): number[] {
  const vals = [...text].map((c) => {
    const n = c.charCodeAt(0);
    if (n < 32 || n > 126) throw new Error(`Code 128 cannot encode "${c}"`);
    return n - 32;
  });
  const check = (START_B + vals.reduce((s, v, i) => s + v * (i + 1), 0)) % 103;
  return [START_B, ...vals, check, STOP];
}

/** The module pattern (true = bar) with quiet zones. */
export function code128(text: string): boolean[] {
  const out: boolean[] = Array<boolean>(QUIET).fill(false);
  for (const v of code128Values(text)) {
    const widths = PATTERNS[v];
    for (let i = 0; i < widths.length; i++) for (let k = 0; k < Number(widths[i]); k++) out.push(i % 2 === 0);
  }
  for (let k = 0; k < QUIET; k++) out.push(false);
  return out;
}
