'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { giveFeedback, loadShortlist, postJob, registerCompany, signIn, signOut, uploadResults } from '@/app/recruiters/[slug]/actions';
import type { Shortlist } from '@/lib/placements-depth';
import { FormDialog, type Field } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, SelectInput, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';

export interface PortalHome {
  company: { id: string; name: string; sector: string; city: string };
  drives: { id: string; title: string; kind: string; roleTitle: string; status: string; driveDate: string | null; ctcLpa: number | null; registrations: number; selected: number }[];
}

/** The results format the API reads (roll number, then pass, fail or absent): shown as typed, in every language. */
const LINES_EXAMPLE = '25BCA001, pass\n25BCA002, fail\n25BCA003, absent';

type Open ={ kind: 'register' } | { kind: 'signin' } | { kind: 'job' } | { kind: 'feedback' } | null;

/** Before signing in: register the company, or sign in with the portal key the placement cell sent. */
export function RecruiterWelcome({ slug, expired }: { slug: string; expired: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<string | null>(null);
  const register: Field[] = [
    { name: 'name', label: t('pd.rc.company'), required: true },
    { name: 'sector', label: t('pd.sector') },
    { name: 'city', label: t('pd.city') },
    { name: 'website', label: t('pd.co.website') },
    { name: 'contactName', label: t('pd.rc.contactName'), required: true },
    { name: 'designation', label: t('pd.co.designation') },
    { name: 'contactEmail', label: t('inv.email'), required: true },
    { name: 'contactPhone', label: t('ops.f.phone') },
    { name: 'description', label: t('pd.co.about'), kind: 'multiline' },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {expired && <p className="text-sm text-destructive sm:col-span-2">{t('pd.rc.expired')}</p>}
      {message && <p className="text-sm sm:col-span-2" role="status">{message}</p>}
      <Card title={t('pd.rc.signInTitle')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('pd.rc.signInHelp')}</p>
        <Button onClick={() => setOpen({ kind: 'signin' })} data-testid="recruiter-signin">{t('pd.rc.signIn')}</Button>
      </Card>
      <Card title={t('pd.rc.registerTitle')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('pd.rc.registerHelp')}</p>
        <Button variant="outline" onClick={() => setOpen({ kind: 'register' })} data-testid="recruiter-register">{t('pd.rc.register')}</Button>
      </Card>
      {open?.kind === 'signin' && (
        <FormDialog
          title={t('pd.rc.signIn')}
          fields={[{ name: 'key', label: t('pd.portalKey'), required: true }]}
          onSubmit={(v) => signIn(slug, v)}
          onClose={(done) => {
            setOpen(null);
            if (done) router.refresh();
          }}
        />
      )}
      {open?.kind === 'register' && (
        <FormDialog
          title={t('pd.rc.register')}
          fields={register}
          onSubmit={(v) => registerCompany(slug, v)}
          onClose={(done) => {
            setOpen(null);
            if (done) setMessage(t('pd.rc.registered'));
          }}
        />
      )}
    </div>
  );
}

/** Signed in: the company's drives with shortlists and results, posting a job description, and feedback. */
export function RecruiterHome({ slug, home }: { slug: string; home: PortalHome }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [list, setList] = useState<Shortlist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = (driveId: string) =>
    start(async () => {
      const r = await loadShortlist(slug, driveId);
      if (!r.ok) return setError(r.error);
      setError(null);
      setList(r.data);
    });
  type Drive = PortalHome['drives'][number];
  const cols: Column<Drive>[] = [
    { id: 'title', header: t('pl.col.drive'), rowHeader: true, cell: (d) => <>{d.title}<span className="block text-xs text-muted-foreground">{d.roleTitle}</span></> },
    { id: 'date', header: t('pl.col.date'), hideBelow: 'sm', cell: (d) => (d.driveDate ? fmt.date(d.driveDate, 'short') : '—') },
    { id: 'regs', header: t('pl.col.registered'), align: 'right', cell: (d) => d.registrations },
    { id: 'selected', header: t('pd.offers'), align: 'right', hideBelow: 'sm', cell: (d) => d.selected },
    { id: 'status', header: t('ops.f.status'), cell: (d) => <StatusPill tone={statusTone(d.status)}>{statusLabel(t, d.status)}</StatusPill> },
    { id: 'act', header: '', csv: false, align: 'right', cell: (d) => (d.status !== 'draft' ? <Button size="sm" variant="outline" disabled={pending} onClick={() => show(d.id)}>{t('pd.rc.shortlist')}</Button> : <span className="text-xs text-muted-foreground">{t('pd.rc.inReview')}</span>) },
  ];
  const scores = ['5', '4', '3', '2', '1'].map((n) => ({ value: n, label: n }));
  const year = new Date().getFullYear();
  return (
    <div className="grid gap-6">
      <Card
        title={home.company.name}
        action={
          <Button variant="ghost" onClick={() => void signOut(slug).then(() => router.refresh())}>
            {t('pd.rc.signOut')}
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">{[home.company.sector, home.company.city].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen({ kind: 'job' })} data-testid="recruiter-post">{t('pd.rc.postJob')}</Button>
          <Button variant="outline" onClick={() => setOpen({ kind: 'feedback' })}>{t('pd.rc.feedback')}</Button>
        </div>
        {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
      </Card>
      <Card title={t('pd.drives')}>
        <DataTable label={t('pd.drives')} columns={cols} rows={home.drives} rowId={(d) => d.id} empty={t('pd.rc.noDrives')} />
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </Card>
      {list && <ShortlistDialog slug={slug} list={list} onClose={() => setList(null)} onSaved={() => { setList(null); router.refresh(); }} />}
      {open?.kind === 'job' && (
        <FormDialog
          title={t('pd.rc.postJob')}
          intro={t('pd.rc.postHelp')}
          fields={[
            { name: 'title', label: t('pl.col.drive'), required: true },
            { name: 'kind', label: t('pd.kind'), kind: 'select', init: 'placement', options: [{ value: 'placement', label: t('pd.rc.kindPlacement') }, { value: 'internship', label: t('pd.rc.kindInternship') }] },
            { name: 'roleTitle', label: t('pl.col.role'), required: true },
            { name: 'ctcLpa', label: t('pd.ctcLpa') },
            { name: 'stipend', label: t('pd.stipend'), kind: 'rupees' },
            { name: 'location', label: t('pd.location') },
            { name: 'driveDate', label: t('pl.col.date'), kind: 'date' },
            { name: 'minCgpa', label: t('pl.col.cgpa') },
            { name: 'maxBacklogs', label: t('pd.backlogs'), kind: 'number' },
            { name: 'skills', label: t('pd.skills') },
            { name: 'bond', label: t('pd.bond') },
            { name: 'description', label: t('pd.rc.jd'), kind: 'multiline', required: true },
          ]}
          onSubmit={(v) => postJob(slug, v)}
          onClose={(done) => {
            setOpen(null);
            if (done) {
              setNotice(t('pd.rc.posted'));
              router.refresh();
            }
          }}
        />
      )}
      {open?.kind === 'feedback' && (
        <FormDialog
          title={t('pd.rc.feedback')}
          intro={t('pd.rc.feedbackHelp')}
          fields={[
            { name: 'respondentName', label: t('pd.rc.yourName'), required: true },
            { name: 'respondentEmail', label: t('inv.email') },
            { name: 'year', label: t('pd.year'), kind: 'number', required: true, init: String(year) },
            ...([1, 2, 3, 4, 5] as const).map((i): Field => ({ name: `r${i}`, label: t(`pd.rc.c${i}`), kind: 'select', required: true, options: scores })),
            { name: 'overall', label: t('pd.overall'), kind: 'select', required: true, options: scores },
            { name: 'comments', label: t('pd.rc.comments'), kind: 'multiline' },
          ]}
          onSubmit={(v) => giveFeedback(slug, v)}
          onClose={(done) => {
            setOpen(null);
            if (done) setNotice(t('pd.rc.thanks'));
          }}
        />
      )}
    </div>
  );
}

/** A drive's shortlist, and a round's results uploaded by roll number. */
function ShortlistDialog({ slug, list, onClose, onSaved }: { slug: string; list: Shortlist; onClose: () => void; onSaved: () => void }) {
  const { t, fmt } = useI18n();
  const [roundId, setRoundId] = useState(list.rounds[0]?.id ?? '');
  const [lines, setLines] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  type R = Shortlist['rows'][number];
  const cols: Column<R>[] = [
    { id: 'roll', header: t('pd.rollNo'), rowHeader: true, cell: (r) => r.rollNo },
    { id: 'name', header: t('ops.f.student'), cell: (r) => r.fullName },
    { id: 'program', header: t('pd.programme'), hideBelow: 'md', cell: (r) => r.program },
    { id: 'cgpa', header: t('pl.col.cgpa'), align: 'right', cell: (r) => fmt.number(Number(r.cgpaAt), { maximumFractionDigits: 2 }) },
    { id: 'backlogs', header: t('pd.backlogs'), align: 'right', hideBelow: 'sm', cell: (r) => r.backlogsAt },
    ...list.rounds.map((x): Column<R> => ({ id: x.id, header: x.name, hideBelow: 'md', cell: (r) => (r.rounds[x.name] ? t(`pd.result.${r.rounds[x.name] as 'pass'}`) : '—') })),
  ];
  const save = () =>
    start(async () => {
      const r = await uploadResults(slug, list.drive.id, roundId, lines);
      if (!r.ok) return setError(r.error);
      onSaved();
    });
  return (
    <Dialog
      title={list.drive.title}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t('ops.close')}</Button>
          {list.rounds.length > 0 && <Button onClick={save} disabled={pending || !roundId || !lines.trim()} data-testid="recruiter-results">{t('pd.rc.upload')}</Button>}
        </>
      }
    >
      <DataTable label={t('pd.rc.shortlist')} columns={cols} rows={list.rows} rowId={(r) => r.rollNo} empty={t('pd.dr.noRegistrations')} exportName="shortlist" />
      {list.rounds.length > 0 && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm text-muted-foreground">{t('pd.rc.resultsHelp')}</p>
          <SelectInput className="max-w-[260px]" label={t('pd.dr.round')} value={roundId} onChange={(e) => setRoundId(e.target.value)} options={list.rounds.map((r) => ({ value: r.id, label: r.name }))} />
          <TextInput label={t('pd.rc.lines')} multiline minRows={4} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={LINES_EXAMPLE} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
