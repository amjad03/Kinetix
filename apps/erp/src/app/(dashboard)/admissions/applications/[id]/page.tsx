import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplicationDeskPanel } from '@/components/admissions/ApplicationDeskPanel';
import { ApplicationReview } from '@/components/admissions/ApplicationReview';
import type { ApplicationDesk } from '@/lib/admissions-desk';
import { StatusPill } from '@/components/admissions/Chips';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ApiError, api, load, requireSection } from '@/lib/api';
import type { ApplicationDetail } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { loadFlows } from '@/lib/pathways-b-server';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

import { Alert } from '@/components/kx';
import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.review.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('admissions');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const app = await load(async () => {
    try {
      return await api<ApplicationDetail>(`/v1/admissions/applications/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const { t, locale } = await getI18n();
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/admissions/applications" size="small" startIcon={<ArrowBack />}>
        {t('adm.tab.applications')}
      </LinkButton>
    </div>
  );
  if (app.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={app.error} />
      </>
    );
  }
  const a = app.data;
  const [structure, desk] = await Promise.all([load(() => api<Structure>('/v1/admin/structure')), load(() => api<ApplicationDesk>(`/v1/admissions/applications/${id}/desk`))]);
  // A lateral or transfer applicant joins a later term than the cycle's.
  const joinTerm = a.entryTermOverride ?? a.cycle.entryTerm;
  const classes = a.status === 'accepted' ? (structure.data?.sections ?? []).filter((s) => s.programId === a.cycle.programId && s.term === joinTerm).map((s) => ({ id: s.id, name: s.displayName, term: s.term })) : [];
  const termCount = structure.data?.programs.find((p) => p.id === a.cycle.programId)?.termCount ?? 1;
  const answer = (k: string) => a.answers[k];
  return (
    <>
      {back}
      <PageHeader title={a.applicantName} subtitle={`${a.applicationNo} · ${a.cycle.name}`} actions={<StatusPill kind="application" status={a.status} />} />
      {a.statusReason && (
        <Alert className="mb-4" severity="info">
          {a.statusReason}
        </Alert>
      )}
      <div className="grid grid-cols-[1fr] lg:grid-cols-[1fr_1fr] gap-6">
        <div className="rounded-[12px] border bg-card p-5">
          <SectionTitle flush>{t('adm.review.details')}</SectionTitle>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] leading-[19px]">{a.phone}{a.email ? ` · ${a.email}` : ''}</p>
            {a.dateOfBirth && <p className="text-[13px] leading-[19px]">{t('adm.field.dob')}: {formatDate(a.dateOfBirth, 'long', locale)}</p>}
            <p className="text-[13px] leading-[19px]">
              {t('adm.review.guardian')}: {a.guardianName} ({a.guardianRelation}) · {a.guardianPhone}
            </p>
          </div>
          <SectionTitle>{t('adm.review.answers')}</SectionTitle>
          <div className="flex flex-col gap-1">
            {a.cycle.formFields.map((f) => (
              <p className="text-[13px] leading-[19px]" key={f.key}>
                <span className="text-[13px] leading-[19px] text-muted-foreground">
                  {f.label}:{' '}
                </span>
                {answer(f.key) ?? '–'}
              </p>
            ))}
            {a.cycle.formFields.length === 0 && (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('adm.review.noQuestions')}
              </p>
            )}
          </div>
          <SectionTitle>{t('adm.review.eligibility')}</SectionTitle>
          {a.eligibilityCheck.length === 0 ? (
            <Alert severity="success">{t('adm.review.meets')}</Alert>
          ) : (
            <Alert severity="warning">{a.eligibilityCheck.join('; ')}</Alert>
          )}
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-2">
            {t('adm.review.score', { score: a.liveMeritScore })}
            {a.meritRank ? ` · ${t('adm.review.rank', { rank: a.meritRank })}` : ''}
          </p>
          <SectionTitle>{t('adm.review.history')}</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {a.history.map((h, i) => (
              <p className="text-[13px] leading-[19px]" key={i}>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {formatDate(h.at.slice(0, 10), 'short', locale)} · {h.actorName ?? t('adm.system')} ·{' '}
                </span>
                {h.action.replace(/^admissions\./, '').replace(/\.v1$/, '').replaceAll('.', ' ').replaceAll('_', ' ')}
                {h.data && typeof h.data === 'object' && 'to' in h.data ? ` → ${t(`adm.app.${String(h.data.to)}` as MessageKey)}` : ''}
                {h.data && typeof h.data === 'object' && typeof h.data.reason === 'string' && h.data.reason ? ` (${h.data.reason})` : ''}
              </p>
            ))}
          </div>
        </div>
        <ApplicationReview app={{ ...a, cycle: { ...a.cycle, documents: a.cycle.documents.filter((d) => !d.for || d.for === 'all' || d.for === a.nationality) } }} classes={classes} canWaive={me?.roles.some((r) => r === 'principal' || r === 'tenant_admin') ?? false} flows={await loadFlows()} />
      </div>
      <div className="mt-6">
        {desk.error !== undefined ? (
          <ErrorState message={desk.error} />
        ) : (
          <ApplicationDeskPanel applicationId={a.id} status={a.status} desk={desk.data} kind={{ admissionType: a.admissionType, entryTermOverride: a.entryTermOverride, nationality: a.nationality }} termCount={termCount} />
        )}
      </div>
    </>
  );
}
