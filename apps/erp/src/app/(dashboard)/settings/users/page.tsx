import type { Metadata } from 'next';
import { UsersAccess } from '@/components/access/UsersAccess';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.users.title') };
}

/** Settings > Users and access: every account, its roles, status, two-step sign-in, devices and sign-ins. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('settings');
  const { t } = await getI18n();
  // The office works with staff accounts; students and parents are one filter away (Kind: Everyone).
  const records = await loadRecords('users', await searchParams, { filters: { kind: 'staff' } });
  const roles = records.data?.meta.fields.find((f) => f.key === 'role')?.options?.map((o) => o.value) ?? [];
  return (
    <>
      <PageHeader
        title={t('ga.users.title')}
        subtitle={t('ga.users.sub')}
        actions={
          <>
            <LinkButton href="/audit?tab=signins" variant="outlined">
              {t('ga.signins.title')}
            </LinkButton>
            <LinkButton href="/settings/roles" variant="outlined">
              {t('ga.roles.title')}
            </LinkButton>
          </>
        }
      />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <UsersAccess meta={records.data.meta} page={records.data.page} state={records.data.state} roles={roles} />}
    </>
  );
}
