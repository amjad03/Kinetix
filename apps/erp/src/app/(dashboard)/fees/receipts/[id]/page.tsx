import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { PrintButton, ReceiptPrintStyles } from '@/components/fees/PrintReceipt';
import { ReceiptView } from '@/components/fees/ReceiptView';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import type { FeeReceipt } from '@/lib/types';

export const metadata: Metadata = { title: 'Receipt' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('fees');
  const { id } = await params;
  const receipt = UUID.test(id) ? await load(() => api<FeeReceipt>(`/v1/fees/payments/${id}/receipt`)) : { error: 'Receipt not found.', data: undefined };

  return (
    <>
      <ReceiptPrintStyles />
      <Box className="kx-noprint" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ ml: -1 }}>
          <LinkButton href="/fees/invoices?status=paid" size="small" startIcon={<ArrowBack />}>
            Invoices
          </LinkButton>
        </Box>
        {receipt.data && <PrintButton />}
      </Box>
      {receipt.error !== undefined ? (
        <ErrorState title="Can't show this receipt" message={receipt.error} />
      ) : (
        <Card className="kx-receipt" sx={{ maxWidth: 720, mx: 'auto', p: { xs: 2.5, md: 5 } }}>
          <ReceiptView r={receipt.data} timeZone={TIMEZONE} full />
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 4, textAlign: 'center' }}>
            Issued through KINETIX ERP. Keep this receipt for your records.
          </Typography>
        </Card>
      )}
    </>
  );
}
