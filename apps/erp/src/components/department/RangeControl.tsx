'use client';

import Check from '@mui/icons-material/Check';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { deptQuery, MAX_RANGE_DAYS, RANGE_LABEL, type DeptRange, type RangeKey } from '@/lib/department';
import { addDays, daysBetween } from '@/lib/dates';
import { useI18n } from '@/i18n/client';

/** M3 segmented button for the department's range: this week, 30 days, the term, or custom dates. */
export function RangeControl({ deptId, range, today }: { deptId: string | null; range: DeptRange; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const { t } = useI18n();
  const go = (r: DeptRange) => start(() => router.push(`${pathname}?${deptQuery(deptId, r)}`, { scroll: false }));

  return (
    <>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label={t('common.loading')} />}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={range.key}
        aria-label={t('range.label')}
        data-testid="dept-range"
        onChange={(_, v: RangeKey | null) => {
          if (v === 'custom') setCustom(true);
          else if (v) go({ key: v, from: '', to: '' });
        }}
      >
        {(['week', 'month', 'term', 'custom'] as const).map((k) => (
          <ToggleButton
            key={k}
            value={k}
            sx={{ gap: 0.75, px: 1.75 }}
            // Custom opens the dialog again even when it is already chosen.
            onClick={k === 'custom' && range.key === 'custom' ? () => setCustom(true) : undefined}
          >
            {range.key === k && <Check sx={{ fontSize: 18 }} />}
            {t(RANGE_LABEL[k])}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {custom && (
        <CustomDialog
          range={range}
          today={today}
          onClose={() => setCustom(false)}
          onApply={(from, to) => {
            setCustom(false);
            go({ key: 'custom', from, to });
          }}
        />
      )}
    </>
  );
}

function CustomDialog({ range, today, onClose, onApply }: { range: DeptRange; today: string; onClose: () => void; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const { t } = useI18n();
  const error = !from || !to ? t('dept.range.bothDates') : from > to ? t('dept.range.order') : daysBetween(from, to) >= MAX_RANGE_DAYS ? t('dept.range.max', { n: MAX_RANGE_DAYS }) : null;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) onApply(from, to);
        }}
      >
        <DialogTitle>{t('dept.range.title')}</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <FormField label={t('dept.range.from')}>
              <TextInput
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, min: addDays(today, -730) } }}
                fullWidth
              />
            </FormField>
            <FormField label={t('dept.range.to')}>
              <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }} fullWidth />
            </FormField>
          </Stack>
          <Typography variant="caption" color={error && from && to ? 'error' : 'text.secondary'} component="p" sx={{ mt: 1.5 }}>
            {error && from && to ? error : t('dept.range.help', { n: MAX_RANGE_DAYS })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={!!error}>
            {t('dept.range.show')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
