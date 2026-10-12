'use client';

import { useRouter } from 'next/navigation';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { ApprovalPanel, RecordPage, WorkflowStepper, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { Card } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toneOf, type ColKind, type ColSpec, type Row } from '@/lib/fee-desk';
import { DeskAction, type FieldSpec } from './DeskAction';
import { SpecTable, useCell, useWord } from './SpecTable';

export interface Fact {
  label: string;
  value: unknown;
  kind?: ColKind;
}
export interface TableSpec {
  columns: ColSpec[];
  rows: Row[];
  href?: string;
}
export interface ActionSpec {
  label: string;
  path: string;
  fields?: FieldSpec[];
  fixed?: Record<string, unknown>;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  done?: string;
}
export interface StepSpec {
  id: string;
  label: string;
  state: WorkflowStep['state'];
  by?: string | null;
  at?: string | null;
  note?: string | null;
}

/** One desk record on the RecordPage template: facts, overview, related lists, audit history and the approval panel. */
export function DeskRecord({
  title,
  subtitle,
  status,
  facts,
  details = [],
  overview,
  related = [],
  history,
  steps,
  decide,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  status?: string;
  facts: Fact[];
  details?: Fact[];
  overview?: TableSpec & { label: string };
  related?: (TableSpec & { value: string; label: string })[];
  history: { id: string | number; at: string; actor: string | null; action: string; data?: unknown }[];
  steps?: StepSpec[];
  /** Approve/reject through this decide endpoint when the viewer may. */
  decide?: { path: string; canDecide: boolean };
  actions?: ActionSpec[];
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const cell = useCell();
  const word = useWord();
  const tr = (k: string) => {
    const s = t(k as MessageKey);
    return s === k ? k.split('.').pop()!.replace(/_/g, ' ') : s;
  };
  const activity: ActivityItem[] = history.map((h) => {
    const comment = h.data && typeof h.data === 'object' && 'comment' in h.data ? String((h.data as { comment?: string }).comment ?? '') : '';
    return { id: String(h.id), at: fmt.dateTime(h.at), actor: h.actor ?? t('fd.system'), action: tr(`fd.act.${h.action}`), detail: comment || undefined, tone: /rejected|bounced/.test(h.action) ? 'danger' : /approved|published|paid|verified|cleared/.test(h.action) ? 'success' : undefined };
  });
  const wf: WorkflowStep[] | undefined = steps?.map((s) => ({ id: s.id, label: t(s.label as MessageKey), state: s.state, by: s.by ?? undefined, at: s.at ? fmt.dateTime(s.at) : undefined, note: s.note ?? undefined }));
  const buttons = actions.map((a) => <DeskAction key={a.path + a.label} label={t(a.label as MessageKey)} path={a.path} fields={a.fields} fixed={a.fixed} variant={a.variant} done={a.done} />);

  const aside = decide ? (
    <ApprovalPanel
      steps={wf}
      canDecide={decide.canDecide}
      history={activity.slice(0, 6)}
      onDecide={async (decision, comment) => {
        const res = await deskSend(decide.path, { decision, comment });
        return res.ok ? undefined : res.error;
      }}
      onDecided={() => router.refresh()}
    />
  ) : wf ? (
    <Card title={t('fd.progress')}>
      <WorkflowStepper steps={wf} />
    </Card>
  ) : undefined;

  return (
    <RecordPage
      title={title}
      subtitle={subtitle}
      status={status ? { label: word(status), tone: toneOf(status) } : undefined}
      facts={facts.map((f) => ({ label: t(f.label as MessageKey), value: cell({ key: '', label: '', kind: f.kind }, f.value) }))}
      primary={buttons[0]}
      secondary={buttons.length > 1 ? <div className="flex flex-wrap gap-2">{buttons.slice(1)}</div> : undefined}
      overview={
        <div className="grid gap-6">
          {details.length > 0 && (
            <Card>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {details.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t(d.label as MessageKey)}</dt>
                    <dd className="mt-1 break-words text-sm">{cell({ key: '', label: '', kind: d.kind }, d.value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {overview && <SpecTable columns={overview.columns} rows={overview.rows} href={overview.href} label={t(overview.label as MessageKey)} />}
        </div>
      }
      related={related.map((r) => ({ value: r.value, label: t(r.label as MessageKey), count: r.rows.length, content: <SpecTable columns={r.columns} rows={r.rows} href={r.href} label={t(r.label as MessageKey)} /> }))}
      activity={activity}
      aside={aside}
    />
  );
}
