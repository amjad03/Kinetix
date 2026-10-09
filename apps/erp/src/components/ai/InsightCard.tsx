'use client';

import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { askInsight } from '@/app/(dashboard)/ai/insight-actions';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { InsightKind, InsightResponse } from '@/lib/ai-insight';

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Stack spacing={0.5}>
      <Typography variant="subtitle2">{title}</Typography>
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        {items.map((x, i) => (
          <li key={i}>
            <Typography variant="body2">{x}</Typography>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

/** "Ask KINETIX AI": a summary of this page's domain figures, always labelled as an AI draft. */
export function InsightCard({ kind }: { kind: InsightKind }) {
  const { t } = useI18n();
  const [res, setRes] = useState<InsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      const r = await askInsight(kind);
      if (r.ok) {
        setRes(r.data);
        setError(null);
      } else setError(r.error);
    });

  return (
    <Card
      title={t('aiq.title')}
      subtitle={t(`aiq.${kind}` as MessageKey)}
      testId={`ai-insight-${kind}`}
      sx={{ mb: 3 }}
      action={
        <Button variant="outlined" size="small" startIcon={pending ? <CircularProgress size={16} /> : <AutoAwesomeOutlined />} onClick={ask} disabled={pending} data-testid="ai-insight-ask">
          {t(res ? 'aiq.again' : 'aiq.ask')}
        </Button>
      }
    >
      <Stack spacing={1.5}>
        <Typography variant="caption" color="text.secondary">
          {t('aiq.privacy')}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {res && (
          <Stack spacing={1.5} data-testid="ai-insight-result">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill tone="warning">{t('aiq.draft')}</StatusPill>
            </Stack>
            {res.meta.preview && <Alert severity="info">{t('aiq.preview')}</Alert>}
            <Typography variant="subtitle1">{res.result.headline}</Typography>
            <Bullets title={t('aiq.highlights')} items={res.result.highlights} />
            <Bullets title={t('aiq.risks')} items={res.result.risks} />
            <Bullets title={t('aiq.suggestions')} items={res.result.suggestions} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
