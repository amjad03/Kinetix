'use client';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Priority } from '@/lib/types';

import { Chip } from '@/components/kx';
import { BellRing as NotificationImportantOutlined, Megaphone as CampaignOutlined, OctagonAlert as ReportOutlined } from 'lucide-react';
/** Label, short line, what boards do and what families get: dictionary keys `msg.pri.<value>[.short|.board|.families]`. */
export const PRIORITIES: { value: Priority; icon: ReactNode }[] = [
  { value: 'info', icon: <CampaignOutlined /> },
  { value: 'important', icon: <NotificationImportantOutlined /> },
  { value: 'emergency', icon: <ReportOutlined /> },
];

export const priorityKey = (p: Priority, part?: 'short' | 'board' | 'families') => `msg.pri.${p}${part ? `.${part}` : ''}` as MessageKey;

export function PriorityChip({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  if (priority === 'emergency') return <Chip className="bg-destructive text-white" size="small" label={t('msg.pri.emergency')} />;
  if (priority === 'important') return <Chip className="bg-orange-soft text-orange-ink" size="small" label={t('msg.pri.important')} />;
  return <Chip className="bg-secondary text-secondary-foreground" size="small" label={t('msg.pri.info')} />;
}

/** How long a message stays; the label is `msg.exp.<minutes>`. */
export const EXPIRY_OPTIONS = [15, 60, 240, 24 * 60, 3 * 24 * 60, 7 * 24 * 60].map((minutes) => ({ minutes, label: `msg.exp.${minutes}` as MessageKey }));
