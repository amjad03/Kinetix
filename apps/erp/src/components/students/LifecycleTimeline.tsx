'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { LifecycleEventRow } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';

/** The student's permanent record, newest first: what changed, why, who did it. */
export function LifecycleTimeline({ events }: { events: LifecycleEventRow[] }) {
  const { t, locale } = useI18n();
  if (events.length === 0) return <Typography color="text.secondary">{t('stu.noEvents')}</Typography>;
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
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, borderLeft: 2, borderColor: 'divider', ml: 1 }} data-testid="lifecycle-timeline">
      {events.map((e) => (
        <Box component="li" key={e.id} sx={{ position: 'relative', pl: 2.5, pb: 2.5 }}>
          <Box sx={{ position: 'absolute', left: -6, top: 6, width: 10, height: 10, borderRadius: '50%', bgcolor: e.kind === 'status' ? 'primary.main' : 'text.disabled' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {title(e)}
          </Typography>
          {e.reason && (
            <Typography variant="body2" color="text.secondary">
              {e.reason}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {formatDate(e.effectiveOn, 'short', locale)} · {e.actorName ?? t('adm.system')}
            {e.approverName ? ` · ${t('stu.approvedBy', { name: e.approverName })}` : ''}
            {e.returnOn ? ` · ${t('stu.returnsOn', { date: formatDate(e.returnOn, 'short', locale) })}` : ''}
            {e.certificateId ? ` · ${t('stu.tcLinked')}` : ''}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
