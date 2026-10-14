import { describe, expect, it } from 'vitest';
import { aggKey, aggsFor, barMax, chartPlan, defaultChart, emptyDefinition, moveItem, opsFor, parseEmails, ready, refKey, toneOf, type OutColumn, type StudioResult } from './report-studio';

const result = (over: Partial<StudioResult>): StudioResult => ({ dataset: { key: 'fees', label: 'Fees' }, columns: [], rows: [], totals: null, truncated: false, pivot: null, filters: [], chart: null, formatting: [], ...over });
const col = (key: string, type: OutColumn['type'], dim = false, extra: Partial<OutColumn> = {}): OutColumn => ({ key, label: key, type, dim, ...extra });

describe('report studio helpers', () => {
  it('names outputs the way the API does', () => {
    expect(aggKey({ fn: 'count' })).toBe('count');
    expect(aggKey({ fn: 'pct' })).toBe('pct');
    expect(aggKey({ fn: 'count', field: 'roll_no' })).toBe('count_roll_no');
    expect(aggKey({ fn: 'sum', field: 'balance' })).toBe('sum_balance');
    expect(aggKey({ fn: 'measure', field: 'collected_pct' })).toBe('collected_pct');
    expect(refKey('due_on:month')).toBe('due_on__month');
  });

  it('offers the conditions and totals that suit a field', () => {
    expect(opsFor('date', null)[0]).toBe('relative');
    expect(opsFor('bool', null)).toEqual(['is_true', 'is_false']);
    expect(opsFor('text', 'section')[0]).toBe('in');
    expect(aggsFor({ type: 'money', aggregatable: true })).toContain('sum');
    expect(aggsFor({ type: 'int', aggregatable: false })).not.toContain('sum');
    expect(aggsFor({ type: 'bool', aggregatable: false })[0]).toBe('pct_true');
  });

  it('leaves half-filled filters and totals out of the live preview', () => {
    const def = { ...emptyDefinition(), filters: [{ field: 'title', op: 'contains' as const }, { field: 'is_overdue', op: 'is_true' as const }, { field: 'balance', op: 'between' as const, value: ['1000', ''] }], aggregates: [{ fn: 'sum' as const }, { fn: 'count' as const }] };
    const r = ready(def);
    expect(r.filters).toEqual([{ field: 'is_overdue', op: 'is_true' }]);
    expect(r.aggregates).toEqual([{ fn: 'count' }]);
  });

  it('colours cells by rule, in rupees for money and across pivot columns', () => {
    const rules = [{ column: 'pct_true_is_present', op: 'lt' as const, value: 75, tone: 'red' as const, style: 'fill' as const }, { column: 'balance', op: 'gt' as const, value: 5000, tone: 'amber' as const, style: 'text' as const }];
    expect(toneOf(col('pct_true_is_present', 'percent'), 54.5, rules)).toEqual({ tone: 'red', style: 'fill' });
    expect(toneOf(col('pct_true_is_present__p0', 'percent', false, { measure: 'pct_true_is_present', pivotValue: '2026-10' }), 80, rules)).toBeNull();
    expect(toneOf(col('balance', 'money'), 600_000, rules)).toEqual({ tone: 'amber', style: 'text' });
    expect(toneOf(col('balance', 'money'), 400_000, rules)).toBeNull();
    const bars = barMax(result({ columns: [col('n', 'int')], rows: [{ n: 3 }, { n: -8 }], formatting: [{ column: 'n', op: 'bar', tone: 'blue', style: 'fill' }] }));
    expect(bars).toEqual({ n: 8 });
  });

  it('picks a chart that fits the result', () => {
    const byMonth = result({ columns: [col('paid_on__month', 'text', true), col('sum_amount', 'money')], rows: [{ paid_on__month: '2026-09', sum_amount: 1 }, { paid_on__month: '2026-10', sum_amount: 2 }] });
    expect(defaultChart(byMonth)).toBe('line');
    const byClass = result({ columns: [col('class', 'text', true), col('count', 'int')], rows: [{ class: 'A', count: 1 }, { class: 'B', count: 2 }] });
    expect(defaultChart(byClass)).toBe('bar');
    expect(chartPlan(byClass).pieOk).toBe(true);
    const one = result({ columns: [col('sum_amount', 'money')], rows: [{ sum_amount: 5 }] });
    expect(defaultChart(one)).toBe('kpi');
    const pivot = result({ pivot: { column: 'ageing', label: 'Ageing', truncated: false }, columns: [col('class', 'text', true), col('sum_balance__p0', 'money', false, { measure: 'sum_balance', pivotValue: 'Not yet due' }), col('sum_balance__p1', 'money', false, { measure: 'sum_balance', pivotValue: '1-30 days' }), col('sum_balance__total', 'money', false, { measure: 'sum_balance' })], rows: [{ class: 'A', sum_balance__p0: 1, sum_balance__p1: 2, sum_balance__total: 3 }] });
    expect(defaultChart(pivot)).toBe('stacked');
    expect(chartPlan(pivot).series.map((s) => s.key)).toEqual(['sum_balance__p0', 'sum_balance__p1']);
    expect(defaultChart(result({ chart: { type: 'donut' }, columns: byClass.columns, rows: byClass.rows }))).toBe('donut');
    expect(defaultChart(result({}))).toBe('table');
  });

  it('reorders lists and reads email addresses', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(parseEmails('A@x.in, b@x.in;\n a@x.in')).toEqual(['a@x.in', 'b@x.in']);
  });
});
