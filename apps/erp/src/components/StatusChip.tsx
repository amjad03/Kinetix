'use client';

import { CircleAlert, CircleCheck, Clock, Hourglass } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { ClassStatus } from '@/lib/types';
import { StatusPill, type Tone } from '@/components/ui/Badge';

const TONE: Record<ClassStatus, Tone> = { live: 'live', taught: 'success', not_started: 'warning', missed: 'danger', upcoming: 'neutral' };
const ICON: Partial<Record<ClassStatus, ReactNode>> = {
  taught: <CircleCheck />,
  not_started: <Hourglass />,
  missed: <CircleAlert />,
  upcoming: <Clock />,
};

/** A class's status as a pill: a dot or an icon, and always the word. */
export function StatusChip({ status }: { status: ClassStatus }) {
  const { t } = useI18n();
  return (
    <span data-status={status} className="inline-flex">
      <StatusPill tone={TONE[status]} icon={ICON[status]} title={t(`status.help.${status}`)}>
        {t(`status.${status}`)}
      </StatusPill>
    </span>
  );
}
