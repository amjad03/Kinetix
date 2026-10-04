'use client';

import PrintOutlined from '@mui/icons-material/PrintOutlined';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';

/** Prints only the receipt: no navigation, no buttons, black on white, A5-friendly margins. */
export function ReceiptPrintStyles() {
  return (
    <GlobalStyles
      styles={{
        '@media print': {
          '@page': { margin: '14mm' },
          'html, body': { background: '#fff !important' },
          '.kx-chrome, .kx-noprint': { display: 'none !important' },
          '.kx-shell': { display: 'block !important', minHeight: '0 !important', background: '#fff !important' },
          '.kx-main': { margin: '0 !important', padding: '0 !important', borderRadius: '0 !important', background: '#fff !important' },
          '.kx-receipt': { border: '1px solid #9aa0a6 !important', boxShadow: 'none !important', color: '#000 !important', maxWidth: 'none !important' },
          '.kx-receipt *': { color: '#000 !important' },
        },
      }}
    />
  );
}

export function PrintButton() {
  return (
    <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
      Print
    </Button>
  );
}
