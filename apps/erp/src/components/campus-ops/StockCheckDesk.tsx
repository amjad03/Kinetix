'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { closeStockCheck, scanStockCheck, startStockCheck } from '@/app/(dashboard)/records/actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, InlineField, PageHeader, StatGrid, StatTile, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { recordHref, toneOf } from '@/lib/campus-ops';

export interface StockCheck {
  id: string;
  number: string;
  status: 'open' | 'closed' | 'cancelled';
  note: string;
  createdAt: string;
  closedAt: string | null;
  summary: { expected: number; found: number; missingTitles: number } | null;
}

/** Library stock verification: start, scan copies by barcode or ISBN, close to get the shortfall. */
export function StockCheckDesk({ checks }: { checks: StockCheck[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const open = checks.find((c) => c.status === 'open');
  const last = checks.find((c) => c.status === 'closed');

  const begin = () =>
    start(async () => {
      const res = await startStockCheck('');
      if (!res.ok) setMsg({ text: res.error, bad: true });
      router.refresh();
    });
  const scan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!open || !code.trim()) return;
    start(async () => {
      const res = await scanStockCheck(open.id, code);
      setMsg(res.ok ? { text: `${t('cops.sc.scanned', { title: res.data.title, found: res.data.found, copies: res.data.copies })}${res.data.over ? ` · ${t('cops.sc.over')}` : ''}`, bad: res.data.over } : { text: res.error, bad: true });
      setCode('');
      input.current?.focus();
    });
  };
  const close = () =>
    start(async () => {
      if (!open) return;
      const res = await closeStockCheck(open.id);
      if (!res.ok) setMsg({ text: res.error, bad: true });
      else router.push(recordHref('stock-check', open.id));
    });

  const columns: Column<StockCheck>[] = [
    { id: 'number', header: t('cops.sc.number'), cell: (c) => c.number, sort: (c) => c.number, rowHeader: true },
    { id: 'status', header: t('cops.status'), cell: (c) => <StatusPill tone={toneOf(c.status)}>{t(`cops.s.${c.status === 'open' ? 'open' : c.status === 'closed' ? 'closed' : 'cancelled'}`)}</StatusPill>, sort: (c) => c.status },
    { id: 'started', header: t('cops.sc.started'), cell: (c) => c.createdAt.slice(0, 10), sort: (c) => c.createdAt },
    { id: 'expected', header: t('cops.sc.expected'), cell: (c) => c.summary?.expected ?? '', align: 'right' },
    { id: 'found', header: t('cops.sc.found'), cell: (c) => c.summary?.found ?? '', align: 'right' },
    { id: 'missing', header: t('cops.sc.missing'), cell: (c) => c.summary?.missingTitles ?? '', align: 'right' },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('cops.sc.title')}
        subtitle={t('cops.sc.subtitle')}
        actions={
          open ? (
            <Button className="h-10" variant="outline" disabled={pending} onClick={close}>
              {t('cops.a.closeCheck')}
            </Button>
          ) : (
            <Button className="h-10" disabled={pending} onClick={begin}>
              {t('cops.sc.start')}
            </Button>
          )
        }
      />
      {last?.summary && (
        <StatGrid>
          <StatTile label={t('cops.sc.expected')} value={String(last.summary.expected)} />
          <StatTile label={t('cops.sc.found')} value={String(last.summary.found)} />
          <StatTile label={t('cops.sc.missing')} value={String(last.summary.missingTitles)} />
        </StatGrid>
      )}
      {open && (
        <Card title={open.number}>
          <form onSubmit={scan}>
            <InlineField
              actions={
                <Button type="submit" className="h-10" disabled={pending || !code.trim()}>
                  {t('cops.sc.scan')}
                </Button>
              }
            >
              <TextInput inputRef={input} autoFocus label={t('cops.sc.code')} value={code} onChange={(e) => setCode(e.target.value)} />
            </InlineField>
          </form>
        </Card>
      )}
      {msg && (
        <p role="status" className={msg.bad ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {msg.text}
        </p>
      )}
      <Card title={t('cops.sc.history')}>
        <DataTable label={t('cops.sc.history')} columns={columns} rows={checks} rowId={(c) => c.id} rowHref={(c) => recordHref('stock-check', c.id)} empty={t('cops.none')} />
      </Card>
    </div>
  );
}
