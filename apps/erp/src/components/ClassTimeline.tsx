'use client';

import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import MeetingRoomOutlined from '@mui/icons-material/MeetingRoomOutlined';
import PersonOutline from '@mui/icons-material/PersonOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Fragment, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { hhmm } from '@/lib/dates';
import type { ClassRow, ClassStatus } from '@/lib/types';
import { StatusChip } from './StatusChip';

const DOT: Record<ClassStatus, string> = {
  live: 'kx.live',
  taught: 'kx.success',
  not_started: 'error.main',
  missed: 'error.main',
  upcoming: 'm3.outline',
};

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, '& svg': { fontSize: 16 } }}>
      {icon}
      {children}
    </Box>
  );
}

export function AttendanceSummary({ c }: { c: ClassRow }) {
  const { t } = useI18n();
  if (c.status === 'upcoming') return <>{t('att.notDue')}</>;
  if (!c.attendanceTaken) return <Box component="span" sx={{ color: c.status === 'live' ? 'text.secondary' : 'error.main' }}>{t('att.notTaken')}</Box>;
  return (
    <>
      {t('att.taken')}{' '}
      <Box component="span" sx={{ color: c.absent ? 'error.main' : 'inherit', fontWeight: c.absent ? 500 : 400 }}>
        {c.absent ? t('att.absent', { n: c.absent }) : t('att.allPresent')}
      </Box>
    </>
  );
}

/** The day's classes as a vertical timeline, with a "now" line on today. */
export function ClassTimeline({ classes, nowTime }: { classes: ClassRow[]; nowTime?: string }) {
  const { t } = useI18n();
  const nowIndex = nowTime ? classes.findIndex((c) => c.startsAt > nowTime) : -1;
  const showNowAtEnd = !!nowTime && nowIndex === -1 && classes.length > 0;
  const nowLine = nowTime ? (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '64px 20px 1fr', sm: '96px 24px 1fr' }, alignItems: 'center', my: 0.5 }} aria-label={t('timeline.nowLabel', { time: nowTime.slice(0, 5) })}>
      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500, textAlign: 'right', pr: 1.5 }}>
        {t('timeline.now', { time: nowTime.slice(0, 5) })}
      </Typography>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', justifySelf: 'center' }} />
      <Box sx={{ height: 2, bgcolor: 'error.main', borderRadius: 1 }} />
    </Box>
  ) : null;

  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="class-timeline">
      {classes.map((c, i) => (
        <Fragment key={c.id}>
          {i === nowIndex && nowLine}
          <Box
            component="li"
            data-status={c.status}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '64px 20px 1fr', sm: '96px 24px 1fr' }, minHeight: 88 }}
          >
            <Box sx={{ textAlign: 'right', pr: 1.5, pt: 1.75 }}>
              <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {hhmm(c.startsAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {hhmm(c.endsAt)}
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <Box
                sx={{
                  position: 'absolute',
                  top: i === 0 ? 24 : 0,
                  bottom: i === classes.length - 1 ? 'calc(100% - 24px)' : 0,
                  width: 2,
                  bgcolor: 'm3.outlineVariant',
                }}
              />
              <Box
                sx={{
                  mt: '18px',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: c.status === 'upcoming' ? 'kx.pane' : DOT[c.status],
                  border: 2,
                  borderColor: DOT[c.status],
                  zIndex: 1,
                }}
              />
            </Box>
            <Box
              sx={{
                ml: 1,
                mb: 1.25,
                px: 2,
                py: 1.5,
                borderRadius: '12px',
                border: 1,
                borderColor: c.status === 'live' ? 'kx.live' : 'm3.outlineVariant',
                bgcolor: c.status === 'live' ? 'kx.liveContainer' : 'transparent',
                display: 'flex',
                gap: 2,
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                minWidth: 0,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" component="h3" sx={{ lineHeight: '24px' }}>
                  {c.subject.name}{' '}
                  <Typography component="span" variant="body2" color="text.secondary">
                    · {c.section.displayName}
                  </Typography>
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  component="div"
                  sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
                >
                  <Meta icon={<PersonOutline />}>{c.teacher.fullName}</Meta>
                  {c.room && <Meta icon={<MeetingRoomOutlined />}>{c.room}</Meta>}
                  {c.board && <Meta icon={<CastForEducationOutlined />}>{c.board}</Meta>}
                  <Meta icon={<FactCheckOutlined />}>
                    <AttendanceSummary c={c} />
                  </Meta>
                </Typography>
              </Box>
              <Box sx={{ flexShrink: 0, pt: 0.25 }}>
                <StatusChip status={c.status} />
              </Box>
            </Box>
          </Box>
        </Fragment>
      ))}
      {showNowAtEnd && nowLine}
    </Box>
  );
}
