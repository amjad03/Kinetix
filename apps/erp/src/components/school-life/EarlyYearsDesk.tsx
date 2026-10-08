'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addObservation, loadChild, seedFramework, setMilestone } from '@/app/(dashboard)/early-years/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Col, type Field } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { EY_DOMAINS, EY_STATUSES, type EyChild, type EyRecord, type EyTerm, type SectionOption } from '@/lib/school-life';

/** Nursery to UKG: the class list, each child's milestones and observations, and the learning story. */
export function EarlyYearsDesk({ sections, sectionId, kids, terms, canSeed, milestoneCount }: { sections: SectionOption[]; sectionId: string; kids: EyChild[]; terms: EyTerm[]; canSeed: boolean; milestoneCount: number }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [child, setChild] = useState<{ id: string; record: EyRecord } | null>(null);
  const [noting, setNoting] = useState(false);
  const [termId, setTermId] = useState(terms[0]?.id ?? '');
  const [pending, start] = useTransition();

  const open = (id: string) =>
    start(async () => {
      const res = await loadChild(id);
      if (res.ok) setChild({ id, record: res.data });
      else toast(res.error);
    });

  const mark = (milestoneId: string, status: string) =>
    start(async () => {
      if (!child) return;
      const res = await setMilestone(child.id, milestoneId, status);
      if (!res.ok) return toast(res.error);
      const fresh = await loadChild(child.id);
      if (fresh.ok) setChild({ id: child.id, record: fresh.data });
    });

  const cols: Col<EyChild>[] = [
    { label: t('ey.col.roll'), cell: (c) => c.rollNo, sort: (c) => c.rollNo },
    { label: t('ey.col.child'), cell: (c) => c.fullName, sort: (c) => c.fullName },
    { label: t('ey.col.achieved'), cell: (c) => fmt.number(c.achieved), num: true, sort: (c) => c.achieved },
    { label: t('ey.col.observations'), cell: (c) => fmt.number(c.observations), num: true, sort: (c) => c.observations },
    { label: '', cell: (c) => <Button size="small" onClick={() => open(c.id)}>{t('ey.open')}</Button> },
  ];

  const noteFields = (r: EyRecord): Field[] => [
    { name: 'note', label: t('ey.f.note'), kind: 'multiline', required: true },
    { name: 'milestoneId', label: t('ey.f.milestone'), kind: 'select', options: [{ value: '', label: t('ey.f.none') }, ...r.milestones.map((m) => ({ value: m.id, label: `${t(`ey.domain.${m.domain}` as MessageKey)}: ${m.title} (${m.ageBand})` }))] },
    { name: 'status', label: t('ey.f.status'), kind: 'select', options: [{ value: '', label: t('ey.f.none') }, ...EY_STATUSES.map((s) => ({ value: s, label: t(`ey.status.${s}` as MessageKey) }))] },
    { name: 'domain', label: t('ey.f.domain'), kind: 'select', options: [{ value: '', label: t('ey.f.none') }, ...EY_DOMAINS.map((d) => ({ value: d, label: t(`ey.domain.${d}` as MessageKey) }))] },
    { name: 'observedOn', label: t('ey.f.date'), kind: 'date' },
  ];

  return (
    <>
      <Bar>
        <UrlSelect label={t('ey.section')} param="sectionId" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.displayName }))} testId="ey-section" />
        {canSeed && milestoneCount === 0 && <ActionButton label={t('ey.seed')} run={seedFramework} onDone={toast} />}
      </Bar>
      {milestoneCount === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('ey.noFramework')}</Typography>}
      <Grid testId="ey-children" empty={t('ey.empty')} rows={kids} cols={cols} />

      {child && (
        <InfoDialog title={child.record.student.fullName} onClose={() => setChild(null)}>
          <Stack spacing={2} data-testid="ey-detail">
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setNoting(true)}>{t('ey.addNote')}</Button>
              {terms.length > 0 && (
                <>
                  <select aria-label={t('ey.term')} value={termId} onChange={(e) => setTermId(e.target.value)}>
                    {terms.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                  <Link href={`/api/download?kind=learning-story&id=${child.id}&termId=${termId}`} download>{t('ey.story')}</Link>
                </>
              )}
            </Stack>
            {EY_DOMAINS.map((d) => {
              const ms = child.record.milestones.filter((m) => m.domain === d);
              if (ms.length === 0) return null;
              return (
                <div key={d}>
                  <Typography variant="subtitle2">{t(`ey.domain.${d}` as MessageKey)}</Typography>
                  {ms.map((m) => (
                    <Stack key={m.id} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', py: 0.25 }}>
                      <Typography variant="body2" sx={{ flex: '1 1 240px' }}>{m.title} ({m.ageBand})</Typography>
                      {EY_STATUSES.map((s) => (
                        <Button key={s} size="small" disabled={pending} variant={m.status === s ? 'contained' : 'text'} onClick={() => mark(m.id, s)}>
                          {t(`ey.status.${s}` as MessageKey)}
                        </Button>
                      ))}
                    </Stack>
                  ))}
                </div>
              );
            })}
            <div>
              <Typography variant="subtitle2">{t('ey.observations')}</Typography>
              {child.record.observations.length === 0 && <Typography variant="body2" color="text.secondary">{t('ey.noObservations')}</Typography>}
              {child.record.observations.map((o) => (
                <Typography key={o.id} variant="body2" sx={{ py: 0.25 }}>
                  {fmt.date(o.observedOn)} <Pill label={t(`ey.domain.${o.domain}` as MessageKey)} /> {o.note} {o.status && <Pill label={t(`ey.status.${o.status}` as MessageKey)} />} {o.hasPhoto && <Pill label={t('ey.photo')} />}
                </Typography>
              ))}
            </div>
          </Stack>
        </InfoDialog>
      )}
      {noting && child && (
        <FormDialog
          title={t('ey.addNote')}
          fields={noteFields(child.record)}
          onSubmit={(v) => addObservation(child.id, v)}
          onClose={(m) => {
            setNoting(false);
            if (m) {
              toast(m);
              open(child.id);
            }
          }}
        />
      )}
      {toastNode}
    </>
  );
}
