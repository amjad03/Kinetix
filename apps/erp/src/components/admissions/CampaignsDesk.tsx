'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCampaign, setCampaignActive } from '@/app/(dashboard)/admissions/deep-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

interface Line {
  enquiries: number;
  applied: number;
  enrolled: number;
  lost: number;
  conversionPct: number;
}
export interface CampaignReport {
  campaigns: (Line & { id: string; name: string; channel: string; utmCampaign: string | null; active: boolean; budgetPaise: number; costPerEnrolmentPaise: number | null })[];
  unattributed: Line;
}

const rupees = (paise: number, locale: string) => new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

/** Campaigns and their conversion: enquiries, applications, enrolments and cost per enrolment. */
export function CampaignsDesk({ report }: { report: CampaignReport }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: '', channel: '', utmSource: '', utmMedium: '', utmCampaign: '', budget: '0' });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('camp.new')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => createCampaign({ name: f.name, channel: f.channel, utmSource: f.utmSource, utmMedium: f.utmMedium, utmCampaign: f.utmCampaign, budgetRupees: Number(f.budget) }), () => setF({ name: '', channel: '', utmSource: '', utmMedium: '', utmCampaign: '', budget: '0' }));
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('camp.name')} required>
            <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </FormField>
          <FormField label={t('camp.channel')} required>
            <TextInput value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} required />
          </FormField>
          <FormField label={t('camp.budget')}>
            <TextInput type="number" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          </FormField>
          <FormField label={t('camp.utmSource')}>
            <TextInput value={f.utmSource} onChange={(e) => setF({ ...f, utmSource: e.target.value })} />
          </FormField>
          <FormField label={t('camp.utmMedium')}>
            <TextInput value={f.utmMedium} onChange={(e) => setF({ ...f, utmMedium: e.target.value })} />
          </FormField>
          <FormField label={t('camp.utmCampaign')} helper={t('camp.utmHelp')}>
            <TextInput value={f.utmCampaign} onChange={(e) => setF({ ...f, utmCampaign: e.target.value })} />
          </FormField>
          <Box>
            <Button type="submit" variant="contained" disabled={pending || f.name.trim().length < 2 || f.channel.trim().length < 2}>
              {t('camp.create')}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" data-testid="campaign-report">
          <TableHead>
            <TableRow>
              <TableCell>{t('camp.name')}</TableCell>
              <TableCell align="right">{t('camp.col.enquiries')}</TableCell>
              <TableCell align="right">{t('camp.col.applied')}</TableCell>
              <TableCell align="right">{t('camp.col.enrolled')}</TableCell>
              <TableCell align="right">{t('camp.col.conversion')}</TableCell>
              <TableCell align="right">{t('camp.budget')}</TableCell>
              <TableCell align="right">{t('camp.col.cost')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {report.campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.name}
                  <Typography variant="caption" color="text.secondary" component="div">
                    {c.channel}
                    {c.utmCampaign ? ` · ${c.utmCampaign}` : ''}
                  </Typography>
                </TableCell>
                <TableCell align="right">{c.enquiries}</TableCell>
                <TableCell align="right">{c.applied}</TableCell>
                <TableCell align="right">{c.enrolled}</TableCell>
                <TableCell align="right">{c.conversionPct}%</TableCell>
                <TableCell align="right">{rupees(c.budgetPaise, locale)}</TableCell>
                <TableCell align="right">{c.costPerEnrolmentPaise == null ? '–' : rupees(c.costPerEnrolmentPaise, locale)}</TableCell>
                <TableCell>
                  <Button size="small" disabled={pending} onClick={() => run(() => setCampaignActive(c.id, !c.active))}>
                    {c.active ? <StatusPill tone="success">{t('camp.active')}</StatusPill> : <StatusPill tone="neutral">{t('camp.paused')}</StatusPill>}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <em>{t('camp.unattributed')}</em>
              </TableCell>
              <TableCell align="right">{report.unattributed.enquiries}</TableCell>
              <TableCell align="right">{report.unattributed.applied}</TableCell>
              <TableCell align="right">{report.unattributed.enrolled}</TableCell>
              <TableCell align="right">{report.unattributed.conversionPct}%</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
      {report.campaigns.length === 0 && <Typography color="text.secondary">{t('camp.none')}</Typography>}
    </Stack>
  );
}
