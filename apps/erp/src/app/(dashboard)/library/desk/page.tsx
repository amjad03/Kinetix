import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { LhtDesk, type DeskTask } from '@/components/lht/LhtDesk';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { LibraryLookup } from '@/components/lht/LibraryLookup';
import { MarcImport } from '@/components/lht/MarcImport';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatGrid, StatTile } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { RecordMeta } from '@/lib/records';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.desk.library') };
}

interface Dash {
  titles: number;
  copies: number;
  onShelf: number;
  onLoan: number;
  overdue: number;
  issuedToday: number;
  returnedToday: number;
  footfallToday: number;
  insideNow: number;
  members: number;
  unpaidFinesPaise: number;
  suggestions: number;
  onOrder: number;
  waivers: number;
  issuesLate: number;
  inTransit: number;
  illOut: number;
  eresourceOpens30: number;
}

const opts = (meta: RecordMeta | null, field: string) => meta?.fields.find((f) => f.key === field)?.options ?? [];

/** The circulation desk: issue and return by scanning, the drop box, the gate, enrolment, MARC import and no-dues. */
export default async function LibraryDeskPage() {
  await requireSection('library');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [dash, gate, members, structure, students] = await Promise.all([
      api<Dash>('/v1/library/dashboard'),
      safe(api<RecordMeta>('/v1/records/library-gate/meta'), null),
      safe(api<RecordMeta>('/v1/records/library-members/meta'), null),
      safe(api<Structure>('/v1/admin/structure'), null),
      safe(api<{ id: string; fullName: string; rollNo: string }[]>('/v1/students?status=active'), []),
    ]);
    return { dash, gate, members, structure, students };
  });
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={t('lht.desk.library')} actions={<LhtLinks module="library" here="desk" />} />
        <ErrorState message={data.error} />
      </>
    );
  const { dash: d, gate, members, structure, students } = data.data;
  const branches = opts(gate, 'branchId');
  const purposes = ['reading', 'borrow', 'reference', 'eresources', 'other'].map((v) => ({ value: v, label: t(`rk.o.library-gate.purpose.${v}` as MessageKey) }));
  const sections = (structure?.sections ?? []).map((s) => ({ value: s.id, label: s.displayName }));
  const studentOpts = students.map((s) => ({ value: s.id, label: `${s.fullName} (${s.rollNo})` }));
  const branch = { name: 'branchId', label: t('lht.f.branch'), type: 'select' as const, options: branches };

  const tasks: DeskTask[] = [
    {
      id: 'issue',
      title: t('lht.lib.issue'),
      hint: t('lht.lib.issueHint'),
      path: '/v1/library/desk/issue',
      submit: t('lht.lib.issueGo'),
      fields: [
        { name: 'memberCode', label: t('lht.f.memberCode'), type: 'text', required: true },
        { name: 'copyCodes', label: t('lht.f.copyCodes'), type: 'codes', required: true, hint: t('lht.f.codesHint') },
        { name: 'dueOn', label: t('lht.f.dueOn'), type: 'date' },
        branch,
        { name: 'bookBank', label: t('lht.f.bookBank'), type: 'bool' },
      ],
    },
    { id: 'return', title: t('lht.lib.return'), hint: t('lht.lib.returnHint'), path: '/v1/library/desk/return', submit: t('lht.lib.returnGo'), fields: [{ name: 'copyCodes', label: t('lht.f.copyCodes'), type: 'codes', required: true, hint: t('lht.f.codesHint') }, branch] },
    { id: 'dropbox', title: t('lht.lib.dropbox'), hint: t('lht.lib.dropboxHint'), path: '/v1/library/dropbox', submit: t('lht.lib.dropboxGo'), fields: [{ name: 'codes', label: t('lht.f.copyCodes'), type: 'codes', required: true, hint: t('lht.f.codesHint') }, branch] },
    {
      id: 'gate',
      title: t('lht.lib.gate'),
      hint: t('lht.lib.gateHint'),
      path: '/v1/library/gate/swipe',
      submit: t('lht.lib.gateGo'),
      fields: [{ name: 'memberCode', label: t('lht.f.memberCode'), type: 'text', required: true }, { name: 'purpose', label: t('lht.f.purpose'), type: 'select', options: purposes, initial: 'reading', required: true }, branch],
      result: [
        { key: 'name', label: t('lht.r.name') },
        { key: 'direction', label: t('lht.r.direction'), words: { in: t('lht.r.in'), out: t('lht.r.out') } },
      ],
    },
    {
      id: 'enrol',
      title: t('lht.lib.enrol'),
      hint: t('lht.lib.enrolHint'),
      path: '/v1/library/members/enrol',
      submit: t('lht.lib.enrolGo'),
      fields: [
        { name: 'sectionId', label: t('lht.f.section'), type: 'select', options: sections },
        { name: 'categoryId', label: t('lht.f.category'), type: 'select', options: opts(members, 'categoryId') },
      ],
      result: [{ key: 'enrolled', label: t('lht.r.enrolled') }],
    },
    {
      id: 'arrivals',
      title: t('lht.lib.arrivals'),
      hint: t('lht.lib.arrivalsHint'),
      path: '/v1/library/new-arrivals/notify',
      submit: t('lht.lib.arrivalsGo'),
      fields: [{ name: 'days', label: t('lht.f.days'), type: 'number', initial: '7', required: true }],
      result: [
        { key: 'books', label: t('lht.r.books') },
        { key: 'notified', label: t('lht.r.notified') },
      ],
    },
    {
      id: 'nodues',
      title: t('lht.lib.noDues'),
      hint: t('lht.lib.noDuesHint'),
      path: '/v1/library/no-dues/{studentId}/clear',
      submit: t('lht.lib.noDuesGo'),
      fields: [
        { name: 'studentId', label: t('lht.f.student'), type: 'select', options: studentOpts, required: true },
        { name: 'purpose', label: t('lht.f.for'), type: 'text', initial: 'exit', required: true },
        { name: 'note', label: t('lht.f.note'), type: 'textarea' },
      ],
      result: [
        { key: 'cardNo', label: t('lht.r.card') },
        { key: 'depositHeldPaise', label: t('lht.r.deposit'), kind: 'rupees' },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title={t('lht.desk.library')}
        subtitle={t('lht.desk.library.sub')}
        actions={
          <>
            <LhtLinks module="library" here="desk" />
            <LinkButton href="/api/lht-file?kind=marc-export&id=mrc" variant="outlined">
              {t('lht.marc.export')}
            </LinkButton>
          </>
        }
      />
      <StatGrid min={140}>
        <StatTile label={t('lht.s.titles')} value={fmt.number(d.titles)} caption={t('lht.s.copiesN', { n: fmt.number(d.copies) })} testId="lht-lib-titles" />
        <StatTile label={t('lht.s.onShelf')} value={fmt.number(d.onShelf)} caption={d.inTransit ? t('lht.s.inTransitN', { n: d.inTransit }) : undefined} />
        <StatTile label={t('lht.s.onLoan')} value={fmt.number(d.onLoan)} caption={t('lht.s.today', { a: d.issuedToday, b: d.returnedToday })} />
        <StatTile label={t('lht.s.overdue')} value={fmt.number(d.overdue)} tone={d.overdue ? 'warning' : 'default'} href="/library/records?view=library-loans&f.status=overdue" />
        <StatTile label={t('lht.s.unpaid')} value={fmt.rupees(d.unpaidFinesPaise)} tone={d.unpaidFinesPaise ? 'warning' : 'default'} caption={d.waivers ? t('lht.s.waiversN', { n: d.waivers }) : undefined} />
        <StatTile label={t('lht.s.footfall')} value={fmt.number(d.footfallToday)} caption={t('lht.s.insideN', { n: d.insideNow })} />
        <StatTile label={t('lht.s.members')} value={fmt.number(d.members)} />
        <StatTile label={t('lht.s.acq')} value={fmt.number(d.suggestions)} caption={t('lht.s.onOrderN', { n: d.onOrder })} href="/library/records?view=library-acquisitions" />
        <StatTile label={t('lht.s.late')} value={fmt.number(d.issuesLate)} tone={d.issuesLate ? 'warning' : 'default'} href="/library/records?view=library-issues&f.late=yes" />
        <StatTile label={t('lht.s.eres')} value={fmt.number(d.eresourceOpens30)} caption={t('lht.s.illN', { n: d.illOut })} />
      </StatGrid>
      <LibraryLookup />
      <LhtDesk tasks={tasks} />
      <div className="mt-5">
        <MarcImport branches={branches} />
      </div>
    </>
  );
}
