import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load } from '@/lib/api';
import { groupOf, LHT_GROUPS, OPTION_SOURCES, sourcesFor, type LhtModule, type OptionSource } from '@/lib/lht';
import type { FieldOption, RecordMeta } from '@/lib/records';
import { loadRecords } from '@/lib/records-server';
import { LhtRecords } from './LhtRecords';

/** The module's own pages, as buttons in the page header: the desk, the record lists, reports and settings. */
export async function LhtLinks({ module, here }: { module: LhtModule; here: 'desk' | 'records' | 'home' }) {
  const { t } = await getI18n();
  return (
    <>
      {here !== 'home' && (
        <LinkButton href={`/${module}`} variant="outlined">
          {t(`nav.${module}` as MessageKey)}
        </LinkButton>
      )}
      {here !== 'desk' && (
        <LinkButton href={`/${module}/desk`} variant="outlined" data-testid={`lht-link-desk-${module}`}>
          {t(`lht.desk.${module}` as MessageKey)}
        </LinkButton>
      )}
      {here !== 'records' && (
        <LinkButton href={`/${module}/records`} variant="outlined" data-testid={`lht-link-records-${module}`}>
          {t(`lht.records.${module}` as MessageKey)}
        </LinkButton>
      )}
      {here !== 'home' && (
        <>
          <LinkButton href="/ops-reports" variant="outlined">
            {t('cops.reports')}
          </LinkButton>
          <LinkButton href={`/module-settings/${module}`} variant="outlined">
            {t('cops.settings')}
          </LinkButton>
        </>
      )}
    </>
  );
}

/** One module's record lists: tabs for the groups and for the lists in the chosen group, then the list. */
export async function LhtRecordsPage({ module, sp }: { module: LhtModule; sp: Record<string, string | string[] | undefined> }) {
  const { t } = await getI18n();
  const asked = typeof sp.view === 'string' ? sp.view : '';
  const group = groupOf(module, asked) ?? LHT_GROUPS[module][0];
  const entity = group.entities.includes(asked) ? asked : group.entities[0];
  const title = t(`lht.records.${module}` as MessageKey);
  const word = (e: string) => t(`rk.entity.${e}` as MessageKey);
  const href = (e: string) => `/${module}/records?view=${e}`;

  const records = await loadRecords(entity, sp);
  const sources: Partial<Record<OptionSource, FieldOption[]>> = {};
  for (const s of sourcesFor(entity)) {
    const src = OPTION_SOURCES[s];
    const meta = await load(() => api<RecordMeta>(`/v1/records/${src.entity}/meta`));
    sources[s] = meta.data?.fields.find((f) => f.key === src.field)?.options ?? [];
  }

  return (
    <>
      <PageHeader title={title} subtitle={t(`lht.records.${module}.sub` as MessageKey)} actions={<LhtLinks module={module} here="records" />} />
      <LinkTabs value={group.key} label={title} items={LHT_GROUPS[module].map((g) => ({ value: g.key, label: t(`lht.g.${module}.${g.key}` as MessageKey), href: href(g.entities[0]) }))} />
      {group.entities.length > 1 && <LinkTabs value={entity} label={t(`lht.g.${module}.${group.key}` as MessageKey)} items={group.entities.map((e) => ({ value: e, label: word(e), href: href(e) }))} />}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <LhtRecords module={module} meta={records.data.meta} page={records.data.page} state={records.data.state} view={entity} sources={sources} />}
    </>
  );
}
