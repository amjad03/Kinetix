import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatusPill } from '@/components/ui';
import { ConvocationDesk } from '@/components/university/ConvocationDesk';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, ApiError, load, requireSection } from '@/lib/api';
import type { ConvocationDetail } from '@/lib/curriculum';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('un.d.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONE = { draft: 'neutral', registration_open: 'success', closed: 'warning', held: 'info' } as const;

/** One convocation: eligible graduates, registration, withholding and issuing the degrees. */
export default async function ConvocationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('university');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const convocation = await api<ConvocationDetail>(`/v1/university/convocations/${id}`).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    });
    const structure = await api<Structure>('/v1/admin/structure').catch(() => null);
    return { convocation, structure };
  });
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/university" size="small" startIcon={<ArrowLeft />}>
        {t('nav.university')}
      </LinkButton>
    </div>
  );
  if (data.error !== undefined)
    return (
      <>
        {back}
        <ErrorState message={data.error} />
      </>
    );
  const c = data.data.convocation;
  const classes = (data.data.structure?.sections ?? []).filter((s) => !c.programId || s.programId === c.programId).map((s) => ({ id: s.id, name: s.displayName }));
  const canAdmin = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'exam_controller');
  return (
    <>
      {back}
      <PageHeader
        title={c.name}
        subtitle={t('un.d.sub', { date: fmt.date(c.heldOn), year: String(c.graduationYear) })}
        actions={
          <>
            <StatusPill tone={TONE[c.status]}>{t(`un.cs.${c.status}` as MessageKey)}</StatusPill>
            <LinkButton href={`/university/degrees?convocationId=${c.id}`} variant="outlined">
              {t('un.reg.title')}
            </LinkButton>
          </>
        }
      />
      <ConvocationDesk convocation={c} classes={classes} canAdmin={canAdmin} />
    </>
  );
}
