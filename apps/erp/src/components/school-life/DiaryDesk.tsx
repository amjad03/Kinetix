'use client';

import { NotebookPen } from 'lucide-react';
import { useState, useTransition } from 'react';
import { loadAcks } from '@/app/(dashboard)/diary/actions';
import { InfoDialog, useToast } from '@/components/ops/kit';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import type { DiaryAck } from '@/lib/school-life';

const COLUMNS: ColSpec[] = [
  { key: 'entryDate', header: 'rk.f.diary-entries.entryDate', kind: 'date' },
  { key: 'sectionId', from: 'section', header: 'rk.f.diary-entries.sectionId', kind: 'strong' },
  { key: 'subjectId', from: 'subject', header: 'rk.f.diary-entries.subjectId', hideBelow: 'md' },
  { key: 'author', header: 'rk.f.diary-entries.author', sortKey: false, hideBelow: 'sm' },
  { key: 'classwork', header: 'rk.f.diary-entries.classwork', kind: 'wrap', sortKey: false },
  { key: 'homeworkNote', header: 'rk.f.diary-entries.homeworkNote', kind: 'wrap', sortKey: false },
  { key: 'notice', header: 'rk.f.diary-entries.notice', kind: 'wrap', sortKey: false, hideBelow: 'md' },
  { key: 'acknowledged', header: 'rk.f.diary-entries.acknowledged', kind: 'number', sortKey: false },
];

/**
 * The school diary as a record kit list across the classes a person may write for (filter by class or date): write an
 * entry (families are told), correct it, delete it to the recycle bin and restore it, with history; each row shows who
 * has read it.
 */
export function DiaryDesk({ list }: { list: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState } }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [acks, setAcks] = useState<{ entry: Row; rows: DiaryAck[] } | null>(null);
  const [, start] = useTransition();
  const openAcks = (entry: Row) =>
    start(async () => {
      const res = await loadAcks(String(entry.id));
      if (res.ok) setAcks({ entry, rows: res.data });
      else toast(res.error);
    });
  return (
    <>
      <KitList
        {...list}
        label="nav.diary"
        columns={COLUMNS}
        rowActions={(e) => [{ id: 'who', label: t('dy.who'), onSelect: () => openAcks(e) }]}
        empty={{ icon: <NotebookPen />, title: 'dy.empty', body: 'kr.empty.diary-entries' }}
        testId="dy-entries"
      />
      {acks && (
        <InfoDialog title={t('dy.whoTitle')} onClose={() => setAcks(null)}>
          <p className="mb-2 text-[13px] text-muted-foreground">{t('dy.read', { n: Number(acks.entry.acknowledged ?? 0), total: Number(acks.entry.students ?? 0) })}</p>
          <div className="flex flex-col gap-1" data-testid="dy-acks">
            {acks.rows.map((a) => (
              <p className="text-[13px] leading-[19px]" key={a.studentId}>
                {a.rollNo} {a.fullName}: {a.acknowledgedAt ? fmt.dateTime(a.acknowledgedAt) : t('dy.notRead')}
              </p>
            ))}
          </div>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
