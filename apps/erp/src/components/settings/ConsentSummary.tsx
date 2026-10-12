'use client';
import { useState } from 'react';
import { SegmentBar } from '@/components/Bars';
import { DataTable } from '@/components/ui';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { consentShares, type ConsentSummary } from '@/lib/settings';

import { Button, Chip, Collapse } from '@/components/kx';
import { ChevronDown as ExpandMore, ChevronUp as ExpandLess, Shield as ShieldOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
/** Per purpose: how many students' families agreed, said no, or have not answered yet. */
export function ConsentSummaryView({ summary }: { summary: ConsentSummary }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState(false);
  return (
    <section aria-labelledby="consent-title" id="consent" data-testid="consent-summary">
      <SectionTitle id="consent-title">
        <span className="inline-flex items-center gap-2">
          <ShieldOutlined className="size-5" /> {t('consent.title')}
        </span>
      </SectionTitle>
      <p className="text-[13px] leading-[19px] text-muted-foreground max-w-[820px] mb-3">
        {t('consent.subtitle')}
      </p>
      <div className="flex gap-2 flex-wrap mb-4">
        <Chip size="small" variant="outlined" label={t('consent.notice', { version: summary.noticeVersion })} data-testid="consent-version" />
        <Chip size="small" variant="outlined" label={t('consent.students', { n: summary.students })} data-testid="consent-students" />
      </div>
      <DataTable
          testId="consent-table"
          label={t('consent.col.purpose')}
          rows={summary.purposes}
          rowId={(p) => p.purpose}
          exportName="consent-summary"
          bare
          rowAttrs={(p) => ({ 'data-testid': 'consent-row', 'data-purpose': p.purpose })}
          columns={[
            {
              id: 'purpose',
              header: t('consent.col.purpose'),
              rowHeader: true,
              sort: (p) => t(`consent.purpose.${p.purpose}`),
              cell: (p) => (
                <>
                  <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t(`consent.purpose.${p.purpose}`)}</h6>
                  <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground max-w-[440px]">
                    {t(`consent.purpose.${p.purpose}.help`)}
                  </p>
                  <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground max-w-[440px] italic">
                    {t(`consent.purpose.${p.purpose}.no`)}
                  </p>
                </>
              ),
            },
            { id: 'granted', header: t('consent.col.granted'), align: 'right', sort: (p) => p.granted, cell: (p) => <span data-testid="consent-granted">{p.granted}</span> },
            { id: 'withdrawn', header: t('consent.col.withdrawn'), align: 'right', sort: (p) => p.withdrawn, cell: (p) => <span className={cn(p.withdrawn ? 'text-red-ink' : '')} data-testid="consent-withdrawn">{p.withdrawn}</span> },
            { id: 'notAsked', header: t('consent.col.notAsked'), align: 'right', sort: (p) => p.notAsked, cell: (p) => <span data-testid="consent-not-asked">{p.notAsked}</span> },
            {
              id: 'share',
              header: '',
              csv: false,
              width: 200,
              cell: (p) => {
                const share = consentShares(p);
                return (
                  <>
                    <SegmentBar
                      label={t('consent.bar', { granted: p.granted, withdrawn: p.withdrawn, notAsked: p.notAsked })}
                      parts={[
                        { value: p.granted, color: 'kx.success' },
                        { value: p.withdrawn, color: 'error.main' },
                        { value: p.notAsked, color: 'm3.outlineVariant' },
                      ]}
                    />
                    {share && (
                      <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-1 tabular-nums">
                        {t('consent.of', { pct: share.granted, n: summary.students })}
                      </p>
                    )}
                  </>
                );
              },
            },
          ]}
        />
      <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3 max-w-[820px]">
        {t('consent.notAskedNote')}
      </p>
      <Button className="mt-3 -ml-2" onClick={() => setNotice((v) => !v)} endIcon={notice ? <ExpandLess /> : <ExpandMore />} aria-expanded={notice} data-testid="consent-notice-toggle">
        {notice ? t('consent.hideNotice') : t('consent.readNotice')}
      </Button>
      <Collapse in={notice}>
        <div className="mt-2 p-5 rounded-[12px] bg-muted max-w-[820px]" data-testid="consent-notice">
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mb-3 italic">
            {t('consent.noticeDraft')}
          </p>
          <NoticeSection title={t('notice.who.title')} lines={[t('notice.who.school'), t('notice.who.college'), t('notice.who.change')]} />
          <NoticeSection title={t('notice.where.title')} lines={[t('notice.where.body')]} />
          <NoticeSection title={t('notice.contact.title')} lines={[t('notice.contact.body')]} />
        </div>
      </Collapse>
    </section>
  );
}

function NoticeSection({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="[&+&]:mt-4">
      <h3 className="text-sm leading-5 font-medium tracking-[0.1px]">
        {title}
      </h3>
      {lines.map((l) => (
        <p className="text-[13px] leading-[19px] text-muted-foreground mt-1" key={l}>
          {l}
        </p>
      ))}
    </div>
  );
}
