'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addCombination, addHouse, addOutcome, addStream, awardPoints, saveReportCard } from '@/app/(dashboard)/school-mode/actions';
import { Bar, FormDialog, Grid, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { HouseRow, OutcomeRow, PucStream } from '@/lib/curriculum';

type Dlg = { title: string; fields: Field[]; run: (v: Record<string, string>) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }> };

/** School mode: house system, PUC streams and combinations, learning outcomes, and report cards with remarks and promotion. */
export function SchoolModeDesk({ houses, streams, outcomes, years, tab, canAdmin }: { houses: HouseRow[]; streams: PucStream[]; outcomes: OutcomeRow[]; years: { id: string; label: string }[]; tab: string; canAdmin: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const open = (d: Dlg) => setDlg(d);
  const categories = (['academics', 'sports', 'arts', 'discipline', 'service', 'general'] as const).map((c) => ({ value: c, label: t(`sm.cat.${c}`) }));
  const combos = streams.flatMap((s) => s.combinations.map((c) => ({ ...c, stream: s.name })));

  const housesTab = (
    <>
      {canAdmin && (
        <Bar>
          <Button variant="contained" onClick={() => open({ title: t('sm.h.new'), fields: [{ name: 'name', label: t('sm.h.name'), required: true }, { name: 'colour', label: t('sm.h.colour'), init: '#1d4ed8' }, { name: 'motto', label: t('sm.h.motto') }], run: addHouse })}>
            {t('sm.h.new')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="sm-houses"
        empty={t('sm.h.empty')}
        rows={houses}
        cols={[
          { label: t('sm.h.rank'), cell: (h) => h.rank, num: true, sort: (h) => h.rank },
          { label: t('sm.h.name'), cell: (h) => <span style={{ borderLeft: `6px solid ${h.colour}`, paddingLeft: 8 }}>{h.name}</span>, sort: (h) => h.name },
          { label: t('sm.h.points'), cell: (h) => h.points, num: true, sort: (h) => h.points },
          { label: t('sm.h.members'), cell: (h) => h.members, num: true, sort: (h) => h.members },
          {
            label: '',
            cell: (h) => (
              <Button size="small" onClick={() => open({ title: `${t('sm.h.award')}: ${h.name}`, fields: [{ name: 'points', label: t('sm.h.pointsHint'), required: true }, { name: 'reason', label: t('sm.h.reason'), required: true }, { name: 'category', label: t('sm.h.category'), kind: 'select', options: categories, init: 'general' }], run: (v) => awardPoints(h.id, v) })}>
                {t('sm.h.award')}
              </Button>
            ),
          },
        ]}
      />
    </>
  );

  const pucTab = (
    <>
      {canAdmin && (
        <Bar>
          <Button variant="outlined" onClick={() => open({ title: t('sm.p.newStream'), fields: [{ name: 'code', label: t('sm.p.code'), required: true }, { name: 'name', label: t('sm.p.name'), required: true }], run: addStream })}>
            {t('sm.p.newStream')}
          </Button>
          <Button
            variant="contained"
            disabled={streams.length === 0}
            onClick={() =>
              open({
                title: t('sm.p.newCombo'),
                fields: [
                  { name: 'streamId', label: t('sm.p.stream'), kind: 'select', required: true, options: streams.map((s) => ({ value: s.id, label: s.name })) },
                  { name: 'code', label: t('sm.p.code'), required: true },
                  { name: 'name', label: t('sm.p.name'), required: true },
                  { name: 'seats', label: t('sm.p.seats'), kind: 'number' },
                  { name: 'subjects', label: t('sm.p.subjects'), kind: 'multiline', required: true },
                ],
                run: addCombination,
              })
            }
          >
            {t('sm.p.newCombo')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="sm-puc"
        empty={t('sm.p.empty')}
        rows={combos}
        cols={[
          { label: t('sm.p.stream'), cell: (c) => c.stream, sort: (c) => c.stream },
          { label: t('sm.p.code'), cell: (c) => c.code, sort: (c) => c.code },
          { label: t('sm.p.name'), cell: (c) => c.name },
          { label: t('sm.p.components'), cell: (c) => c.subjects.map((s) => `${s.name} (${s.theoryMax} / ${s.practicalMax} / ${s.internalMax})`).join(', ') },
          { label: t('sm.p.filled'), cell: (c) => (c.seats ? `${c.enrolled} / ${c.seats}` : c.enrolled), num: true },
        ]}
      />
    </>
  );

  const outcomesTab = (
    <>
      {canAdmin && (
        <Bar>
          <Button
            variant="contained"
            onClick={() =>
              open({
                title: t('sm.o.new'),
                fields: [
                  { name: 'kind', label: t('sm.o.kind'), kind: 'select', options: [{ value: 'outcome', label: t('sm.o.outcome') }, { value: 'competency', label: t('sm.o.competency') }], init: 'outcome' },
                  { name: 'grade', label: t('sm.o.grade'), kind: 'number', required: true },
                  { name: 'subjectName', label: t('sm.o.subject'), required: true },
                  { name: 'code', label: t('sm.p.code'), required: true },
                  { name: 'statement', label: t('sm.o.statement'), kind: 'multiline', required: true },
                ],
                run: addOutcome,
              })
            }
          >
            {t('sm.o.new')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="sm-outcomes"
        empty={t('sm.o.empty')}
        rows={outcomes}
        cols={[
          { label: t('sm.o.grade'), cell: (o) => o.grade, num: true, sort: (o) => o.grade },
          { label: t('sm.o.subject'), cell: (o) => o.subjectName, sort: (o) => o.subjectName },
          { label: t('sm.p.code'), cell: (o) => o.code, sort: (o) => o.code },
          { label: t('sm.o.kind'), cell: (o) => t(o.kind === 'outcome' ? 'sm.o.outcome' : 'sm.o.competency') },
          { label: t('sm.o.statement'), cell: (o) => o.statement },
        ]}
      />
    </>
  );

  const cardsTab = (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="body2">{t('sm.c.hint')}</Typography>
      <Button
        variant="contained"
        onClick={() =>
          open({
            title: t('sm.c.save'),
            fields: [
              { name: 'studentId', label: t('sm.c.student'), kind: 'uuid', required: true },
              { name: 'academicYearId', label: t('sm.c.year'), kind: 'select', required: true, options: years.map((y) => ({ value: y.id, label: y.label })) },
              { name: 'termLabel', label: t('sm.c.term'), required: true, init: 'Term 1' },
              { name: 'lines', label: t('sm.c.lines'), kind: 'multiline', required: true },
              { name: 'coCurricular', label: t('sm.c.co'), kind: 'multiline' },
              { name: 'behaviourGrade', label: t('sm.c.conduct') },
              { name: 'remarks', label: t('sm.c.remarks'), kind: 'multiline' },
              ...(canAdmin
                ? [
                    { name: 'promotionStatus', label: t('sm.c.promotion'), kind: 'select' as const, init: 'pending', options: (['pending', 'promoted', 'promoted_with_grace', 'detained'] as const).map((p) => ({ value: p, label: t(`sm.c.p.${p}`) })) },
                    { name: 'promotedTo', label: t('sm.c.promotedTo') },
                  ]
                : []),
            ],
            run: saveReportCard,
          })
        }
      >
        {t('sm.c.save')}
      </Button>
    </Stack>
  );

  return (
    <>
      <Tabbed
        label={t('nav.schoolMode')}
        initial={tab}
        tabs={[
          { id: 'houses', label: t('sm.tab.houses'), node: housesTab },
          { id: 'puc', label: t('sm.tab.puc'), node: pucTab },
          { id: 'outcomes', label: t('sm.tab.outcomes'), node: outcomesTab },
          { id: 'cards', label: t('sm.tab.cards'), node: cardsTab },
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
