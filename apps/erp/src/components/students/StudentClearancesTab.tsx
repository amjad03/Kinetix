'use client';

import { FileCheck2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { startClearance } from '@/app/(dashboard)/students/info-actions';
import { Button } from '@/components/shadcn/button';
import { Card, EmptyState, FormRow, SelectInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { CLEARANCE_PURPOSES, type Clearance } from '@/lib/student-info';
import { ClearancePanel } from './ClearancePanel';

/** A student's no-dues clearances, newest first, and a way to start one (for a TC, course completion or migration). */
export function StudentClearancesTab({ studentId, clearances, canStart }: { studentId: string; clearances: Clearance[]; canStart: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [purpose, setPurpose] = useState<string>('tc');
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await startClearance(studentId, purpose);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('si.clr.started'));
      router.refresh();
    });
  return (
    <div className="grid gap-6">
      {canStart && (
        <Card title={t('si.clr.start')} subtitle={t('si.clr.startHelp')}>
          <FormRow>
            <SelectInput label={t('si.clr.purpose')} value={purpose} onChange={(e) => setPurpose(e.target.value)} options={CLEARANCE_PURPOSES.map((p) => ({ value: p, label: t(`si.clr.purpose.${p}` as MessageKey) }))} className="min-w-[240px]" />
            <Button onClick={go} disabled={pending} data-testid="start-clearance">
              {t('si.clr.start')}
            </Button>
          </FormRow>
        </Card>
      )}
      {clearances.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title={t('si.clr.noneForStudent')}>
          {t('si.clr.noneForStudentBody')}
        </EmptyState>
      ) : (
        clearances.map((c) => <ClearancePanel key={`${c.id}:${c.status}:${c.items.map((i) => i.status).join()}`} clearance={c} />)
      )}
    </div>
  );
}
