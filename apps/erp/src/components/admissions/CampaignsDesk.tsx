'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCampaign, setCampaignActive } from '@/app/(dashboard)/admissions/deep-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

import { Alert, Button, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('camp.new')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(3,1fr)] gap-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => createCampaign({ name: f.name, channel: f.channel, utmSource: f.utmSource, utmMedium: f.utmMedium, utmCampaign: f.utmCampaign, budgetRupees: Number(f.budget) }), () => setF({ name: '', channel: '', utmSource: '', utmMedium: '', utmCampaign: '', budget: '0' }));
          }}
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
          <div>
            <Button type="submit" variant="contained" disabled={pending || f.name.trim().length < 2 || f.channel.trim().length < 2}>
              {t('camp.create')}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-[12px] border bg-card overflow-x-auto">
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
                  <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {c.channel}
                    {c.utmCampaign ? ` · ${c.utmCampaign}` : ''}
                  </div>
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
      </div>
      {report.campaigns.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('camp.none')}</p>}
    </div>
  );
}
