'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import {
  assignSubstitute,
  cancelSubstitution,
  loadSubstitutions,
  suggestSubstitutes,
  type Candidate,
  type NeededPeriod,
  type SubstitutionRow,
} from '@/app/(dashboard)/timetable/substitution-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

/** Periods of teachers on approved leave that day: pick a free teacher of the same subject or department. */
export function SubstitutionsPanel({ today }: { today: string }) {
  const { t } = useI18n();
  const [date, setDate] = useState(today);
  const [needed, setNeeded] = useState<NeededPeriod[] | null>(null);
  const [assigned, setAssigned] = useState<SubstitutionRow[]>([]);
  const [suggest, setSuggest] = useState<{ slotId: string; list: Candidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = async (d: string) => {
    const res = await loadSubstitutions(d);
    if (!res.ok) return setError(res.error);
    setNeeded(res.data.needed);
    setAssigned(res.data.assigned);
    setSuggest(null);
  };
  const go = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      await fn();
    });
  const time = (a: string, b: string) => `${a.slice(0, 5)}-${b.slice(0, 5)}`;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mt: 3 }} data-testid="substitutions">
      <SectionTitle flush>{t('sub.title')}</SectionTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('sub.help')}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', mb: 2 }}>
        <FormField label={t('sub.date')}>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <Button variant="outlined" size="small" disabled={pending || !date} onClick={() => go(() => reload(date))}>
          {t('sub.show')}
        </Button>
      </Stack>

      {needed && (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">{t('sub.needed')}</Typography>
          {needed.length === 0 && <Typography color="text.secondary">{t('sub.none')}</Typography>}
          {needed.map((p) => (
            <Box key={p.slotId} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ flex: '1 1 220px' }}>
                  <strong>{time(p.startsAt, p.endsAt)}</strong> · {p.section} · {p.subject} · {t('sub.away', { name: p.teacher })}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={pending}
                  onClick={() =>
                    go(async () => {
                      const res = await suggestSubstitutes(p.slotId, date);
                      if (res.ok) setSuggest({ slotId: p.slotId, list: res.data });
                      else setError(res.error);
                    })
                  }
                >
                  {t('sub.suggest')}
                </Button>
              </Stack>
              {suggest?.slotId === p.slotId && (
                <Stack direction="row" sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap' }}>
                  {suggest.list.length === 0 && <Typography variant="body2" color="text.secondary">{t('sub.noFree')}</Typography>}
                  {suggest.list.map((c) => (
                    <Chip
                      key={c.id}
                      clickable
                      color={c.match === 'subject' ? 'primary' : 'default'}
                      label={`${c.fullName} · ${t(`sub.match.${c.match}` as MessageKey)} · ${t('sub.periods', { n: c.periodsThatDay })}`}
                      onClick={() =>
                        go(async () => {
                          const res = await assignSubstitute(p.slotId, date, c.id);
                          if (res.ok) await reload(date);
                          else setError(res.error);
                        })
                      }
                    />
                  ))}
                </Stack>
              )}
            </Box>
          ))}

          <Typography variant="subtitle2" sx={{ pt: 1 }}>
            {t('sub.assigned')}
          </Typography>
          {assigned.length === 0 && <Typography color="text.secondary">{t('sub.noneAssigned')}</Typography>}
          {assigned.map((a) => (
            <Stack key={a.id} direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ flex: '1 1 220px' }}>
                <strong>{time(a.startsAt, a.endsAt)}</strong> · {a.section.displayName} · {a.subject.name} · {a.originalTeacher} → {a.substituteTeacher}
              </Typography>
              <Button
                size="small"
                color="error"
                disabled={pending}
                onClick={() =>
                  go(async () => {
                    const res = await cancelSubstitution(a.id);
                    if (res.ok) await reload(date);
                    else setError(res.error);
                  })
                }
              >
                {t('sub.cancel')}
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
