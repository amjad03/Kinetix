import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { formatRupees, METHOD_LABEL, rupeesInWords } from '@/lib/money';
import type { FeeReceipt } from '@/lib/types';

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: { xs: 0, sm: 2 }, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 500 : 400, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** A fee receipt: on screen after a counter payment, and on the printable page. */
export function ReceiptView({ r, timeZone, full }: { r: FeeReceipt; timeZone: string; full?: boolean }) {
  return (
    <Box data-testid="receipt">
      {full && (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h5" component="p" sx={{ fontWeight: 500 }}>
            {r.institution}
          </Typography>
          <Typography variant="overline" component="h1" sx={{ letterSpacing: '0.2em', fontSize: '0.875rem', color: 'text.secondary' }}>
            Fee receipt
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }} data-testid="receipt-no">
          {r.receiptNo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.paidAt))}
        </Typography>
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Row label="Student">
        {r.student.fullName}
        {r.student.rollNo ? ` · ${r.student.rollNo}` : ''}
      </Row>
      <Row label="Class">{r.className}</Row>
      <Row label="Towards">{r.invoice.title}</Row>
      <Row label="Amount received" strong>
        <span data-testid="receipt-amount">{formatRupees(r.amountPaise)}</span>
      </Row>
      {full && <Row label="In words">{rupeesInWords(r.amountPaise)}</Row>}
      <Row label="Paid by">
        {METHOD_LABEL[r.method] ?? r.method}
        {r.reference ? ` · ${r.reference}` : ''}
      </Row>
      <Divider sx={{ my: 1 }} />
      <Row label="Fee">{formatRupees(r.invoice.amountPaise)}</Row>
      <Row label="Balance due">{r.invoice.balancePaise > 0 ? formatRupees(r.invoice.balancePaise) : 'Nil · fully paid'}</Row>
    </Box>
  );
}
