import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { FormRow, FormRowActions, SelectInput } from '@/components/ui';
import { Button } from '@/components/shadcn/button';
import { DegreeRegister } from '@/components/university/DegreeRegister';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ConvocationRow, DegreeRow } from '@/lib/curriculum';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('un.reg.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The register of degrees conferred, by graduation year or convocation (filters in the URL). */
export default async function DegreeRegisterPage({ searchParams }: { searchParams: Promise<{ year?: string; convocationId?: string }> }) {
  await requireSection('university');
  const { t } = await getI18n();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : '';
  const convocationId = sp.convocationId && UUID.test(sp.convocationId) ? sp.convocationId : '';
  const q = new URLSearchParams({ ...(year ? { year } : {}), ...(convocationId ? { convocationId } : {}) }).toString();
  const data = await load(async () => {
    const [rows, convocations] = await Promise.all([api<DegreeRow[]>(`/v1/university/degrees${q ? `?${q}` : ''}`), api<ConvocationRow[]>('/v1/university/convocations')]);
    return { rows, convocations };
  });
  const years = data.data ? [...new Set(data.data.convocations.map((c) => c.graduationYear))].sort((a, b) => b - a) : [];
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/university" size="small" startIcon={<ArrowLeft />}>
          {t('nav.university')}
        </LinkButton>
      </div>
      <PageHeader title={t('un.reg.title')} subtitle={t('un.reg.sub')} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <>
          <div className="mb-4">
            <FormRow component="form" method="get">
              <SelectInput name="year" label={t('un.c.year')} defaultValue={year} options={[{ value: '', label: t('un.reg.allYears') }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
              <SelectInput name="convocationId" label={t('un.reg.convocation')} defaultValue={convocationId} options={[{ value: '', label: t('un.reg.allConvocations') }, ...data.data.convocations.map((c) => ({ value: c.id, label: c.name }))]} />
              <FormRowActions>
                <Button type="submit">{t('un.reg.apply')}</Button>
              </FormRowActions>
            </FormRow>
          </div>
          <DegreeRegister rows={data.data.rows} />
        </>
      )}
    </>
  );
}
