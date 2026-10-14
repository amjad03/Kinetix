import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeHoldOverrides, FeeHoldPanel, HoldStudentPicker } from '@/components/fee-depth/FeeHolds';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { Card, LinkTabs, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { canOverrideFeeHold, FEE_HOLD_PURPOSES, type FeeHoldOverrideRow, type FeeHoldStatus } from '@/lib/fee-holds';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fh.pageTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fee holds: which documents the institution holds for unpaid fees (set in fee settings), a student's holds with the
 * principal's override, and every override in force (or, with ?all=1, withdrawn ones too).
 */
export default async function FeeHoldsPage({ searchParams }: { searchParams: Promise<{ student?: string; all?: string }> }) {
  const me = await requireSection('fees');
  const { student, all } = await searchParams;
  const { t } = await getI18n();
  const showAll = all === '1';
  const canOverride = canOverrideFeeHold(me?.roles ?? []);
  const data = await load(async () => {
    const [settings, rows, status] = await Promise.all([
      api<{ duesBlock: { hallTicket?: boolean; results?: boolean; tc?: boolean; minRupees?: number } }>('/v1/fee-accounts/settings'),
      api<FeeHoldOverrideRow[]>(`/v1/fee-holds${showAll ? '?all=1' : ''}`),
      student && UUID.test(student) ? api<FeeHoldStatus>(`/v1/fee-holds/${student}`) : Promise.resolve(null),
    ]);
    const name = status && student ? (await api<{ fullName: string }>(`/v1/students/${student}/profile`).catch(() => null))?.fullName : null;
    return { settings, rows, status, name };
  });
  const header = (
    <>
      <PageHeader
        title={t('fh.pageTitle')}
        subtitle={t('fh.pageSub')}
        actions={
          <Button asChild variant="outline" className="h-9">
            <Link href="/accounts/settings#set-dues">{t('fh.openSettings')}</Link>
          </Button>
        }
      />
      <FeesNav value="holds" />
    </>
  );
  if (data.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={data.error} />
      </>
    );
  const { settings, rows, status, name } = data.data;
  const block = settings.duesBlock ?? {};
  return (
    <>
      {header}
      <div className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('fh.settingsTitle')} action={<Link className="text-sm underline underline-offset-2" href="/accounts/settings#set-dues">{t('fh.change')}</Link>}>
            <ul className="m-0 grid list-none gap-2 p-0" data-testid="fee-hold-settings">
              {FEE_HOLD_PURPOSES.map((p) => (
                <li key={p} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(`fh.p.${p}` as MessageKey)}</span>
                  <StatusPill tone={block[p] ? 'warning' : 'neutral'}>{block[p] ? t('fh.on') : t('fh.off')}</StatusPill>
                </li>
              ))}
              <li className="text-sm text-muted-foreground">{t('fh.minNote', { amount: String(block.minRupees ?? 0) })}</li>
            </ul>
          </Card>
          <Card title={t('fh.findTitle')}>
            <p className="mt-0 mb-3 text-sm text-muted-foreground">{t('fh.findSub')}</p>
            <HoldStudentPicker />
          </Card>
        </div>
        {status && student && (
          <div className="grid gap-2">
            <h2 className="m-0 text-base font-semibold">
              <Link className="hover:underline" href={`/students/${student}?tab=fees`}>
                {name ?? t('fh.thisStudent')}
              </Link>
            </h2>
            <FeeHoldPanel studentId={student} status={status} canOverride={canOverride} canSettings />
          </div>
        )}
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="m-0 text-base font-semibold">{t('fh.listTitle')}</h2>
            <LinkTabs
              value={showAll ? 'all' : 'current'}
              label={t('fh.listTitle')}
              items={[
                { value: 'current', label: t('fh.current'), href: '/fees/holds' },
                { value: 'all', label: t('fh.withWithdrawn'), href: '/fees/holds?all=1' },
              ]}
            />
          </div>
          <FeeHoldOverrides rows={rows} canOverride={canOverride} showWithdrawn={showAll} />
        </section>
      </div>
    </>
  );
}
