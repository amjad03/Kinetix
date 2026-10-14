'use client';

import { CalendarOff, FileText, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { classRoster, recordOnDuty } from '@/app/(dashboard)/attendance/desk-actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, EmptyState, SelectInput, StatusPill, TextInput, useToast, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type R = Row & Record<string, string | number | boolean | null>;
const STATUS_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral', revoked: 'neutral' };

/** Leave and on duty (Attendance → Leave and OD): the kit list with approvals in bulk, and on duty for a whole group. */
export function LeaveRecords({ meta, page, state, classes }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; classes: { id: string; name: string; program: string }[] }) {
  const { t, fmt } = useI18n();
  const [group, setGroup] = useState(false);
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    const span = (x: R) => `${fmt.date(String(x.fromDate), 'short')}${x.toDate !== x.fromDate ? ` – ${fmt.date(String(x.toDate), 'short')}` : ''}${x.fromTime ? ` · ${String(x.fromTime).slice(0, 5)}–${String(x.toTime).slice(0, 5)}` : ''}`;
    return [
      { id: 'student', header: t('atd.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (x) => `${v(x).rollNo} ${v(x).fullName}` },
      { id: 'class', header: t('atd.col.class'), sortKey: 'class', hideBelow: 'md', cell: (x) => v(x).section },
      { id: 'kind', header: t('atd.col.kind'), sortKey: 'kind', cell: (x) => <StatusPill tone="info">{tr(t, `rk.o.attendance-leaves.kind.${v(x).kind}`, String(v(x).kind))}</StatusPill> },
      { id: 'dates', header: t('atd.col.dates'), sortKey: 'from', cell: (x) => span(v(x)) },
      { id: 'activity', header: t('atd.col.activity'), hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).activity || '—' },
      { id: 'reason', header: t('atd.col.reason'), hideBelow: 'lg', cell: (x) => <span className="line-clamp-2 max-w-[280px]">{String(v(x).reason)}</span> },
      { id: 'status', header: t('atd.col.status'), sortKey: 'status', cell: (x) => <StatusPill tone={STATUS_TONE[String(v(x).status)] ?? 'neutral'}>{tr(t, `rk.o.attendance-leaves.status.${v(x).status}`, String(v(x).status))}</StatusPill> },
      { id: 'marks', header: t('atd.col.marksWritten'), align: 'right', hideBelow: 'md', defaultHidden: true, cell: (x) => fmt.number(Number(v(x).appliedMarks ?? 0)) },
      { id: 'decidedBy', header: t('atd.col.decidedBy'), hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).decidedBy ?? '—' },
    ];
  }, [t, fmt]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('atd.leave.title')}
        columns={columns}
        extraRowActions={(row) => ((row as R).hasDocument ? [{ id: 'doc', label: t('atd.document'), icon: <FileText />, onSelect: (r) => window.open(`/api/download?kind=leave-doc&id=${r.id}`, '_blank', 'noopener') }] : [])}
        toolbar={
          meta.can.create ? (
            <Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setGroup(true)} data-testid="group-od">
              <Users />
              {t('atd.groupOd')}
            </Button>
          ) : undefined
        }
        empty={
          <EmptyState icon={<CalendarOff />} title={t('atd.leave.empty')} testId="no-leave">
            {t('atd.leave.emptyBody')}
          </EmptyState>
        }
      />
      {group && <GroupOnDuty classes={classes} onClose={() => setGroup(false)} />}
    </>
  );
}

/** On duty for several students at once (a team at a fest, an NSS camp), approved at once when the person may decide. */
function GroupOnDuty({ classes, onClose }: { classes: { id: string; name: string; program: string }[]; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState<{ id: string; rollNo: string; fullName: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [v, setV] = useState({ fromDate: '', toDate: '', fromTime: '', toTime: '', activity: '', reason: '', approve: true });
  const pick = (id: string) => {
    setSectionId(id);
    start(async () => {
      const r = id ? await classRoster(id) : null;
      setStudents(r?.ok ? r.data.students : []);
      if (r && !r.ok) toast.error(r.error);
    });
  };
  const ready = chosen.length > 0 && v.fromDate && v.toDate && v.activity.trim().length >= 2 && v.reason.trim().length >= 3 && !v.fromTime === !v.toTime;
  const save = () =>
    start(async () => {
      const res = await recordOnDuty({ studentIds: chosen, fromDate: v.fromDate, toDate: v.toDate || v.fromDate, ...(v.fromTime ? { fromTime: v.fromTime, toTime: v.toTime } : {}), activity: v.activity.trim(), reason: v.reason.trim(), approve: v.approve });
      if (!res.ok) return toast.error(res.error);
      const failed = res.data.results.filter((r) => !r.ok);
      if (failed.length) toast.error(t('atd.groupOdSome', { ok: fmt.number(res.data.created), n: fmt.number(failed.length), reason: failed[0].message ?? '' }));
      else toast.success(t('atd.groupOdDone', { n: fmt.number(res.data.created) }));
      onClose();
      router.refresh();
    });
  const date = { slotProps: { inputLabel: { shrink: true } } };
  return (
    <Dialog
      title={t('atd.groupOd')}
      size="md"
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending || !ready} data-testid="group-od-save">
            {t('atd.groupOdSave', { n: fmt.number(chosen.length) })}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectInput label={t('atd.class')} value={sectionId} onChange={(e) => pick(e.target.value)} options={classes.map((c) => ({ value: c.id, label: c.name }))} empty={t('atd.chooseClass')} />
        {students.length > 0 && (
          <fieldset className="grid max-h-56 gap-0.5 overflow-y-auto rounded-md border p-2">
            <legend className="px-1 text-xs text-muted-foreground">{t('atd.students')}</legend>
            <CheckboxField label={t('atd.everyone')} checked={chosen.length === students.length} onChange={(c) => setChosen(c ? students.map((s) => s.id) : [])} />
            {students.map((s) => (
              <CheckboxField key={s.id} label={`${s.rollNo} ${s.fullName}`} checked={chosen.includes(s.id)} onChange={(c) => setChosen((x) => (c ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
            ))}
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput type="date" label={t('atd.from')} value={v.fromDate} onChange={(e) => setV({ ...v, fromDate: e.target.value, toDate: v.toDate || e.target.value })} required {...date} />
          <TextInput type="date" label={t('atd.to')} value={v.toDate} onChange={(e) => setV({ ...v, toDate: e.target.value })} required {...date} />
          <TextInput type="time" label={t('atd.fromTime')} value={v.fromTime} onChange={(e) => setV({ ...v, fromTime: e.target.value })} helper={t('atd.timeHelp')} {...date} />
          <TextInput type="time" label={t('atd.toTime')} value={v.toTime} onChange={(e) => setV({ ...v, toTime: e.target.value })} {...date} />
        </div>
        <TextInput label={t('atd.activity')} value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} required helper={t('atd.activityHelp')} />
        <TextInput label={t('atd.reason')} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} required multiline minRows={2} />
        <CheckboxField label={t('atd.approveNow')} checked={v.approve} onChange={(c) => setV({ ...v, approve: c })} helper={t('atd.approveNowHelp')} />
      </div>
    </Dialog>
  );
}
