'use client';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { LifecycleEventRow } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';

import { cn } from '@/lib/utils';
/** The student's permanent record, newest first: what changed, why, who did it. */
export function LifecycleTimeline({ events }: { events: LifecycleEventRow[] }) {
  const { t, locale } = useI18n();
  if (events.length === 0) return <p className="text-sm leading-[21px] text-muted-foreground">{t('stu.noEvents')}</p>;
  const title = (e: LifecycleEventRow) => {
    const st = (s: string | null) => (s ? t(`adm.stu.${s}` as MessageKey) : '–');
    switch (e.kind) {
      case 'status':
        return e.fromStatus ? t('stu.ev.status', { from: st(e.fromStatus), to: st(e.toStatus) }) : t('stu.ev.started', { to: st(e.toStatus) });
      case 'promotion':
        return t('stu.ev.promotion', { from: e.fromSection ?? '–', to: e.toSection ?? '–' });
      case 'section':
        return t('stu.ev.section', { from: e.fromSection ?? '–', to: e.toSection ?? '–' });
      default:
        return t('stu.ev.guardian');
    }
  };
  return (
    <ol className="list-none m-0 p-0 border-l-2 border-border ml-2" data-testid="lifecycle-timeline">
      {events.map((e) => (
        <li className="relative pl-5 pb-5" key={e.id}>
          <div className={cn('absolute left-[-6px] top-[6px] w-[10px] h-[10px] rounded-full', e.kind === 'status' ? 'bg-teal' : 'bg-faint')} />
          <p className="text-[13px] leading-[19px] font-semibold">
            {title(e)}
          </p>
          {e.reason && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {e.reason}
            </p>
          )}
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {formatDate(e.effectiveOn, 'short', locale)} · {e.actorName ?? t('adm.system')}
            {e.approverName ? ` · ${t('stu.approvedBy', { name: e.approverName })}` : ''}
            {e.returnOn ? ` · ${t('stu.returnsOn', { date: formatDate(e.returnOn, 'short', locale) })}` : ''}
            {e.certificateId ? ` · ${t('stu.tcLinked')}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
