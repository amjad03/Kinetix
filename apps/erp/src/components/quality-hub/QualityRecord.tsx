'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveRecord } from '@/app/(dashboard)/quality/actions';
import { TextField } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, RecordPage, WorkflowStepper, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { Card, DataTable, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { DECISIONS, MODULE_HOME, MOVES, fieldKey, statusKey, statusTone, type QhMove, type QhRecord } from '@/lib/quality-hub';
import { actionText } from '@/components/records/text';
import { cellNode, qhColumns } from './cells';

/**
 * One record of the quality group on the RecordPage template: status, key facts, the module's next
 * moves (or an approve / reject decision), the related lists and the audit history. Every move calls
 * the module's own endpoint, so its rules and notifications apply; the page then refreshes.
 */
export function QualityRecord({ record }: { record: QhRecord }) {
  const i = useI18n();
  const { t, fmt } = i;
  const router = useRouter();
  const toast = useToastOptional();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<QhMove | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const moves = MOVES[record.entity]?.[record.status] ?? [];
  const deciding = (DECISIONS[record.entity] ?? []).includes(record.status);
  const moveLabel = (m: string) => t(`qh.move.${m}` as MessageKey);

  const run = (m: QhMove, text = '') => {
    setError(null);
    start(async () => {
      const res = await moveRecord(record.entity, record.id, record.status, m.key, text);
      if (!res.ok) {
        setError(res.error);
        toast?.error(res.error);
        return;
      }
      toast?.success(t('qh.moved', { move: moveLabel(m.key) }));
      setAsking(null);
      setNote('');
      router.refresh();
    });
  };
  const press = (m: QhMove) => (m.note ? (setAsking(m), setError(null)) : run(m));

  const steps: WorkflowStep[] = record.steps.map((s) => ({ id: s.status, label: t(statusKey(s.status)), state: s.state }));
  const activity: ActivityItem[] = record.activity.map((a) => ({ id: a.id, at: a.at, actor: a.actor, action: actionText(t, a.action) }));

  const actionButtons = moves.length > 0 && (
    <>
      {moves.map((m, n) => (
        <Button key={m.key} className="h-10" variant={m.danger ? 'destructive' : n === 0 ? 'default' : 'outline'} disabled={pending} onClick={() => press(m)} data-testid={`qh-move-${m.key}`}>
          {moveLabel(m.key)}
        </Button>
      ))}
    </>
  );

  const aside = deciding ? (
    <ApprovalPanel
      steps={steps}
      canDecide
      history={activity.slice(0, 5)}
      onDecide={async (d, comment) => {
        const res = await moveRecord(record.entity, record.id, record.status, d, comment);
        return res.ok ? undefined : res.error;
      }}
      onDecided={(d) => {
        toast?.success(t('qh.moved', { move: moveLabel(d) }));
        router.refresh();
      }}
    />
  ) : (
    <Card title={t('tpl.steps')}>
      <div className="grid gap-5">
        <WorkflowStepper steps={steps} />
        {asking && (
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-4" aria-busy={pending}>
            <p className="text-sm font-semibold">{moveLabel(asking.key)}</p>
            <TextField label={t(asking.note === 'required' ? 'qh.noteRequired' : 'qh.noteOptional')} multiline minRows={3} value={note} onChange={(e) => setNote(e.target.value)} error={!!error} helperText={error ?? undefined} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className="h-10" disabled={pending} onClick={() => setAsking(null)}>
                {t('qh.back')}
              </Button>
              <Button className="h-10" variant={asking.danger ? 'destructive' : 'default'} disabled={pending} onClick={() => run(asking, note)} data-testid="qh-move-confirm">
                {moveLabel(asking.key)}
              </Button>
            </div>
          </div>
        )}
        {!asking && moves.length === 0 && !deciding && <p className="text-sm text-muted-foreground">{t('qh.noMoves')}</p>}
      </div>
    </Card>
  );

  return (
    <RecordPage
      title={record.title}
      status={{ label: t(statusKey(record.status)), tone: statusTone(record.status) }}
      subtitle={
        <span className="text-sm text-muted-foreground">
          {t(`qh.e.${record.entity}` as MessageKey)}
          {record.createdAt && ` · ${t('qh.created', { date: fmt.date(record.createdAt.slice(0, 10), 'short') })}`}
        </span>
      }
      facts={record.facts.map((f) => ({ label: t(fieldKey(f.key)), value: cellNode(i, f.key, f.kind, f.value) }))}
      primary={actionButtons || undefined}
      secondary={
        <Button asChild variant="outline" className="h-10">
          <Link href={MODULE_HOME[record.module]}>{t('qh.openDesk')}</Link>
        </Button>
      }
      overview={
        record.body.length ? (
          <div className="grid gap-5">
            {record.body.map((b) => (
              <section key={b.key} className="grid gap-1.5">
                <h3 className="text-sm font-semibold">{t(fieldKey(b.key))}</h3>
                <p className="whitespace-pre-wrap text-sm leading-6">{b.value}</p>
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('qh.noDetail')}</p>
        )
      }
      related={record.related.map((r) => ({
        value: r.key,
        label: t(`qh.rel.${r.key}` as MessageKey),
        count: r.rows.length,
        content: <DataTable columns={qhColumns(i, r.columns)} rows={r.rows} rowId={(x) => x.id} label={t(`qh.rel.${r.key}` as MessageKey)} />,
      }))}
      activity={activity}
      aside={aside}
    />
  );
}
