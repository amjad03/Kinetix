'use client';

import { GraduationCap } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildEligible, candidateStep, convocationDetailStep, issueDegrees } from '@/app/(dashboard)/university/actions';
import { Button } from '@/components/kx';
import { ActionButton, Bar, FormDialog, Grid, useToast, type Field } from '@/components/ops/kit';
import { StatGrid, StatTile, StatusPill, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { candidateSteps, type CandidateStatus, type ConvocationDetail } from '@/lib/curriculum';
import type { ActionResult } from '@/lib/types';

type Dlg = { title: string; fields: Field[]; intro?: string; submit?: string; run: (v: Record<string, string>) => Promise<ActionResult<unknown>> };
const TONE: Record<CandidateStatus, Tone> = { eligible: 'neutral', registered: 'info', withheld: 'danger', degree_issued: 'success' };

/**
 * One convocation: its eligible graduates (built for the programme, a batch or a class), registration, withholding,
 * and issuing the degrees with serial numbers through the institution's degree certificate template.
 */
export function ConvocationDesk({ convocation: c, classes, canAdmin }: { convocation: ConvocationDetail; classes: { id: string; name: string }[]; canAdmin: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const count = (s: CandidateStatus) => c.candidates.filter((x) => x.status === s).length;
  const open = c.status !== 'held';

  return (
    <>
      <StatGrid>
        <StatTile label={t('un.d.eligible')} value={fmt.number(count('eligible'))} />
        <StatTile label={t('un.d.registered')} value={fmt.number(count('registered'))} />
        <StatTile label={t('un.d.withheld')} value={fmt.number(count('withheld'))} />
        <StatTile label={t('un.d.issued')} value={fmt.number(count('degree_issued'))} />
      </StatGrid>
      {canAdmin && open && (
        <div className="mt-6">
          <Bar>
            <Button
              variant="outlined"
              onClick={() =>
                setDlg({
                  title: t('un.c.generate'),
                  intro: t('un.d.eligibleIntro'),
                  fields: [
                    { name: 'batchYear', label: t('un.d.batchYear'), kind: 'number' },
                    { name: 'sectionId', label: t('un.d.class'), kind: 'select', options: [{ value: '', label: t('un.d.allClasses') }, ...classes.map((x) => ({ value: x.id, label: x.name }))] },
                  ],
                  run: (v) => buildEligible(c.id, v),
                })
              }
            >
              {t('un.c.generate')}
            </Button>
            <Button variant="outlined" onClick={() => setDlg({ title: c.status === 'registration_open' ? t('un.c.close') : t('un.c.open'), fields: [], run: () => convocationDetailStep(c.id, c.status === 'registration_open' ? 'close' : 'open') })}>
              {c.status === 'registration_open' ? t('un.c.close') : t('un.c.open')}
            </Button>
            <Button
              variant="contained"
              onClick={() =>
                setDlg({
                  title: t('un.c.issue'),
                  intro: t('un.d.issueIntro'),
                  submit: t('un.c.issue'),
                  fields: [{ name: 'who', label: t('un.d.issueTo'), kind: 'select', init: 'registered', options: [{ value: 'registered', label: t('un.d.toRegistered') }, { value: 'absentia', label: t('un.d.inAbsentia') }] }],
                  run: (v) => issueDegrees(c.id, v.who === 'absentia'),
                })
              }
            >
              {t('un.c.issue')}
            </Button>
          </Bar>
        </div>
      )}
      <div className="mt-6">
        <Grid
          testId="un-candidates"
          empty={t('un.d.empty')}
          emptyIcon={<GraduationCap />}
          exportName={`convocation-${c.graduationYear}`}
          rows={c.candidates}
          cols={[
            { label: t('un.d.graduate'), cell: (x) => <NextLink className="font-medium hover:underline" href={`/students/${x.studentId}`}>{x.name}</NextLink>, sort: (x) => x.name },
            { label: t('un.d.classRoll'), cell: (x) => `${x.className} · ${x.rollNo}`, sort: (x) => `${x.className} ${x.rollNo}` },
            { label: t('un.d.degree'), cell: (x) => x.degreeTitle, wrap: true },
            { label: t('un.d.cgpa'), cell: (x) => (x.cgpa === null ? '—' : x.cgpa.toFixed(2)), num: true, sort: (x) => x.cgpa ?? 0 },
            { label: t('un.c.status'), cell: (x) => <StatusPill tone={TONE[x.status]}>{t(`un.cand.${x.status}` as MessageKey)}</StatusPill>, sort: (x) => x.status },
            { label: t('un.d.certNo'), cell: (x) => x.certificateNo ?? '—', sort: (x) => x.certificateNo ?? '' },
            {
              label: '',
              cell: (x) => (
                <div className="flex flex-row justify-end gap-1">
                  {candidateSteps(x.status, c.status).map((s) =>
                    s === 'download' ? (
                      <Button key={s} size="small" variant="text" href={`/api/download?kind=degree&id=${c.id}&candidate=${x.id}`} target="_blank" rel="noopener">
                        {t('un.d.download')}
                      </Button>
                    ) : canAdmin ? (
                      <ActionButton
                        key={s}
                        label={t(s === 'register' ? 'un.d.register' : 'un.d.withhold')}
                        tone={s === 'withhold' ? 'error' : undefined}
                        run={() => candidateStep(c.id, x, s)}
                        onDone={(m) => {
                          toast(m);
                          router.refresh();
                        }}
                      />
                    ) : null,
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
      {dlg && (
        <FormDialog
          title={dlg.title}
          fields={dlg.fields}
          intro={dlg.intro}
          submitLabel={dlg.submit}
          onSubmit={dlg.run}
          onClose={(m) => {
            setDlg(null);
            if (m) {
              toast(t('ops.saved'));
              router.refresh();
            }
          }}
        />
      )}
      {toastNode}
    </>
  );
}
