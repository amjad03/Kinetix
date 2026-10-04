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
import Card from '@mui/material/Card';
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
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { createDepartment, deleteDepartment, updateDepartment } from '@/app/(dashboard)/departments/actions';
import { EmptyState } from '@/components/States';
import { PageHeader } from '@/components/PageHeader';
import { headCandidates, movedSubjects } from '@/lib/department';
import type { AdminDepartment, StaffMember } from '@/lib/types';

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  program: string;
  term: number;
}

type Open = { kind: 'create' } | { kind: 'edit'; dept: AdminDepartment } | { kind: 'delete'; dept: AdminDepartment } | null;

export function DepartmentsManager({ departments, staff, subjects }: { departments: AdminDepartment[]; staff: StaffMember[]; subjects: SubjectOption[] }) {
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
        title="Departments"
        subtitle="Group subjects and staff into departments. Each head of department sees their department's classes, teachers and marks."
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={() => setOpen({ kind: 'create' })}>
            Add department
          </Button>
        }
      />
      {departments.length === 0 ? (
        <EmptyState
          icon={<GroupsOutlined />}
          title="No departments yet"
          testId="no-departments"
          actions={
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpen({ kind: 'create' })}>
              Add department
            </Button>
          }
        >
          Add a department such as Commerce, choose its head, then its subjects and staff.
        </EmptyState>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          {departments.map((d) => (
            <Card key={d.id} data-testid="department-card" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" component="h2" data-testid="department-name">
                    {d.name}
                  </Typography>
                  <Typography variant="body2" color={d.head ? 'text.secondary' : 'error.main'} data-testid="department-head">
                    {d.head ? `Head: ${d.head}` : 'No head of department'}
                  </Typography>
                </Box>
                <Tooltip title="Open the department view">
                  <IconButton component={Link} href={`/department?dept=${d.id}`} aria-label={`View ${d.name}`}>
                    <InsightsOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton onClick={() => setOpen({ kind: 'edit', dept: d })} aria-label={`Edit ${d.name}`}>
                    <EditOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton onClick={() => setOpen({ kind: 'delete', dept: d })} aria-label={`Delete ${d.name}`}>
                    <DeleteOutlined />
                  </IconButton>
                </Tooltip>
              </Box>
              <ChipRow label="Subjects" empty="No subjects yet" items={d.subjects.map((s) => ({ id: s.id, label: s.name, title: s.code }))} testId="department-subjects" />
              <ChipRow label="Staff" empty="No staff yet" items={d.staff.map((s) => ({ id: s.id, label: s.fullName }))} testId="department-staff" />
            </Card>
          ))}
        </Box>
      )}
      {unassigned.length > 0 && departments.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }} data-testid="unassigned-subjects">
          Not in a department: {unassigned.map((s) => s.name).join(', ')}
        </Typography>
      )}

      {open?.kind === 'create' && <CreateDialog staff={staff} onClose={close} />}
      {open?.kind === 'edit' && <EditDialog dept={open.dept} departments={departments} staff={staff} subjects={subjects} onClose={close} />}
      {open?.kind === 'delete' && <DeleteDialog dept={open.dept} onClose={close} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}

function ChipRow({ label, empty, items, testId }: { label: string; empty: string; items: { id: string; label: string; title?: string }[]; testId: string }) {
  return (
    <Box data-testid={testId}>
      <Typography variant="caption" component="h3" sx={{ color: 'text.secondary', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.5px', mb: 0.75 }}>
        {label}
      </Typography>
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
  const heads = headCandidates(staff);
  return (
    <TextField
      select
      label="Head of department"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={heads.length === 0 ? 'Nobody has the HOD role yet. Give a teacher the HOD role to make them a head.' : 'Only staff with the HOD role can head a department.'}
      fullWidth
      slotProps={{ select: { 'data-testid': 'head-select' } as object }}
    >
      <MenuItem value="">
        <em>No head</em>
      </MenuItem>
      {heads.map((s) => (
        <MenuItem key={s.id} value={s.id}>
          {s.fullName}
        </MenuItem>
      ))}
    </TextField>
  );
}

function CreateDialog({ staff, onClose }: { staff: StaffMember[]; onClose: (message?: string) => void }) {
  const [name, setName] = useState('');
  const [head, setHead] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createDepartment({ name, headUserId: head || null });
      if (res.ok) onClose(`${name.trim()} added`);
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
        <DialogTitle>Add department</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} placeholder="For example, Commerce" />
            <HeadSelect staff={staff} value={head} onChange={setHead} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim()} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
            Add
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
    if (dept.headUserId && !list.some((s) => s.id === dept.headUserId)) list.push({ id: dept.headUserId, fullName: dept.head ?? 'Current head', roles: ['hod'] });
    return list;
  }, [staff, dept.headUserId, dept.head]);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await updateDepartment(dept.id, {
        ...(name.trim() !== dept.name && { name }),
        ...((head || null) !== dept.headUserId && { headUserId: head || null }),
        staffIds,
        subjectIds,
      });
      if (res.ok) onClose(`${name.trim()} saved`);
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
        <DialogTitle>Edit {dept.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && (
              <Alert severity="error" data-testid="department-error">
                {error}
              </Alert>
            )}
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
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
                        {s.code} · Sem {s.term}
                        {from && from !== dept.name ? ` · in ${from}` : ''}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => <TextField {...params} label="Subjects" placeholder={subjectIds.length ? '' : 'Choose subjects'} />}
              data-testid="subjects-select"
            />
            {moved.length > 0 && (
              <Alert severity="info" data-testid="subjects-moving">
                A subject belongs to one department. Saving moves {moved.map((m) => `${m.name} from ${m.from}`).join(', ')}.
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
              renderInput={(params) => <TextField {...params} label="Staff" placeholder={staffIds.length ? '' : 'Choose staff'} />}
              data-testid="staff-select"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim()} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ dept, onClose }: { dept: AdminDepartment; onClose: (message?: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {dept.name}?</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText>
          {dept.head ? `${dept.head} will no longer see this department. ` : ''}Its subjects stay on the timetable but are no longer in a department. Classes, attendance and marks are not
          affected.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteDepartment(dept.id);
              if (res.ok) onClose(`${dept.name} deleted`);
              else setError(res.error);
            })
          }
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
