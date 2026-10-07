'use client';

import Chip from '@mui/material/Chip';
import { useI18n } from '@/i18n/client';
import { applicationTone, studentTone } from '@/lib/admissions';
import type { MessageKey } from '@/i18n/messages';

/** An application's or a student's status, in words and a colour. */
export function StatusPill({ kind, status }: { kind: 'application' | 'student'; status: string }) {
  const { t } = useI18n();
  const tone = kind === 'application' ? applicationTone(status) : studentTone(status);
  return <Chip size="small" label={t(`adm.${kind === 'application' ? 'app' : 'stu'}.${status}` as MessageKey)} color={tone} variant={tone === 'default' ? 'outlined' : 'filled'} />;
}
