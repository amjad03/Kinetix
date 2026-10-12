import type { Metadata } from 'next';
import { DeskTable } from '@/components/campus/Desk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TextInput } from '@/components/ui/Form';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { AUDIT_PAGE_SIZE, auditExportPath, auditPageNo, auditParams, type AuditPage, type AuditSearch } from '@/lib/govern';

import { Button } from '@/components/kx';
import { FileDown as FileDownloadOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.audit') };
}

/** The audit log: who did what and when, filtered by actor, action, subject and dates, paged, with a CSV download. Opening it is audited by the API. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditSearch> }) {
  await requireSection('audit');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const filters = auditParams(sp);
  const page = auditPageNo(sp.page);
  const q = new URLSearchParams(filters);
  q.set('limit', String(AUDIT_PAGE_SIZE));
  q.set('offset', String((page - 1) * AUDIT_PAGE_SIZE));
  const res = await load(() => api<AuditPage>(`/v1/audit?${q}`));
  const link = (n: number) => {
    const p = new URLSearchParams(filters);
    if (n > 1) p.set('page', String(n));
    return `/audit${p.toString() ? `?${p}` : ''}`;
  };
  const input = (name: keyof AuditSearch, label: string, type = 'text') => (
      <TextInput label={label} type={type} name={name} defaultValue={sp[name] ?? ''} slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined} />
  );
  return (
    <>
      <PageHeader title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <form className="flex gap-3 flex-wrap items-end mb-6" method="get" data-testid="audit-filters">
        {input('action', t('audit.f.action'))}
        {input('subjectType', t('audit.f.subjectType'))}
        {input('subjectId', t('audit.f.subjectId'))}
        {input('actorId', t('audit.f.actorId'))}
        {input('from', t('audit.f.from'), 'date')}
        {input('to', t('audit.f.to'), 'date')}
        <Button type="submit" variant="outlined">{t('audit.apply')}</Button>
        <Button variant="outlined" href={auditExportPath(filters)} startIcon={<FileDownloadOutlined />} data-testid="audit-export">{t('audit.export')}</Button>
      </form>
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-2" data-testid="audit-total">{t('audit.total', { n: fmt.number(res.data.total) })}</p>
          <DeskTable
            title={t('nav.audit')}
            testId="audit-table"
            exportName="audit-page"
            head={[t('audit.col.when'), t('audit.col.actor'), t('audit.col.action'), t('audit.col.subject'), t('audit.col.details')]}
            rows={res.data.items.map((r) => [
              fmt.dateTime(r.at),
              r.actorName ?? (r.actorType === 'system' ? t('audit.system') : r.actorId ?? '-'),
              r.action,
              r.subjectType ? `${r.subjectType}${r.subjectId ? ` ${r.subjectId.slice(0, 8)}` : ''}` : '-',
              r.data === null ? '-' : JSON.stringify(r.data).slice(0, 160),
            ])}
          />
          <div className="flex gap-2 items-center">
            {page > 1 && <LinkButton href={link(page - 1)} size="small">{t('audit.prev')}</LinkButton>}
            <p className="text-[13px] leading-[19px]">{t('audit.page', { n: page })}</p>
            {res.data.offset + res.data.items.length < res.data.total && <LinkButton href={link(page + 1)} size="small">{t('audit.next')}</LinkButton>}
          </div>
        </>
      )}
    </>
  );
}
