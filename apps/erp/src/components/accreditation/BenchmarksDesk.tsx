'use client';

import { useState, useTransition } from 'react';
import { saveSettings } from '@/app/(dashboard)/accreditation/actions';
import { Button } from '@/components/kx';
import { Card, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { fig } from '@/lib/accreditation-ui';

export interface BenchRow {
  code: string;
  title: string;
  unit: string;
  bench: number | null;
  catalogue: number | null;
  dir: 'high' | 'low';
}

/**
 * Benchmarks a metric scores against. NIRF scales several sub-parameters against the best institution of the category,
 * so the quality team sets them to last year's category leaders; for NAAC and NBA they are the values that earn full marks.
 */
export function BenchmarksDesk({ fw, rows }: { fw: string; rows: BenchRow[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.code, r.bench !== null && r.bench !== r.catalogue ? String(r.bench) : ''])));
  const save = () =>
    start(async () => {
      const bench: Record<string, number> = {};
      for (const [k, x] of Object.entries(v)) if (x.trim() !== '' && Number(x) > 0) bench[k] = Number(x);
      const res = await saveSettings(fw, bench);
      if (res.ok) toast.success(t('acx.s.saved'));
      else toast.error(res.error);
    });
  return (
    <Card title={t('acx.s.title')} subtitle={t('acx.s.sub')} padded={false} testId="acx-bench">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">{t('acx.d.metric')}</th>
              <th className="px-4 py-2 font-medium">{t('acx.s.catalogue')}</th>
              <th className="px-4 py-2 font-medium">{t('acx.s.yours')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <b>{r.code}</b> <span className="text-muted-foreground">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">{r.dir === 'low' ? t('acx.s.lower') : t('acx.s.higher')}</span>
                </td>
                <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                  {fig(r.catalogue)} {r.unit}
                </td>
                <td className="w-[180px] px-4 py-2">
                  <TextInput aria-label={`${r.code} ${t('acx.s.yours')}`} inputMode="decimal" placeholder={fig(r.catalogue)} value={v[r.code] ?? ''} onChange={(e) => setV({ ...v, [r.code]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t px-4 py-3">
        <Button variant="contained" disabled={pending} onClick={save}>
          {t('acx.s.save')}
        </Button>
      </div>
    </Card>
  );
}
