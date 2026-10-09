import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { DecideControl } from '@/components/attendance/DecideControl';
import { DeskTable, Pill } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import type { CondonationRow, CorrectionRow, ShortageRow } from '@/lib/institution';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.attendanceGov') };
}

const TONE = { pending: 'warning', approved: 'success', rejected: 'error' } as const;

/** Attendance approvals: corrections to locked registers, shortage list, and condonation requests. */
export default async function AttendanceGovernancePage({ searchParams }: { searchParams: Promise<{ sectionId?: string }> }) {
  await requireSection('school');
  const { t, fmt } = await getI18n();
  const sectionId = (await searchParams).sectionId ?? '';
  const data = await load(async () => {
    const [corrections, condonations, structure] = await Promise.all([
      api<CorrectionRow[]>('/v1/attendance/corrections'),
      api<CondonationRow[]>('/v1/attendance/condonations'),
      api<Structure>('/v1/admin/structure'),
    ]);
    const pick = /^[0-9a-f-]{36}$/i.test(sectionId) ? sectionId : structure.sections[0]?.id;
    const shortage = pick ? await api<{ thresholdPct: number; rows: ShortageRow[] }>(`/v1/attendance/shortage?sectionId=${pick}`) : { thresholdPct: 75, rows: [] };
    return { corrections, condonations, structure, shortage, pick: pick ?? '' };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { corrections, condonations, structure, shortage, pick } = data.data;
  const st = (s: string | null) => (s ? t(`agv.st.${s}` as MessageKey) : '-');
  const status = (s: 'pending' | 'approved' | 'rejected') => <Pill key={s} label={t(`agv.status.${s}` as MessageKey)} tone={TONE[s]} />;
  return (
    <>
      <PageHeader title={t('nav.attendanceGov')} subtitle={t('agv.subtitle')} />
      {corrections.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('agv.noCorrections')}
        </Typography>
      ) : (
        <DeskTable
          title={t('agv.corrections')}
          testId="corrections-table"
          head={[t('agv.col.student'), t('agv.col.subject'), t('agv.col.date'), t('agv.col.change'), t('agv.col.reason'), t('agv.col.by'), t('agv.col.status'), t('agv.col.action')]}
          rows={corrections.map((c) => [
            `${c.student} (${c.rollNo})`,
            c.subject,
            fmt.date(c.date, 'short'),
            `${st(c.fromStatus)} > ${st(c.toStatus)}`,
            c.reason,
            c.requester,
            status(c.status),
            c.status === 'pending' ? <DecideControl key={c.id} kind="correction" id={c.id} /> : '',
          ])}
        />
      )}

      <UrlSelect label={t('agv.section')} param="sectionId" value={pick} options={structure.sections.map((s) => ({ value: s.id, label: s.displayName }))} />
      <Typography variant="body2" color="text.secondary" sx={{ my: 1.5 }}>
        {t('agv.threshold', { n: shortage.thresholdPct })}
      </Typography>
      {shortage.rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('agv.noShortage')}
        </Typography>
      ) : (
        <DeskTable
          title={t('agv.shortage')}
          testId="shortage-table"
          head={[t('agv.col.student'), t('agv.col.subject'), t('agv.col.attended'), t('agv.col.pct'), t('agv.col.condoned'), t('agv.col.effective')]}
          rows={shortage.rows.map((r) => [`${r.fullName} (${r.rollNo})`, r.subject, `${r.present + r.late}/${r.present + r.late + r.absent}`, r.pct === null ? '-' : `${r.pct}%`, r.condonedPoints ? `+${r.condonedPoints}` : '-', <Pill key={r.studentId + r.subject} label={r.effectivePct === null ? '-' : `${r.effectivePct}%`} tone="error" />])}
        />
      )}

      {condonations.length === 0 ? (
        <Typography color="text.secondary">{t('agv.noCondonations')}</Typography>
      ) : (
        <DeskTable
          title={t('agv.condonations')}
          testId="condonations-table"
          head={[t('agv.col.student'), t('agv.col.kind'), t('agv.col.reason'), t('agv.col.document'), t('agv.col.status'), t('agv.col.action')]}
          rows={condonations.map((c) => [
            `${c.fullName} (${c.rollNo})`,
            t(`agv.kind.${c.kind}` as MessageKey),
            c.reason,
            c.hasDocument ? t('agv.hasDoc') : t('agv.noDoc'),
            <span key={c.id}>
              {status(c.status)} {c.status === 'approved' && `+${c.approvedPoints}`}
            </span>,
            c.status === 'pending' ? <DecideControl key={c.id} kind="condonation" id={c.id} /> : '',
          ])}
        />
      )}
    </>
  );
}
