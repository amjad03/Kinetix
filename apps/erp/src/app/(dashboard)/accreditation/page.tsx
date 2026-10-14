import type { Metadata } from 'next';
import NextLink from 'next/link';
import { ArrowRight, BadgeCheck, Building2, ClipboardList, GraduationCap, Landmark, School, ShieldCheck, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { BODY_ORDER, type FrameworkSummary } from '@/lib/accreditation-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acx.h.title') };
}

const ICON = { naac: BadgeCheck, nba: GraduationCap, nirf: Trophy, aishe: ClipboardList, udise: School, aicte: Building2, ugc: Landmark, cbse: ShieldCheck } as const;

/** The accreditation hub: every framework and statutory return KINETIX prepares, grouped by body, and my open tasks. */
export default async function AccreditationHub() {
  await requireSection('accreditation');
  const { t } = await getI18n();
  const data = await load(async () => ({ list: await api<FrameworkSummary[]>('/v1/accreditation/frameworks'), mine: await safe(api<{ id: string; status: string }[]>('/v1/accreditation/my-tasks'), []) }));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { list, mine } = data.data;
  const open = mine.filter((x) => x.status !== 'approved').length;
  return (
    <>
      <PageHeader title={t('acx.h.title')} subtitle={t('acx.h.sub')} />
      {open > 0 && (
        <NextLink href="/accreditation/my-tasks" className="mb-4 flex items-center gap-3 rounded-lg border bg-amber-soft px-4 py-3 text-[13px] text-amber-ink no-underline">
          <ClipboardList className="size-4" aria-hidden />
          <b>{t('acx.h.myTasks', { n: open })}</b>
          <ArrowRight className="ml-auto size-4" aria-hidden />
        </NextLink>
      )}
      <div className="flex flex-col gap-6" data-testid="acx-hub">
        {BODY_ORDER.map((body) => {
          const fws = list.filter((f) => f.body === body);
          if (!fws.length) return null;
          const Icon = ICON[body];
          return (
            <section key={body} aria-labelledby={`acx-${body}`}>
              <h2 id={`acx-${body}`} className="m-0 mb-1 flex items-center gap-2 text-base font-semibold">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {t(`acx.body.${body}` as MessageKey)}
              </h2>
              <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t(`acx.bodySub.${body}` as MessageKey)}</p>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
                {fws.map((f) => (
                  <NextLink key={f.key} href={`/accreditation/${f.key}`} className="group no-underline" data-testid={`acx-fw-${f.key}`}>
                    <Card className="h-full transition-colors group-hover:border-border-strong">
                      <b className="block text-[15px] text-foreground">{f.title}</b>
                      <span className="mt-1 block text-[13px] text-muted-foreground">{f.variant}</span>
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        <StatusPill tone="info">{t('acx.h.metrics', { n: f.metrics })}</StatusPill>
                        <StatusPill>{t('acx.h.split', { qn: f.quantitative, ql: f.qualitative })}</StatusPill>
                        <StatusPill>{t('acx.h.years', { n: f.years })}</StatusPill>
                        {f.scoring !== 'none' && <StatusPill tone="success">{t(`acx.h.scoring.${f.scoring}` as MessageKey, { n: f.weight })}</StatusPill>}
                      </span>
                      <span className="mt-3 line-clamp-2 block text-xs text-muted-foreground">{f.source}</span>
                    </Card>
                  </NextLink>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
