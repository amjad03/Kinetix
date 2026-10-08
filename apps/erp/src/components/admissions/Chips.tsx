'use client';

import { StatusPill as Pill, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { applicationTone, studentTone } from '@/lib/admissions';
import type { MessageKey } from '@/i18n/messages';

const TONE: Record<string, Tone> = { default: 'neutral', info: 'info', success: 'success', warning: 'warning', error: 'danger' };

/** An application's or a student's status, in words and a colour. */
export function StatusPill({ kind, status }: { kind: 'application' | 'student'; status: string }) {
  const { t } = useI18n();
  const tone = kind === 'application' ? applicationTone(status) : studentTone(status);
  return <Pill tone={TONE[tone] ?? 'neutral'}>{t(`adm.${kind === 'application' ? 'app' : 'stu'}.${status}` as MessageKey)}</Pill>;
}
