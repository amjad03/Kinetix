import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { accreditationEntries, dvvQueries } from '../db/schema-accreditation.js';
import { obeEvidence } from '../db/schema.js';
import { computeAuto, type AutoValue } from './auto.js';
import { catalogue, estimate, metricScore, type Body, type GroupScore, type MetricDef } from './catalogue.js';

export interface MetricView extends MetricDef {
  entryId: string | null;
  /** The figure that counts: the one entered by hand, else the one computed from ERP data. */
  value: number | null;
  source: 'manual' | 'auto' | 'none';
  autoValue: number | null;
  autoText: string;
  textValue: string;
  rows: string[][];
  selfScore: number | null;
  note: string;
  evidence: number;
  score: number | null;
  complete: boolean;
}

export interface Overview {
  body: Body;
  cycle: string;
  groups: (GroupScore & { complete: number })[];
  metrics: MetricView[];
  completeness: { complete: number; total: number; percent: number };
  estimate: { estimate: number | null; floor: number; grade: string; floorGrade: string } | null;
}

@Injectable()
export class AccreditationService {
  /** Every metric of a framework for a cycle, with the entered or computed figure, its score, evidence count and completeness. */
  async overview(tx: Tx, body: Body, cycle: string): Promise<Overview> {
    const { groups, metrics } = catalogue(body);
    const entries = await tx.select().from(accreditationEntries).where(and(eq(accreditationEntries.body, body), eq(accreditationEntries.cycle, cycle)));
    const byCode = new Map(entries.map((e) => [e.metricCode, e]));
    const evidence = entries.length ? await tx.select({ targetId: obeEvidence.targetId, n: sql<number>`count(*)::int` }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'metric'), inArray(obeEvidence.targetId, entries.map((e) => e.id)))).groupBy(obeEvidence.targetId) : [];
    const evN = new Map(evidence.map((x) => [x.targetId, x.n]));
    const auto = await computeAuto(tx, [...new Set(metrics.map((m) => m.auto).filter(Boolean))]);
    const views: MetricView[] = metrics.map((d) => {
      const e = byCode.get(d.code);
      const a: AutoValue = (d.auto && auto.get(d.auto)) || { value: null };
      const manual = e?.value ?? null;
      const value = manual ?? a.value;
      const rows = ((e?.dataRows ?? []) as string[][]) ?? [];
      const textValue = e?.textValue ?? '';
      const source = manual !== null || textValue !== '' || rows.length ? 'manual' : a.value !== null ? 'auto' : 'none';
      const complete = d.kind === 'QnM' ? value !== null || rows.length > 0 : textValue.trim() !== '' || (a.value !== null && !!a.text);
      return { ...d, entryId: e?.id ?? null, value, source, autoValue: a.value, autoText: a.text ?? '', textValue, rows, selfScore: e?.selfScore ?? null, note: e?.note ?? '', evidence: e ? (evN.get(e.id) ?? 0) : 0, score: metricScore(d, value, e?.selfScore ?? null), complete };
    });
    const est = body === 'nirf' ? null : estimate(groups, new Map(views.map((v) => [v.code, v.score])), metrics);
    const done = views.filter((v) => v.complete).length;
    return {
      body,
      cycle,
      groups: (est?.groups ?? groups.map((g) => ({ id: g.id, title: g.title, weight: g.weight, metrics: views.filter((v) => v.group === g.id).length, scored: 0, mean: null }))).map((g) => ({ ...g, complete: views.filter((v) => v.group === g.id && v.complete).length })),
      metrics: views,
      completeness: { complete: done, total: views.length, percent: views.length ? Math.round((1000 * done) / views.length) / 10 : 0 },
      estimate: est ? { estimate: est.estimate, floor: est.floor, grade: est.grade, floorGrade: est.floorGrade } : null,
    };
  }

  async dvv(tx: Tx, cycle: string) {
    return tx.select().from(dvvQueries).where(eq(dvvQueries.cycle, cycle)).orderBy(asc(dvvQueries.metricCode), asc(dvvQueries.createdAt));
  }

  /** Latest attainment per programme outcome and course outcome, for the NBA SAR criterion 3 tables. */
  async attainmentRows(tx: Tx) {
    const r = await tx.execute(sql`select p.name as program, x.scope, x.code, x.direct, x.indirect, x.combined, x.target, x.gap, x.met
      from (select distinct on (program_id, target_id) * from attainment_snapshots order by program_id, target_id, computed_at desc) x join programs p on p.id = x.program_id order by p.name, x.scope desc, x.code`);
    return r.rows as { program: string; scope: string; code: string; direct: number | null; indirect: number | null; combined: number | null; target: number; gap: number | null; met: boolean }[];
  }

  async coPoMatrix(tx: Tx) {
    const r = await tx.execute(sql`select p.name as program, co.code as co, po.code as po, m.strength from co_outcome_map m join course_outcomes co on co.id = m.co_id join program_outcomes po on po.id = m.outcome_id
      join co_sets cs on cs.id = co.co_set_id join subjects sj on sj.id = cs.subject_id join programs p on p.id = sj.program_id order by p.name, co.code, po.code`);
    return r.rows as { program: string; co: string; po: string; strength: number }[];
  }
}
