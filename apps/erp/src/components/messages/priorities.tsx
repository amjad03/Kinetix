'use client';

import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import NotificationImportantOutlined from '@mui/icons-material/NotificationImportantOutlined';
import ReportOutlined from '@mui/icons-material/ReportOutlined';
import Chip from '@mui/material/Chip';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Priority } from '@/lib/types';

/** Label, short line, what boards do and what families get: dictionary keys `msg.pri.<value>[.short|.board|.families]`. */
export const PRIORITIES: { value: Priority; icon: ReactNode }[] = [
  { value: 'info', icon: <CampaignOutlined /> },
  { value: 'important', icon: <NotificationImportantOutlined /> },
  { value: 'emergency', icon: <ReportOutlined /> },
];

export const priorityKey = (p: Priority, part?: 'short' | 'board' | 'families') => `msg.pri.${p}${part ? `.${part}` : ''}` as MessageKey;

export function PriorityChip({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  if (priority === 'emergency') return <Chip size="small" label={t('msg.pri.emergency')} sx={{ bgcolor: 'error.main', color: 'error.contrastText' }} />;
  if (priority === 'important') return <Chip size="small" label={t('msg.pri.important')} sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />;
  return <Chip size="small" label={t('msg.pri.info')} sx={{ bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer' }} />;
}

/** How long a message stays; the label is `msg.exp.<minutes>`. */
export const EXPIRY_OPTIONS = [15, 60, 240, 24 * 60, 3 * 24 * 60, 7 * 24 * 60].map((minutes) => ({ minutes, label: `msg.exp.${minutes}` as MessageKey }));
