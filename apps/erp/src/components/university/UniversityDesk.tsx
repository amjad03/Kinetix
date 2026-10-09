'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { addConvocation, addInstitution, convocationStep } from '@/app/(dashboard)/university/actions';
import { Bar, FormDialog, Grid, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ConvocationRow, InstitutionRow } from '@/lib/curriculum';

type Dlg = { title: string; fields: Field[]; run: (v: Record<string, string>) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }> };
const TONE = { draft: 'neutral', registration_open: 'success', closed: 'warning', held: 'info' } as const;

/** Affiliated institutions and convocations (eligible graduates, registration, degree certificates). */
export function UniversityDesk({ institutions, convocations, programs, tab, canAdmin }: { institutions: InstitutionRow[]; convocations: ConvocationRow[]; programs: { id: string; name: string }[]; tab: string; canAdmin: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const step = (c: ConvocationRow, s: 'eligible' | 'open' | 'close' | 'issue', label: string) => (
    <Button size="small" onClick={() => setDlg({ title: label, fields: [], run: () => convocationStep(c.id, s) })}>
      {label}
    </Button>
  );

  const institutionsTab = (
    <>
      {canAdmin && (
        <Bar>
          <Button
            variant="contained"
            onClick={() =>
              setDlg({
                title: t('un.i.new'),
                fields: [
                  { name: 'code', label: t('un.i.code'), required: true },
                  { name: 'name', label: t('un.i.name'), required: true },
                  { name: 'model', label: t('un.i.model'), kind: 'select', init: 'affiliated', options: (['affiliated', 'autonomous', 'constituent', 'deemed'] as const).map((m) => ({ value: m, label: t(`un.model.${m}`) })) },
                  { name: 'university', label: t('un.i.university') },
                  { name: 'city', label: t('un.i.city') },
                  { name: 'affiliationValidTo', label: t('un.i.valid'), kind: 'date' },
                ],
                run: addInstitution,
              })
            }
          >
            {t('un.i.new')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="un-institutions"
        empty={t('un.i.empty')}
        rows={institutions}
        cols={[
          { label: t('un.i.code'), cell: (i) => i.code, sort: (i) => i.code },
          { label: t('un.i.name'), cell: (i) => i.name, sort: (i) => i.name },
          { label: t('un.i.model'), cell: (i) => t(`un.model.${i.model}` as MessageKey) },
          { label: t('un.i.university'), cell: (i) => i.university || '—' },
          { label: t('un.i.valid'), cell: (i) => i.affiliationValidTo ?? '—', sort: (i) => i.affiliationValidTo ?? '' },
          { label: t('un.i.active'), cell: (i) => <StatusPill tone={i.active ? 'success' : 'neutral'}>{t(i.active ? 'un.yes' : 'un.no')}</StatusPill> },
        ]}
      />
    </>
  );

  const convocationsTab = (
    <>
      {canAdmin && (
        <Bar>
          <Button
            variant="contained"
            onClick={() =>
              setDlg({
                title: t('un.c.new'),
                fields: [
                  { name: 'name', label: t('un.c.name'), required: true },
                  { name: 'heldOn', label: t('un.c.date'), kind: 'date', required: true },
                  { name: 'graduationYear', label: t('un.c.year'), kind: 'number', required: true, init: String(new Date().getFullYear()) },
                  { name: 'programId', label: t('un.c.programme'), kind: 'select', options: programs.map((p) => ({ value: p.id, label: p.name })) },
                ],
                run: addConvocation,
              })
            }
          >
            {t('un.c.new')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="un-convocations"
        empty={t('un.c.empty')}
        rows={convocations}
        cols={[
          { label: t('un.c.name'), cell: (c) => c.name, sort: (c) => c.name },
          { label: t('un.c.date'), cell: (c) => c.heldOn, sort: (c) => c.heldOn },
          { label: t('un.c.status'), cell: (c) => <StatusPill tone={TONE[c.status]}>{t(`un.cs.${c.status}` as MessageKey)}</StatusPill>, sort: (c) => c.status },
          { label: t('un.c.eligible'), cell: (c) => c.candidates, num: true },
          { label: t('un.c.registered'), cell: (c) => c.registered, num: true },
          {
            label: '',
            cell: (c) =>
              canAdmin && c.status !== 'held' ? (
                <Stack direction="row" spacing={1}>
                  {step(c, 'eligible', t('un.c.generate'))}
                  {c.status !== 'registration_open' ? step(c, 'open', t('un.c.open')) : step(c, 'close', t('un.c.close'))}
                  {step(c, 'issue', t('un.c.issue'))}
                </Stack>
              ) : null,
          },
        ]}
      />
    </>
  );

  return (
    <>
      <Tabbed
        label={t('nav.university')}
        initial={tab}
        tabs={[
          { id: 'convocations', label: t('un.tab.convocations'), node: convocationsTab },
          { id: 'institutions', label: t('un.tab.institutions'), node: institutionsTab },
        ]}
      />
      {dlg && (
        <FormDialog
          title={dlg.title}
          fields={dlg.fields}
          onSubmit={dlg.run}
          onClose={(m) => {
            setDlg(null);
            if (m) toast(t('ops.saved'));
          }}
        />
      )}
      {toastNode}
    </>
  );
}
