'use client';

import { LogOut, ShieldOff, UserCog } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { getAccessUser, resetUserMfa, revokeUserSession, signOutUser } from '@/app/(dashboard)/settings/access-actions';
import { Button } from '@/components/shadcn/button';
import { Sheet, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { deviceName, FAMILY_ROLES, type AccessUser } from '@/lib/governance-access';
import { useRoleName } from './UsersAccess';

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <h3 className="m-0 text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One person's access: roles, departments, two-step sign-in, signed-in devices and recent sign-ins. */
export function UserSheet({ id, onClose, onEditRoles }: { id: string; onClose: () => void; onEditRoles: (u: { id: string; fullName: string; roles: string[] }) => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const roleName = useRoleName();
  const [user, setUser] = useState<AccessUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const reload = useCallback(
    () =>
      start(async () => {
        const res = await getAccessUser(id);
        if (res.ok) setUser(res.data);
        else setError(res.error);
      }),
    [id],
  );
  useEffect(reload, [reload]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error);
      toast.success(done);
      const again = await getAccessUser(id);
      if (again.ok) setUser(again.data);
    });

  const u = user;
  return (
    <Sheet open title={u?.fullName ?? t('ga.users.loading')} subtitle={u ? [u.email, u.phone].filter(Boolean).join(' · ') : undefined} onClose={onClose} width={560}>
      {error && <p className="m-0 text-sm text-red-ink">{error}</p>}
      {!u && !error && <p className="m-0 text-sm text-muted-foreground">{t('ga.users.loading')}</p>}
      {u && (
        <div data-testid="user-sheet">
          <div className="mb-6 flex flex-wrap gap-2">
            <StatusPill tone={u.status === 'active' ? 'success' : u.status === 'invited' ? 'info' : 'neutral'}>{t(`ga.users.status.${u.status}` as MessageKey)}</StatusPill>
            {u.mustChangePassword && <StatusPill tone="warning">{t('ga.users.mustChange')}</StatusPill>}
            <StatusPill tone="neutral">{t('ga.users.since', { date: fmt.date(u.createdAt.slice(0, 10), 'short') })}</StatusPill>
          </div>

          <Section
            title={t('ga.users.col.roles')}
            action={
              u.roles.some((r) => !FAMILY_ROLES.includes(r)) || u.roles.length === 0 ? (
                <Button size="sm" variant="outline" className="h-8" onClick={() => onEditRoles({ id: u.id, fullName: u.fullName, roles: u.roles })}>
                  <UserCog />
                  {t('ga.users.manageRoles')}
                </Button>
              ) : undefined
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {u.roles.length ? u.roles.map((r) => <StatusPill key={r}>{roleName(r)}</StatusPill>) : <span className="text-sm text-muted-foreground">{t('ga.users.noRoles')}</span>}
            </div>
            {(u.departments.length > 0 || u.headOf.length > 0) && (
              <p className="m-0 mt-3 text-[13px] text-muted-foreground">
                {u.departments.length > 0 && t('ga.users.departments', { list: u.departments.map((d) => d.name).join(', ') })}
                {u.headOf.length > 0 && ` ${t('ga.users.heads', { list: u.headOf.map((d) => d.name).join(', ') })}`}
              </p>
            )}
          </Section>

          <Section
            title={t('ga.users.col.mfa')}
            action={
              u.mfaOn ? (
                <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => run(() => resetUserMfa(u.id), t('ga.users.mfaReset'))}>
                  <ShieldOff />
                  {t('ga.users.resetMfa')}
                </Button>
              ) : undefined
            }
          >
            <p className="m-0 text-sm">{u.mfaOn ? t('ga.users.mfaOnLong') : t('ga.users.mfaOffLong')}</p>
          </Section>

          <Section
            title={t('ga.users.sessions', { n: u.sessions.length })}
            action={
              u.sessions.length > 0 ? (
                <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => run(() => signOutUser(u.id), t('ga.users.signedOut', { n: u.sessions.length, name: u.fullName }))}>
                  <LogOut />
                  {t('ga.users.signOutAll')}
                </Button>
              ) : undefined
            }
          >
            {u.sessions.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{t('ga.users.noSessions')}</p>
            ) : (
              <ul className="m-0 list-none divide-y rounded-md border p-0">
                {u.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{deviceName(s) || t('ga.users.unknownDevice')}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('ga.users.sessionSeen', { when: fmt.relative(s.lastSeenAt) })}
                        {s.ip ? ` · ${s.ip}` : ''}
                        {s.mfaVerified ? ` · ${t('ga.users.mfaOn')}` : ''}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => run(() => revokeUserSession(u.id, s.id), t('ga.users.sessionEnded'))}>
                      {t('ga.users.signOutDevice')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('ga.users.recentSignIns')}>
            {u.signIns.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{t('ga.users.noSignIns')}</p>
            ) : (
              <ul className="m-0 list-none p-0 text-sm">
                {u.signIns.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
                    <span>{fmt.dateTime(s.at)}</span>
                    <StatusPill tone={s.action === 'auth.sign_in' ? 'success' : 'danger'}>{t(`ga.signin.${s.action.replace('auth.', '')}` as MessageKey)}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Sheet>
  );
}
