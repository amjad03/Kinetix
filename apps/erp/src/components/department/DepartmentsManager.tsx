'use client';

import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { createDepartment, deleteDepartment, updateDepartment } from '@/app/(dashboard)/departments/actions';
import { EmptyState } from '@/components/States';
import { DataTable } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { headCandidates, movedSubjects } from '@/lib/department';
import type { AdminDepartment, StaffMember } from '@/lib/types';
import { useI18n } from '@/i18n/client';

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  program: string;
  term: number;
}

type Open = { kind: 'create' } | { kind: 'edit'; dept: AdminDepartment } | { kind: 'delete'; dept: AdminDepartment } | null;

export function DepartmentsManager({ departments, staff, subjects }: { departments: AdminDepartment[]; staff: StaffMember[]; subjects: SubjectOption[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);
  const close = (message?: string) => {
    setOpen(null);
    if (message) setToast(message);
  };
  const unassigned = useMemo(() => {
    const taken = new Set(departments.flatMap((d) => d.subjects.map((s) => s.id)));
    return subjects.filter((s) => !taken.has(s.id));
  }, [departments, subjects]);

  return (
    <>
      <PageHeader
        title={t('nav.departments')}
        subtitle={t('depts.subtitle')}
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={() => setOpen({ kind: 'create' })}>
            {t('depts.add')}
          </Button>
        }
      />
      {departments.length === 0 ? (
        <EmptyState
          icon={<GroupsOutlined />}
          title={t('depts.none')}
          testId="no-departments"
          actions={
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpen({ kind: 'create' })}>
              {t('depts.add')}
            </Button>
          }
        >
          {t('depts.noneBody')}
        </EmptyState>
      ) : (
        <DataTable
          testId="departments"
          label={t('nav.departments')}
          rows={departments}
          rowId={(d) => d.id}
          exportName="departments"
          rowAttrs={() => ({ 'data-testid': 'department-card' })}
          columns={[
            {
              id: 'name',
              header: t('nav.departments'),
              rowHeader: true,
              sort: (d) => d.name,
              cell: (d) => <span data-testid="department-name">{d.name}</span>,
            },
            {
              id: 'head',
              header: t('depts.headLabel'),
              sort: (d) => d.head ?? '',
              cell: (d) => (
                <Typography variant="body2" color={d.head ? 'text.primary' : 'error.main'} data-testid="department-head">
                  {d.head ? t('depts.head', { name: d.head }) : t('depts.noHead')}
                </Typography>
              ),
            },
            { id: 'subjects', header: t('depts.subjects'), hideBelow: 'md', sort: (d) => d.subjects.length, csv: (d) => d.subjects.map((s) => s.name).join(', '), cell: (d) => <ChipRow empty={t('depts.noSubjects')} items={d.subjects.map((s) => ({ id: s.id, label: s.name, title: s.code }))} testId="department-subjects" /> },
            { id: 'staff', header: t('depts.staff'), hideBelow: 'lg', sort: (d) => d.staff.length, csv: (d) => d.staff.map((s) => s.fullName).join(', '), cell: (d) => <ChipRow empty={t('depts.noStaff')} items={d.staff.map((s) => ({ id: s.id, label: s.fullName }))} testId="department-staff" /> },
            {
              id: 'actions',
              header: '',
              csv: false,
              align: 'right',
              cell: (d) => (
                <Box sx={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('depts.view')}>
                    <IconButton component={Link} href={`/department?dept=${d.id}`} aria-label={t('depts.viewName', { name: d.name })}>
                      <InsightsOutlined />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <IconButton onClick={() => setOpen({ kind: 'edit', dept: d })} aria-label={t('depts.editName', { name: d.name })}>
                      <EditOutlined />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <IconButton onClick={() => setOpen({ kind: 'delete', dept: d })} aria-label={t('depts.deleteName', { name: d.name })}>
                      <DeleteOutlined />
                    </IconButton>
                  </Tooltip>
                </Box>
              ),
            },
          ]}
        />
      )}
      {unassigned.length > 0 && departments.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }} data-testid="unassigned-subjects">
          {t('depts.unassigned', { names: unassigned.map((s) => s.name).join(', ') })}
        </Typography>
      )}

      {open?.kind === 'create' && <CreateDialog staff={staff} onClose={close} />}
      {open?.kind === 'edit' && <EditDialog dept={open.dept} departments={departments} staff={staff} subjects={subjects} onClose={close} />}
      {open?.kind === 'delete' && <DeleteDialog dept={open.dept} onClose={close} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}

function ChipRow({ empty, items, testId }: { empty: string; items: { id: string; label: string; title?: string }[]; testId: string }) {
  return (
    <Box data-testid={testId}>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {items.map((i) => (
            <Chip key={i.id} label={i.label} title={i.title} size="small" variant="outlined" />
          ))}
        </Box>
      )}
    </Box>
  );
}

