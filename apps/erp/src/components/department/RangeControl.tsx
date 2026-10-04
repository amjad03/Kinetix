'use client';

import Check from '@mui/icons-material/Check';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deptQuery, MAX_RANGE_DAYS, RANGE_LABEL, type DeptRange, type RangeKey } from '@/lib/department';
import { addDays, daysBetween } from '@/lib/dates';

/** M3 segmented button for the department's range: this week, 30 days, the term, or custom dates. */
export function RangeControl({ deptId, range, today }: { deptId: string | null; range: DeptRange; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const go = (r: DeptRange) => start(() => router.push(`${pathname}?${deptQuery(deptId, r)}`, { scroll: false }));

  return (
    <>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label="Loading" />}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={range.key}
        aria-label="Time range"
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
            {RANGE_LABEL[k]}
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
  const error = !from || !to ? 'Choose both dates.' : from > to ? 'The start must be on or before the end.' : daysBetween(from, to) >= MAX_RANGE_DAYS ? `Choose at most ${MAX_RANGE_DAYS} days.` : null;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) onApply(from, to);
        }}
      >
        <DialogTitle>Custom range</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, min: addDays(today, -730) } }}
              fullWidth
            />
            <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }} fullWidth />
          </Stack>
          <Typography variant="caption" color={error && from && to ? 'error' : 'text.secondary'} component="p" sx={{ mt: 1.5 }}>
            {error && from && to ? error : `Up to ${MAX_RANGE_DAYS} days, about a term.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!!error}>
            Show
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
