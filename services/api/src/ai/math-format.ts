/**
 * Answer clean-up for the board: models often reply with LaTeX ($x^2$, \frac{a}{b}) or markdown
 * that a classroom panel cannot draw. These helpers turn it into plain Unicode maths a student
 * can read on any screen, and tidy OCR output from handwriting.
 */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω', phi: 'φ', epsilon: 'ε', rho: 'ρ', tau: 'τ',
  Delta: 'Δ', Omega: 'Ω', Sigma: 'Σ', Pi: 'Π', Theta: 'Θ', Phi: 'Φ',
};
const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', infty: '∞', degree: '°', circ: '°',
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', implies: '⇒', therefore: '∴', because: '∵', angle: '∠', perp: '⊥', parallel: '∥',
  in: '∈', subset: '⊂', cup: '∪', cap: '∩', int: '∫', sum: '∑', prod: '∏', partial: '∂', nabla: '∇', sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', lim: 'lim',
};
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };

const mapAll = (s: string, table: Record<string, string>) => [...s].map((c) => table[c]).join('');
const canMap = (s: string, table: Record<string, string>) => s.length > 0 && [...s].every((c) => table[c] !== undefined);
const wrap = (s: string) => (/^[\w.°]+$/.test(s) ? s : `(${s})`);

/** One LaTeX fragment (no dollar signs) as Unicode text. */
export function latexToUnicode(src: string): string {
  let s = src;
  for (let n = 0; n < 6 && /\\[dt]?frac/.test(s); n++) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${wrap(a.trim())}/${wrap(b.trim())}`);
  }
  s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_, n: string, a: string) => `${canMap(n, SUP) ? mapAll(n, SUP) : n}√${wrap(a)}`);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a: string) => `√${wrap(a)}`);
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname|mbox)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:left|right|big|Big)\b\s*/g, '');
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? m.slice(1));
  s = s.replace(/\\([,;:! ])/g, ' ').replace(/\\([{}%&#_])/g, '$1');
  s = s.replace(/\^\s*°/g, '°');
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_, e: string) => (canMap(e, SUP) ? mapAll(e, SUP) : `^(${e})`));
  s = s.replace(/\^\s*([0-9n])/g, (_, e: string) => SUP[e]);
  s = s.replace(/_\s*\{([^{}]*)\}/g, (_, e: string) => (canMap(e, SUB) ? mapAll(e, SUB) : `_(${e})`));
  s = s.replace(/_\s*([0-9])/g, (_, e: string) => SUB[e]);
  return s.replace(/[{}]/g, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * LaTeX written without $ delimiters (\frac{1}{2}, 3 \times 4, x^{2}, x^2). Only the commands in
 * the tables above are changed, so any other backslash is left as it is.
 */
export function bareLatexToUnicode(text: string): string {
  let s = text;
  for (let n = 0; n < 6 && /\\[dt]?frac\s*\{/.test(s); n++) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${wrap(a.trim())}/${wrap(b.trim())}`);
  }
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a: string) => `√${wrap(a)}`);
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname|mbox)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:left|right)(?![A-Za-z])\s*/g, '');
  s = s.replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? m);
  s = s.replace(/([\w)\]])\^\{([0-9n+-]{1,4})\}/g, (_, b: string, e: string) => b + mapAll(e, SUP));
  s = s.replace(/([A-Za-z0-9)\]])\^([+-]?[0-9]{1,3})(?!\d|\.\d)/g, (_, b: string, e: string) => b + mapAll(e, SUP));
  // Chemical formulas and indices: H_2O, x_{12}.
  s = s.replace(/([A-Za-z)\]])_\{([0-9]{1,3})\}/g, (_, b: string, e: string) => b + mapAll(e, SUB));
  s = s.replace(/([A-Z][a-z]?|[a-z])_([0-9]{1,2})(?!\d)/g, (_, b: string, e: string) => b + mapAll(e, SUB));
  return s;
}

/**
 * Replaces every $…$, $$…$$, \(…\) and \[…\] in a reply with Unicode maths, and LaTeX written
 * without delimiters too; removes markdown (fences, bold, italics, headings, inline code) and
 * turns markdown bullets into "•".
 */
export function cleanAnswerText(text: string): string {
  let s = text.replace(/\r\n?/g, '\n');
  // A newline the model escaped twice arrives as the two characters \n.
  s = s.replace(/\\n(?![a-z])/g, '\n');
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/g, '$1');
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => latexToUnicode(m));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => latexToUnicode(m));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => latexToUnicode(m));
  s = s.replace(/(?<![\w\\])\$([^$\n]{1,200}?)\$(?!\w)/g, (_, m: string) => latexToUnicode(m));
  s = bareLatexToUnicode(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^([ \t]*)[*-][ \t]+(?=\S)/gm, '$1• ');
  s = s.replace(/(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])/g, '$1');
  s = s.replace(/`([^`\n]+)`/g, '$1');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Handwriting read from a photo of the board: fixes look-alike symbols and stray spacing. */
export function cleanOcrText(text: string): string {
  return cleanAnswerText(text)
    .replace(/[‐‑–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

/** Cleaned lines, without empties or repeats (case and punctuation ignored). */
export function tidyList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = cleanAnswerText(raw);
    const k = t.toLowerCase().replace(/\W+/g, ' ').trim();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
