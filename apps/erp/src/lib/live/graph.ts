// y = f(x) for graphs on the live board: a TypeScript port of `compileGraph` in
// packages/kinetix_ink/lib/src/graph_expr.dart. Understands + − × ÷ ^, brackets, implicit
// multiplication (2x, 3(x+1), x sin x), pi, e, and sin, cos, tan, asin, acos, atan, sqrt, abs,
// ln, log (base 10), exp. Angles are radians. No eval: the expression is parsed into closures.

type F = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  exp: Math.exp,
  log: (v) => Math.log10(v),
  ln: Math.log,
};

// Longest first, so 'asin' wins over 'sin' and 'exp' over 'e'.
const WORDS = [...Object.keys(FUNCTIONS).sort((a, b) => b.length - a.length), 'pi', 'x', 'e'];

class Parser {
  i = 0;
  constructor(private readonly s: string) {}

  get done() {
    return this.i >= this.s.length;
  }

  peek(): string | null {
    while (this.i < this.s.length && this.s[this.i] === ' ') this.i++;
    return this.done ? null : this.s[this.i];
  }

  expression(): F {
    let left = this.term();
    for (;;) {
      const c = this.peek();
      if (c !== '+' && c !== '-') return left;
      this.i++;
      const l = left, r = this.term();
      left = c === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
  }

  term(): F {
    let left = this.unary();
    for (;;) {
      const c = this.peek();
      if (c === '*' || c === '/') {
        this.i++;
        const l = left, r = this.unary();
        left = c === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (c !== null && (c === '(' || c === '.' || /[a-z0-9]/.test(c))) {
        const l = left, r = this.unary();
        left = (x) => l(x) * r(x);
      } else {
        return left;
      }
    }
  }

  unary(): F {
    const c = this.peek();
    if (c === '-') {
      this.i++;
      const f = this.unary();
      return (x) => -f(x);
    }
    if (c === '+') {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  power(): F {
    const base = this.atom();
    if (this.peek() === '^') {
      this.i++;
      const exp = this.unary();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  atom(): F {
    const c = this.peek();
    if (c === null) throw new Error('end');
    if (c === '(') {
      this.i++;
      const f = this.expression();
      if (this.peek() !== ')') throw new Error(')');
      this.i++;
      return f;
    }
    if (/[0-9.]/.test(c)) {
      const start = this.i;
      while (this.i < this.s.length && /[0-9.]/.test(this.s[this.i])) this.i++;
      const v = Number(this.s.slice(start, this.i));
      if (!Number.isFinite(v)) throw new Error('number');
      return () => v;
    }
    for (const word of WORDS) {
      if (!this.s.startsWith(word, this.i)) continue;
      this.i += word.length;
      if (word === 'x') return (x) => x;
      if (word === 'pi') return () => Math.PI;
      if (word === 'e') return () => Math.E;
      const fn = FUNCTIONS[word];
      const arg = this.power();
      return (x) => fn(arg(x));
    }
    throw new Error(`unexpected ${c}`);
  }
}

/** The function for `expression`, or null when it cannot be read. */
export function compileGraph(expression: string): F | null {
  try {
    const p = new Parser(expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').toLowerCase());
    const f = p.expression();
    if (p.peek() !== null) return null;
    return f;
  } catch {
    return null;
  }
}
