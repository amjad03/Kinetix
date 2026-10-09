import { PageHeader } from '@/components/PageHeader';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import type { DeskSpec } from '@/lib/g1-desk';
import { loadDesk, loadLookups } from '@/lib/g1-load';
import type { Section } from '@/lib/access';
import { ConfigDesk } from './ConfigDesk';

/** The server side of a tabbed desk: checks access, reads the filters from the URL, loads every tab and hands it to the desk. */
export async function DeskPage({ spec, page, section, searchParams }: { spec: DeskSpec; page: string; section: Section; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection(section);
  const { t } = await getI18n();
  const sp = await searchParams;
  const { lookups, filterOptions, filters } = await loadLookups(spec, sp);
  const data = await loadDesk(spec, filters);
  return (
    <>
      <PageHeader title={t(spec.title)} subtitle={t(spec.subtitle)} />
      <ConfigDesk spec={spec} data={data} filterOptions={filterOptions} filterValues={filters} lookups={lookups} initialTab={sp.tab ?? spec.tabs[0].id} page={page} />
    </>
  );
}
