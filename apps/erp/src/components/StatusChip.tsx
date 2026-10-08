'use client';

import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import HourglassEmpty from '@mui/icons-material/HourglassEmpty';
import Schedule from '@mui/icons-material/Schedule';
import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { ClassStatus } from '@/lib/types';
import { StatusPill, type Tone } from '@/components/ui';

const TONE: Record<ClassStatus, Tone> = { live: 'live', taught: 'success', not_started: 'warning', missed: 'danger', upcoming: 'neutral' };
const ICON: Partial<Record<ClassStatus, ReactNode>> = {
  taught: <CheckCircleOutline />,
  not_started: <HourglassEmpty />,
  missed: <ErrorOutline />,
  upcoming: <Schedule />,
};

/** A class's status as a pill: a dot or an icon, and always the word. */
export function StatusChip({ status }: { status: ClassStatus }) {
  const { t } = useI18n();
  return (
    <Box component="span" data-status={status} sx={{ display: 'inline-flex' }}>
      <StatusPill tone={TONE[status]} icon={ICON[status]} title={t(`status.help.${status}`)}>
        {t(`status.${status}`)}
      </StatusPill>
    </Box>
  );
}
