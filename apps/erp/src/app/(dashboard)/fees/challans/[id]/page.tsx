import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CancelChallan } from '@/components/fee-depth/CancelChallan';
import { PrintButton, ReceiptPrintStyles } from '@/components/fees/PrintReceipt';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { Card, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { toneOf } from '@/lib/fee-desk';
import type { ChallanView } from '@/lib/fee-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.challan') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COPIES = ['fx.copy.bank', 'fx.copy.institution', 'fx.copy.student'] as const;

/** A bank challan to print in three copies (bank, institution, student), and its state. */
export default async function ChallanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('fees');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, fmt } = await getI18n();
  const data = await load(() => api<ChallanView>(`/v1/fee-collect/challans/${id}`));
  if (data.error !== undefined) return <ErrorState title={t('fx.challan')} message={data.error} />;
  const d = data.data;
  const c = d.challan;
  const expired = c.status === 'issued' && c.validUntil < new Date().toISOString().slice(0, 10);
  const status = expired ? 'expired' : c.status;
  return (
    <>
      <ReceiptPrintStyles />
      <div className="kx-noprint mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="h-9">
            <Link href="/fees/challans">{t('fd.nav.challans')}</Link>
          </Button>
          <StatusPill tone={toneOf(status)}>{t(`fd.st.${status}` as MessageKey)}</StatusPill>
          {d.receiptNo && (
            <Link className="text-sm underline" href={`/fees/receipt/${c.receiptId}`}>
              {d.receiptNo}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === 'issued' && <CancelChallan id={c.id} />}
          <PrintButton />
        </div>
      </div>
      <div className="grid gap-6" data-testid="challan">
        {COPIES.map((copy) => (
          <Card key={copy} className="kx-receipt mx-auto w-full max-w-[760px] p-5 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="m-0 text-lg font-semibold">{d.institution}</h2>
                <p className="m-0 text-sm">{t('fx.challanFor', { bank: c.bankName })}</p>
                {c.bankAccount && <p className="m-0 text-sm text-muted-foreground">{t('fx.creditAccount', { account: c.bankAccount })}</p>}
              </div>
              <div className="text-right text-sm">
                <p className="m-0 text-xs font-semibold uppercase">{t(copy)}</p>
                <p className="m-0 font-mono font-semibold">{c.number}</p>
                <p className="m-0 text-muted-foreground">{t('fx.validUntil', { date: fmt.date(c.validUntil, 'short') })}</p>
              </div>
            </div>
            <p className="m-0 mt-4 text-sm">
              {d.student.fullName} · {d.student.rollNo} · {d.student.section}
            </p>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="py-1.5">{l.headName}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt.rupees(l.balancePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-semibold">{t('fx.payAtBank')}</td>
                  <td className="pt-2 text-right font-semibold tabular-nums">{fmt.rupees(c.amountPaise)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="m-0 mt-2 text-sm">{d.inWords}</p>
            <div className="mt-6 grid grid-cols-2 gap-6 text-xs text-muted-foreground">
              <span className="border-t pt-1">{t('fx.depositorSign')}</span>
              <span className="border-t pt-1 text-right">{t('fx.bankSeal')}</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
