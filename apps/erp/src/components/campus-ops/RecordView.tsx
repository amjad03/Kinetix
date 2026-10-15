'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runRecordAction } from '@/app/(dashboard)/records/actions';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { ApprovalPanel, RecordPage, WorkflowStepper, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { Card, DataTable, FormRow, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { actionsFor, factsOf, fieldsOf, formatField, humanize, recordHref, RELATED_KIND, statusOf, toneOf, workflowSteps, type OpsRecord } from '@/lib/campus-ops';

type Row = Record<string, unknown>;
const camel = (k: string) => k.replace(/_paise$/, '').replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** One admissions or campus-operations record: header, facts, workflow, related lists and audit history. */
export function RecordView({ data }: { data: OpsRecord }) {
  const { t } = useI18n();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const tr = (key: string, fallback: string) => {
    const s = t(key as MessageKey);
    return s === key ? fallback : s;
  };
  const field = (k: string) => tr(`cops.c.${camel(k)}`, humanize(k));
  const value = (k: string, v: unknown) => formatField(k, v, [t('cops.yes'), t('cops.no')]);
  const statusLabel = (s: string) => tr(`cops.s.${s}`, humanize(s));

  const r = data.record;
  const status = statusOf(data.kind, r);
  const actions = actionsFor(data.kind, status);
  const decisions = actions.filter((a) => a.decision);
  const buttons = actions.filter((a) => !a.decision);
  const activity: ActivityItem[] = data.activity.map((a) => ({ id: String(a.id), at: a.at, actor: a.actor ?? t('cops.none'), action: humanize(a.action.replace(/\.v\d+$/, '').split('.').slice(-1)[0] ?? a.action) }));
  const steps: WorkflowStep[] = workflowSteps(data.kind, status).map((s) => ({ id: s.id, label: statusLabel(s.id), state: s.state }));

  const run = (key: string, text = note) =>
    new Promise<string | void>((resolve) =>
      start(async () => {
        setError('');
        const res = await runRecordAction(data.kind, data.id, key, text);
        if (!res.ok) {
          setError(res.error);
          resolve(res.error);
          return;
        }
        setNote('');
        router.refresh();
        resolve();
      }),
    );

  const table = (rows: Row[], key: string) => {
    const keys = [...new Set(rows.flatMap((x) => fieldsOf(x).map(([k]) => k)))].slice(0, 6);
    const kind = RELATED_KIND[key];
    const columns: Column<Row>[] = keys.map((k, i) => ({ id: k, header: field(k), cell: (x) => value(k, x[k] ?? ''), sort: (x) => (typeof x[k] === 'number' ? (x[k] as number) : String(x[k] ?? '')), rowHeader: i === 0 }));
    return <DataTable label={tr(`cops.rel.${key}`, humanize(key))} columns={columns} rows={rows} rowId={(x) => String(x.id ?? JSON.stringify(x))} rowHref={kind ? (x) => recordHref(kind, String(x.id)) : undefined} empty={t('cops.none')} pageSize={10} />;
  };

  return (
    <RecordPage
      title={data.title}
      subtitle={tr(`cops.m.${data.module}`, data.module)}
      status={status ? { label: statusLabel(status), tone: toneOf(status) } : undefined}
      facts={factsOf(r, 6, ['status', 'stage']).map(([k, v]) => ({ label: field(k), value: value(k, v) }))}
      primary={
        buttons.length > 0 ? (
          <FormRow labelled={false}>
            {buttons.length > 0 && <Input className="h-9 w-[220px]" placeholder={t('cops.note')} aria-label={t('cops.note')} value={note} onChange={(e) => setNote(e.target.value)} />}
            {buttons.map((a, i) => (
              <Button key={a.key} variant={i === 0 ? 'default' : 'outline'} disabled={pending} onClick={() => void run(a.key)}>
                {tr(`cops.a.${a.key}`, humanize(a.key))}
              </Button>
            ))}
          </FormRow>
        ) : undefined
      }
      overview={
        <div className="grid gap-6">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {steps.length > 0 && decisions.length === 0 && (
            <Card title={t('cops.workflow')}>
              <WorkflowStepper steps={steps} label={t('cops.workflow')} />
            </Card>
          )}
          <Card title={t('cops.overview')}>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {fieldsOf(r).filter(([k]) => k !== 'status' && k !== 'stage').map(([k, v]) => (
                <div key={k} className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{field(k)}</dt>
                  <dd className="text-sm break-words">{value(k, v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {data.kind === 'stock-check' && r.summary !== null && typeof r.summary === 'object' && (
            <Card title={t('cops.sc.missing')} action={<Link href="/library/stock-checks">{t('cops.sc.title')}</Link>}>
              {table(((r.summary as { missing?: Row[] }).missing ?? []).map((m) => ({ id: m.bookId, ...m })), 'scanned')}
            </Card>
          )}
        </div>
      }
      related={data.related.map((rel) => ({ value: rel.key, label: tr(`cops.rel.${rel.key}`, humanize(rel.key)), count: rel.count, content: table(rel.rows, rel.key) }))}
      activity={activity}
      aside={
        decisions.length > 0 ? (
          <ApprovalPanel
            steps={steps}
            canDecide
            onDecide={(d, comment) => {
              const a = decisions.find((x) => x.decision === d);
              return a ? run(a.key, comment) : Promise.resolve();
            }}
            onDecided={() => router.refresh()}
            history={activity}
          />
        ) : undefined
      }
    />
  );
}
