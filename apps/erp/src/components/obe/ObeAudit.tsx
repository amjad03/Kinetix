'use client';

import { Download, FileUp, Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { uploadTargetsSheet } from '@/app/(dashboard)/obe/flagship-actions';
import { useRun } from '@/components/exams/useRun';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { Button } from '@/components/shadcn/button';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { exportHref } from '@/lib/exams';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { cn } from '@/lib/utils';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState };

const STATEMENT_COLUMNS: ColSpec[] = [
  { key: 'kind', header: 'oa.col.kind', kind: 'choice', tone: (v) => (v === 'po' ? 'info' : v === 'pso' ? 'success' : 'neutral') },
  { key: 'code', header: 'oa.col.code', kind: 'strong' },
  { key: 'statement', header: 'oa.col.statement', kind: 'wrap' },
  { key: 'mapped', header: 'oa.col.mapped', kind: 'number', sortKey: false, hideBelow: 'md' },
  { key: 'ord', header: 'oa.col.order', kind: 'number', hideBelow: 'lg' },
  { key: 'program', header: 'oa.col.programme', sortKey: false, defaultHidden: true },
];

/**
 * A programme's vision, mission, PEOs, POs and PSOs as a record kit list: add, edit, bulk order, Excel import and
 * export, history, and delete (refused while course outcomes or the PEO-mission matrix use the statement).
 */
export function StatementsList(p: Props) {
  return <KitList {...p} label="oa.st.title" columns={STATEMENT_COLUMNS} empty={{ icon: <Flag />, title: 'oa.st.none', body: 'oa.st.noneBody' }} testId="obe-statements" />;
}

/** Download the year's targets as Excel and upload them back: checked first, saved only when there are no errors. */
export function TargetsSheet({ programId, yearId, canEdit }: { programId: string; yearId: string; canEdit: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, run, feedback } = useRun();
  const [sheet, setSheet] = useState<{ saved: boolean; rows: number; errors: { row: number; message: string }[] } | null>(null);
  const upload = (check: boolean) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('check', String(check));
    run(() => uploadTargetsSheet(programId, yearId, form), undefined, (r) => {
      setSheet(r);
      if (r.saved) {
        toast.success(t('oa.tg.imported', { n: r.rows }));
        router.refresh();
      }
    });
  };
  return (
    <div className="mb-4" data-testid="targets-sheet">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={exportHref(`/v1/obe/programs/${programId}/targets.xlsx?academicYearId=${yearId}`)} download data-testid="targets-download">
            <Download className="size-4" aria-hidden />
            {t('oa.tg.download')}
          </a>
        </Button>
        {canEdit && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()} data-testid="targets-upload">
            <FileUp className="size-4" aria-hidden />
            {t('oa.tg.upload')}
          </Button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={() => upload(true)} aria-label={t('oa.tg.upload')} />
      </div>
      {feedback}
      {sheet && (
        <div className={cn('mt-3 rounded-md border p-3 text-[13px]', sheet.errors.length ? 'border-red/40 bg-red/5' : 'bg-muted/40')} role="status" data-testid="targets-sheet-result">
          {sheet.errors.length ? (
            <>
              <b className="font-semibold">{t('oa.tg.sheetErrors', { n: sheet.errors.length })}</b>
              <ul className="m-0 mt-1 list-disc pl-5">
                {sheet.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{t('oa.tg.row', { n: e.row, msg: e.message })}</li>
                ))}
              </ul>
            </>
          ) : sheet.saved ? (
            t('oa.tg.imported', { n: sheet.rows })
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {t('oa.tg.sheetOk', { n: sheet.rows })}
              <Button size="sm" disabled={pending} onClick={() => upload(false)} data-testid="targets-apply">
                {t('oa.tg.apply')}
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
