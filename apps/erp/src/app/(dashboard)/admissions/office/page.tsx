import type { Metadata } from 'next';
import { ArchiveRestore, GitBranch, Scale, Stamp } from 'lucide-react';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { KitList, type KitColumn } from '@/components/admissions/KitList';
import { UgcSlabsButton } from '@/components/admissions/UgcSlabsButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adk.tab.office') };
}

const VIEWS = ['approvals', 'originals', 'rules', 'refunds'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Record<View, string> = { approvals: 'admission-requests', originals: 'custody-register', rules: 'assignment-rules', refunds: 'refund-slabs' };

/**
 * The admissions office: approvals waiting for the principal (management quota, cancellation and refund, change of
 * programme), the register of original certificates in custody, how enquiries are shared out among counsellors, and
 * the refund policy. Each is a record kit list.
 */
export default async function OfficePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as View) : 'approvals';
  const { t } = await getI18n();
  const loaded = await loadRecords(ENTITY[view], sp);
  const words = (prefix: string, values: string[]) => Object.fromEntries(values.map((v) => [v, t(`${prefix}.${v}` as MessageKey)]));
  const COLUMNS: Record<View, KitColumn[]> = {
    approvals: [
      { key: 'applicantName', header: t('adm.col.applicant'), sortKey: 'applicant', rowHeader: true, sub: 'applicationNo' },
      { key: 'kind', header: t('adk.col.kind'), sortKey: 'kind', labels: words('adk.req.kind', ['management_quota', 'cancellation', 'programme_change']) },
      { key: 'reason', header: t('si.col.reason'), hideBelow: 'md' },
      { key: 'refundPaise', header: t('adk.col.refund'), kind: 'paise', hideBelow: 'lg' },
      { key: 'toCycleName', header: t('adk.col.moveTo'), hideBelow: 'lg' },
      { key: 'status', header: t('adm.col.status'), sortKey: 'status', kind: 'pill', labels: words('adk.req.status', ['pending', 'approved', 'rejected']), tones: { pending: 'warning', approved: 'success', rejected: 'danger' } },
      { key: 'requesterName', header: t('adk.col.raisedBy'), hideBelow: 'lg' },
      { key: 'createdAt', header: t('si.col.raisedOn'), sortKey: 'created', kind: 'date', hideBelow: 'sm' },
    ],
    originals: [
      { key: 'holderName', header: t('adk.col.whose'), sortKey: 'holder', rowHeader: true, sub: 'applicationNo' },
      { key: 'document', header: t('adk.col.document'), sortKey: 'document' },
      { key: 'referenceNo', header: t('adk.col.reference'), hideBelow: 'md' },
      { key: 'receivedOn', header: t('adk.col.received'), sortKey: 'received', kind: 'date' },
      { key: 'status', header: t('adm.col.status'), kind: 'pill', labels: words('adk.custody', ['held', 'returned']), tones: { held: 'warning', returned: 'success' } },
      { key: 'returnedOn', header: t('adk.col.returnedOn'), sortKey: 'returned', kind: 'date', hideBelow: 'md' },
      { key: 'acknowledgement', header: t('adk.col.signedBy'), hideBelow: 'lg' },
    ],
    rules: [
      { key: 'name', header: t('adk.col.rule'), rowHeader: true },
      { key: 'programName', header: t('adk.col.programme'), hideBelow: 'md' },
      { key: 'source', header: t('adk.col.source'), hideBelow: 'md', labels: Object.fromEntries(['web', 'walk_in', 'phone', 'campaign', 'referral', 'import', 'whatsapp', 'fair', 'meta', 'google', 'email'].map((s) => [s, t(`adm.source.${s}` as MessageKey)])) },
      { key: 'region', header: t('adk.col.region'), hideBelow: 'lg' },
      { key: 'mode', header: t('adk.col.how'), labels: words('adk.mode', ['round_robin', 'least_loaded']) },
      { key: 'counsellorNames', header: t('adk.col.counsellors') },
      { key: 'active', header: t('adk.col.active'), kind: 'bool', hideBelow: 'sm' },
    ],
    refunds: [
      { key: 'label', header: t('adk.col.slab'), rowHeader: true },
      { key: 'uptoDays', header: t('adk.col.uptoDays'), kind: 'number' },
      { key: 'percent', header: t('adk.col.refundPct'), kind: 'number' },
      { key: 'deductionPercent', header: t('adk.col.chargePct'), kind: 'number', hideBelow: 'sm' },
      { key: 'deductionCapRupees', header: t('adk.col.chargeCap'), kind: 'rupees', hideBelow: 'sm' },
    ],
  };
  const EMPTY: Record<View, { icon: React.ReactNode; title: MessageKey; body: MessageKey }> = {
    approvals: { icon: <Stamp />, title: 'adk.req.none', body: 'adk.req.noneBody' },
    originals: { icon: <ArchiveRestore />, title: 'adk.custody.none', body: 'adk.custody.noneBody' },
    rules: { icon: <GitBranch />, title: 'adk.rules.none', body: 'adk.rules.noneBody' },
    refunds: { icon: <Scale />, title: 'adk.refund.none', body: 'adk.refund.noneBody' },
  };
  const note = (k: string) => [{ key: 'note', label: t(k as MessageKey), type: 'textarea' as const }];
  return (
    <>
      <PageHeader title={t('adk.tab.office')} subtitle={t('adk.office.subtitle')} />
      <AdmissionsTabs current="office" />
      <LinkTabs value={view} label={t('adk.tab.office')} items={VIEWS.map((v) => ({ value: v, label: t(`adk.office.${v}` as MessageKey), href: `/admissions/office?view=${v}` }))} />
      <p className="mb-4 text-[13px] text-muted-foreground">{t(`adk.office.${view}.help` as MessageKey)}</p>
      {loaded.error !== undefined ? (
        <ErrorState message={loaded.error} />
      ) : (
        <KitList
          meta={loaded.data.meta}
          page={loaded.data.page}
          state={loaded.data.state}
          label={t(`adk.office.${view}` as MessageKey)}
          columns={COLUMNS[view]}
          rowHref={view === 'approvals' ? '/admissions/applications/{applicationId}' : view === 'originals' ? '/admissions/applications/{applicationId}' : undefined}
          extraParams={{ view }}
          toolbar={view === 'refunds' && loaded.data.page.total === 0 ? <UgcSlabsButton /> : undefined}
          rowActionKeys={view === 'approvals' ? ['approve', 'reject'] : view === 'originals' ? ['return'] : []}
          actionParams={
            view === 'approvals'
              ? { approve: note('si.note'), reject: [{ key: 'note', label: t('si.rejectWhy'), type: 'textarea', required: true, min: 3 }] }
              : view === 'originals'
                ? {
                    return: [
                      { key: 'returnedTo', label: t('adk.custody.returnedTo'), required: true, min: 2 },
                      { key: 'acknowledgement', label: t('adk.custody.signedBy'), required: true, min: 2, help: t('adk.custody.signedHelp') },
                      { key: 'returnedOn', label: t('adk.custody.returnedOn'), type: 'date' },
                    ],
                  }
                : undefined
          }
          empty={
            <EmptyState icon={EMPTY[view].icon} title={t(EMPTY[view].title)}>
              {t(EMPTY[view].body)}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
