import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { RecordList } from '@/components/exam-office/OfficeViews';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ui';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { kindFromSlug, label, type ListRow } from '@/lib/exam-office';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const kind = kindFromSlug((await params).kind);
  const { t } = await getI18n();
  return { title: kind ? label(t, 'xo.k.', kind) : t('xo.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Kinds that are not tied to one session. */
const UNSCOPED = new Set(['session', 'examiner', 'certificate']);

/** A register of exam office records (papers, hall tickets, question papers…), filtered by session in the URL. */
export default async function RegisterPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ session?: string }> }) {
  await requireSection('exams');
  const kind = kindFromSlug((await params).kind);
  if (!kind) notFound();
  const sp = await searchParams;
  const session = sp.session && UUID.test(sp.session) ? sp.session : '';
  const { t } = await getI18n();
  const [rows, sessions] = await Promise.all([load(() => api<ListRow[]>(`/v1/exam-office/records/${kind}${session ? `?sessionId=${session}` : ''}`)), UNSCOPED.has(kind) ? null : load(() => api<ListRow[]>('/v1/exam-office/records/session'))]);
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/exams/office" size="small" startIcon={<ArrowLeft />}>
          {t('xo.back')}
        </LinkButton>
      </div>
      <PageHeader
        title={label(t, 'xo.k.', kind)}
        actions={sessions?.data ? <UrlSelect label={t('xo.session')} param="session" value={session} options={[{ value: '', label: t('xo.allSessions') }, ...sessions.data.map((s) => ({ value: s.id, label: s.title }))]} minWidth={260} /> : undefined}
      />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <RecordList kind={kind} rows={rows.data} />}
    </>
  );
}
