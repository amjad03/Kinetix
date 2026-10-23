'use client';
import { useState, useTransition } from 'react';
import { askInsight } from '@/app/(dashboard)/ai/insight-actions';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { InsightKind, InsightResponse } from '@/lib/ai-insight';

import { Alert, Button, CircularProgress } from '@/components/kx';
import { Sparkles as AutoAwesomeOutlined } from 'lucide-react';
function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{title}</h6>
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        {items.map((x, i) => (
          <li key={i}>
            <p className="text-[13px] leading-[19px]">{x}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Ask Zynetix AI": a summary of this page's domain figures, always labelled as an AI draft. */
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
    <Card className="mb-6"
      title={t('aiq.title')}
      subtitle={t(`aiq.${kind}` as MessageKey)}
      testId={`ai-insight-${kind}`}
      action={
        <Button variant="outlined" size="small" startIcon={pending ? <CircularProgress size={16} /> : <AutoAwesomeOutlined />} onClick={ask} disabled={pending} data-testid="ai-insight-ask">
          {t(res ? 'aiq.again' : 'aiq.ask')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
          {t('aiq.privacy')}
        </span>
        {error && <Alert severity="error">{error}</Alert>}
        {res && (
          <div className="flex flex-col gap-3" data-testid="ai-insight-result">
            <div className="flex flex-row gap-2 items-center flex-wrap">
              <StatusPill tone="warning">{t('aiq.draft')}</StatusPill>
            </div>
            {res.meta.preview && <Alert severity="info">{t('aiq.preview')}</Alert>}
            <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{res.result.headline}</h6>
            <Bullets title={t('aiq.highlights')} items={res.result.highlights} />
            <Bullets title={t('aiq.risks')} items={res.result.risks} />
            <Bullets title={t('aiq.suggestions')} items={res.result.suggestions} />
          </div>
        )}
      </div>
    </Card>
  );
}
