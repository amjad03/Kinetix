'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { runPromotion } from '@/app/(dashboard)/students/actions';
import { useI18n } from '@/i18n/client';
import type { PromotionResult } from '@/lib/admissions';

export interface PromotionClass {
  id: string;
  name: string;
  programId: string;
  term: number;
  students: number;
  /** The program's last term: these classes graduate instead of moving on. */
  final: boolean;
}

/**
 * Yearly promotion: pick the destination for each class (or graduation for final-term classes),
 * preview the outcome, then run it. Students not active (on leave, detained) are skipped.
 */
export function PromotionTool({ classes }: { classes: PromotionClass[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    // A sensible default: the same-lettered class of the next term, if there is one.
    const out: Record<string, string> = {};
    for (const c of classes) {
      if (c.final) out[c.id] = 'graduate';
      else {
        const next = classes.find((x) => x.programId === c.programId && x.term === c.term + 1 && x.name.slice(-1) === c.name.slice(-1)) ?? classes.find((x) => x.programId === c.programId && x.term === c.term + 1);
        if (next) out[c.id] = next.id;
      }
    }
    return out;
  });
  const [preview, setPreview] = useState<PromotionResult | null>(null);
  const [done, setDone] = useState<PromotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mappings = Object.entries(targets).filter(([, v]) => v).map(([from, to]) => ({ fromSectionId: from, toSectionId: to === 'graduate' ? null : to }));
  const go = (dryRun: boolean) =>
    start(async () => {
      setError(null);
      const res = await runPromotion({ label, mappings, dryRun });
      if (!res.ok) return setError(res.error);
      if (dryRun) setPreview(res.data);
      else {
        setDone(res.data);
        setPreview(null);
        router.refresh();
      }
    });
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {done && (
        <Alert severity="success">
          {t('stu.promo.done', { promoted: done.promoted, detained: done.detained, graduated: done.graduated, skipped: done.skipped })}
        </Alert>
      )}
      <FormField label={t('stu.promo.label')}>
        <TextInput helperText={t('stu.promo.labelHelp')} value={label} onChange={(e) => { setLabel(e.target.value); setPreview(null); }} sx={{ maxWidth: 420 }} />
      </FormField>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'center' }}>
          {classes.map((c) => (
            <Box key={c.id} sx={{ display: 'contents' }}>
              <Typography variant="body2">
                {c.name} · {t('stu.promo.students', { n: c.students })}
              </Typography>
              <TextField
                select
                size="small"
                value={targets[c.id] ?? ''}
                onChange={(e) => {
                  setTargets({ ...targets, [c.id]: e.target.value });
                  setPreview(null);
                }}
                aria-label={c.name}
              >
                <MenuItem value="">{t('stu.promo.skip')}</MenuItem>
                {c.final && <MenuItem value="graduate">{t('stu.promo.graduate')}</MenuItem>}
                {!c.final &&
                  classes
                    .filter((x) => x.programId === c.programId && x.term === c.term + 1)
                    .map((x) => (
                      <MenuItem key={x.id} value={x.id}>
                        {x.name}
                      </MenuItem>
                    ))}
              </TextField>
            </Box>
          ))}
        </Box>
      </Paper>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" disabled={pending || mappings.length === 0 || label.trim().length < 3} onClick={() => go(true)}>
          {t('stu.promo.preview')}
        </Button>
        <Button variant="contained" disabled={pending || !preview || label.trim().length < 3} onClick={() => go(false)}>
          {t('stu.promo.run')}
        </Button>
      </Stack>
      {preview && <Alert severity="info">{t('stu.promo.preview.result', { promoted: preview.promoted, detained: preview.detained, graduated: preview.graduated, skipped: preview.skipped })}</Alert>}
    </Stack>
  );
}
