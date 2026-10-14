'use client';

import { CalendarClock, Copy, Pencil, Plus, RotateCcw, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { duplicateReport, runReport, setFavourite } from '@/app/(dashboard)/reports/studio-actions';
import { Button } from '@/components/shadcn/button';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { opNeedsValue, type DatasetMeta, type Filter, type ReportDoc, type StudioResult } from '@/lib/report-studio';
import { Labelled, Pick, Toolbar } from './controls';
import { ScheduleDialog } from './Dialogs';
import { ExportMenu } from './ExportMenu';
import { FilterEditor, ValuePicker } from './FilterEditor';
import { ResultView } from './ResultView';

const QUICK_PICKERS = ['class', 'program', 'department', 'academic_year', 'campus', 'session', 'route', 'block', 'scheme', 'leave_type', 'store'];

/**
 * A saved or library report: quick filters (period, class, program, department…) that apply as
 * they change, the chart and table with drill-down, and its actions: star, customise or edit,
 * duplicate, schedule and download.
 */
export function ReportViewer({ doc, dataset, relative, initial }: { doc: ReportDoc; dataset: DatasetMeta; relative: { key: string; label: string }[]; initial: StudioResult | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [result, setResult] = useState<StudioResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(doc.favourite);
  const [period, setPeriod] = useState('');
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [extra, setExtra] = useState<Filter[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [running, start] = useTransition();
  const first = useRef(true);
  const source = doc.ref.startsWith('custom:') ? { reportId: doc.ref.slice(7) } : { libraryKey: doc.ref.slice(4) };
  const pickers = dataset.fields.filter((f) => f.picker && QUICK_PICKERS.includes(f.key)).slice(0, 3);

  const runtime = useMemo<Filter[]>(() => {
    const out: Filter[] = [];
    if (period && dataset.dateField) out.push({ field: dataset.dateField, op: 'relative', value: period });
    for (const [field, ids] of Object.entries(picks)) if (ids.length) out.push({ field, op: 'in', value: ids });
    for (const f of extra) if (!opNeedsValue(f.op) || (f.value !== undefined && f.value !== '' && (!Array.isArray(f.value) || f.value.length))) out.push(f);
    return out;
  }, [period, picks, extra, dataset.dateField]);
  const key = JSON.stringify(runtime);

  useEffect(() => {
    if (first.current && initial) {
      first.current = false;
      return;
    }
    first.current = false;
    const timer = setTimeout(
      () =>
        start(async () => {
          const res = await runReport(source, runtime);
          if (res.ok) {
            setResult(res.data);
            setError(null);
          } else setError(res.error);
        }),
      250,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggleFav = () =>
    start(async () => {
      const res = await setFavourite(doc.ref, !fav);
      if (res.ok) setFav(!fav);
      else toast.error(res.error);
    });
  const copy = () =>
    start(async () => {
      const res = await duplicateReport(doc.ref.slice(7));
      if (res.ok) router.push(`/reports/builder?id=${res.data.id}`);
      else toast.error(res.error);
    });
  const clear = () => {
    setPeriod('');
    setPicks({});
    setExtra([]);
  };
  const filtered = !!period || Object.values(picks).some((v) => v.length) || extra.length > 0;
  const editHref = doc.ref.startsWith('custom:') && doc.canEdit ? `/reports/builder?id=${doc.ref.slice(7)}` : `/reports/builder?${doc.ref.startsWith('lib:') ? `lib=${doc.ref.slice(4)}` : `copy=${doc.ref.slice(7)}`}`;

  return (
    <div className="grid gap-4" data-testid="rs-viewer">
      <Toolbar label={t('rs.v.actions')}>
        <Button variant="outline" onClick={toggleFav} aria-pressed={fav} data-testid="rs-star">
          <Star className={fav ? 'fill-current text-amber-ink' : undefined} />
          {fav ? t('rs.unstar') : t('rs.star')}
        </Button>
        {doc.ref.startsWith('custom:') && !doc.canEdit ? (
          <Button variant="outline" onClick={copy} disabled={running}>
            <Copy />
            {t('rs.act.duplicate')}
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={editHref} data-testid="rs-edit">
              <Pencil />
              {doc.ref.startsWith('lib:') ? t('rs.v.customise') : t('rs.v.edit')}
            </Link>
          </Button>
        )}
        <Button variant="outline" onClick={() => setSchedule(true)} data-testid="rs-schedule">
          <CalendarClock />
          {t('rs.v.schedule')}
        </Button>
        <ExportMenu source={source} runtime={runtime} />
      </Toolbar>

      <div className="rounded-lg border bg-card p-4">
        <Toolbar label={t('rs.quick.title')}>
          {dataset.dateField && (
            <Labelled label={t('rs.quick.period')} className="w-[200px]">
              <Pick label={t('rs.quick.period')} value={period || '_saved'} onChange={(v) => setPeriod(v === '_saved' ? '' : v)} options={[{ value: '_saved', label: t('rs.quick.anyPeriod') }, ...relative.map((r) => ({ value: r.key, label: r.label }))]} testId="rs-period" />
            </Labelled>
          )}
          {pickers.map((f) => (
            <Labelled key={f.key} label={f.label}>
              <ValuePicker dataset={dataset.key} field={f} multiple value={picks[f.key] ?? []} onChange={(v) => setPicks({ ...picks, [f.key]: v })} />
            </Labelled>
          ))}
          <Button variant="ghost" onClick={() => setExtra([...extra, { field: dataset.fields[0].key, op: 'contains' }])}>
            <Plus />
            {t('rs.quick.add')}
          </Button>
          {filtered && (
            <Button variant="ghost" onClick={clear}>
              <RotateCcw />
              {t('rs.quick.clear')}
            </Button>
          )}
        </Toolbar>
        {extra.length > 0 && (
          <div className="mt-3 grid gap-2">
            {extra.map((f, i) => (
              <FilterEditor key={i} dataset={dataset} filter={f} relative={relative} onChange={(nf) => setExtra(extra.map((x, j) => (j === i ? nf : x)))} onRemove={() => setExtra(extra.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red-ink">
          {error}
        </p>
      )}
      <div aria-busy={running} className={running ? 'opacity-60 transition-opacity' : undefined}>
        {result && <ResultView result={result} title={doc.title} definition={doc.definition} source={source} runtime={runtime} testId="rs-result" />}
      </div>
      {schedule && <ScheduleDialog source={source} title={doc.title} runtime={runtime} onClose={() => setSchedule(false)} />}
    </div>
  );
}
