'use client';
import Link from 'next/link';
import { useState } from 'react';
import { createSession } from '@/app/(dashboard)/exams/actions';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { sessionTone, type ExamSession } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

import { Button, Card, MenuItem } from '@/components/kx';
export function ExamSessionsDesk({ sessions, structure, canManage }: { sessions: ExamSession[]; structure: Structure & { academicYears?: { id: string; label: string; isCurrent: boolean }[] }; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const years = structure.academicYears ?? [];
  const [f, setF] = useState({ academicYearId: years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '', programId: structure.programs[0]?.id ?? '', term: '1', name: '', kind: 'regular' as 'regular' | 'supplementary', startsOn: '', endsOn: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      {canManage && (
        <Card className="p-5 mb-6">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-3">
            {t('exm.newSession')}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createSession({ ...f, term: Number(f.term) }), t('exm.sessionCreated'), () => setF((x) => ({ ...x, name: '' })));
            }}
            style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
          >
            <FormField label={t('exm.f.name')} required>
              <TextInput value={f.name} onChange={set('name')} required />
            </FormField>
            <FormField label={t('exm.f.year')} required>
              <TextInput select value={f.academicYearId} onChange={set('academicYearId')} required>
                {years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.program')} required>
              <TextInput select value={f.programId} onChange={set('programId')} required>
                {structure.programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.term')}>
              <TextInput type="number" value={f.term} onChange={set('term')} slotProps={{ htmlInput: { min: 1, max: 20 } }} />
            </FormField>
            <FormField label={t('exm.f.kind')}>
              <TextInput select value={f.kind} onChange={set('kind')}>
                <MenuItem value="regular">{t('exm.kind.regular')}</MenuItem>
                <MenuItem value="supplementary">{t('exm.kind.supplementary')}</MenuItem>
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.starts')} required>
              <TextInput type="date" value={f.startsOn} onChange={set('startsOn')} required slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <FormField label={t('exm.f.ends')} required>
              <TextInput type="date" value={f.endsOn} onChange={set('endsOn')} required slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <Button className="self-center" type="submit" variant="contained" disabled={pending}>
              {t('exm.create')}
            </Button>
          </form>
          {feedback}
        </Card>
      )}
      {sessions.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('exm.none')}</p>
      ) : (
        <DataTable
          testId="exam-sessions"
          label={t('nav.exams')}
          rows={sessions}
          rowId={(s) => String(s.id)}
          exportName="exam-sessions"
          columns={[
            { id: 'c0', header: t('exm.f.name'), rowHeader: true, sort: (s) => s.name, cell: (s) => (<><Link href={`/exams/${s.id}`}>{s.name}</Link>
                              {s.kind === 'supplementary' && <span style={{ marginInlineStart: 8 }}><StatusPill tone="info">{t('exm.kind.supplementary')}</StatusPill></span>}</>) },
            { id: 'c1', header: t('exm.f.term'), sort: (s) => s.term, cell: (s) => s.term },
            { id: 'c2', header: t('exm.dates'), sort: (s) => `${fmt.date(s.startsOn)} – ${fmt.date(s.endsOn)}`, cell: (s) => `${fmt.date(s.startsOn)} – ${fmt.date(s.endsOn)}` },
            { id: 'c3', header: t('exm.status'), sort: (s) => t(`exm.st.${s.status}`), cell: (s) => (<><StatusPill tone={sessionTone(s.status) === 'success' ? 'success' : sessionTone(s.status) === 'warning' ? 'warning' : 'neutral'}>{t(`exm.st.${s.status}`)}</StatusPill></>) },
          ]}
        />
      )}
    </>
  );
}
