'use client';

import { useState, useTransition } from 'react';
import { setUserRoles } from '@/app/(dashboard)/settings/access-actions';
import { Checkbox, FormControlLabel } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Dialog, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { FAMILY_ROLES } from '@/lib/governance-access';
import { useRoleName } from './UsersAccess';

/** Groups of roles in the picker, so a long list reads quickly. */
const GROUPS: { key: 'lead' | 'teach' | 'office' | 'campus' | 'care' | 'outside'; roles: string[] }[] = [
  { key: 'lead', roles: ['tenant_admin', 'principal', 'university_admin', 'hod'] },
  { key: 'teach', roles: ['teacher', 'mentor', 'exam_controller', 'examiner', 'quality_officer', 'research_coordinator'] },
  { key: 'office', roles: ['accountant', 'admissions_officer', 'hr_manager', 'librarian', 'placement_officer'] },
  { key: 'campus', roles: ['transport_manager', 'driver', 'hostel_warden', 'canteen_manager', 'store_keeper'] },
  { key: 'care', roles: ['grievance_officer', 'counsellor', 'icc_member'] },
  { key: 'outside', roles: ['external_examiner', 'accreditation_reviewer'] },
];

/** Picks a person's roles. Saving signs them out, so the new roles apply at their next sign-in. */
export function RolesDialog({ user, assignable, onClose, onSaved }: { user: { id: string; fullName: string; roles: string[] }; assignable: string[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const roleName = useRoleName();
  const [busy, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(user.roles.filter((r) => !FAMILY_ROLES.includes(r)));
  const kept = user.roles.filter((r) => FAMILY_ROLES.includes(r));
  const known = new Set(GROUPS.flatMap((g) => g.roles));
  const groups = [...GROUPS.map((g) => ({ ...g, roles: g.roles.filter((r) => assignable.includes(r)) })), { key: 'other' as const, roles: assignable.filter((r) => !known.has(r)) }].filter((g) => g.roles.length);
  const changed = picked.slice().sort().join() !== user.roles.filter((r) => !FAMILY_ROLES.includes(r)).sort().join();

  const save = () =>
    start(async () => {
      const res = await setUserRoles(user.id, picked);
      if (!res.ok) return toast.error(res.error);
      toast.success(res.data.signedOut ? t('ga.roles.savedSignedOut', { name: user.fullName }) : t('ga.roles.saved', { name: user.fullName }));
      onSaved();
    });

  return (
    <Dialog
      size="md"
      title={t('ga.roles.dialogTitle', { name: user.fullName })}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" className="h-9" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button className="h-9" onClick={save} disabled={busy || !changed || picked.length === 0} data-testid="save-roles">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-sm text-muted-foreground">{t('ga.roles.dialogHelp')}</p>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="role-picker">
        {groups.map((g) => (
          <fieldset key={g.key} className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1 text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{t(`ga.roles.group.${g.key}`)}</legend>
            {g.roles.map((r) => (
              <FormControlLabel key={r} className="flex" control={<Checkbox checked={picked.includes(r)} onChange={(_, c) => setPicked((cur) => (c ? [...cur, r] : cur.filter((x) => x !== r)))} />} label={roleName(r)} />
            ))}
          </fieldset>
        ))}
      </div>
      {kept.length > 0 && <p className="m-0 mt-4 text-[12.5px] text-muted-foreground">{t('ga.roles.kept', { roles: kept.map(roleName).join(', ') })}</p>}
      {picked.length === 0 && <p className="m-0 mt-2 text-[12.5px] text-red-ink">{t('ga.roles.atLeastOne')}</p>}
    </Dialog>
  );
}
