'use client';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui';
import { hhmm } from '@/lib/dates';
import type { ClassRow, ClassStatus } from '@/lib/types';
import { AttendanceSummary } from './ClassTimeline';
import { EmptyState } from './States';
import { STATUS_ORDER } from '@/lib/status';
import { useI18n } from '@/i18n/client';
import { StatusChip } from './StatusChip';
import { cn } from '@/lib/utils';

import { Button, Chip, FormControl, InputLabel, MenuItem, Select } from '@/components/kx';
import { Check, FilterX as FilterAltOffOutlined } from 'lucide-react';
import { naturalCompare } from '@/lib/natural';
const ALL = '';

export function ClassesTable({ classes, initialStatus }: { classes: ClassRow[]; initialStatus?: ClassStatus }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ClassStatus | typeof ALL>(initialStatus ?? ALL);
  const [section, setSection] = useState(ALL);
  const [teacher, setTeacher] = useState(ALL);

  const sections = useMemo(() => [...new Map(classes.map((c) => [c.section.id, c.section.displayName])).entries()].sort((a, b) => naturalCompare(a[1], b[1])), [classes]);
  const teachers = useMemo(() => [...new Map(classes.map((c) => [c.teacher.id, c.teacher.fullName])).entries()].sort((a, b) => naturalCompare(a[1], b[1])), [classes]);
  const counts = useMemo(() => {
    const m = new Map<ClassStatus, number>();
    for (const c of classes) if ((!section || c.section.id === section) && (!teacher || c.teacher.id === teacher)) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [classes, section, teacher]);

  const rows = classes.filter((c) => (!status || c.status === status) && (!section || c.section.id === section) && (!teacher || c.teacher.id === teacher));
  const filtered = !!(status || section || teacher);
  const clear = () => {
    setStatus(ALL);
    setSection(ALL);
    setTeacher(ALL);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2 [&>button]:mb-1" role="group" aria-label={t('classes.filterStatus')}>
        <Chip className={cn(status === ALL && 'bg-secondary text-secondary-foreground [&_svg]:text-inherit')}
          label={t('classes.all', { n: classes.length })}
          variant={status === ALL ? 'filled' : 'outlined'}
          onClick={() => setStatus(ALL)}
          icon={status === ALL ? <Check className="text-[18px_!important]" /> : undefined}
          aria-pressed={status === ALL}
        />
        {STATUS_ORDER.map((s) => {
          const on = status === s;
          return (
            <Chip className={cn(on && 'bg-secondary text-secondary-foreground [&_svg]:text-inherit')}
              key={s}
              label={t('classes.chip', { label: t(`status.${s}`), n: counts.get(s) ?? 0 })}
              variant={on ? 'filled' : 'outlined'}
              onClick={() => setStatus(on ? ALL : s)}
              icon={on ? <Check className="text-[18px_!important]" /> : undefined}
              aria-pressed={on}
              data-testid={`filter-${s}`}
            />
          );
        })}
        <div className="flex-1" />
        <FormControl className="min-w-[180px]" size="small">
          <InputLabel id="f-class" shrink>{t('classes.col.class')}</InputLabel>
          <Select labelId="f-class" label={t('classes.col.class')} notched displayEmpty value={section} onChange={(e) => setSection(e.target.value)} data-testid="filter-class">
            <MenuItem value={ALL}>{t('common.allClasses')}</MenuItem>
            {sections.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl className="min-w-[180px]" size="small">
          <InputLabel id="f-teacher" shrink>{t('classes.col.teacher')}</InputLabel>
          <Select labelId="f-teacher" label={t('classes.col.teacher')} notched displayEmpty value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <MenuItem value={ALL}>{t('common.allTeachers')}</MenuItem>
            {teachers.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          dense
          icon={<FilterAltOffOutlined />}
          title={t('classes.noMatch')}
          actions={
            <Button variant="outlined" onClick={clear}>
              {t('common.clearFilters')}
            </Button>
          }
        />
      ) : (
        <DataTable
          testId="classes-table"
          label={t('nav.classes')}
          rows={rows}
          rowId={(c) => c.id}
          exportName="classes"
          columns={[
            { id: 'c0', header: t('classes.col.time'), rowHeader: true, sort: (c) => `${hhmm(c.startsAt)}–${hhmm(c.endsAt)}`, cell: (c) => <span className="whitespace-nowrap">{`${hhmm(c.startsAt)}–${hhmm(c.endsAt)}`}</span> },
            { id: 'c1', header: t('classes.col.class'), sort: (c) => c.subject.name, csv: (c) => `${c.subject.name} (${c.section.displayName} · ${c.subject.code})`, cell: (c) => (<><h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{c.subject.name}</h6>
                              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                                {c.section.displayName} · {c.subject.code}
                              </span></>) },
            { id: 'c2', header: t('classes.col.teacher'), sort: (c) => c.teacher.fullName, cell: (c) => c.teacher.fullName },
            { id: 'c3', header: t('classes.col.room'), sort: (c) => c.room ?? '', cell: (c) => c.room ?? '—' },
            { id: 'c4', header: t('classes.col.board'), sort: (c) => c.board ?? '', cell: (c) => c.board ?? '—' },
            { id: 'c5', header: t('classes.col.attendance'), csv: false, cell: (c) => (<><span className="text-[13px] leading-[19px]">
                                <AttendanceSummary c={c} />
                              </span></>) },
            { id: 'c6', header: t('classes.col.status'), sort: (c) => c.status, cell: (c) => (<><StatusChip status={c.status} /></>) },
          ]}
        />
      )}
      {filtered && rows.length > 0 && (
        <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3">
          {t('classes.showing', { shown: rows.length, total: classes.length })}{' '}
          <button className="[all:unset] cursor-pointer text-teal-ink font-medium" onClick={clear}>
            {t('common.clearFilters')}
          </button>
        </p>
      )}
    </>
  );
}
