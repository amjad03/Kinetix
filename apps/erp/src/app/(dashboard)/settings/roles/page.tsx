import type { Metadata } from 'next';
import { RoleMatrix } from '@/components/access/RoleMatrix';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AccessMatrix, RulesHistoryEntry } from '@/lib/governance-access';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.roles.title') };
}

/** Settings > Roles and permissions: what each staff role may do in each module (enforced by the API on every call). */
export default async function RolesPage() {
  const me = await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<AccessMatrix>('/v1/admin/access/matrix'), api<RulesHistoryEntry[]>('/v1/admin/access/matrix/history')]));
  return (
    <>
      <PageHeader
        title={t('ga.roles.title')}
        subtitle={t('ga.roles.sub')}
        actions={
          <LinkButton href="/settings/users" variant="outlined">
            {t('ga.users.title')}
          </LinkButton>
        }
      />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <RoleMatrix matrix={data.data[0]} history={data.data[1]} canEditPrincipal={!!me?.roles.includes('tenant_admin')} />}
    </>
  );
}
