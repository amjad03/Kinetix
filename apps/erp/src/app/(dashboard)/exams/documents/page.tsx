import { ExamsTabs } from '@/components/exams/ExamsTabs';
import type { Metadata } from 'next';
import { CellTabs, DOC_TABS, type DocTab } from '@/components/exam-cell/CellTabs';
import { CorrectionRecords, DocRequestRecords, VerificationRecords } from '@/components/exam-cell/CellRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.docRequests') };
}

type SP = Record<string, string | string[] | undefined>;

/**
 * Academic documents (exam controller, principal, admin): transcript, provisional certificate and grade card requests
 * with fees, duplicates and reissues; name and date-of-birth corrections; and verification requests from employers.
 */
export default async function DocumentRequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSection('exams');
  const { t } = await getI18n();
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: DocTab = (DOC_TABS as readonly string[]).includes(raw ?? '') ? (raw as DocTab) : 'requests';
  const entity = { requests: 'academic-doc-requests', corrections: 'record-corrections', verification: 'verification-requests' }[tab];
  const r = await loadRecords(entity, sp);
  const slug = me?.tenant.slug;
  return (
    <>
      <PageHeader title={t('nav.docRequests')} subtitle={t(`xc.sub.doc.${tab}`)} />
      <ExamsTabs current="documents" roles={me?.roles} />
      <CellTabs area="docs" current={tab} />
      {tab === 'verification' && slug && (
        <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground" data-testid="verify-link">
          {t('xc.verifyLink')} <a className="underline" href={`/verify/request/${slug}`}>{`/verify/request/${slug}`}</a>
        </p>
      )}
      {r.error !== undefined ? (
        <ErrorState message={r.error} />
      ) : tab === 'requests' ? (
        <DocRequestRecords meta={r.data.meta} page={r.data.page} state={r.data.state} extraParams={{ tab }} />
      ) : tab === 'corrections' ? (
        <CorrectionRecords meta={r.data.meta} page={r.data.page} state={r.data.state} extraParams={{ tab }} />
      ) : (
        <VerificationRecords meta={r.data.meta} page={r.data.page} state={r.data.state} extraParams={{ tab }} />
      )}
    </>
  );
}
