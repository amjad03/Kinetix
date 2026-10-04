'use client';

import Check from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import Button from '@mui/material/Button';
import { useMemo, useState } from 'react';
import { hhmm } from '@/lib/dates';
import type { ClassRow, ClassStatus } from '@/lib/types';
import { AttendanceSummary } from './ClassTimeline';
import { TableFrame } from './DataTable';
import { EmptyState } from './States';
import { STATUS_ORDER } from '@/lib/status';
import { useI18n } from '@/i18n/client';
import { StatusChip } from './StatusChip';

const ALL = '';

export function ClassesTable({ classes, initialStatus }: { classes: ClassRow[]; initialStatus?: ClassStatus }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ClassStatus | typeof ALL>(initialStatus ?? ALL);
  const [section, setSection] = useState(ALL);
  const [teacher, setTeacher] = useState(ALL);

  const sections = useMemo(() => [...new Map(classes.map((c) => [c.section.id, c.section.displayName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [classes]);
  const teachers = useMemo(() => [...new Map(classes.map((c) => [c.teacher.id, c.teacher.fullName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [classes]);
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }} role="group" aria-label={t('classes.filterStatus')}>
        <Chip
          label={t('classes.all', { n: classes.length })}
          variant={status === ALL ? 'filled' : 'outlined'}
          onClick={() => setStatus(ALL)}
          icon={status === ALL ? <Check sx={{ fontSize: '18px !important' }} /> : undefined}
          sx={status === ALL ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '& .MuiChip-icon': { color: 'inherit' } } : undefined}
          aria-pressed={status === ALL}
        />
        {STATUS_ORDER.map((s) => {
          const on = status === s;
          return (
            <Chip
              key={s}
              label={t('classes.chip', { label: t(`status.${s}`), n: counts.get(s) ?? 0 })}
              variant={on ? 'filled' : 'outlined'}
              onClick={() => setStatus(on ? ALL : s)}
              icon={on ? <Check sx={{ fontSize: '18px !important' }} /> : undefined}
              sx={on ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '& .MuiChip-icon': { color: 'inherit' } } : undefined}
              aria-pressed={on}
              data-testid={`filter-${s}`}
            />
          );
        })}
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
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
        <FormControl size="small" sx={{ minWidth: 180 }}>
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
      </Box>

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
        <TableFrame testId="classes-table">
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('classes.col.time')}</TableCell>
                <TableCell>{t('classes.col.class')}</TableCell>
                <TableCell>{t('classes.col.teacher')}</TableCell>
                <TableCell>{t('classes.col.room')}</TableCell>
                <TableCell>{t('classes.col.board')}</TableCell>
                <TableCell>{t('classes.col.attendance')}</TableCell>
                <TableCell>{t('classes.col.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover data-status={c.status}>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {hhmm(c.startsAt)}–{hhmm(c.endsAt)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2">{c.subject.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.section.displayName} · {c.subject.code}
                    </Typography>
                  </TableCell>
                  <TableCell>{c.teacher.fullName}</TableCell>
                  <TableCell>{c.room ?? '—'}</TableCell>
                  <TableCell sx={{ color: c.board ? 'text.primary' : 'text.secondary' }}>{c.board ?? '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" component="span">
                      <AttendanceSummary c={c} />
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {filtered && rows.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          {t('classes.showing', { shown: rows.length, total: classes.length })}{' '}
          <Box component="button" onClick={clear} sx={{ all: 'unset', cursor: 'pointer', color: 'primary.main', fontWeight: 500 }}>
            {t('common.clearFilters')}
          </Box>
        </Typography>
      )}
    </>
  );
}
