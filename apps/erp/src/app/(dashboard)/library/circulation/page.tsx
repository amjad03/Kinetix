import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { dl, opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

interface LoanRow {
  id: string;
  book: { title: string };
  student: { fullName: string; rollNo: string };
  dueOn: string;
  overdue: boolean;
  fineSoFarPaise: number;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.lib.title') };
}

/** Renewals, reservations, lost and damaged books, and the book labels. */
export default async function CirculationPage() {
  await requireSection('library');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [loans, reservations, books, students] = await Promise.all([
      api<LoanRow[]>('/v1/library/loans'),
      api<Record<string, unknown>[]>('/v1/library/reservations'),
      api<{ id: string; title: string; barcode?: string }[]>('/v1/library/books'),
      safe(api<{ id: string; fullName: string; rollNo: string }[]>('/v1/students?status=active'), []),
    ]);
    return { loans, reservations, books, students };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { loans, reservations, books, students } = data.data;
  const words = stateWords(t);
  const damage = [{ name: 'note', label: t('dx.lib.condition'), type: 'text' as const, required: true }, { name: 'amountPaise', label: t('dx.lib.charge'), type: 'paise' as const, hint: t('dx.lib.chargeHint') }];

  const panels: Panel[] = [
    {
      id: 'loans',
      title: t('dx.lib.loans'),
      hint: t('dx.lib.loansHint'),
      empty: t('dx.lib.noLoans'),
      columns: [
        { key: 'title', label: t('dx.c.title') },
        { key: 'studentName', label: t('dx.c.student') },
        { key: 'rollNo', label: t('dx.c.rollNo') },
        { key: 'dueOn', label: t('dx.lib.due'), kind: 'date' },
        { key: 'overdue', label: t('dx.lib.overdue'), kind: 'yes' },
        { key: 'fineSoFarPaise', label: t('dx.lib.fineSoFar'), kind: 'paise' },
      ],
      rows: loans.map((l) => ({ id: l.id, title: l.book.title, studentName: l.student.fullName, rollNo: l.student.rollNo, dueOn: l.dueOn, overdue: l.overdue, fineSoFarPaise: l.fineSoFarPaise })),
      actions: [
        { label: t('dx.lib.renew'), path: '/v1/library/loans/{id}/renew', show: { key: 'overdue', is: [false] } },
        { label: t('dx.lib.lost'), path: '/v1/library/loans/{id}/lost', fields: damage },
        { label: t('dx.lib.damaged'), path: '/v1/library/loans/{id}/damaged', fields: damage },
      ],
    },
    {
      id: 'reservations',
      title: t('dx.lib.reservations'),
      hint: t('dx.lib.reservationsHint'),
      empty: t('dx.lib.noReservations'),
      columns: [
        { key: 'title', label: t('dx.c.title') },
        { key: 'student', label: t('dx.c.student') },
        { key: 'position', label: t('dx.lib.position'), kind: 'num' },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
        { key: 'expiresAt', label: t('dx.lib.holdUntil'), kind: 'datetime' },
      ],
      rows: reservations,
      actions: [{ label: t('dx.cancel'), path: '/v1/library/reservations/{id}/cancel', confirm: t('dx.lib.cancelReservation') }],
      forms: [
        {
          id: 'reserve',
          title: t('dx.lib.reserve'),
          submit: t('dx.add'),
          path: '/v1/library/reservations',
          fields: [
            { name: 'bookId', label: t('dx.c.title'), type: 'select', options: opt(books, (b) => b.id, (b) => b.title), required: true },
            { name: 'studentId', label: t('dx.c.student'), type: 'select', options: opt(students, (s) => s.id, (s) => `${s.fullName} (${s.rollNo})`), required: true },
          ],
        },
      ],
    },
    {
      id: 'labels',
      title: t('dx.lib.labels'),
      hint: t('dx.lib.labelsHint'),
      empty: t('dx.lib.noBooks'),
      downloads: [{ label: t('dx.lib.printLabels'), href: dl('library-labels', 'all') }],
      columns: [
        { key: 'barcode', label: t('dx.lib.code') },
        { key: 'title', label: t('dx.c.title') },
        { key: 'copies', label: t('dx.lib.copies'), kind: 'num' },
        { key: 'onLoan', label: t('dx.lib.onLoan'), kind: 'num' },
      ],
      rows: books.slice(0, 50),
      forms: [{ id: 'assign', title: t('dx.lib.assignTitle'), submit: t('dx.lib.assign'), path: '/v1/library/books/barcodes/assign', fields: [], result: [{ key: 'assigned', label: t('dx.lib.assigned') }] }],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.lib.title')} subtitle={t('dx.lib.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
