'use client';

import { FileUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, SelectInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

const PORTALS = ['ssp', 'nsp', 'state', 'central', 'institution', 'other'];

interface Report {
  rows: { applicationNo: string; ok: boolean; message: string; status?: string; disbursedPaise?: number | null }[];
  updated: number;
  notFound: number;
}

/**
 * Imports a scholarship portal's status export (Karnataka SSP, NSP…): applications move to verified, sanctioned or
 * rejected with the portal's own wording; disbursements are listed to receipt against the bank credit.
 */
export function PortalStatusImport() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState('ssp');
  const [csv, setCsv] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const r = await deskSend<Report>('/v1/fee-collect/govt-scholarships/import-status', { portal, csv });
      if (!r.ok) return toast.error(r.error);
      setReport(r.data);
      router.refresh();
    });
  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <FileUp className="size-4" /> {t('ff.ssp.import')}
      </Button>
      {open ? (
        <Dialog
          title={t('ff.ssp.importTitle')}
          size="md"
          busy={pending}
          onClose={() => (setOpen(false), setReport(null), setCsv(''), setName(''))}
          actions={
            report ? (
              <Button onClick={() => (setOpen(false), setReport(null), setCsv(''), setName(''))}>{t('ff.done')}</Button>
            ) : (
              <Button disabled={!csv || pending} onClick={send}>
                {t('ff.ssp.importNow')}
              </Button>
            )
          }
        >
          {report ? (
            <div className="grid gap-2 text-sm" data-testid="portal-import-report">
              <p className="m-0">{t('ff.ssp.result', { updated: report.updated, missing: report.notFound })}</p>
              <ul className="m-0 grid gap-1 p-0">
                {report.rows.map((r) => (
                  <li key={r.applicationNo} className={`list-none ${r.ok ? '' : 'text-destructive'}`}>
                    <span className="font-mono">{r.applicationNo}</span> · {r.message}
                    {r.disbursedPaise ? ` (${fmt.rupees(r.disbursedPaise)})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="m-0 text-sm text-muted-foreground">{t('ff.ssp.importHelp')}</p>
              <SelectInput label={t('fd.col.portal')} value={portal} onChange={(e) => setPortal(e.target.value)} options={PORTALS.map((p) => ({ value: p, label: t(`ff.portal.${p}` as 'ff.portal.ssp') }))} />
              <label className="grid gap-1 text-sm">
                <span>{t('ff.ssp.file')}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setName(f.name);
                    setCsv(await f.text());
                  }}
                />
              </label>
              {name ? <p className="m-0 text-xs text-muted-foreground">{name}</p> : null}
            </div>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
