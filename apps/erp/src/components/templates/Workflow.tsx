'use client';

import { Check, Circle, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { TextField } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { ActivityTimeline, type ActivityItem } from './RecordPage';

export interface WorkflowStep {
  id: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'rejected' | 'skipped';
  /** Who acted or who it waits on. */
  by?: string;
  /** ISO timestamp of the decision. */
  at?: string;
  note?: string;
}

/**
 * Where a record is in its approval chain: one compact, horizontally scrollable row of dots and short
 * labels that scrolls itself to the current step. Who/when/note shows under the row for the current
 * step only; the other steps carry it in their tooltip.
 */
export function WorkflowStepper({ steps, label }: { steps: WorkflowStep[]; label?: string }) {
  const { t, fmt } = useI18n();
  const row = useRef<HTMLOListElement>(null);
  const focus = steps.find((s) => s.state === 'current' || s.state === 'rejected');
  const focusId = focus?.id;
  useEffect(() => {
    const ol = row.current;
    const li = focusId ? ol?.querySelector<HTMLElement>(`[data-step="${CSS.escape(focusId)}"]`) : null;
    if (ol && li) ol.scrollLeft = Math.max(0, li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2);
  }, [focusId, steps.length]);
  const detail = (s: WorkflowStep) => [s.by, s.at && fmt.dateTime(s.at), s.note && `“${s.note}”`].filter(Boolean).join(' · ');
  return (
    <div className="min-w-0" data-testid="workflow-stepper-wrap">
      <ol ref={row} aria-label={label ?? t('tpl.steps')} className="flex min-w-0 items-center overflow-x-auto pb-1 [scrollbar-width:thin]" data-testid="workflow-stepper">
        {steps.map((s, i) => {
          const Icon = s.state === 'done' ? Check : s.state === 'rejected' ? X : Circle;
          const info = detail(s);
          return (
            <li key={s.id} data-step={s.id} aria-current={s.state === 'current' ? 'step' : undefined} title={info ? `${s.label} — ${info}` : s.label} className="flex shrink-0 items-center">
              {i > 0 && <span aria-hidden className={cn('mx-2 h-px w-5 shrink-0', steps[i - 1].state === 'done' ? 'bg-primary' : 'bg-border')} />}
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-background',
                  s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  s.state === 'current' && 'border-primary text-primary',
                  s.state === 'rejected' && 'border-red bg-red text-white',
                  (s.state === 'upcoming' || s.state === 'skipped') && 'text-muted-foreground',
                )}
              >
                <Icon aria-hidden className={cn('size-3', s.state === 'current' && 'size-2 fill-current')} />
              </span>
              <span className={cn('ml-1.5 max-w-[11rem] truncate text-[12.5px] whitespace-nowrap', s.state === 'current' || s.state === 'rejected' ? 'font-semibold text-foreground' : 'text-muted-foreground', s.state === 'done' && 'text-foreground')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {focus && detail(focus) && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground" data-testid="workflow-current">
          <span className="font-medium text-foreground">{focus.label}</span> · {detail(focus)}
        </p>
      )}
    </div>
  );
}

/**
 * ApprovalPanel: the decision box for whoever the record waits on. Reject needs a comment.
 * `onDecide` runs the server action and returns an error message (or nothing); `onDecided` is the
 * notifications hook (tell the requester, refresh counts) and runs only after a successful decision.
 */
export function ApprovalPanel({
  title,
  steps,
  canDecide,
  onDecide,
  onDecided,
  history = [],
  extra,
}: {
  title?: string;
  steps?: WorkflowStep[];
  canDecide: boolean;
  onDecide: (decision: 'approve' | 'reject', comment: string) => Promise<string | void>;
  onDecided?: (decision: 'approve' | 'reject', comment: string) => void;
  history?: ActivityItem[];
  /** Fields the approver must fill (amount sanctioned, effective date). */
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (d: 'approve' | 'reject') => {
    if (d === 'reject' && !comment.trim()) {
      setError(t('tpl.commentRequired'));
      return;
    }
    setError(null);
    start(async () => {
      const err = await onDecide(d, comment.trim());
      if (err) {
        setError(err);
        toast?.error(err);
        return;
      }
      onDecided?.(d, comment.trim());
      setComment('');
    });
  };

  return (
    <Card title={title ?? t('tpl.steps')} testId="approval-panel">
      <div className="grid gap-5">
        {steps && <WorkflowStepper steps={steps} />}
        {canDecide && (
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-4" aria-busy={pending}>
            <p className="text-sm font-semibold">{t('tpl.awaiting')}</p>
            {extra}
            <TextField label={t('tpl.comment')} multiline minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} error={!!error} helperText={error ?? undefined} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className="h-10" disabled={pending} onClick={() => decide('reject')} data-testid="approval-reject">
                {t('tpl.reject')}
              </Button>
              <Button className="h-10" disabled={pending} onClick={() => decide('approve')} data-testid="approval-approve">
                {t('tpl.approve')}
              </Button>
            </div>
          </div>
        )}
        {history.length > 0 && <ActivityTimeline items={history} />}
      </div>
    </Card>
  );
}
