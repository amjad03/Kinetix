import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/kx';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { ReportTable, type ReportColumn } from '@/components/students/ReportTable';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { FormRow, LinkTabs, SelectInput, TextInput } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { STUDENT_REPORTS, type StudentReport } from '@/lib/student-info';
import type { Structure } from '@/lib/types';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.registers') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Statements over a period (the rest are as on a day). */
const RANGED: StudentReport[] = ['dropouts', 'tc-register'];

/**
 * The student registers and statements: strength by class, gender and category; religion and minority (AISHE and
 * UDISE+); age-wise; students with details missing; dropouts and long absentees; the transfer certificate register.
 * The report and its filters live in the URL; each table exports to CSV.
 */
export default async function RegistersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('students');
  const sp = await searchParams;
  const { t } = await getI18n();
  const kind = (STUDENT_REPORTS as readonly string[]).includes(sp.kind ?? '') ? (sp.kind as StudentReport) : 'strength';
  const programId = sp.programId && UUID.test(sp.programId) ? sp.programId : '';
  const from = sp.from && DAY.test(sp.from) ? sp.from : '';
  const to = sp.to && DAY.test(sp.to) ? sp.to : '';
  const on = sp.on && DAY.test(sp.on) ? sp.on : '';
  const q = new URLSearchParams({ ...(programId && { programId }), ...(from && { from }), ...(to && { to }), ...(on && { on }) });
  const [rows, structure] = await Promise.all([load(() => api<Record<string, unknown>[]>(`/v1/students/reports/${kind}?${q}`)), load(() => api<Structure>('/v1/admin/structure'))]);

  const n = (key: string, header: MessageKey): ReportColumn => ({ key, header: t(header), kind: 'number' });
  const statusLabels = Object.fromEntries(['dropped', 'transferred', 'expelled', 'long_absent'].map((s) => [s, t(`adm.stu.${s}` as MessageKey)]));
  const clearanceLabels = Object.fromEntries(['open', 'cleared', 'cancelled'].map((s) => [s, t(`si.clr.status.${s}` as MessageKey)]));
  const COLUMNS: Record<StudentReport, ReportColumn[]> = {
    strength: [
      { key: 'className', header: t('si.reg.class'), rowHeader: true },
      { key: 'programme', header: t('si.reg.programme'), hideBelow: 'md' },
      n('total', 'si.reg.total'),
      n('male', 'si.o.gender.male'),
      n('female', 'si.o.gender.female'),
      n('other', 'si.o.gender.other'),
      n('genderNotGiven', 'si.reg.notGiven'),
      n('general', 'si.o.category.general'),
      n('obc', 'si.o.category.obc'),
      n('sc', 'si.o.category.sc'),
      n('st', 'si.o.category.st'),
      n('ews', 'si.o.category.ews'),
      n('pwd', 'si.reg.pwd'),
    ],
    religion: [{ key: 'religion', header: t('si.f.religion'), rowHeader: true }, n('total', 'si.reg.total'), n('male', 'si.o.gender.male'), n('female', 'si.o.gender.female'), n('minority', 'si.reg.minority'), n('pwd', 'si.reg.pwd')],
    age: [{ key: 'band', header: t('si.reg.ageBand'), rowHeader: true }, n('total', 'si.reg.total'), n('male', 'si.o.gender.male'), n('female', 'si.o.gender.female'), n('other', 'si.o.gender.other')],
    missing: [
      { key: 'fullName', header: t('si.col.student'), rowHeader: true },
      { key: 'rollNo', header: t('si.reg.roll') },
      { key: 'className', header: t('si.reg.class'), hideBelow: 'md' },
      { key: 'missing', header: t('si.reg.missing') },
      n('count', 'si.reg.missingCount'),
    ],
    dropouts: [
      { key: 'effectiveOn', header: t('si.reg.on'), kind: 'date' },
      { key: 'fullName', header: t('si.col.student'), rowHeader: true },
      { key: 'rollNo', header: t('si.reg.roll'), hideBelow: 'sm' },
      { key: 'className', header: t('si.reg.class'), hideBelow: 'md' },
      { key: 'status', header: t('si.col.status'), labels: statusLabels },
      { key: 'reason', header: t('si.col.reason'), hideBelow: 'lg' },
      { key: 'recordedBy', header: t('si.reg.recordedBy'), hideBelow: 'lg' },
    ],
    'tc-register': [
      { key: 'leftOn', header: t('si.reg.leftOn'), kind: 'date' },
      { key: 'tcNo', header: t('si.reg.tcNo') },
      { key: 'fullName', header: t('si.col.student'), rowHeader: true },
      { key: 'admissionNo', header: t('si.col.admissionNo'), hideBelow: 'md' },
      { key: 'className', header: t('si.reg.class'), hideBelow: 'md' },
      { key: 'reason', header: t('si.col.reason'), hideBelow: 'lg' },
      { key: 'issuedOn', header: t('si.reg.issuedOn'), kind: 'date', hideBelow: 'lg' },
      { key: 'noDues', header: t('si.reg.noDues'), labels: clearanceLabels },
    ],
  };
  const href = (k: StudentReport) => `/students/registers?${new URLSearchParams({ kind: k, ...(programId && { programId }) })}`;

  return (
    <>
      <PageHeader title={t('si.tab.registers')} subtitle={t('si.reg.subtitle')} />
      <StudentsTabs current="registers" />
      <LinkTabs value={kind} label={t('si.tab.registers')} items={STUDENT_REPORTS.map((k) => ({ value: k, label: t(`si.reg.kind.${k}` as MessageKey), href: href(k) }))} />
      <FormRow component="form" method="get" className="mb-4">
        <input type="hidden" name="kind" value={kind} />
        <SelectInput name="programId" label={t('si.reg.programme')} defaultValue={programId} options={(structure.data?.programs ?? []).map((p) => ({ value: p.id, label: p.name }))} empty={t('si.reg.allProgrammes')} className="min-w-[220px]" />
        {kind === 'age' && <TextInput type="date" name="on" label={t('si.reg.asOn')} defaultValue={on} slotProps={{ inputLabel: { shrink: true } }} />}
        {RANGED.includes(kind) && (
          <>
            <TextInput type="date" name="from" label={t('si.reg.from')} defaultValue={from} slotProps={{ inputLabel: { shrink: true } }} />
            <TextInput type="date" name="to" label={t('si.reg.to')} defaultValue={to} slotProps={{ inputLabel: { shrink: true } }} />
          </>
        )}
        <Button type="submit" variant="outlined">
          {t('si.reg.apply')}
        </Button>
      </FormRow>
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : (
        <ReportTable
          rows={rows.data}
          columns={COLUMNS[kind]}
          label={t(`si.reg.kind.${kind}` as MessageKey)}
          exportName={`students-${kind}`}
          totals={kind === 'strength' || kind === 'religion' || kind === 'age'}
          testId={`register-${kind}`}
          empty={
            <EmptyState icon={<ClipboardList />} title={t('si.reg.none')}>
              {t(`si.reg.noneBody.${kind}` as MessageKey)}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
