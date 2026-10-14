'use client';

import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { useI18n } from '@/i18n/client';

/** Print the timetable on screen, or download it as a PDF (a class's, a teacher's or a room's). */
export function TimetablePrint({ pdf }: { pdf: string }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" className="h-9" onClick={() => window.print()} data-testid="timetable-print">
        <Printer />
        {t('atd.print')}
      </Button>
      <Button variant="outline" className="h-9" asChild>
        <a href={pdf} data-testid="timetable-pdf">
          <FileText />
          {t('atd.pdf')}
        </a>
      </Button>
    </div>
  );
}
