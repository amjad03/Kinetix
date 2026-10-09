import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

interface Invoice {
  id: string;
  title: string;
  amountPaise: number;
  paidPaise: number;
  dueOn: string;
  status: string;
  student: { id: string; fullName: string; rollNo: string };
}
interface Plan {
  id: string;
  name: string;
  parts: { percent: number; dueAfterDays: number }[];
  active: boolean;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.fee.title') };
}

/** Instalment plans, the late-fee rule and the fines it adds, and students' advance credit. */
export default async function FeePlansPage() {
  await requireSection('fees');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [plans, rule, lateFees, credits, invoices, students] = await Promise.all([
      api<Plan[]>('/v1/fees/instalment-plans'),
      api<{ name: string; graceDays: number; flatPaise: number; perDayPaise: number; capPaise: number | null } | null>('/v1/fees/late-fee-rule'),
      api<Record<string, unknown>[]>('/v1/fees/late-fees'),
      api<{ studentId: string; name: string; rollNo: string; balancePaise: number }[]>('/v1/fees/credits'),
      safe(api<Invoice[]>('/v1/fees/invoices?status=due'), []),
      safe(api<{ id: string; fullName: string; rollNo: string }[]>('/v1/students?status=active'), []),
    ]);
    return { plans, rule, lateFees, credits, invoices, students };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { plans, rule, lateFees, credits, invoices, students } = data.data;
  const words = stateWords(t);
  const invLabel = (i: Invoice) => `${i.student.fullName} (${i.student.rollNo}): ${i.title}, ${fmt.rupees(i.amountPaise - i.paidPaise)}`;
  const unpaid = invoices.filter((i) => i.paidPaise === 0);
  const withCredit = invoices.filter((i) => credits.some((c) => c.studentId === i.student.id));
  const rupees = (paise: number | null | undefined) => (paise === null || paise === undefined ? '' : String(paise / 100));

  const panels: Panel[] = [
    {
      id: 'plans',
      title: t('dx.fee.plans'),
      hint: t('dx.fee.plansHint'),
      empty: t('dx.fee.noPlans'),
      columns: [
        { key: 'name', label: t('dx.c.name') },
        { key: 'summary', label: t('dx.fee.parts') },
        { key: 'active', label: t('dx.fee.inUse'), kind: 'yes' },
      ],
      rows: plans.map((p) => ({ ...p, summary: p.parts.map((x) => `${x.percent}% +${x.dueAfterDays}d`).join(', ') })),
      actions: [
        { label: t('dx.fee.retire'), path: '/v1/fees/instalment-plans/{id}/active', body: { active: false }, show: { key: 'active', is: [true] } },
        { label: t('dx.fee.reuse'), path: '/v1/fees/instalment-plans/{id}/active', body: { active: true }, show: { key: 'active', is: [false] } },
      ],
      forms: [
        {
          id: 'plan',
          title: t('dx.fee.newPlan'),
          submit: t('dx.add'),
          path: '/v1/fees/instalment-plans',
          fields: [
            { name: 'name', label: t('dx.c.name'), type: 'text', required: true },
            { name: 'parts', label: t('dx.fee.parts'), type: 'lines', lines: { keys: ['percent', 'dueAfterDays'], numeric: ['percent', 'dueAfterDays'] }, initial: '50, 0\n30, 30\n20, 60', required: true, hint: t('dx.fee.partsHint') },
          ],
        },
        {
          id: 'split',
          title: t('dx.fee.split'),
          submit: t('dx.fee.splitSubmit'),
          path: '/v1/fees/invoices/{invoiceId}/instalments',
          pathFields: ['invoiceId'],
          fields: [
            { name: 'invoiceId', label: t('dx.fee.invoice'), type: 'select', options: opt(unpaid, (i) => i.id, invLabel), required: true },
            { name: 'planId', label: t('dx.fee.plan'), type: 'select', options: opt(plans.filter((p) => p.active), (p) => p.id, (p) => p.name), required: true },
          ],
        },
      ],
    },
    {
      id: 'late',
      title: t('dx.fee.late'),
      hint: rule ? t('dx.fee.ruleText', { grace: rule.graceDays, flat: fmt.rupees(rule.flatPaise), perDay: fmt.rupees(rule.perDayPaise), cap: rule.capPaise === null ? t('dx.none') : fmt.rupees(rule.capPaise) }) : t('dx.fee.noRule'),
      empty: t('dx.fee.noLate'),
      columns: [
        { key: 'student', label: t('dx.c.name') },
        { key: 'rollNo', label: t('dx.c.rollNo') },
        { key: 'title', label: t('dx.fee.invoice') },
        { key: 'daysLate', label: t('dx.fee.daysLate'), kind: 'num' },
        { key: 'appliedPaise', label: t('dx.fee.fine'), kind: 'paise' },
        { key: 'waivedPaise', label: t('dx.fee.waived'), kind: 'paise' },
        { key: 'invoiceStatus', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: lateFees,
      actions: [{ label: t('dx.fee.waive'), path: '/v1/fees/late-fees/{id}/waive', fields: [{ name: 'amountPaise', label: t('dx.fee.waiveAmount'), type: 'paise', hint: t('dx.fee.waiveHint') }, { name: 'reason', label: t('dx.c.reason'), type: 'text', required: true }] }],
      forms: [
        {
          id: 'rule',
          title: t('dx.fee.setRule'),
          submit: t('dx.save'),
          method: 'PUT',
          path: '/v1/fees/late-fee-rule',
          fields: [
            { name: 'graceDays', label: t('dx.fee.grace'), type: 'number', initial: String(rule?.graceDays ?? 5), required: true },
            { name: 'flatPaise', label: t('dx.fee.flat'), type: 'paise', initial: rupees(rule?.flatPaise ?? 5000), required: true },
            { name: 'perDayPaise', label: t('dx.fee.perDay'), type: 'paise', initial: rupees(rule?.perDayPaise ?? 1000), required: true },
            { name: 'capPaise', label: t('dx.fee.cap'), type: 'paise', initial: rupees(rule?.capPaise ?? 50000), nullable: true },
          ],
        },
        { id: 'run', title: t('dx.fee.runTitle'), submit: t('dx.fee.run'), path: '/v1/fees/late-fees/run', fields: [], result: [{ key: 'assessed', label: t('dx.fee.assessed') }] },
      ],
    },
    {
      id: 'credits',
      title: t('dx.fee.credits'),
      hint: t('dx.fee.creditsHint'),
      empty: t('dx.fee.noCredits'),
      columns: [
        { key: 'name', label: t('dx.c.name') },
        { key: 'rollNo', label: t('dx.c.rollNo') },
        { key: 'balancePaise', label: t('dx.fee.balance'), kind: 'paise' },
      ],
      rows: credits.map((c) => ({ ...c, id: c.studentId })),
      actions: [{ label: t('dx.fee.refund'), path: '/v1/fees/credits/refund', rowBody: { studentId: 'studentId' }, fields: [{ name: 'amountPaise', label: t('dx.c.amount'), type: 'paise', required: true }, { name: 'note', label: t('dx.c.note'), type: 'text' }] }],
      forms: [
        {
          id: 'credit',
          title: t('dx.fee.addCredit'),
          submit: t('dx.add'),
          path: '/v1/fees/credits',
          fields: [
            { name: 'studentId', label: t('dx.c.student'), type: 'select', options: opt(students, (s) => s.id, (s) => `${s.fullName} (${s.rollNo})`), required: true },
            { name: 'amountPaise', label: t('dx.c.amount'), type: 'paise', required: true },
            { name: 'note', label: t('dx.c.note'), type: 'text' },
          ],
        },
        {
          id: 'apply',
          title: t('dx.fee.applyCredit'),
          submit: t('dx.fee.apply'),
          path: '/v1/fees/invoices/{invoiceId}/apply-credit',
          pathFields: ['invoiceId'],
          fields: [{ name: 'invoiceId', label: t('dx.fee.invoice'), type: 'select', options: opt(withCredit, (i) => i.id, invLabel), required: true }],
          result: [{ key: 'appliedPaise', label: t('dx.fee.applied') }],
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.fee.title')} subtitle={t('dx.fee.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
