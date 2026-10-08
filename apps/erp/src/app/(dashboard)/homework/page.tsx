import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import type { Metadata } from 'next';
import { HomeworkTable } from '@/components/HomeworkTable';
import { PageHeader } from '@/components/PageHeader';
import { RangeToggle } from '@/components/RangeToggle';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { schoolToday, TIMEZONE } from '@/lib/school';
import type { HomeworkRow } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.homework') };
}

const RANGES = [7, 14, 30];

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireSection('school');
  const d = Number((await searchParams).days);
  const days = RANGES.includes(d) ? d : 7;
  const today = schoolToday();
  const res = await load(() => api<HomeworkRow[]>(`/v1/admin/homework?days=${days}`));
  const rows = res.data ?? [];
  const classes = new Set(rows.map((r) => r.section)).size;
  const teachers = new Set(rows.map((r) => r.teacher)).size;
  const { t } = await getI18n();

  return (
    <>
      <PageHeader
        title={t('nav.homework')}
        subtitle={
          res.data
            ? `${t.plural('hw.subtitle', rows.length, { days })}${rows.length ? ` · ${t.plural('hw.classes', classes)} · ${t.plural('hw.teachers', teachers)}` : ''}`
            : t('hw.setInLast', { days })
        }
        actions={<RangeToggle value={days} options={RANGES} />}
      />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AssignmentOutlined />} title={t('hw.none', { days })} testId="no-homework">
          {t('hw.noneBody')} {days < 30 ? t('hw.tryLonger') : ''}
        </EmptyState>
      ) : (
        <HomeworkTable rows={rows} today={today} timezone={TIMEZONE} />
      )}
    </>
  );
}
