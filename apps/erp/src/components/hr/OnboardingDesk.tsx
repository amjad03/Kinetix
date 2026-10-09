'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addOnboardingItem, loadOnboarding, startOnboarding, tickOnboarding } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/dates';
import type { OnboardingItem, OnboardingProgress } from '@/lib/hr-lifecycle';

/** Joining checklists: who is being onboarded, how far along, and the items to tick. */
export function OnboardingDesk({ progress, staff }: { progress: OnboardingProgress[]; staff: { userId: string; fullName: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [who, setWho] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [extra, setExtra] = useState('');
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => Promise<void> | void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        await after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  const reload = async (userId: string) => {
    const res = await loadOnboarding(userId);
    if (res.ok) setItems(res.data);
    else setError(res.error);
  };
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('hl.onb.start')}</SectionTitle>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-end' } }}>
          <Box sx={{ minWidth: 260 }}>
            <FormField label={t('hl.staff')}>
              <TextInput select value={who} onChange={(e) => setWho(e.target.value)}>
                <MenuItem value="">{t('hl.chooseStaff')}</MenuItem>
                {staff.map((s) => (
                  <MenuItem key={s.userId} value={s.userId}>
                    {s.fullName}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
          </Box>
          <Button variant="contained" disabled={pending || !who} onClick={() => run(() => startOnboarding(who), () => setWho(''))}>
            {t('hl.onb.start')}
          </Button>
        </Stack>
      </Paper>

      {progress.length === 0 && <Typography color="text.secondary">{t('hl.onb.none')}</Typography>}
      {progress.map((p) => (
        <Paper key={p.userId} variant="outlined" sx={{ p: 2 }} data-testid="onboarding-row">
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>{p.fullName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hl.onb.progress', { done: p.done, total: p.total })}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={async () => {
                if (open === p.userId) return setOpen(null);
                setOpen(p.userId);
                await reload(p.userId);
              }}
            >
              {t('hl.onb.open')}
            </Button>
          </Stack>
          {open === p.userId && (
            <Box sx={{ mt: 1.5 }}>
              {items.map((it) => (
                <Stack key={it.id} direction="row" sx={{ alignItems: 'center' }}>
                  <Checkbox checked={it.done} disabled={pending} onChange={(e) => run(() => tickOnboarding(it.id, e.target.checked), () => reload(p.userId))} slotProps={{ input: { 'aria-label': it.title } }} />
                  <Box>
                    <Typography sx={{ textDecoration: it.done ? 'line-through' : 'none' }}>{it.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('hl.onb.owner')}: {it.owner}
                      {it.dueOn ? ` · ${t('hl.onb.due')}: ${formatDate(it.dueOn, 'dayMonth', locale)}` : ''}
                    </Typography>
                  </Box>
                </Stack>
              ))}
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'flex-end' }}>
                <FormField label={t('hl.onb.itemTitle')}>
                  <TextInput value={extra} onChange={(e) => setExtra(e.target.value)} />
                </FormField>
                <Button disabled={pending || extra.trim().length < 3} onClick={() => run(() => addOnboardingItem(p.userId, extra), async () => { setExtra(''); await reload(p.userId); })}>
                  {t('hl.onb.addItem')}
                </Button>
              </Stack>
            </Box>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
