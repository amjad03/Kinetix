'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addOnboardingItem, loadOnboarding, startOnboarding, tickOnboarding } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/dates';
import type { OnboardingItem, OnboardingProgress } from '@/lib/hr-lifecycle';

import { Alert, Button, Checkbox, MenuItem } from '@/components/kx';
import { cn } from '@/lib/utils';
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('hl.onb.start')}</SectionTitle>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="min-w-[260px]">
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
          </div>
          <Button variant="contained" disabled={pending || !who} onClick={() => run(() => startOnboarding(who), () => setWho(''))}>
            {t('hl.onb.start')}
          </Button>
        </div>
      </div>

      {progress.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('hl.onb.none')}</p>}
      {progress.map((p) => (
        <div className="rounded-[12px] border bg-card p-4" key={p.userId} data-testid="onboarding-row">
          <div className="flex flex-row justify-between items-center gap-4 flex-wrap">
            <div>
              <p className="text-sm leading-[21px] font-semibold">{p.fullName}</p>
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('hl.onb.progress', { done: p.done, total: p.total })}
              </p>
            </div>
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
          </div>
          {open === p.userId && (
            <div className="mt-3">
              {items.map((it) => (
                <div className="flex flex-row items-center" key={it.id}>
                  <Checkbox checked={it.done} disabled={pending} onChange={(e) => run(() => tickOnboarding(it.id, e.target.checked), () => reload(p.userId))} slotProps={{ input: { 'aria-label': it.title } }} />
                  <div>
                    <p className={cn('text-sm leading-[21px]', it.done ? 'line-through' : 'no-underline')}>{it.title}</p>
                    <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {t('hl.onb.owner')}: {it.owner}
                      {it.dueOn ? ` · ${t('hl.onb.due')}: ${formatDate(it.dueOn, 'dayMonth', locale)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
              <FormRow className="gap-2 mt-3">
                <FormField label={t('hl.onb.itemTitle')}>
                  <TextInput value={extra} onChange={(e) => setExtra(e.target.value)} />
                </FormField>
                <Button disabled={pending || extra.trim().length < 3} onClick={() => run(() => addOnboardingItem(p.userId, extra), async () => { setExtra(''); await reload(p.userId); })}>
                  {t('hl.onb.addItem')}
                </Button>
              </FormRow>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
