import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton, ReceiptPrintStyles } from '@/components/fees/PrintReceipt';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { StructureSheet } from '@/lib/fee-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.sheetTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The fee-structure sheet to print or hand to families: heads, optional heads, totals and the instalments. */
export default async function StructurePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('fees');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, fmt } = await getI18n();
  const data = await load(() => api<StructureSheet>(`/v1/fee-setup/structures/${id}/print`));
  if (data.error !== undefined) return <ErrorState title={t('fx.sheetTitle')} message={data.error} />;
  const d = data.data;
  const s = d.structure;
  const scope = [s.program, s.campus, s.term ? t('fx.sem', { n: s.term }) : null, s.batch, s.quota, s.category].filter(Boolean).join(' · ');
  return (
    <>
      <ReceiptPrintStyles />
      <div className="kx-noprint mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" className="h-9">
          <Link href={`/fees/structures/${id}`}>{t('fd.one.structures')}</Link>
        </Button>
        <PrintButton />
      </div>
      <Card className="kx-receipt mx-auto max-w-[760px] p-5 md:p-10">
        <div data-testid="structure-sheet">
          <div className="text-center">
            <h2 className="m-0 text-xl font-semibold">{d.institution}</h2>
            <p className="m-0 mt-1 text-sm font-semibold uppercase">{t('fx.sheetTitle')}</p>
            <p className="m-0 mt-2 text-base font-medium">{s.name}</p>
            <p className="m-0 text-sm text-muted-foreground">{[s.academicYear, scope].filter(Boolean).join(' · ')}</p>
          </div>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">{t('fx.col.head')}</th>
                <th className="py-2 font-medium">{t('fx.col.notes')}</th>
                <th className="py-2 text-right font-medium">{t('fx.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.code} className="border-b">
                  <td className="py-2">{i.head}</td>
                  <td className="py-2 text-xs text-muted-foreground">{[i.optional ? t('fx.optionalNote') : null, !i.refundable ? t('fx.nonRefundable') : null, i.gstRate > 0 ? t('fx.gstRate', { rate: i.gstRate }) : null].filter(Boolean).join(' · ')}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.rupees(i.amountPaise)}</td>
                </tr>
              ))}
              {s.perCreditPaise > 0 && (
                <tr className="border-b">
                  <td className="py-2">{t('fx.creditFee')}</td>
                  <td className="py-2 text-xs text-muted-foreground">{t('fx.perCredit')}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.rupees(s.perCreditPaise)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-semibold" colSpan={2}>
                  {t('fx.compulsoryTotal')}
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums">{fmt.rupees(d.compulsoryPaise)}</td>
              </tr>
              {d.optionalPaise > 0 && (
                <tr>
                  <td className="pt-1 text-muted-foreground" colSpan={2}>
                    {t('fx.optionalTotal')}
                  </td>
                  <td className="pt-1 text-right tabular-nums text-muted-foreground">{fmt.rupees(d.optionalPaise)}</td>
                </tr>
              )}
            </tfoot>
          </table>
          {d.plan && (
            <>
              <h3 className="m-0 mt-6 text-sm font-semibold">{t('fx.instalmentsOf', { name: d.plan.name })}</h3>
              <ol className="m-0 mt-2 grid gap-1 pl-5 text-sm">
                {d.plan.parts.map((p, i) => (
                  <li key={i}>{t('fx.instalmentLine', { percent: p.percent, amount: fmt.rupees(p.amountPaise), days: p.dueAfterDays })}</li>
                ))}
              </ol>
            </>
          )}
          <p className="m-0 mt-6 text-xs text-muted-foreground">{t('fx.sheetFooter', { days: s.dueInDays })}</p>
        </div>
      </Card>
    </>
  );
}
