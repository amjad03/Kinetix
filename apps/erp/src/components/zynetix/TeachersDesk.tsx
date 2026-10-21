'use client';
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createTeacher, resetTeacherPassword, setTeacherActive, updateTeacher, type TeacherForm } from '@/app/(dashboard)/zynetix/actions';
import { Button, IconButton, Tooltip } from '@/components/kx';
import { CheckboxField, DataTable, Dialog, FormGrid, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Teacher } from '@/lib/zynetix';

type Editing = { id: string | null; form: TeacherForm & { subjects: string } };
const blank = (): Editing => ({ id: null, form: { fullName: '', email: '', phone: '', roles: ['teacher'], departmentIds: [], subjects: '' } });

/** The college's teachers: add (the temporary password is shown once), edit, deactivate, and reset a password. */
export function TeachersDesk({ teachers, departments }: { teachers: Teacher[]; departments: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [secret, setSecret] = useState<{ name: string; login: string; password: string } | null>(null);
  const [busy, start] = useTransition();

  const save = () => {
    if (!editing) return;
    const { subjects, ...f } = editing.form;
    const form: TeacherForm = { ...f, teachingSubjects: subjects.split(',').map((s) => s.trim()).filter(Boolean) };
    start(async () => {
      if (editing.id) {
        const res = await updateTeacher(editing.id, form);
        if (!res.ok) return toast.error(res.error);
        toast.success(t('zx.t.saved'));
      } else {
        const res = await createTeacher(form);
        if (!res.ok) return toast.error(res.error);
        setSecret({ name: res.data!.fullName, login: res.data!.email ?? res.data!.phone ?? '', password: res.data!.temporaryPassword });
      }
      setEditing(null);
    });
  };
  const toggleActive = (r: Teacher) =>
    start(async () => {
      const active = r.status !== 'active';
      if (!active && !window.confirm(t('zx.t.confirmDeactivate', { name: r.fullName }))) return;
      const res = await setTeacherActive(r.id, active);
      if (!res.ok) return toast.error(res.error);
      toast.success(t(active ? 'zx.t.activated' : 'zx.t.deactivated'));
    });
  const reset = (r: Teacher) => {
    if (!window.confirm(t('zx.t.confirmReset', { name: r.fullName }))) return;
    start(async () => {
      const res = await resetTeacherPassword(r.id);
      if (!res.ok) return toast.error(res.error);
      setSecret({ name: r.fullName, login: r.email ?? r.phone ?? '', password: res.data!.temporaryPassword });
    });
  };
  const edit = (r: Teacher) =>
    setEditing({ id: r.id, form: { fullName: r.fullName, email: r.email ?? '', phone: r.phone ?? '', roles: r.roles.filter((x): x is 'teacher' | 'hod' => x === 'teacher' || x === 'hod'), departmentIds: r.departments.map((d) => d.id), subjects: r.teachingSubjects.join(', ') } });

  const columns: Column<Teacher>[] = [
    { id: 'name', header: t('zx.t.name'), rowHeader: true, sort: (r) => r.fullName, cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { id: 'login', header: t('zx.t.login'), sort: (r) => r.email ?? r.phone ?? '', cell: (r) => r.email ?? r.phone ?? '—' },
    { id: 'dept', header: t('zx.t.departments'), hideBelow: 'md', sort: (r) => r.departments.map((d) => d.name).join(', '), cell: (r) => r.departments.map((d) => d.name).join(', ') || '—' },
    { id: 'subjects', header: t('zx.t.subjects'), hideBelow: 'lg', sort: (r) => r.teachingSubjects.join(', '), cell: (r) => r.teachingSubjects.join(', ') || '—' },
    { id: 'roles', header: t('zx.t.roles'), sort: (r) => r.roles.join(','), cell: (r) => (r.roles.includes('hod') ? t('zx.t.hod') : t('zx.t.teacher')) },
    { id: 'status', header: t('zx.t.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={r.status === 'active' ? 'success' : 'neutral'}>{t(r.status === 'active' ? 'zx.t.active' : 'zx.t.inactive')}</StatusPill> },
    {
      id: 'actions',
      header: '',
      csv: false,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Tooltip title={t('common.edit')}>
            <IconButton size="small" aria-label={t('zx.t.editOne', { name: r.fullName })} disabled={busy} onClick={() => edit(r)}>
              <Pencil />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('zx.t.reset')}>
            <IconButton size="small" aria-label={t('zx.t.resetOne', { name: r.fullName })} disabled={busy} onClick={() => reset(r)}>
              <KeyRound />
            </IconButton>
          </Tooltip>
          <Tooltip title={t(r.status === 'active' ? 'zx.t.deactivate' : 'zx.t.activate')}>
            <IconButton size="small" aria-label={t(r.status === 'active' ? 'zx.t.deactivateOne' : 'zx.t.activateOne', { name: r.fullName })} disabled={busy} onClick={() => toggleActive(r)} data-testid="zx-teacher-active">
              {r.status === 'active' ? <UserX /> : <UserCheck />}
            </IconButton>
          </Tooltip>
        </div>
      ),
    },
  ];

  const f = editing?.form;
  const set = (patch: Partial<Editing['form']>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  return (
    <>
      <DataTable
        testId="zx-teachers"
        label={t('nav.zxTeachers')}
        rows={teachers}
        rowId={(r) => r.id}
        columns={columns}
        exportName="teachers"
        rowAttrs={() => ({ 'data-testid': 'zx-teacher-row' })}
        toolbar={
          <Button variant="contained" startIcon={<Plus />} onClick={() => setEditing(blank())} data-testid="zx-add-teacher">
            {t('zx.t.add')}
          </Button>
        }
      />
      {editing && f && (
        <Dialog
          title={t(editing.id ? 'zx.t.edit' : 'zx.t.add')}
          onClose={() => setEditing(null)}
          busy={busy}
          size="md"
          actions={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="contained" onClick={save} disabled={busy} data-testid="zx-teacher-save">
                {t('common.save')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <TextInput label={t('zx.t.name')} required value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'zx-teacher-name' } }} />
            <FormGrid>
              <TextInput label={t('zx.t.email')} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'zx-teacher-email' } }} />
              <TextInput label={t('zx.t.phone')} value={f.phone} onChange={(e) => set({ phone: e.target.value })} slotProps={{ htmlInput: { maxLength: 20 } }} />
            </FormGrid>
            <TextInput label={t('zx.t.subjects')} helper={t('zx.t.subjectsHelp')} value={f.subjects} onChange={(e) => set({ subjects: e.target.value })} />
            <CheckboxField label={t('zx.t.hod')} checked={!!f.roles?.includes('hod')} onChange={(on) => set({ roles: on ? ['teacher', 'hod'] : ['teacher'] })} />
            {departments.length > 0 && (
              <fieldset>
                <legend className="text-[13px] font-semibold">{t('zx.t.departments')}</legend>
                <div className="flex flex-wrap gap-x-4">
                  {departments.map((d) => (
                    <CheckboxField key={d.id} label={d.name} checked={!!f.departmentIds?.includes(d.id)} onChange={(on) => set({ departmentIds: on ? [...(f.departmentIds ?? []), d.id] : (f.departmentIds ?? []).filter((x) => x !== d.id) })} />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </Dialog>
      )}
      {secret && (
        <Dialog title={t('zx.t.passwordTitle')} onClose={() => setSecret(null)} actions={<Button variant="contained" onClick={() => setSecret(null)}>{t('zx.t.done')}</Button>}>
          <p className="text-sm">{t('zx.t.passwordBody', { name: secret.name, login: secret.login })}</p>
          <p className="mt-3 rounded-lg border bg-muted px-3 py-2 font-mono text-lg tracking-wider" data-testid="zx-temp-password">
            {secret.password}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t('zx.t.passwordOnce')}</p>
        </Dialog>
      )}
    </>
  );
}
