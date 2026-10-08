'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { savePolicy, setFeature } from '@/app/(dashboard)/settings/security/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { FeatureFlag } from '@/lib/insights';

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
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Card sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {t('security.policy')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3 }}>
          {assignableRoles.map((r) => (
            <FormControlLabel
              key={r}
              control={<Checkbox checked={roles.includes(r)} onChange={(e) => setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))} />}
              label={ROLE_LABEL[r] ? t(ROLE_LABEL[r]) : r}
            />
          ))}
        </Box>
        <Button variant="contained" disabled={pending} onClick={() => run(() => savePolicy(roles))} sx={{ mt: 1.5 }}>
          {t('security.policy.save')}
        </Button>
      </Card>
      <Card sx={{ p: 3 }}>
        <Typography variant="h6" component="h2">
          {t('security.features')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('security.features.lead')}
        </Typography>
        <Stack data-testid="features">
          {features.map((f) => (
            <FormControlLabel
              key={f.key}
              control={<Switch checked={f.enabled} disabled={pending} onChange={(e) => run(() => setFeature(f.key, e.target.checked))} />}
              label={label(f.key)}
            />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
