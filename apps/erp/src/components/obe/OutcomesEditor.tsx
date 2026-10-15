'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FieldRow, FormField, TextInput } from '@/components/ui';
import { addOutcome, removeOutcome } from '@/app/(dashboard)/obe/actions';
import { useRun } from '@/components/exams/useRun';
import { useI18n } from '@/i18n/client';
import type { OutcomeKind, ProgramOutcome } from '@/lib/obe';

import { Button, Card, MenuItem } from '@/components/kx';
const KINDS: OutcomeKind[] = ['mission', 'vision', 'peo', 'po', 'pso'];

/** The programme's mission, vision, PEOs, POs and PSOs. */
export function OutcomesEditor({ programs, programId, outcomes, canEdit }: { programs: { id: string; name: string }[]; programId: string; outcomes: ProgramOutcome[]; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [f, setF] = useState({ kind: 'po' as OutcomeKind, code: '', statement: '' });
  return (
    <>
      <FormField label={t('exm.f.program')}>
        <TextInput className="min-w-[220px] mb-4" select value={programId} onChange={(e) => router.push(`/obe/setup?programId=${e.target.value}`)}>
          {programs.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextInput>
      </FormField>
      {feedback}
      {KINDS.map((k) => (
        <div className="mb-4" key={k}>
          <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
            {t(`obe.kind.${k}`)}
          </h2>
          {outcomes.filter((o) => o.kind === k).map((o) => (
            <div className="flex gap-2 items-baseline" key={o.id}>
              <p className="text-sm leading-[21px] font-semibold min-w-[56px]">{o.code}</p>
              <p className="text-sm leading-[21px] flex-1">{o.statement}</p>
              {canEdit && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => removeOutcome(o.id), t('obe.removed'))}>
                  {t('exm.remove')}
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
      {canEdit && (
        <Card className="mb-6 p-5">
          <FieldRow>
            <FormField label={t('obe.f.kind')}>
              <TextInput className="min-w-[150px]" select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OutcomeKind })}>
                {KINDS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {t(`obe.kind.${k}`)}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.code')}>
              <TextInput className="w-[100px]" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </FormField>
            <FormField label={t('obe.f.statement')}>
              <TextInput className="flex-1 min-w-[260px]" value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} />
            </FormField>
            <Button variant="outlined" disabled={pending} onClick={() => run(() => addOutcome(programId, f), t('obe.added'), () => setF({ ...f, code: '', statement: '' }))}>
              {t('obe.add')}
            </Button>
          </FieldRow>
        </Card>
      )}
    </>
  );
}
