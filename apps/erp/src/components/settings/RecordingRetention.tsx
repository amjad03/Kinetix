'use client';

import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useState, useTransition } from 'react';
import { DataTable, FieldRow, FormField, TextInput } from '@/components/ui';
import { saveRetentionGraceDays } from '@/app/(dashboard)/settings/retention-actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { expiringFirst, parseGraceDays, totalExpiring, type RetentionOverview } from '@/lib/retention';

/** "Keep class recordings until N days after the semester ends", and per class what goes in the next 30 days. */
export function RecordingRetention({ overview }: { overview: RetentionOverview }) {
  const { t, fmt } = useI18n();
  const [saved, setSaved] = useState(overview.graceDays);
  const [value, setValue] = useState(String(overview.graceDays));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const days = parseGraceDays(value);
  const soon = expiringFirst(overview.classes).filter((c) => c.expiringSoon > 0);

  const save = () => {
    if (days === null) return;
    setError(null);
    start(async () => {
      const res = await saveRetentionGraceDays(days);
      if (!res.ok) return setError(res.error);
      setSaved(res.data.recordingRetentionGraceDays);
      setValue(String(res.data.recordingRetentionGraceDays));
      setToast(t('retention.saved', { n: res.data.recordingRetentionGraceDays }));
    });
  };

  return (
    <>
      <SectionTitle>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <VideocamOutlined fontSize="small" /> {t('retention.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="retention" data-grace={saved} aria-busy={pending}>
        <Box sx={{ px: 2.5, py: 2 }}>
          {error && (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="subtitle1" component="p" sx={{ lineHeight: '24px' }} data-testid="retention-summary">
            {t('retention.grace', { n: saved })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {t('retention.graceHelp')}
          </Typography>
          <Box sx={{ mt: 2 }}>
          <FieldRow>
            <FormField label={t('retention.graceLabel')}>
              <TextInput
                value={value}
                onChange={(e) => setValue(e.target.value)}
                error={days === null}
                helperText={days === null ? t('retention.graceProblem') : ' '}
                sx={{ width: 260 }}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'retention-days' }, input: { endAdornment: <InputAdornment position="end">0–90</InputAdornment> } }}
              />
            </FormField>
            <Button variant="contained" onClick={save} disabled={pending || days === null || days === saved} data-testid="retention-save">
              {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : t('retention.save')}
            </Button>
          </FieldRow>
          </Box>
        </Box>
        <Divider />
        <Box sx={{ px: 2.5, py: 2 }} data-testid="retention-overview" data-expiring={totalExpiring(overview.classes)}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
            {t('retention.overview')}
          </Typography>
          {soon.length === 0 ? (
            <Typography variant="body2" color="text.secondary" data-testid="retention-nothing">
              {t('retention.nothingSoon')}
            </Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <DataTable
                label={t('retention.overview')}
                rows={soon}
                rowId={(c) => String(c.sectionId)}
                columns={[
                  { id: 'c0', header: t('retention.class'), rowHeader: true, sort: (c) => c.sectionName, cell: (c) => c.sectionName },
                  { id: 'c1', header: t('retention.expiring'), align: 'right', sort: (c) => c.expiringSoon, cell: (c) => fmt.number(c.expiringSoon) },
                  { id: 'c2', header: t('retention.next'), sort: (c) => c.nextExpiresOn ?? '', cell: (c) => c.nextExpiresOn ? fmt.date(c.nextExpiresOn, 'short') : t('retention.none') },
                  { id: 'c3', header: t('retention.kept'), align: 'right', sort: (c) => c.kept, cell: (c) => fmt.number(c.kept) },
                  { id: 'c4', header: t('retention.total'), align: 'right', sort: (c) => c.total, cell: (c) => fmt.number(c.total) },
                ]}
              />
            </Box>
          )}
          {overview.noTerm.count > 0 && (
            <Alert severity="info" sx={{ mt: 2 }} data-testid="retention-no-term">
              {t.plural('retention.noTerm', overview.noTerm.count)}{' '}
              <Link component={NextLink} href="/calendar">
                {t('retention.noTermHint')}
              </Link>
              <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                {overview.noTerm.recordings.slice(0, 10).map((r) => (
                  <li key={r.id} data-testid="retention-no-term-item">
                    {r.title} · {r.sectionName ?? t('retention.noClass')} · {r.teacherName} · {fmt.date(r.startedAt.slice(0, 10), 'short')}
                  </li>
                ))}
              </Box>
            </Alert>
          )}
        </Box>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
