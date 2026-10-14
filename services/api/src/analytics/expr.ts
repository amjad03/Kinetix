import { sql, type SQL } from 'drizzle-orm';
import type { FieldType } from './semantic.js';

/**
 * The calculated-field language: a small, safe expression syntax compiled to SQL.
 *
 *   percent(sum(paid), sum(amount))      round(marks / max_marks * 100, 1)
 *   if(balance > 0, 'Due', 'Clear')      days_between(due_on, today())
 *
 * Names are dataset field keys (or earlier calculated fields); text is in quotes; literals are
 * bound as parameters, and only the functions below exist. Anything else is a 400 with a message
 * a person can act on. "Row" fields work on each row; "measure" fields summarise a group and
 * must wrap fields in sum(), avg(), min(), max(), count() or count_distinct().
 */

export class ExprError extends Error {}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'field'; name: string }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'not'; a: Node }
  | { k: 'neg'; a: Node };

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

const MAX_LEN = 400;
const MAX_TOKENS = 200;
const MAX_DEPTH = 12;

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new ExprError(`A formula can be at most ${MAX_LEN} characters`);
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) throw new ExprError(`Unexpected "${c}"`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) s += src[j++];
      if (j >= src.length) throw new ExprError('Text is missing its closing quote');
      if (s.length > 100) throw new ExprError('Text in a formula can be at most 100 characters');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '!=', '<>', '=='].includes(two)) {
      out.push({ t: 'op', v: two === '==' ? '=' : two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }
    if ('+-*/%(),<>='.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new ExprError(`"${c}" is not allowed in a formula`);
  }
  if (out.length > MAX_TOKENS) throw new ExprError('The formula is too long');
  return out;
}

function parse(src: string): Node {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExprError('The formula is empty');
  let p = 0;
  let depth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const isKw = (v: string) => peek()?.t === 'id' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`);
    p++;
  };
  const guard = <T>(fn: () => T): T => {
    if (++depth > MAX_DEPTH) throw new ExprError('The formula is nested too deeply');
    try {
      return fn();
    } finally {
      depth--;
    }
  };
  const or = (): Node =>
    guard(() => {
      let a = and();
      while (isKw('or')) {
        p++;
        a = { k: 'bin', op: 'or', a, b: and() };
      }
      return a;
    });
  const and = (): Node => {
    let a = not();
    while (isKw('and')) {
      p++;
      a = { k: 'bin', op: 'and', a, b: not() };
    }
    return a;
  };
  const not = (): Node => {
    if (isKw('not')) {
      p++;
      return guard(() => ({ k: 'not', a: not() }));
    }
    return cmp();
  };
  const cmp = (): Node => {
    const a = add();
    const t = peek();
    if (t?.t === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      p++;
      return { k: 'bin', op: t.v, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v as string;
      a = { k: 'bin', op, a, b: mul() };
    }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = toks[p++].v as string;
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp('-')) {
      p++;
      return guard(() => ({ k: 'neg', a: unary() }));
    }
    return primary();
  };
  const primary = (): Node => {
    const t = toks[p++];
    if (!t) throw new ExprError('The formula ends too early');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = or();
      expect(')');
      return e;
    }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { k: 'bool', v: t.v === 'true' };
      if (t.v === 'null') return { k: 'null' };
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          do {
            if (args.length >= 10) throw new ExprError('Too many values for one function');
            args.push(or());
          } while (isOp(',') && ++p);
        }
        expect(')');
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'field', name: t.v };
    }
    throw new ExprError(`Unexpected "${t.v}"`);
  };
  const root = or();
  if (p < toks.length) throw new ExprError(`Unexpected "${String(toks[p].v)}"`);
  return root;
}

export interface Operand {
  sql: SQL;
  type: FieldType;
}

export type ExprMode = 'row' | 'measure';

const NUM: FieldType[] = ['int', 'number', 'money', 'percent'];
const isNum = (t: FieldType) => NUM.includes(t);

const ROW_FNS = ['round', 'floor', 'ceil', 'abs', 'coalesce', 'if', 'concat', 'upper', 'lower', 'trim', 'length', 'left', 'right', 'year', 'month', 'day', 'weekday', 'days_between', 'add_days', 'today', 'percent', 'greatest', 'least', 'nullif'] as const;
const AGG_FNS = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'count_if'] as const;
/** The functions, for the builder's help panel. */
export const FUNCTIONS = { row: ROW_FNS, measure: [...AGG_FNS, ...ROW_FNS] };

/**
 * Compiles a formula. `resolve` maps a name to a field's SQL and type (or undefined), and `today`
 * is the institution's date. Returns the SQL, its type, and whether it summarises rows.
 */
export function compileExpr(src: string, mode: ExprMode, resolve: (name: string) => Operand | undefined, today: string): Operand & { aggregate: boolean } {
  const root = parse(src);
  let aggregate = false;

  const go = (n: Node, inAgg: boolean): Operand => {
    switch (n.k) {
      case 'num':
        return { sql: sql`${n.v}::numeric`, type: Number.isInteger(n.v) ? 'int' : 'number' };
      case 'str':
        return { sql: sql`${n.v}::text`, type: 'text' };
      case 'bool':
        return { sql: n.v ? sql`true` : sql`false`, type: 'bool' };
      case 'null':
        return { sql: sql`null`, type: 'text' };
      case 'field': {
        const r = resolve(n.name);
        if (!r) throw new ExprError(`"${n.name}" is not a field of this dataset`);
        if (mode === 'measure' && !inAgg) throw new ExprError(`Wrap "${n.name}" in sum(), avg(), min(), max() or count() in a summary formula`);
        return r;
      }
      case 'not': {
        const a = go(n.a, inAgg);
        if (a.type !== 'bool') throw new ExprError('"not" needs a yes/no value');
        return { sql: sql`(not ${a.sql})`, type: 'bool' };
      }
      case 'neg': {
        const a = go(n.a, inAgg);
        if (!isNum(a.type)) throw new ExprError('Only numbers can be negative');
        return { sql: sql`(-${a.sql})`, type: a.type };
      }
      case 'bin':
        return binary(n.op, go(n.a, inAgg), go(n.b, inAgg));
      case 'call':
        return call(n.fn, n.args, inAgg);
    }
  };

  const binary = (op: string, a: Operand, b: Operand): Operand => {
    if (op === 'and' || op === 'or') {
      if (a.type !== 'bool' || b.type !== 'bool') throw new ExprError(`"${op}" joins yes/no conditions`);
      return { sql: sql`(${a.sql} ${sql.raw(op)} ${b.sql})`, type: 'bool' };
    }
    if (['=', '!=', '<', '<=', '>', '>='].includes(op)) {
      const ok = (isNum(a.type) && isNum(b.type)) || a.type === b.type;
      if (!ok) throw new ExprError('Compare like with like: numbers with numbers, dates with dates, text with text');
      return { sql: sql`(${a.sql} ${sql.raw(op === '!=' ? '<>' : op)} ${b.sql})`, type: 'bool' };
    }
    if (a.type === 'date' && b.type === 'date' && op === '-') return { sql: sql`(${a.sql} - ${b.sql})`, type: 'int' };
    if (a.type === 'date' && isNum(b.type) && (op === '+' || op === '-')) return { sql: sql`(${a.sql} ${sql.raw(op)} (${b.sql})::int)`, type: 'date' };
    if (!isNum(a.type) || !isNum(b.type)) throw new ExprError(`"${op}" works on numbers`);
    let type: FieldType = 'number';
    if ((op === '+' || op === '-') && a.type === b.type) type = a.type;
    if (op === '*' && (a.type === 'money') !== (b.type === 'money')) type = 'money';
    if (op === '/' && a.type === 'money' && b.type !== 'money') type = 'money';
    if (op === '/') return { sql: sql`((${a.sql})::numeric / nullif((${b.sql})::numeric, 0))`, type };
    if (op === '%') return { sql: sql`mod((${a.sql})::numeric, nullif((${b.sql})::numeric, 0))`, type };
    return { sql: sql`(${a.sql} ${sql.raw(op)} ${b.sql})`, type };
  };

  const arity = (fn: string, args: Node[], min: number, max = min) => {
    if (args.length < min || args.length > max) throw new ExprError(min === max ? `${fn}() takes ${min} value${min === 1 ? '' : 's'}` : `${fn}() takes ${min} to ${max} values`);
  };
  const need = (fn: string, o: Operand, kind: 'num' | 'text' | 'date' | 'bool') => {
    const ok = kind === 'num' ? isNum(o.type) : o.type === kind;
    if (!ok) throw new ExprError(`${fn}() needs ${kind === 'num' ? 'a number' : kind === 'bool' ? 'a yes/no condition' : `a ${kind}`}`);
    return o;
  };
  const literalInt = (fn: string, n: Node, lo: number, hi: number): number => {
    if (n.k !== 'num' || !Number.isInteger(n.v) || n.v < lo || n.v > hi) throw new ExprError(`${fn}() needs a whole number from ${lo} to ${hi}`);
    return n.v;
  };

  const call = (fn: string, args: Node[], inAgg: boolean): Operand => {
    if ((AGG_FNS as readonly string[]).includes(fn)) {
      if (mode === 'row') throw new ExprError(`${fn}() summarises rows; use it in a summary formula`);
      if (inAgg) throw new ExprError(`${fn}() cannot be inside another summary`);
      aggregate = true;
      if (fn === 'count' && args.length === 0) return { sql: sql`count(*)`, type: 'int' };
      arity(fn, args, 1);
      const a = go(args[0], true);
      if (fn === 'count') return { sql: sql`count(${a.sql})`, type: 'int' };
      if (fn === 'count_distinct') return { sql: sql`count(distinct ${a.sql})`, type: 'int' };
      if (fn === 'count_if') return { sql: sql`count(*) filter (where ${need(fn, a, 'bool').sql})`, type: 'int' };
      if (fn === 'sum' || fn === 'avg') {
        need(fn, a, 'num');
        return { sql: fn === 'sum' ? sql`coalesce(sum(${a.sql}), 0)` : sql`avg(${a.sql})`, type: fn === 'avg' && a.type === 'int' ? 'number' : a.type };
      }
      if (a.type === 'bool') throw new ExprError(`${fn}() does not work on yes/no values`);
      return { sql: sql`${sql.raw(fn)}(${a.sql})`, type: a.type };
    }
    if (!(ROW_FNS as readonly string[]).includes(fn)) throw new ExprError(`There is no function "${fn}"`);
    const ev = () => args.map((a) => go(a, inAgg));
    switch (fn) {
      case 'round': {
        arity(fn, args, 1, 2);
        const a = need(fn, go(args[0], inAgg), 'num');
        const d = args[1] ? literalInt(fn, args[1], 0, 6) : 0;
        return { sql: sql`round((${a.sql})::numeric, ${sql.raw(String(d))})`, type: d === 0 && a.type !== 'money' ? 'int' : a.type === 'int' ? 'number' : a.type };
      }
      case 'floor':
      case 'ceil':
      case 'abs': {
        arity(fn, args, 1);
        const a = need(fn, go(args[0], inAgg), 'num');
        return { sql: sql`${sql.raw(fn)}(${a.sql})`, type: fn === 'abs' ? a.type : 'int' };
      }
      case 'coalesce':
      case 'greatest':
      case 'least': {
        arity(fn, args, 2, 10);
        const xs = ev();
        const t = xs[0].type;
        if (!xs.every((x) => x.type === t || (isNum(x.type) && isNum(t)))) throw new ExprError(`${fn}() needs values of one kind`);
        return { sql: sql`${sql.raw(fn)}(${sql.join(xs.map((x) => x.sql), sql`, `)})`, type: t };
      }
      case 'nullif': {
        arity(fn, args, 2);
        const [a, b] = ev();
        return { sql: sql`nullif(${a.sql}, ${b.sql})`, type: a.type };
      }
      case 'if': {
        arity(fn, args, 3);
        const [c, a, b] = ev();
        need(fn, c, 'bool');
        if (a.type !== b.type && !(isNum(a.type) && isNum(b.type))) throw new ExprError('if() needs both results of one kind');
        return { sql: sql`(case when ${c.sql} then ${a.sql} else ${b.sql} end)`, type: a.type };
      }
      case 'concat': {
        arity(fn, args, 1, 10);
        return { sql: sql`concat(${sql.join(ev().map((x) => sql`(${x.sql})::text`), sql`, `)})`, type: 'text' };
      }
      case 'upper':
      case 'lower':
      case 'trim': {
        arity(fn, args, 1);
        return { sql: sql`${sql.raw(fn)}((${go(args[0], inAgg).sql})::text)`, type: 'text' };
      }
      case 'length': {
        arity(fn, args, 1);
        return { sql: sql`length((${go(args[0], inAgg).sql})::text)`, type: 'int' };
      }
      case 'left':
      case 'right': {
        arity(fn, args, 2);
        const n = literalInt(fn, args[1], 0, 100);
        return { sql: sql`${sql.raw(fn)}((${go(args[0], inAgg).sql})::text, ${sql.raw(String(n))})`, type: 'text' };
      }
      case 'year':
      case 'month':
      case 'day':
      case 'weekday': {
        arity(fn, args, 1);
        const a = need(fn, go(args[0], inAgg), 'date');
        const part = fn === 'weekday' ? 'isodow' : fn;
        return { sql: sql`extract(${sql.raw(part)} from ${a.sql})::int`, type: 'int' };
      }
      case 'days_between': {
        arity(fn, args, 2);
        const [a, b] = ev();
        need(fn, a, 'date');
        need(fn, b, 'date');
        return { sql: sql`(${b.sql} - ${a.sql})`, type: 'int' };
      }
      case 'add_days': {
        arity(fn, args, 2);
        const [a, b] = ev();
        need(fn, a, 'date');
        need(fn, b, 'num');
        return { sql: sql`(${a.sql} + (${b.sql})::int)`, type: 'date' };
      }
      case 'today':
        arity(fn, args, 0);
        return { sql: sql`${today}::date`, type: 'date' };
      case 'percent': {
        arity(fn, args, 2);
        const [a, b] = ev();
        need(fn, a, 'num');
        need(fn, b, 'num');
        return { sql: sql`round((${a.sql})::numeric * 100 / nullif((${b.sql})::numeric, 0), 1)`, type: 'percent' };
      }
    }
    throw new ExprError(`There is no function "${fn}"`);
  };

  const out = go(root, false);
  if (mode === 'measure' && !aggregate) throw new ExprError('A summary formula needs sum(), avg(), min(), max() or count()');
  return { ...out, aggregate };
}
