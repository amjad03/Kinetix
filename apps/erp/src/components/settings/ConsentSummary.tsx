'use client';

import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { SegmentBar } from '@/components/Bars';
import { DataTable } from '@/components/ui';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { consentShares, type ConsentSummary } from '@/lib/settings';

/** Per purpose: how many students' families agreed, said no, or have not answered yet. */
export function ConsentSummaryView({ summary }: { summary: ConsentSummary }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState(false);
  return (
    <Box component="section" aria-labelledby="consent-title" id="consent" data-testid="consent-summary">
      <SectionTitle id="consent-title">
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <ShieldOutlined fontSize="small" /> {t('consent.title')}
        </Box>
      </SectionTitle>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820, mb: 1.5 }}>
        {t('consent.subtitle')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip size="small" variant="outlined" label={t('consent.notice', { version: summary.noticeVersion })} data-testid="consent-version" />
        <Chip size="small" variant="outlined" label={t('consent.students', { n: summary.students })} data-testid="consent-students" />
      </Box>
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
                  <Typography variant="subtitle2">{t(`consent.purpose.${p.purpose}`)}</Typography>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ maxWidth: 440 }}>
                    {t(`consent.purpose.${p.purpose}.help`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ maxWidth: 440, fontStyle: 'italic' }}>
                    {t(`consent.purpose.${p.purpose}.no`)}
                  </Typography>
                </>
              ),
            },
            { id: 'granted', header: t('consent.col.granted'), align: 'right', sort: (p) => p.granted, cell: (p) => <span data-testid="consent-granted">{p.granted}</span> },
            { id: 'withdrawn', header: t('consent.col.withdrawn'), align: 'right', sort: (p) => p.withdrawn, cell: (p) => <Box component="span" sx={{ color: p.withdrawn ? 'error.main' : undefined }} data-testid="consent-withdrawn">{p.withdrawn}</Box> },
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
                      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                        {t('consent.of', { pct: share.granted, n: summary.students })}
                      </Typography>
                    )}
                  </>
                );
              },
            },
          ]}
        />
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5, maxWidth: 820 }}>
        {t('consent.notAskedNote')}
      </Typography>
      <Button sx={{ mt: 1.5, ml: -1 }} onClick={() => setNotice((v) => !v)} endIcon={notice ? <ExpandLess /> : <ExpandMore />} aria-expanded={notice} data-testid="consent-notice-toggle">
        {notice ? t('consent.hideNotice') : t('consent.readNotice')}
      </Button>
      <Collapse in={notice}>
        <Box sx={{ mt: 1, p: 2.5, borderRadius: '12px', bgcolor: 'm3.surfaceContainerLow', maxWidth: 820 }} data-testid="consent-notice">
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5, fontStyle: 'italic' }}>
            {t('consent.noticeDraft')}
          </Typography>
          <NoticeSection title={t('notice.who.title')} lines={[t('notice.who.school'), t('notice.who.college'), t('notice.who.change')]} />
          <NoticeSection title={t('notice.where.title')} lines={[t('notice.where.body')]} />
          <NoticeSection title={t('notice.contact.title')} lines={[t('notice.contact.body')]} />
        </Box>
      </Collapse>
    </Box>
  );
}

function NoticeSection({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Box sx={{ '& + &': { mt: 2 } }}>
      <Typography variant="subtitle2" component="h3">
        {title}
      </Typography>
      {lines.map((l) => (
        <Typography key={l} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {l}
        </Typography>
      ))}
    </Box>
  );
}
