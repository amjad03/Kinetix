'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addRegistration, addRound, autoSlots, makeOffer, moveDrive, recheckRegistration, saveResults, updateSlot } from '@/app/(dashboard)/placements/actions';
import { useDialog, useRun } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { Card, DataTable, Dialog, SelectInput, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';
import { driveMoves, inRound, offerable, type DriveDetail, type DriveOffer, type EligibleList, type Registration, type Round, type Slot } from '@/lib/placements-depth';

type Result = 'pass' | 'fail' | 'absent';
const ROUND_KINDS = ['aptitude', 'technical', 'gd', 'interview', 'hr'] as const;

/**
 * One drive: its criteria and window; who is eligible (and why not); registrations with each round's result; rounds
 * with their results and interview slots; offers to those through the final round; the shortlist for the recruiter.
 */
export function DriveView({ d, company, regs, eligible, slots, offers, canEdit }: { d: DriveDetail; company: string; regs: Registration[]; eligible: EligibleList; slots: Slot[]; offers: DriveOffer[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const run = useRun();
  const [results, setResults] = useState<Round | null>(null);
  const live = !['completed', 'cancelled'].includes(d.status);
  const candidates = offerable(regs, d.rounds, offers);
  const reason = (r: string) => t(`pd.reason.${r as 'cgpa_below'}`);
  const regStatus = (s: string) => t(`pd.reg.${s as 'registered'}`);

  type E = EligibleList['students'][number];
  const eligibleCols: Column<E>[] = [
    { id: 'student', header: t('ops.f.student'), rowHeader: true, sort: (s) => s.rollNo, cell: (s) => <>{s.fullName}<span className="block text-xs text-muted-foreground">{`${s.rollNo} · ${s.className}`}</span></> },
    { id: 'cgpa', header: t('pl.col.cgpa'), align: 'right', sort: (s) => s.cgpa ?? 0, cell: (s) => (s.cgpa === null ? '—' : fmt.number(s.cgpa, { maximumFractionDigits: 2 })) },
    { id: 'backlogs', header: t('pd.backlogs'), align: 'right', sort: (s) => s.backlogs, cell: (s) => s.backlogs },
    { id: 'batch', header: t('pd.batch'), hideBelow: 'md', cell: (s) => s.batchYear ?? '—' },
    { id: 'eligible', header: t('pd.eligible'), sort: (s) => (s.eligible ? 1 : 0), cell: (s) => (s.eligible ? <StatusPill tone="success">{t('ops.yes')}</StatusPill> : <span className="text-xs text-muted-foreground">{s.reasons.map(reason).join(', ')}</span>) },
    { id: 'registration', header: t('pl.col.registered'), cell: (s) => (s.registration ? <StatusPill tone={statusTone(s.registration.status)}>{regStatus(s.registration.status)}</StatusPill> : '—') },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (s) =>
        canEdit && s.eligible && (!s.registration || s.registration.status === 'withdrawn') && ['open', 'closed'].includes(d.status) ? (
          <Button size="sm" variant="outline" onClick={() => open({ title: t('pd.dr.register', { name: s.fullName }), intro: t('pd.dr.registerHelp'), fields: [{ name: 'reason', label: t('ho.reason'), required: true }], done: t('pd.dr.registered'), run: (v) => addRegistration(d.id, { ...v, studentId: s.studentId }) })}>
            {t('pd.dr.registerShort')}
          </Button>
        ) : null,
    },
  ];
  const regCols: Column<Registration>[] = [
    { id: 'student', header: t('ops.f.student'), rowHeader: true, sort: (r) => r.rollNo, cell: (r) => <>{r.fullName}<span className="block text-xs text-muted-foreground">{r.rollNo}</span></> },
    { id: 'cgpa', header: t('pl.col.cgpa'), align: 'right', cell: (r) => fmt.number(r.cgpaAt, { maximumFractionDigits: 2 }) },
    { id: 'backlogs', header: t('pd.backlogs'), align: 'right', cell: (r) => r.backlogsAt },
    ...d.rounds.map((round): Column<Registration> => ({ id: round.id, header: round.name, hideBelow: 'md', cell: (r) => { const x = r.rounds.find((y) => y.roundId === round.id); return x ? <StatusPill tone={x.result === 'pass' ? 'success' : 'danger'}>{t(`pd.result.${x.result}`)}</StatusPill> : '—'; } })),
    { id: 'status', header: t('ops.f.status'), cell: (r) => <StatusPill tone={statusTone(r.status)}>{regStatus(r.status)}</StatusPill> },
    { id: 'act', header: '', csv: false, align: 'right', cell: (r) => (canEdit && live && r.status !== 'withdrawn' ? <Button size="sm" variant="ghost" onClick={() => void run(() => recheckRegistration(d.id, r.id), t('pd.dr.rechecked'))}>{t('pd.dr.recheck')}</Button> : null) },
  ];
  const slotCols: Column<Slot>[] = [
    { id: 'when', header: t('pd.dr.when'), rowHeader: true, sort: (s) => s.startsAt, cell: (s) => fmt.dateTime(s.startsAt) },
    { id: 'round', header: t('pd.dr.round'), cell: (s) => s.round },
    { id: 'student', header: t('ops.f.student'), cell: (s) => `${s.rollNo} · ${s.fullName}` },
    { id: 'venue', header: t('pd.dr.venue'), cell: (s) => s.room ?? s.venue },
    { id: 'panel', header: t('pd.dr.panel'), hideBelow: 'md', cell: (s) => s.panel || '—' },
    { id: 'status', header: t('ops.f.status'), cell: (s) => <StatusPill tone={s.status === 'done' ? 'success' : s.status === 'scheduled' ? 'info' : 'neutral'}>{t(`pd.slot.${s.status}`)}</StatusPill> },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (s) =>
        canEdit && live ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              open({
                title: t('pd.dr.moveSlot'),
                fields: [
                  { name: 'startsAt', label: t('pd.dr.when'), kind: 'datetime' },
                  { name: 'venue', label: t('pd.dr.venue'), init: s.venue },
                  { name: 'panel', label: t('pd.dr.panel'), init: s.panel },
                  { name: 'status', label: t('ops.f.status'), kind: 'select', init: s.status, options: (['scheduled', 'done', 'no_show', 'cancelled'] as const).map((x) => ({ value: x, label: t(`pd.slot.${x}`) })) },
                ],
                run: (v) => updateSlot(d.id, s.id, v),
              })
            }
          >
            {t('ops.edit')}
          </Button>
        ) : null,
    },
  ];
  const offerCols: Column<DriveOffer>[] = [
    { id: 'student', header: t('ops.f.student'), rowHeader: true, cell: (o) => `${o.rollNo} · ${o.fullName}` },
    { id: 'role', header: t('pl.col.role'), cell: (o) => o.roleTitle },
    { id: 'ctc', header: t('pd.ctcLpa'), align: 'right', cell: (o) => (o.ctcLpa === null ? '—' : fmt.number(o.ctcLpa, { maximumFractionDigits: 2 })) },
    { id: 'respondBy', header: t('pd.respondBy'), hideBelow: 'md', cell: (o) => (o.respondBy ? fmt.date(o.respondBy, 'short') : '—') },
    { id: 'condition', header: t('pd.conditional'), hideBelow: 'md', cell: (o) => o.conditionNote ?? '—' },
    { id: 'status', header: t('ops.f.status'), cell: (o) => <StatusPill tone={statusTone(o.status)}>{statusLabel(t, o.status)}</StatusPill> },
  ];
  const roundCols: Column<Round>[] = [
    { id: 'seq', header: '#', rowHeader: true, cell: (r) => r.seq },
    { id: 'name', header: t('ops.f.name'), cell: (r) => r.name },
    { id: 'kind', header: t('pd.kind'), cell: (r) => t(`pd.round.${r.kind as 'interview'}`) },
    { id: 'on', header: t('ivd.date'), cell: (r) => (r.scheduledOn ? fmt.date(r.scheduledOn, 'short') : '—') },
    { id: 'results', header: t('pd.dr.recorded'), align: 'right', cell: (r) => `${regs.filter((x) => x.rounds.some((y) => y.roundId === r.id)).length} / ${inRound(regs, d.rounds, r).length}` },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (r) =>
        canEdit && live ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setResults(r)} disabled={!inRound(regs, d.rounds, r).length}>
              {t('pd.dr.results')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                open({
                  title: t('pd.dr.slots', { round: r.name }),
                  intro: t('pd.dr.slotsHelp'),
                  fields: [
                    { name: 'startsAt', label: t('pd.dr.firstSlot'), kind: 'datetime', required: true },
                    { name: 'minutes', label: t('pd.dr.minutes'), kind: 'number', required: true, init: '20' },
                    { name: 'gapMinutes', label: t('pd.dr.gap'), kind: 'number', init: '0' },
                    { name: 'venues', label: t('pd.dr.venues'), required: true, init: d.venue },
                    { name: 'panel', label: t('pd.dr.panel') },
                  ],
                  done: t('pd.dr.slotted'),
                  run: (v) => autoSlots(d.id, r.id, v),
                })
              }
            >
              {t('pd.dr.schedule')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <RecordPage
        title={d.title}
        subtitle={`${company} · ${d.roleTitle}`}
        status={{ label: statusLabel(t, d.status), tone: statusTone(d.status) }}
        facts={[
          { label: t('pd.category'), value: t(`pd.cat.${d.category}`) },
          { label: d.kind === 'internship' ? t('pd.stipend') : t('pd.ctcLpa'), value: d.kind === 'internship' ? (d.stipendMonthly ? fmt.rupees(d.stipendMonthly * 100) : '—') : d.ctcLpa === null ? '—' : `${fmt.number(d.ctcLpa, { maximumFractionDigits: 2 })} ${t('pl.lakhs')}` },
          { label: t('pl.col.date'), value: d.driveDate ? fmt.date(d.driveDate, 'short') : '—' },
          { label: t('pd.window'), value: `${d.registrationOpensOn ? fmt.date(d.registrationOpensOn, 'short') : '…'} – ${d.registrationClosesOn ? fmt.date(d.registrationClosesOn, 'short') : '…'}` },
          { label: t('pd.criteria'), value: t('pd.criteriaValue', { cgpa: d.minCgpa, backlogs: d.maxBacklogs }) },
          { label: t('pd.eligible'), value: `${fmt.number(eligible.summary.eligible)} / ${fmt.number(eligible.summary.total)}` },
        ]}
        primary={
          canEdit && driveMoves(d.status).length ? (
            <>
              {driveMoves(d.status).map((s, i) => (
                <Button key={s} variant={i === 0 && s !== 'cancelled' ? 'default' : 'outline'} className={s === 'cancelled' ? 'text-destructive' : undefined} onClick={() => void run(() => moveDrive(d.id, s), t('ops.saved'))} data-testid={`drive-${s}`}>
                  {t(`pd.move.${s as 'open'}`)}
                </Button>
              ))}
            </>
          ) : undefined
        }
        secondary={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/download?kind=placement-shortlist&id=${d.id}`}>
                <Download /> {t('pd.dr.shortlist')}
              </a>
            </Button>
            {canEdit && live && (
              <Button variant="outline" onClick={() => open({ title: t('pd.dr.addRound'), fields: [{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'kind', label: t('pd.kind'), kind: 'select', init: 'interview', options: ROUND_KINDS.map((k) => ({ value: k, label: t(`pd.round.${k}`) })) }, { name: 'scheduledOn', label: t('ivd.date'), kind: 'date' }], run: (v) => addRound(d.id, v) })}>
                {t('pd.dr.addRound')}
              </Button>
            )}
            {canEdit && candidates.length > 0 && (
              <Button
                variant="outline"
                data-testid="drive-offer"
                onClick={() =>
                  open({
                    title: t('pd.dr.offer'),
                    intro: t('pd.dr.offerHelp'),
                    fields: [
                      { name: 'registrationId', label: t('ops.f.student'), kind: 'select', required: true, options: candidates.map((r) => ({ value: r.id, label: `${r.rollNo} · ${r.fullName}` })) },
                      { name: 'roleTitle', label: t('pl.col.role'), init: d.roleTitle },
                      { name: 'ctcLpa', label: t('pd.ctcLpa'), init: d.ctcLpa === null ? '' : String(d.ctcLpa) },
                      { name: 'respondBy', label: t('pd.respondBy'), kind: 'date' },
                    ],
                    done: t('pd.dr.offered'),
                    run: (v) => makeOffer(d.id, v.registrationId, v),
                  })
                }
              >
                {t('pd.dr.offer')}
              </Button>
            )}
          </>
        }
        overview={
          <div className="grid gap-6">
            <Card title={t('pd.dr.about')}>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label={t('pd.dr.venue')} value={d.venue || '—'} />
                <Fact label={t('pd.location')} value={d.location || '—'} />
                <Fact label={t('pd.batch')} value={d.batchYears.join(', ') || t('pd.anyBatch')} />
                <Fact label={t('pd.skills')} value={d.skills || '—'} />
                <Fact label={t('pd.bond')} value={d.bond || '—'} />
              </dl>
              {d.description && <p className="mt-4 whitespace-pre-wrap text-sm">{d.description}</p>}
            </Card>
            <Card title={t('pd.dr.rounds')}>
              <DataTable label={t('pd.dr.rounds')} columns={roundCols} rows={d.rounds} rowId={(r) => r.id} empty={t('pd.dr.noRounds')} />
            </Card>
          </div>
        }
        related={[
          { value: 'eligible', label: t('pd.eligible'), count: eligible.summary.eligible, content: <DataTable label={t('pd.eligible')} columns={eligibleCols} rows={eligible.students} rowId={(s) => s.studentId} empty={t('pd.dr.noStudents')} exportName="eligible" pageSize={25} /> },
          { value: 'registrations', label: t('pd.dr.registrations'), count: regs.length, content: <DataTable label={t('pd.dr.registrations')} columns={regCols} rows={regs} rowId={(r) => r.id} empty={t('pd.dr.noRegistrations')} exportName="registrations" pageSize={25} /> },
          { value: 'slots', label: t('pd.dr.slotsTab'), count: slots.length, content: <DataTable label={t('pd.dr.slotsTab')} columns={slotCols} rows={slots} rowId={(s) => s.id} empty={t('pd.dr.noSlots')} exportName="interview-slots" /> },
          { value: 'offers', label: t('pd.offers'), count: offers.length, content: <DataTable label={t('pd.offers')} columns={offerCols} rows={offers} rowId={(o) => o.id} empty={t('pd.dr.noOffers')} /> },
        ]}
      />
      {dialog}
      {results && (
        <ResultsDialog
          round={results}
          regs={inRound(regs, d.rounds, results)}
          onClose={() => setResults(null)}
          onSave={async (rows) => {
            const r = await saveResults(d.id, results.id, rows);
            if (!r.ok) return r.error;
            toast.success(r.data.debarred ? t('pd.dr.savedDebarred', { n: r.data.debarred }) : t('ops.saved'));
            setResults(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Pass, fail or absent for everyone sitting a round; blank leaves a student unrecorded. */
function ResultsDialog({ round, regs, onClose, onSave }: { round: Round; regs: Registration[]; onClose: () => void; onSave: (rows: { registrationId: string; result: Result; note: string }[]) => Promise<string | void> }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Record<string, { result: string; note: string }>>(() => Object.fromEntries(regs.map((r) => { const x = r.rounds.find((y) => y.roundId === round.id); return [r.id, { result: x?.result ?? '', note: x?.note ?? '' }]; })));
  const all = (result: Result) => setV(Object.fromEntries(regs.map((r) => [r.id, { ...v[r.id], result }])));
  const save = () =>
    start(async () => {
      const rows = regs.filter((r) => v[r.id]?.result).map((r) => ({ registrationId: r.id, result: v[r.id].result as Result, note: v[r.id].note }));
      if (!rows.length) return setError(t('pd.dr.nothing'));
      const e = await onSave(rows);
      if (e) setError(e);
    });
  const options = (['pass', 'fail', 'absent'] as const).map((x) => ({ value: x, label: t(`pd.result.${x}`) }));
  return (
    <Dialog
      title={t('pd.dr.resultsOf', { round: round.name })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t('ops.cancel')}</Button>
          <Button onClick={save} disabled={pending} data-testid="results-save">{t('ops.save')}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{t('pd.dr.resultsHelp')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => all('pass')}>{t('pd.dr.allPass')}</Button>
      </div>
      <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
        {regs.map((r) => (
          <div key={r.id} className="flex flex-wrap items-end gap-2">
            <span className="min-w-[160px] flex-1 text-sm">{`${r.rollNo} · ${r.fullName}`}</span>
            <SelectInput className="w-32" label={t('pd.dr.result')} value={v[r.id]?.result ?? ''} onChange={(e) => setV({ ...v, [r.id]: { ...v[r.id], result: e.target.value } })} options={options} empty="" />
            <TextInput className="w-40" label={t('ops.f.note')} value={v[r.id]?.note ?? ''} onChange={(e) => setV({ ...v, [r.id]: { ...v[r.id], note: e.target.value } })} />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}
