'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { Card, SelectInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

type Opt = { value: string; label: string };

/** Bus passes as PDFs: one rider's pass, or every pass of a route for printing. */
export function PassLinks({ riders, routes }: { riders: Opt[]; routes: Opt[] }) {
  const { t } = useI18n();
  const [rider, setRider] = useState('');
  const [route, setRoute] = useState('');
  const row = (label: string, options: Opt[], value: string, set: (v: string) => void, href: string, testId: string) => (
    <div className="flex items-end gap-3">
      <SelectInput className="min-w-0 flex-1" label={label} value={value} onChange={(e) => set(e.target.value)} options={options} empty={t('lht.choose')} />
      <Button asChild={!!value} variant="outline" disabled={!value} data-testid={testId}>
        {value ? (
          <a href={href} download>
            <Download />
            {t('lht.download')}
          </a>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Download />
            {t('lht.download')}
          </span>
        )}
      </Button>
    </div>
  );
  return (
    <Card title={t('lht.tr.passes')} testId="lht-passes">
      <p className="mt-0 mb-4 text-sm text-muted-foreground">{t('lht.tr.passesHint')}</p>
      <div className="grid gap-4">
        {row(t('lht.f.rider'), riders, rider, setRider, `/api/lht-file?kind=bus-pass&id=${rider}`, 'lht-pass-one')}
        {row(t('lht.f.route'), routes, route, setRoute, `/api/lht-file?kind=route-passes&id=${route}`, 'lht-pass-route')}
      </div>
    </Card>
  );
}
