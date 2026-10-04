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

export default async function FeesPage() {
  await requireSection('fees');
  const summary = await load(() => api<FeeSummary>('/v1/fees/summary'));
  const classes = await load(() => feeClasses(summary.data));
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
              caption={`${pct(s!.collectedPaise, s!.billedPaise).toFixed(1)}% of billed · ${formatRupees(s!.collectedPaise)}`}
              bar={<MiniBar value={pct(s!.collectedPaise, s!.billedPaise)} color="kx.success" label="Share of billed fees collected" />}
              testId="fee-collected"
            />
            <StatTile
              label="Outstanding"
              value={formatRupeesShort(s!.outstandingPaise)}
              caption={`${s!.openInvoices} open invoices · ${formatRupees(s!.outstandingPaise)}`}
              testId="fee-outstanding"
            />
            <StatTile
              label="Overdue"
              value={s!.overdueInvoices}
              unit="invoices"
              tone={s!.overdueInvoices > 0 ? 'warning' : 'default'}
              caption={s!.overdueInvoices > 0 ? 'Past the due date and not fully paid' : 'Nothing is overdue'}
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
                      <TableCell align="right" sx={{ color: c.overdue ? 'error.main' : 'text.secondary', fontWeight: c.overdue ? 500 : 400 }}>
                        {c.overdue}
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
        </>
      )}
    </>
  );
}