function HeadSelect({ staff, value, onChange }: { staff: StaffMember[]; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const heads = headCandidates(staff);
  return (
    <FormField label={t('depts.headLabel')}>
      <TextInput
        select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        helperText={heads.length === 0 ? t('depts.noHods') : t('depts.onlyHods')}
        fullWidth
        slotProps={{ select: { 'data-testid': 'head-select' } as object }}
      >
        <MenuItem value="">
          <em>{t('depts.noHeadOption')}</em>
        </MenuItem>
        {heads.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.fullName}
          </MenuItem>
        ))}
      </TextInput>
    </FormField>
  );
}

function CreateDialog({ staff, onClose }: { staff: StaffMember[]; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [head, setHead] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createDepartment({ name, headUserId: head || null });
      if (res.ok) onClose(t('depts.added', { name: name.trim() }));
      else setError(res.error);
    });
  };
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle>{t('depts.add')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('depts.name')} required>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus required fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} placeholder={t('depts.namePlaceholder')} />
            </FormField>
            <HeadSelect staff={staff} value={head} onChange={setHead} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim()} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
            {t('common.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EditDialog({
  dept,
  departments,
  staff,
  subjects,
  onClose,
}: {
  dept: AdminDepartment;
  departments: AdminDepartment[];
  staff: StaffMember[];
  subjects: SubjectOption[];
  onClose: (message?: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(dept.name);
  const [head, setHead] = useState(dept.headUserId ?? '');
  const [staffIds, setStaffIds] = useState(dept.staff.map((s) => s.id));
  const [subjectIds, setSubjectIds] = useState(dept.subjects.map((s) => s.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = useMemo(() => new Map(departments.flatMap((d) => d.subjects.map((s) => [s.id, d.name] as const))), [departments]);
  const moved = movedSubjects(dept.id, subjectIds, departments);
  // Staff list: everyone from /v1/admin/staff, plus anyone already in the department.
  const people = useMemo(() => {
    const all = new Map(staff.map((s) => [s.id, { id: s.id, fullName: s.fullName }]));
    for (const s of dept.staff) if (!all.has(s.id)) all.set(s.id, s);
    return [...all.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [staff, dept.staff]);
  const headOptions = useMemo(() => {
    // Keep a current head who has since lost the HOD role selectable, so the form shows them.
    const list = headCandidates(staff);
    if (dept.headUserId && !list.some((s) => s.id === dept.headUserId)) list.push({ id: dept.headUserId, fullName: dept.head ?? t('depts.currentHead'), roles: ['hod'] });
    return list;
  }, [staff, dept.headUserId, dept.head, t]);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await updateDepartment(dept.id, {
        ...(name.trim() !== dept.name && { name }),
        ...((head || null) !== dept.headUserId && { headUserId: head || null }),
        staffIds,
        subjectIds,
      });
      if (res.ok) onClose(t('depts.saved', { name: name.trim() }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle>{t('depts.edit', { name: dept.name })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && (
              <Alert severity="error" data-testid="department-error">
                {error}
              </Alert>
            )}
            <FormField label={t('depts.name')} required>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
            </FormField>
            <HeadSelect staff={headOptions} value={head} onChange={setHead} />
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={subjects}
              value={subjects.filter((s) => subjectIds.includes(s.id))}
              onChange={(_, v) => setSubjectIds(v.map((s) => s.id))}
              getOptionLabel={(s) => s.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              groupBy={(s) => s.program}
              renderOption={(props, s) => {
                const { key, ...rest } = props as typeof props & { key: string };
                const from = owner.get(s.id);
                return (
                  <li key={key} {...rest}>
                    <Box>
                      <Typography variant="body2">{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.code} · {t('tt.sem', { n: s.term })}
                        {from && from !== dept.name ? ` · ${t('depts.inDept', { name: from })}` : ''}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => <FormField label={t('depts.subjects')}><TextInput {...params} placeholder={subjectIds.length ? '' : t('depts.chooseSubjects')} /></FormField>}
              data-testid="subjects-select"
            />
            {moved.length > 0 && (
              <Alert severity="info" data-testid="subjects-moving">
                {t('depts.moving', { list: moved.map((m) => t('depts.movingItem', { name: m.name, from: m.from })).join(', ') })}
              </Alert>
            )}
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={people}
              value={people.filter((s) => staffIds.includes(s.id))}
              onChange={(_, v) => setStaffIds(v.map((s) => s.id))}
              getOptionLabel={(s) => s.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <FormField label={t('depts.staff')}><TextInput {...params} placeholder={staffIds.length ? '' : t('depts.chooseStaff')} /></FormField>}
              data-testid="staff-select"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim()} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ dept, onClose }: { dept: AdminDepartment; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{t('depts.delete.title', { name: dept.name })}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText>
          {dept.head ? `${t('depts.delete.head', { name: dept.head })} ` : ''}
          {t('depts.delete.body')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteDepartment(dept.id);
              if (res.ok) onClose(t('depts.deleted', { name: dept.name }));
              else setError(res.error);
            })
          }
        >
          {t('common.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
