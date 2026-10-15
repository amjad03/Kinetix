'use client';

import { BarChart3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { applyCurve, clearCurve, previewCurve, saveCurveSettings } from '@/app/(dashboard)/exams/relative-grading/actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, StatGrid, StatTile, StatusPill, SwitchField, TextInput, useToastOptional, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { CurvePreview, CurveSession, RelativeSettings } from '@/lib/relative-grading';

/** The switch: relative grading on or off for the institution, and the smallest class it applies to. */
export function CurveSettingsCard({ settings, canEdit }: { settings: RelativeSettings; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [enabled, setEnabled] = useState(settings.stored?.enabled ?? settings.enabled);
  const [min, setMin] = useState(String(settings.stored?.minClassSize ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      const n = min.trim() === '' ? null : Number(min);
      if (n !== null && (!Number.isInteger(n) || n < 2)) return setError(t('rg.minBad'));
      const res = await saveCurveSettings(enabled, n);
      if (!res.ok) return setError(res.error);
      toast?.success(t('rg.saved'));
      router.refresh();
    });
  return (
    <Card title={t('rg.settingsTitle')} subtitle={settings.profile ? t('rg.profile', { profile: settings.profile }) : t('rg.ownRules')} testId="rg-settings">
      {!settings.allowed ? (
        <p className="m-0 text-sm text-muted-foreground" data-testid="rg-not-allowed">
          {t('rg.notAllowed')}
        </p>
      ) : (
        <div className="grid gap-3">
          <SwitchField label={t('rg.enabled')} checked={enabled} onChange={setEnabled} disabled={!canEdit || pending} />
          <div className="max-w-[16rem]">
            <TextInput label={t('rg.minClass')} type="number" value={min} onChange={(e) => setMin(e.target.value)} disabled={!canEdit || pending} helper={t('rg.minClassHelp', { n: String(settings.regulationMinClassSize) })} fullWidth />
          </div>
          <p className="m-0 text-[13px] text-muted-foreground">{t('rg.howItWorks', { shift: String(settings.maxShift) })}</p>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          {canEdit && (
            <div>
              <Button onClick={save} disabled={pending} data-testid="rg-save">
                {t('rg.save')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type SubjectRow = CurveSession['subjects'][number];

/** A session's subjects: which are graded on a curve, with Preview (and Apply or Clear for the exam office). */
export function CurveSubjects({ data, canApply }: { data: CurveSession; canApply: boolean }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<SubjectRow | null>(null);
  const columns: Column<SubjectRow>[] = [
    { id: 'code', header: t('rg.col.code'), cell: (r) => r.code, sort: (r) => r.code, hideBelow: 'sm' },
    {
      id: 'name',
      header: t('rg.col.subject'),
      rowHeader: true,
      cell: (r) => (
        <span className="font-medium">
          {r.name}
          <span className="block text-xs font-normal text-muted-foreground sm:hidden">
            {r.code} · {r.applied ? t('rg.onCurve') : t('rg.absolute')}
          </span>
        </span>
      ),
      sort: (r) => r.name,
      csv: (r) => r.name,
    },
    {
      id: 'state',
      header: t('rg.col.grading'),
      hideBelow: 'sm',
      cell: (r) => (r.applied ? <StatusPill tone="info">{t('rg.onCurve')}</StatusPill> : <StatusPill tone="neutral">{t('rg.absolute')}</StatusPill>),
      sort: (r) => (r.applied ? 1 : 0),
      csv: (r) => (r.applied ? 'curve' : 'absolute'),
    },
    {
      id: 'stats',
      header: t('rg.col.stats'),
      hideBelow: 'md',
      cell: (r) => (r.applied ? t('rg.statsLine', { mean: fmt.number(r.applied.mean), sd: fmt.number(r.applied.sd), n: String(r.applied.candidates), shift: String(r.applied.shift) }) : '-'),
      csv: (r) => (r.applied ? `${r.applied.mean} ${r.applied.sd} ${r.applied.candidates}` : ''),
    },
    { id: 'act', header: t('rg.col.actions'), align: 'right', csv: false, cell: (r) => <Button variant="outline" className="h-9" onClick={() => setOpen(r)} data-testid={`rg-open-${r.code}`}>{t('rg.preview')}</Button> },
  ];
  return (
    <>
      <DataTable rows={data.subjects} columns={columns} rowId={(r) => r.id} label={t('rg.subjects')} exportName="relative-grading" empty={<EmptyState icon={<BarChart3 />} title={t('rg.noSubjects')} description={t('rg.noSubjectsSub')} />} />
      {open && <CurveDialog sessionId={data.session.id} subject={open} enabled={data.settings.enabled} maxShift={data.settings.maxShift} canApply={canApply && data.session.status !== 'published' && data.session.status !== 'locked'} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Mean, SD, the cut-offs with a moderation shift and both distributions; Apply or Clear. */
function CurveDialog({ sessionId, subject, enabled, maxShift, canApply, onClose }: { sessionId: string; subject: SubjectRow; enabled: boolean; maxShift: number; canApply: boolean; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [shift, setShift] = useState(String(subject.applied?.shift ?? 0));
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<CurvePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shiftNum = () => {
    const n = Number(shift);
    return Number.isFinite(n) && Math.abs(n) <= maxShift ? n : null;
  };
  const run = (kind: 'preview' | 'apply' | 'clear') =>
    start(async () => {
      setError(null);
      const s = shiftNum();
      if (kind !== 'clear' && s === null) return setError(t('rg.shiftBad', { max: String(maxShift) }));
      if (kind === 'preview') {
        const res = await previewCurve(sessionId, subject.id, s!);
        return res.ok ? setPreview(res.data) : setError(res.error);
      }
      const res = kind === 'apply' ? await applyCurve(sessionId, subject.id, s!, note.trim()) : await clearCurve(sessionId, subject.id);
      if (!res.ok) return setError(res.error);
      toast?.success(t(kind === 'apply' ? 'rg.applied' : 'rg.cleared', { n: String(res.data.regraded ?? 0) }));
      onClose();
      router.refresh();
    });
  const max = preview ? Math.max(1, ...preview.absolute.map((x) => x.count), ...preview.relative.map((x) => x.count)) : 1;
  const grades = preview ? [...new Set([...preview.relative.map((x) => x.grade), ...preview.absolute.map((x) => x.grade)])] : [];
  const count = (list: { grade: string; count: number }[], g: string) => list.find((x) => x.grade === g)?.count ?? 0;
  return (
    <Dialog
      title={t('rg.dialogTitle', { subject: `${subject.code} ${subject.name}` })}
      size="lg"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('rg.close')}
          </Button>
          {canApply && subject.applied && (
            <Button variant="outline" onClick={() => run('clear')} disabled={pending} data-testid="rg-clear">
              {t('rg.clear')}
            </Button>
          )}
          {canApply && enabled && preview && !preview.tooSmall && (
            <Button onClick={() => run('apply')} disabled={pending} data-testid="rg-apply">
              {t('rg.apply')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <TextInput label={t('rg.shift')} type="number" value={shift} onChange={(e) => setShift(e.target.value)} helper={t('rg.shiftHelp', { max: String(maxShift) })} fullWidth />
          </div>
          <Button variant="outline" onClick={() => run('preview')} disabled={pending} data-testid="rg-preview">
            {t('rg.preview')}
          </Button>
        </div>
        {!enabled && <p className="m-0 text-sm text-muted-foreground">{t('rg.offNote')}</p>}
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        {preview && (
          <>
            <StatGrid min={120}>
              <StatTile label={t('rg.candidates')} value={preview.stats.candidates} tone={preview.tooSmall ? 'warning' : 'default'} testId="rg-candidates" />
              <StatTile label={t('rg.mean')} value={fmt.number(preview.stats.mean)} testId="rg-mean" />
              <StatTile label={t('rg.sd')} value={fmt.number(preview.stats.sd)} testId="rg-sd" />
              <StatTile label={t('rg.passMark')} value={`${fmt.number(preview.passPercent)}%`} />
            </StatGrid>
            {preview.tooSmall && <p className="m-0 text-sm text-red-ink">{t('rg.tooSmall', { n: String(preview.settings.minClassSize) })}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <table className="w-full text-sm" data-testid="rg-cuts">
                <caption className="pb-2 text-left font-semibold">{t('rg.cuts')}</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-medium">{t('rg.grade')}</th>
                    <th className="py-1 text-right font-medium">{t('rg.points')}</th>
                    <th className="py-1 text-right font-medium">{t('rg.from')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.cuts.map((c) => (
                    <tr key={c.grade} className="border-t">
                      <th scope="row" className="py-1.5 text-left font-medium">{c.grade}</th>
                      <td className="py-1.5 text-right tabular-nums">{c.points}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt.number(c.minPercent)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-sm" data-testid="rg-distribution">
                <caption className="pb-2 text-left font-semibold">{t('rg.distribution')}</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-medium">{t('rg.grade')}</th>
                    <th className="py-1 font-medium">{t('rg.absolute')}</th>
                    <th className="py-1 font-medium">{t('rg.onCurve')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => (
                    <tr key={g} className="border-t">
                      <th scope="row" className="py-1.5 text-left font-medium">{g}</th>
                      {[count(preview.absolute, g), count(preview.relative, g)].map((n, i) => (
                        <td key={i} className="py-1.5">
                          <span className="flex items-center gap-2">
                            <span aria-hidden className={i ? 'h-2.5 rounded-sm bg-primary' : 'h-2.5 rounded-sm bg-muted-foreground/40'} style={{ width: `${Math.round((n / max) * 64)}px` }} />
                            <span className="tabular-nums">{n}</span>
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canApply && enabled && !preview.tooSmall && <TextInput label={t('rg.note')} value={note} onChange={(e) => setNote(e.target.value)} fullWidth />}
          </>
        )}
      </div>
    </Dialog>
  );
}
