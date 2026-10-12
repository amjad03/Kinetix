import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ExamRecord } from '@/components/exam-office/ExamRecord';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/ui';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { kindFromSlug, kindSlug, label, type RecordView } from '@/lib/exam-office';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const kind = kindFromSlug((await params).kind);
  const { t } = await getI18n();
  return { title: kind ? label(t, 'xo.k.', kind) : t('xo.title') };
}

const ID = /^[0-9a-f-]{36}(_[0-9a-f-]{36})?$/i;

/** One exam office record: header, key facts, workflow and approval, related lists, documents and the audit trail. */
export default async function ExamRecordPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireSection('exams');
  const p = await params;
  const kind = kindFromSlug(p.kind);
  if (!kind || !ID.test(p.id)) notFound();
  const { t } = await getI18n();
  const rec = await load(async () => {
    try {
      return await api<RecordView>(`/v1/exam-office/records/${kind}/${p.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const back = rec.data?.sessionId && kind !== 'session' ? { href: `/exams/office/session/${rec.data.sessionId}`, text: label(t, 'xo.k.', 'session') } : { href: `/exams/office/${kindSlug(kind)}`, text: label(t, 'xo.k.', kind) };
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href={back.href} size="small" startIcon={<ArrowLeft />}>
          {back.text}
        </LinkButton>
      </div>
      {rec.error !== undefined ? <ErrorState message={rec.error} /> : <ExamRecord record={rec.data} />}
    </>
  );
}
