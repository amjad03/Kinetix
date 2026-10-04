import ArrowForward from '@mui/icons-material/ArrowForward';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { IssueFeeButton } from '@/components/fees/IssueFeeDialog';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { feeClasses } from '@/lib/fees';
import { formatRupees, formatRupeesShort } from '@/lib/money';
import { schoolToday } from '@/lib/school';
import type { FeeSummary } from '@/lib/types';

export const metadata: Metadata = { title: 'Fees' };

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
/** The exact amount, when the tile shows it shortened (₹9.26 L). */
const exact = (paise: number) => (formatRupeesShort(paise) === formatRupees(paise) ? '' : ` · ${formatRupees(paise)}`);

export default async function FeesPage() {
  await requireSection('fees');
  const [summary, classes] = await Promise.all([load(() => api<FeeSummary>('/v1/fees/summary')), load(feeClasses)]);
  const today = schoolToday();
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle="What has been billed, collected and is still due, class by class"
        actions={
          <>
            <LinkButton href="/fees/invoices" variant="outlined" startIcon={<ReceiptLongOutlined />}>
              Invoices
            </LinkButton>
            <IssueFeeButton classes={classes.data ?? []} today={today} />
          </>
        }
      />
      {summary.error !== undefined ? (
        <ErrorState message={summary.error} />
      ) : s!.classes.length === 0 ? (
        <EmptyState icon={<PaymentsOutlined />} title="No fees issued yet" testId="no-fees">
          Issue a fee to a class: every student gets an invoice, and families can see it in the KINETIX Parent app.
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label="Billed" value={formatRupeesShort(s!.billedPaise)} caption={formatRupees(s!.billedPaise)} testId="fee-billed" />
            <StatTile
              label="Collected"
              value={formatRupeesShort(s!.collectedPaise)}
              caption={`${pct(s!.collectedPaise, s!.billedPaise).toFixed(1)}% of billed${exact(s!.collectedPaise)}`}
              bar={<MiniBar value={pct(s!.collectedPaise, s!.billedPaise)} color="kx.success" label="Share of billed fees collected" />}
              testId="fee-collected"
            />
            <StatTile
              label="Outstanding"
              value={formatRupeesShort(s!.outstandingPaise)}
              caption={`${s!.openInvoices} open invoices${exact(s!.outstandingPaise)}`}
              testId="fee-outstanding"
            />
            <StatTile
              label="Overdue"
              value={formatRupeesShort(s!.overduePaise)}
              tone={s!.overduePaise > 0 ? 'warning' : 'default'}
              caption={s!.overdueInvoices > 0 ? `${s!.overdueInvoices} invoices past the due date${exact(s!.overduePaise)}` : 'Nothing is overdue'}
              testId="fee-overdue"
            />
          </StatGrid>

          <SectionTitle
            action={
              <LinkButton href="/fees/invoices" endIcon={<ArrowForward />} size="small">
                All invoices
              </LinkButton>
            }
          >
            By class
          </SectionTitle>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableFrame testId="fee-classes">
              <Table sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell align="right">Billed</TableCell>
                    <TableCell align="right">Collected</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell align="right">Open</TableCell>
                    <TableCell align="right">Overdue</TableCell>
                    <TableCell aria-label="Invoices" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {s!.classes.map((c) => {
                    const share = pct(c.collectedPaise, c.billedPaise);
                    return (
                      <TableRow key={c.sectionId} hover data-testid="fee-class-row">
                        <TableCell>
                          <Typography variant="subtitle2">{c.className}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRupees(c.billedPaise)}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>
                            <Box sx={{ width: 64 }}>
                              <MiniBar value={share} color="kx.success" label={`${share.toFixed(0)}% collected`} />
                            </Box>
                            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 96 }}>
                              {formatRupees(c.collectedPaise)}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRupees(c.outstandingPaise)}
                        </TableCell>
                        <TableCell align="right">{c.open}</TableCell>
                        <TableCell align="right" sx={{ color: c.overdue ? 'error.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
                          {c.overdue ? (
                            <>
                              <Box component="span" sx={{ fontWeight: 500 }}>
                                {formatRupees(c.overduePaise)}
                              </Box>
                              <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                {c.overdue} invoices
                              </Typography>
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                          <LinkButton href={`/fees/invoices?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} aria-label={`Invoices for ${c.className}`}>
                            Invoices
                          </LinkButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          </Box>
          {/* Phones: one card per class instead of a wide table. */}
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }} data-testid="fee-classes-list">
            {s!.classes.map((c) => (
              <Box key={c.sectionId} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                    {c.className}
                  </Typography>
                  {c.overdue > 0 && (
                    <Typography variant="body2" sx={{ color: 'error.main', whiteSpace: 'nowrap' }}>
                      {formatRupees(c.overduePaise)} overdue
                    </Typography>
                  )}
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {formatRupees(c.outstandingPaise)} outstanding
                </Typography>
                <Box sx={{ my: 1 }}>
                  <MiniBar value={pct(c.collectedPaise, c.billedPaise)} color="kx.success" label={`${pct(c.collectedPaise, c.billedPaise).toFixed(0)}% collected`} />
                </Box>
                <Typography variant="caption" color="text.secondary" component="p">
                  {formatRupees(c.collectedPaise)} collected of {formatRupees(c.billedPaise)} · {c.open} open
                </Typography>
                <LinkButton href={`/fees/invoices?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} sx={{ mt: 1, ml: -1 }}>
                  Invoices
                </LinkButton>
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}
