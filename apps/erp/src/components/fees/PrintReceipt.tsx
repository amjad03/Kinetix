'use client';
import { useI18n } from '@/i18n/client';

import { Button } from '@/components/kx';
import { Printer as PrintOutlined } from 'lucide-react';
/** Prints only the receipt: no navigation, no buttons, black on white, A5-friendly margins. */
const PRINT_CSS = `@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  .kx-chrome, .kx-noprint { display: none !important; }
  .kx-shell { display: block !important; min-height: 0 !important; background: #fff !important; }
  .kx-main { margin: 0 !important; padding: 0 !important; border-radius: 0 !important; background: #fff !important; }
  .kx-receipt { border: 1px solid #9aa0a6 !important; box-shadow: none !important; color: #000 !important; max-width: none !important; }
  .kx-receipt * { color: #000 !important; }
}`;

export function ReceiptPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}

export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
      {t('fees.print')}
    </Button>
  );
}
