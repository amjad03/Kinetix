'use client';

import { Ban, Check, Copy, Eye, RotateCcw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { copyRoleAccess, resetRoleAccess, saveRoleAccess } from '@/app/(dashboard)/settings/access-actions';
import { Button } from '@/components/shadcn/button';
import { Card, CountBadge, Dialog, EmptyState, SelectInput, StatusPill, SwitchField, Tabs, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { changesOf, draftFor, groupModules, levelOf, narrowedCount, type AccessLevel, type AccessMatrix, type RulesHistoryEntry } from '@/lib/governance-access';
import { cn } from '@/lib/utils';
import { useRoleName } from './UsersAccess';

const LEVEL_ICON = { full: <Check />, read: <Eye />, none: <Ban /> } as const;
const LEVEL_CLASS = { full: 'text-green-ink', read: 'text-amber-ink', none: 'text-red-ink' } as const;

/** Full, view only or no access, as three buttons that behave as one radio group. */
function LevelControl({ value, onChange, label, disabled }: { value: AccessLevel; onChange: (v: AccessLevel) => void; label: string; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border bg-card">
      {(['full', 'read', 'none'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          aria-label={t(`ga.level.${l}`)}
          disabled={disabled}
          onClick={() => onChange(l)}
          className={cn(
            'inline-flex items-center gap-1.5 border-r px-2.5 text-[13px] last:border-r-0 disabled:opacity-50 [&_svg]:size-3.5',
            value === l ? (l === 'full' ? 'bg-green-soft text-green-ink' : l === 'read' ? 'bg-amber-soft text-amber-ink' : 'bg-red-soft text-red-ink') : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {LEVEL_ICON[l]}
          <span className="hidden sm:inline">{t(`ga.level.${l}`)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Settings > Roles and permissions: for each staff role, which modules it keeps, may only view, or loses. The rules
 * narrow what a role can do on every screen and app; they never give more. Overview shows every role at once,
 * History who changed what.
 */
export function RoleMatrix({ matrix, history, canEditPrincipal }: { matrix: AccessMatrix; history: RulesHistoryEntry[]; canEditPrincipal: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const roleName = useRoleName();
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<'role' | 'overview' | 'history'>('role');
  const [role, setRole] = useState(matrix.roles.find((r) => r.key === 'teacher')?.key ?? matrix.roles[0]?.key ?? '');
  const [drafts, setDrafts] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [showAll, setShowAll] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [resetting, setResetting] = useState<'role' | 'all' | null>(null);
  const [allRoles, setAllRoles] = useState(false);

  const draft = drafts[role] ?? draftFor(matrix, role);
  const changes = changesOf(matrix, role, draft);
  const locked = role === 'principal' && !canEditPrincipal;
  const groups = useMemo(() => groupModules(matrix.modules.filter((m) => showAll || m.usedBy.includes(role) || levelOf(matrix.rules, role, m.key) !== 'full')), [matrix, role, showAll]);
  const set = (module: string, level: AccessLevel) => setDrafts((d) => ({ ...d, [role]: { ...draft, [module]: level } }));

  const save = () =>
    start(async () => {
      const res = await saveRoleAccess(role, changes);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ga.matrix.saved', { role: roleName(role), n: res.data.changed }));
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== role)));
      router.refresh();
    });
  const copy = (from: string) =>
    start(async () => {
      const res = await copyRoleAccess(from, role);
      setCopying(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ga.matrix.copied', { from: roleName(from), role: roleName(role) }));
      setDrafts({});
      router.refresh();
    });
  const reset = (which: 'role' | 'all') =>
    start(async () => {
      const res = await resetRoleAccess(which === 'role' ? role : undefined);
      setResetting(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ga.matrix.resetDone', { n: res.data.changed }));
      setDrafts({});
      router.refresh();
    });

  const roleList = (
    <nav aria-label={t('ga.matrix.roles')} className="hidden xl:block">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {matrix.roles.map((r) => {
          const n = narrowedCount(matrix.rules, r.key);
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => setRole(r.key)}
                aria-current={role === r.key ? 'true' : undefined}
                className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm', role === r.key ? 'bg-muted font-semibold' : 'hover:bg-muted/60')}
              >
                <span className="min-w-0 truncate">
                  {roleName(r.key)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{fmt.number(r.people)}</span>
                </span>
                {(n > 0 || drafts[r.key]) && <CountBadge count={Math.max(n, 1)} tone={drafts[r.key] ? 'warning' : 'info'} label={t('ga.matrix.narrowed')} />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const shownRoles = matrix.roles.filter((r) => allRoles || r.people > 0 || narrowedCount(matrix.rules, r.key) > 0);

  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        label={t('ga.roles.title')}
        items={[
          { value: 'role', label: t('ga.matrix.tab.role') },
          { value: 'overview', label: t('ga.matrix.tab.overview') },
          { value: 'history', label: t('ga.matrix.tab.history'), count: history.length || undefined },
        ]}
      />
      {tab === 'role' && (
        <div className="mt-5 grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
          {roleList}
          <div className="min-w-0">
            <div className="mb-4 flex flex-col gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-[17px] font-semibold">{roleName(role)}</h2>
                <p className="m-0 text-[13px] text-muted-foreground">{t('ga.matrix.roleHelp', { n: narrowedCount(matrix.rules, role) })}</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full sm:w-72 xl:hidden">
                  <SelectInput label={t('ga.matrix.role')} value={role} onChange={(e) => setRole(String(e.target.value))} options={matrix.roles.map((r) => ({ value: r.key, label: `${roleName(r.key)} (${fmt.number(r.people)})` }))} fullWidth />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" className="h-9" disabled={busy || locked} onClick={() => setCopying('')}>
                    <Copy />
                    {t('ga.matrix.copyFrom')}
                  </Button>
                  <Button variant="outline" className="h-9" disabled={busy || locked || narrowedCount(matrix.rules, role) === 0} onClick={() => setResetting('role')}>
                    <RotateCcw />
                    {t('ga.matrix.resetRole')}
                  </Button>
                </div>
              </div>
            </div>
            {locked && <p className="m-0 mb-4 rounded-md bg-amber-soft px-3 py-2 text-[13px] text-amber-ink">{t('ga.matrix.principalLocked')}</p>}
            <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
              <SwitchField label={t('ga.matrix.showAll')} checked={showAll} onChange={setShowAll} />
            </div>
            {groups.length === 0 ? (
              <EmptyState icon={<ShieldCheck />} title={t('ga.matrix.noModules')}>
                {t('ga.matrix.noModulesBody')}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-4" data-testid="role-modules">
                {groups.map((g) => (
                  <Card key={g.group} title={t(`ga.group.${g.group}` as MessageKey)} padded={false}>
                    <ul className="m-0 list-none divide-y p-0">
                      {g.modules.map((m) => {
                        const used = m.usedBy.includes(role);
                        const was = levelOf(matrix.rules, role, m.key);
                        return (
                          <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{t(`ga.module.${m.key}` as MessageKey)}</div>
                              <div className="text-xs text-muted-foreground">
                                {used ? t('ga.matrix.used') : t('ga.matrix.notUsed')}
                                {draft[m.key] !== was && <span className="ml-1.5 font-medium text-amber-ink">{t('ga.matrix.unsaved')}</span>}
                              </div>
                            </div>
                            <LevelControl value={draft[m.key] ?? 'full'} onChange={(l) => set(m.key, l)} label={t(`ga.module.${m.key}` as MessageKey)} disabled={busy || locked} />
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
            {changes.length > 0 && (
              <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-card" data-testid="matrix-savebar">
                <span className="text-sm">{t('ga.matrix.pending', { n: changes.length })}</span>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-9" disabled={busy} onClick={() => setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== role)))}>
                    {t('ga.matrix.discard')}
                  </Button>
                  <Button className="h-9" disabled={busy} onClick={save} data-testid="matrix-save">
                    {t('ga.matrix.save')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="mt-5">
          <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-[13px] text-muted-foreground">
              {(['full', 'read', 'none'] as const).map((l) => (
                <span key={l} className={cn('inline-flex items-center gap-1 [&_svg]:size-3.5', LEVEL_CLASS[l])}>
                  {LEVEL_ICON[l]}
                  <span className="text-muted-foreground">{t(`ga.level.${l}`)}</span>
                </span>
              ))}
              <span>· {t('ga.matrix.notUsedShort')}</span>
            </div>
            <div className="flex items-center gap-3">
              <SwitchField label={t('ga.matrix.allRoles')} checked={allRoles} onChange={setAllRoles} />
              <Button variant="outline" className="h-9" disabled={busy || matrix.rules.length === 0} onClick={() => setResetting('all')}>
                <RotateCcw />
                {t('ga.matrix.resetAll')}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card" data-testid="matrix-overview">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="sticky left-0 z-[1] min-w-[180px] bg-card px-3 py-2 text-left font-semibold">
                    {t('ga.matrix.module')}
                  </th>
                  {shownRoles.map((r) => (
                    <th key={r.key} scope="col" className="px-2 py-2 text-center align-bottom font-medium whitespace-nowrap">
                      <button type="button" className="hover:underline" onClick={() => (setRole(r.key), setTab('role'))}>
                        {roleName(r.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupModules(matrix.modules).map((g) => (
                  <Fragment key={g.group}>
                    <tr className="bg-muted/30">
                      <th colSpan={shownRoles.length + 1} scope="colgroup" className="sticky left-0 px-3 py-1.5 text-left text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                        {t(`ga.group.${g.group}` as MessageKey)}
                      </th>
                    </tr>
                    {g.modules.map((m) => (
                      <tr key={m.key} className="border-b last:border-b-0">
                        <th scope="row" className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-normal">
                          {t(`ga.module.${m.key}` as MessageKey)}
                        </th>
                        {shownRoles.map((r) => {
                          const l = levelOf(matrix.rules, r.key, m.key);
                          const used = m.usedBy.includes(r.key);
                          return (
                            <td key={r.key} className="px-2 py-2 text-center">
                              {!used && l === 'full' ? (
                                <span className="text-muted-foreground" aria-label={t('ga.matrix.notUsedShort')}>
                                  ·
                                </span>
                              ) : (
                                <span className={cn('inline-flex [&_svg]:size-4', LEVEL_CLASS[l])} title={t(`ga.level.${l}`)} aria-label={t(`ga.level.${l}`)}>
                                  {LEVEL_ICON[l]}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="mt-5">
          {history.length === 0 ? (
            <EmptyState icon={<RotateCcw />} title={t('ga.matrix.noHistory')}>
              {t('ga.matrix.noHistoryBody')}
            </EmptyState>
          ) : (
            <Card padded={false}>
              <ul className="m-0 list-none divide-y p-0" data-testid="matrix-history">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {roleName(h.data?.role ?? '')}
                        {h.data?.copiedFrom && <span className="ml-1.5 font-normal text-muted-foreground">{t('ga.matrix.copiedFrom', { role: roleName(h.data.copiedFrom) })}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {h.actor ?? t('audit.system')} · {fmt.dateTime(h.at)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(h.data?.changes ?? {}).map(([mod, c]) => (
                        <StatusPill key={mod} tone={c.after === 'none' ? 'danger' : c.after === 'read' ? 'warning' : 'success'}>
                          {t(`ga.module.${mod}` as MessageKey)}: {t(`ga.level.${c.before}`)} → {t(`ga.level.${c.after}`)}
                        </StatusPill>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {copying !== null && (
        <Dialog
          title={t('ga.matrix.copyTitle', { role: roleName(role) })}
          onClose={() => setCopying(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" className="h-9" onClick={() => setCopying(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button className="h-9" disabled={busy || !copying} onClick={() => copy(copying)}>
                {t('ga.matrix.copy')}
              </Button>
            </>
          }
        >
          <p className="m-0 mb-4 text-sm text-muted-foreground">{t('ga.matrix.copyHelp', { role: roleName(role) })}</p>
          <SelectInput
            label={t('ga.matrix.copyFromRole')}
            value={copying}
            onChange={(e) => setCopying(String(e.target.value))}
            options={matrix.roles.filter((r) => r.key !== role).map((r) => ({ value: r.key, label: `${roleName(r.key)} (${t('ga.matrix.narrowedN', { n: narrowedCount(matrix.rules, r.key) })})` }))}
            empty=""
            fullWidth
          />
        </Dialog>
      )}
      {resetting && (
        <Dialog
          title={resetting === 'role' ? t('ga.matrix.resetRoleTitle', { role: roleName(role) }) : t('ga.matrix.resetAllTitle')}
          onClose={() => setResetting(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" className="h-9" onClick={() => setResetting(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" className="h-9" disabled={busy} onClick={() => reset(resetting)}>
                {t('ga.matrix.resetGo')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">{resetting === 'role' ? t('ga.matrix.resetRoleBody') : t('ga.matrix.resetAllBody')}</p>
        </Dialog>
      )}
    </>
  );
}
