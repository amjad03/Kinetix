'use client';
import { useState, useTransition } from 'react';
import { savePolicy, setFeature } from '@/app/(dashboard)/settings/security/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { FeatureFlag } from '@/lib/insights';

import { Alert, Button, Card, Checkbox, FormControlLabel, Switch } from '@/components/kx';
const ROLE_LABEL: Record<string, MessageKey> = {
  tenant_admin: 'role.tenant_admin',
  principal: 'role.principal',
  accountant: 'role.accountant',
  hr_manager: 'role.hr_manager',
  admissions_officer: 'role.admissions_officer',
  store_keeper: 'role.store_keeper',
};

/** Feature toggles and the institution's two-step sign-in policy (administrators only). */
export function SecurityAdmin({ features, requiredRoles, assignableRoles }: { features: FeatureFlag[]; requiredRoles: string[]; assignableRoles: string[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>(requiredRoles);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? null));
    });
  const label = (key: string) => t(`feature.${key}` as MessageKey);

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <Card className="p-5">
        <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-2">
          {t('security.policy')}
        </h2>
        <div className="flex flex-wrap gap-x-6">
          {assignableRoles.map((r) => (
            <FormControlLabel
              key={r}
              control={<Checkbox checked={roles.includes(r)} onChange={(e) => setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))} />}
              label={ROLE_LABEL[r] ? t(ROLE_LABEL[r]) : r}
            />
          ))}
        </div>
        <Button className="mt-3" variant="contained" disabled={pending} onClick={() => run(() => savePolicy(roles))}>
          {t('security.policy.save')}
        </Button>
      </Card>
      <Card className="p-5">
        <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
          {t('security.features')}
        </h2>
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-2">
          {t('security.features.lead')}
        </p>
        <div className="flex flex-col" data-testid="features">
          {features.map((f) => (
            <FormControlLabel
              key={f.key}
              control={<Switch checked={f.enabled} disabled={pending} onChange={(e) => run(() => setFeature(f.key, e.target.checked))} />}
              label={label(f.key)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
