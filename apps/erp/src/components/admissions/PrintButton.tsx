'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { useI18n } from '@/i18n/client';

/** Prints the page (the letter sits on its own; the app's chrome is hidden in print). */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button variant="outline" className="h-9 print:hidden" onClick={() => window.print()}>
      <Printer />
      {t('ap.print')}
    </Button>
  );
}
