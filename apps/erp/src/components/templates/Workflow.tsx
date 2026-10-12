'use client';

import { Check, Circle, X } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';
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

/** Where a record is in its approval chain: horizontal on wide screens, a vertical list on phones. */
export function WorkflowStepper({ steps, label }: { steps: WorkflowStep[]; label?: string }) {
  const { t, fmt } = useI18n();
  return (
    <ol aria-label={label ?? t('tpl.steps')} className="grid gap-4 md:flex md:gap-0" data-testid="workflow-stepper">
      {steps.map((s, i) => {
        const Icon = s.state === 'done' ? Check : s.state === 'rejected' ? X : Circle;
        return (
          <li key={s.id} aria-current={s.state === 'current' ? 'step' : undefined} className="relative flex gap-3 md:flex-1 md:flex-col md:gap-2">
            {i < steps.length - 1 && <span aria-hidden className={cn('absolute top-8 left-[15px] h-[calc(100%-16px)] w-px md:top-[15px] md:left-8 md:h-px md:w-[calc(100%-32px)]', s.state === 'done' ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                s.state === 'current' && 'border-primary text-primary',
                s.state === 'rejected' && 'border-red bg-red text-white',
                (s.state === 'upcoming' || s.state === 'skipped') && 'text-muted-foreground',
              )}
            >
              <Icon aria-hidden className={cn('size-4', s.state === 'current' && 'fill-current size-2.5')} />
            </span>
            <div className="min-w-0 md:pr-3">
              <p className={cn('text-sm font-semibold', s.state === 'upcoming' && 'text-muted-foreground')}>{s.label}</p>
              {(s.by || s.at) && (
                <p className="text-xs text-muted-foreground">
                  {s.by}
                  {s.by && s.at && ' · '}
                  {s.at && fmt.dateTime(s.at)}
                </p>
              )}
              {s.note && <p className="mt-1 text-xs text-muted-foreground">“{s.note}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
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
