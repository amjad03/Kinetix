import { FileDown, Filter } from 'lucide-react';
import type { Metadata } from 'next';
import { ApprovalsView, AuditLogTable, SignInsView, UsageView } from '@/components/access/AuditViews';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { SelectInput, TextInput } from '@/components/ui/Form';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { rangeParams, type ApprovalsReport, type SignInReport, type UsageReport } from '@/lib/governance-access';
import { AUDIT_PAGE_SIZE, auditArea, auditExportPath, auditPageNo, auditParams, type AuditPage, type AuditSearch } from '@/lib/govern';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.audit') };
}

type Tab = 'log' | 'signins' | 'usage' | 'approvals';
const TABS: Tab[] = ['log', 'signins', 'usage', 'approvals'];

/**
 * Audit and access reports: the audit log (who changed what, before and after; filters; CSV), sign-ins and failed
 * attempts, usage by area and role, and pending approvals by age. Opening the log is itself audited by the API.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditSearch> }) {
  await requireSection('audit');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'log';

  const tabs = (
    <LinkTabs
      value={tab}
      label={t('nav.audit')}
      items={TABS.map((v) => ({ value: v, label: t(`ga.audit.tab.${v}`), href: v === 'log' ? '/audit' : `/audit?tab=${v}` }))}
    />
  );
  const range = (
    <form className="mb-5 flex flex-wrap items-end gap-3" method="get" data-testid="report-range">
      <input type="hidden" name="tab" value={tab} />
      <TextInput label={t('audit.f.from')} type="date" name="from" defaultValue={sp.from ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
      <TextInput label={t('audit.f.to')} type="date" name="to" defaultValue={sp.to ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
      <Button type="submit" variant="outline" className="h-9">
        <Filter />
        {t('audit.apply')}
      </Button>
    </form>
  );
  const header = <PageHeader title={t('nav.audit')} subtitle={t('audit.subtitle')} actions={<LinkButton href="/settings/users" variant="outlined">{t('ga.users.title')}</LinkButton>} />;

  if (tab === 'signins' || tab === 'usage' || tab === 'approvals') {
    const q = rangeParams(sp);
    const path = tab === 'signins' ? `/v1/admin/access/reports/sign-ins?${q}` : tab === 'usage' ? `/v1/admin/access/reports/usage?${q}` : '/v1/admin/access/reports/approvals';
    const data = await load(() => api<SignInReport & UsageReport & ApprovalsReport>(path));
    return (
      <>
        {header}
        {tabs}
        {tab !== 'approvals' && range}
        {data.error !== undefined ? <ErrorState message={data.error} /> : tab === 'signins' ? <SignInsView data={data.data} /> : tab === 'usage' ? <UsageView data={data.data} /> : <ApprovalsView data={data.data} />}
      </>
    );
  }

  const filters = auditParams(sp);
  const page = auditPageNo(sp.page);
  const q = new URLSearchParams(filters);
  q.set('limit', String(AUDIT_PAGE_SIZE));
  q.set('offset', String((page - 1) * AUDIT_PAGE_SIZE));
  const [res, actions, actors] = await Promise.all([load(() => api<AuditPage>(`/v1/audit?${q}`)), load(() => api<string[]>('/v1/audit/actions')), load(() => api<{ id: string; name: string }[]>('/v1/audit/actors'))]);
  const areas = [...new Set((actions.data ?? []).map(auditArea))].sort();
  const link = (n: number) => {
    const p = new URLSearchParams(filters);
    if (n > 1) p.set('page', String(n));
    return `/audit${p.toString() ? `?${p}` : ''}`;
  };
  return (
    <>
      {header}
      {tabs}
      <form className="mb-5 flex flex-wrap items-end gap-3" method="get" data-testid="audit-filters">
        <TextInput label={t('ga.audit.search')} name="q" defaultValue={sp.q ?? ''} placeholder={t('ga.audit.searchPh')} />
        <SelectInput label={t('ga.audit.area')} name="action" defaultValue={sp.action ?? ''} options={[...areas.map((a) => ({ value: `${a}.*`, label: a.replace(/_/g, ' ') })), ...(sp.action && !sp.action.endsWith('.*') ? [{ value: sp.action, label: sp.action }] : [])]} empty={t('ga.audit.anyArea')} className="min-w-[160px]" />
        <SelectInput label={t('audit.col.actor')} name="actorId" defaultValue={sp.actorId ?? ''} options={(actors.data ?? []).map((a) => ({ value: a.id, label: a.name }))} empty={t('ga.audit.anyone')} className="min-w-[180px]" />
        <TextInput label={t('audit.f.from')} type="date" name="from" defaultValue={sp.from ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
        <TextInput label={t('audit.f.to')} type="date" name="to" defaultValue={sp.to ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
        {sp.subjectType && <input type="hidden" name="subjectType" value={sp.subjectType} />}
        {sp.subjectId && <input type="hidden" name="subjectId" value={sp.subjectId} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" className="h-9">
            <Filter />
            {t('audit.apply')}
          </Button>
          <LinkButton href="/audit" variant="text" className="h-9">
            {t('ga.audit.clear')}
          </LinkButton>
          <LinkButton variant="outlined" href={auditExportPath(filters)} startIcon={<FileDown />} className="h-9" data-testid="audit-export">
            {t('audit.export')}
          </LinkButton>
        </div>
      </form>
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <p className="mb-2 text-[13px] leading-[19px] text-muted-foreground" data-testid="audit-total">
            {t('audit.total', { n: fmt.number(res.data.total) })}
          </p>
          <AuditLogTable items={res.data.items} />
          <div className="mt-3 flex items-center gap-2">
            {page > 1 && (
              <LinkButton href={link(page - 1)} variant="outlined" className="h-9">
                {t('audit.prev')}
              </LinkButton>
            )}
            <p className="m-0 text-[13px] leading-[19px]">{t('audit.page', { n: page })}</p>
            {res.data.offset + res.data.items.length < res.data.total && (
              <LinkButton href={link(page + 1)} variant="outlined" className="h-9">
                {t('audit.next')}
              </LinkButton>
            )}
          </div>
        </>
      )}
    </>
  );
}
