'use client';

import { KeyRound, LogOut, ShieldCheck, ShieldOff, UserCheck, UserCog, UserX, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { bulkRecords, updateRecord } from '@/app/(dashboard)/records-actions';
import { resetUserPassword, signOutUser } from '@/app/(dashboard)/settings/access-actions';
import { BulkReportDialog } from '@/components/records/BulkReportDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, SelectInput, StatusPill, useToast, type BulkAction, type Column, type RowAction, type SelectionInfo } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { bulkTarget, type BulkReport, type ListState, type RecordMeta, type RecordsPage, type Row } from '@/lib/records';
import { RolesDialog } from './RolesDialog';
import { UserSheet } from './UserSheet';

type UserRow = Row & { fullName: string; email: string | null; phone: string | null; status: 'active' | 'invited' | 'disabled'; roles: string[]; kind: string; lastActiveAt: string | null; openSessions: number; mfaOn: boolean; mustChangePassword: boolean };

const STATUS_TONE = { active: 'success', invited: 'info', disabled: 'neutral' } as const;

/** A role's name in the person's language. */
export function useRoleName() {
  const { t } = useI18n();
  return (r: string) => {
    const v = t(`role.${r}` as MessageKey);
    return v === `role.${r}` ? r.replace(/_/g, ' ') : v;
  };
}

/**
 * Settings > Users and access: every account of the institution (record kit list) with its roles, status, two-step
 * sign-in and last activity. A row opens the person's access panel; row actions change roles, give a temporary
 * password, sign out everywhere and disable or enable; bulk actions give or take a role.
 */
export function UsersAccess({ meta, page, state, roles }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; roles: string[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const roleName = useRoleName();
  const [busy, start] = useTransition();
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [password, setPassword] = useState<{ name: string; value: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<UserRow | null>(null);
  const [bulkRole, setBulkRole] = useState<{ op: 'addRole' | 'removeRole'; sel: SelectionInfo } | null>(null);
  const [role, setRole] = useState('');
  const [report, setReport] = useState<{ report: BulkReport; title: string } | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const u = (x: Row) => x as UserRow;

  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: t('ga.users.col.name'),
      sortKey: 'name',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <div className="min-w-0">
          <div className="font-medium">{u(x).fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{[u(x).email, u(x).phone].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    {
      id: 'roles',
      header: t('ga.users.col.roles'),
      cell: (x) => (
        <div className="flex max-w-[320px] flex-wrap gap-1">
          {u(x).roles.length ? u(x).roles.map((r) => <StatusPill key={r} tone={r === 'tenant_admin' || r === 'principal' ? 'info' : 'neutral'}>{roleName(r)}</StatusPill>) : <span className="text-muted-foreground">{t('ga.users.noRoles')}</span>}
        </div>
      ),
    },
    { id: 'status', header: t('ga.users.col.status'), sortKey: 'status', cell: (x) => <StatusPill tone={STATUS_TONE[u(x).status]}>{t(`ga.users.status.${u(x).status}` as MessageKey)}</StatusPill> },
    {
      id: 'mfa',
      header: t('ga.users.col.mfa'),
      hideBelow: 'md',
      cell: (x) => (u(x).mfaOn ? <StatusPill tone="success" icon={<ShieldCheck />}>{t('ga.users.mfaOn')}</StatusPill> : <span className="text-muted-foreground">{t('ga.users.mfaOff')}</span>),
    },
    {
      id: 'lastActive',
      header: t('ga.users.col.lastActive'),
      sortKey: 'lastActive',
      hideBelow: 'sm',
      cell: (x) => (u(x).lastActiveAt ? <span title={fmt.dateTime(u(x).lastActiveAt!)}>{fmt.relative(u(x).lastActiveAt!)}</span> : <span className="text-muted-foreground">{t('ga.users.never')}</span>),
    },
    { id: 'devices', header: t('ga.users.col.devices'), align: 'right', hideBelow: 'md', defaultHidden: true, cell: (x) => fmt.number(u(x).openSessions) },
    { id: 'created', header: t('ga.users.col.created'), sortKey: 'created', hideBelow: 'md', defaultHidden: true, cell: (x) => fmt.date(String(x.createdAt).slice(0, 10), 'short') },
  ];

  const signOut = (x: UserRow) =>
    start(async () => {
      const res = await signOutUser(x.id);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ga.users.signedOut', { n: res.data.signedOut, name: x.fullName }));
      router.refresh();
    });
  const setStatus = (x: UserRow, status: 'active' | 'disabled') =>
    start(async () => {
      const res = await updateRecord('users', x.id, { status });
      if (!res.ok) return toast.error(res.error);
      toast.success(t(status === 'disabled' ? 'ga.users.disabled' : 'ga.users.enabled', { name: x.fullName }));
    });
  const resetPassword = (x: UserRow) =>
    start(async () => {
      const res = await resetUserPassword(x.id);
      setConfirmReset(null);
      if (!res.ok) return toast.error(res.error);
      setPassword({ name: x.fullName, value: res.data.temporaryPassword });
    });

  const rowActions = (x: Row): RowAction<Row>[] => {
    const r = u(x);
    const family = r.kind === 'student' || r.kind === 'guardian';
    return [
      ...(family ? [] : [{ id: 'roles', label: t('ga.users.manageRoles'), icon: <UserCog />, onSelect: () => setEditing(r) }]),
      { id: 'password', label: t('ga.users.tempPassword'), icon: <KeyRound />, onSelect: () => setConfirmReset(r) },
      { id: 'signout', label: t('ga.users.signOutAll'), icon: <LogOut />, disabled: r.openSessions === 0, onSelect: () => signOut(r) },
      r.status === 'disabled'
        ? { id: 'enable', label: t('ga.users.enable'), icon: <UserCheck />, onSelect: () => setStatus(r, 'active') }
        : { id: 'disable', label: t('ga.users.disable'), icon: <UserX />, tone: 'danger' as const, onSelect: () => setStatus(r, 'disabled') },
    ];
  };

  const bulkActions: BulkAction<Row>[] = [
    { id: 'add-role', label: t('ga.users.bulk.addRole'), icon: <ShieldCheck />, onClick: (_rows, sel) => setBulkRole({ op: 'addRole', sel }) },
    { id: 'remove-role', label: t('ga.users.bulk.removeRole'), icon: <ShieldOff />, onClick: (_rows, sel) => setBulkRole({ op: 'removeRole', sel }) },
  ];

  const runBulkRole = () =>
    start(async () => {
      if (!bulkRole || !role) return;
      const title = t(bulkRole.op === 'addRole' ? 'ga.users.bulk.addRole' : 'ga.users.bulk.removeRole');
      const res = await bulkRecords('users', { op: 'action', action: bulkRole.op, params: { role }, target: bulkTarget(bulkRole.sel.target, state) });
      setBulkRole(null);
      setRole('');
      if (!res.ok) return toast.error(res.error);
      setReport({ report: res.data, title });
    });

  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('ga.users.title')}
        columns={columns}
        onView={(x) => setViewing(x.id)}
        extraRowActions={rowActions}
        extraBulkActions={bulkActions}
        empty={
          <EmptyState icon={<UsersRound />} title={t('ga.users.none')} testId="no-users">
            {t('ga.users.noneBody')}
          </EmptyState>
        }
      />
      {viewing && <UserSheet key={sheetKey} id={viewing} onClose={() => setViewing(null)} onEditRoles={(x) => setEditing(x as unknown as UserRow)} />}
      {editing && <RolesDialog user={{ id: editing.id, fullName: editing.fullName, roles: editing.roles }} assignable={roles} onClose={() => setEditing(null)} onSaved={() => {
            setEditing(null);
            setSheetKey((k) => k + 1);
          }} />}
      {confirmReset && (
        <Dialog
          title={t('ga.users.tempPassword')}
          onClose={() => setConfirmReset(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" className="h-9" onClick={() => setConfirmReset(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button className="h-9" onClick={() => resetPassword(confirmReset)} disabled={busy} data-testid="confirm-temp-password">
                {t('ga.users.tempPassword.go')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">{t('ga.users.tempPassword.body', { name: confirmReset.fullName })}</p>
        </Dialog>
      )}
      {password && (
        <Dialog
          title={t('ga.users.tempPassword.done', { name: password.name })}
          onClose={() => setPassword(null)}
          actions={
            <Button className="h-9" onClick={() => setPassword(null)}>
              {t('common.close')}
            </Button>
          }
        >
          <p className="m-0 mb-3 text-sm text-muted-foreground">{t('ga.users.tempPassword.once')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted px-3 py-2 font-mono text-base tracking-wide select-all" data-testid="temp-password">
              {password.value}
            </code>
            <Button variant="outline" className="h-9" onClick={() => void navigator.clipboard?.writeText(password.value).then(() => toast.success(t('ga.copied')))}>
              {t('ga.copy')}
            </Button>
          </div>
        </Dialog>
      )}
      {bulkRole && (
        <Dialog
          title={t(bulkRole.op === 'addRole' ? 'ga.users.bulk.addRole' : 'ga.users.bulk.removeRole')}
          onClose={() => setBulkRole(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" className="h-9" onClick={() => setBulkRole(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button className="h-9" onClick={runBulkRole} disabled={busy || !role}>
                {t('ga.users.bulk.apply', { n: bulkRole.sel.count })}
              </Button>
            </>
          }
        >
          <p className="m-0 mb-4 text-sm text-muted-foreground">{t(bulkRole.op === 'addRole' ? 'ga.users.bulk.addHelp' : 'ga.users.bulk.removeHelp', { n: bulkRole.sel.count })}</p>
          <SelectInput label={t('ga.users.role')} value={role} onChange={(e) => setRole(String(e.target.value))} options={roles.map((r) => ({ value: r, label: roleName(r) }))} empty="" fullWidth />
        </Dialog>
      )}
      {report && <BulkReportDialog report={report.report} title={report.title} onClose={() => setReport(null)} />}
    </>
  );
}
