import type { Metadata } from 'next';
import Link from 'next/link';
import { CurriculumTabs } from '@/components/curriculum/CurriculumTabs';
import { ReadmissionHistory, ReadmissionPlanView } from '@/components/curriculum/Readmission';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { canReadmit, type ReadmissionPlan, type ReadmissionRow } from '@/lib/relative-grading';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ra.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Hit = { id: string; name: string; rollNo: string; status: string; section: string; program: string };

/**
 * Re-admission into the scheme in force: find the student, give the day they rejoin and the term, see the curriculum
 * version they move to with what counts (same code or an equivalence) and what is left, then re-admit them.
 */
export default async function ReadmissionPage({ searchParams }: { searchParams: Promise<{ q?: string; student?: string; on?: string; term?: string }> }) {
  const me = await requireSection('curriculum');
  const sp = await searchParams;
  const { t } = await getI18n();
  const student = sp.student && UUID.test(sp.student) ? sp.student : null;
  const q = (sp.q ?? '').trim();
  const on = sp.on && DAY.test(sp.on) ? sp.on : new Date().toISOString().slice(0, 10);
  const term = Number(sp.term ?? '');
  const hits = !student && q.length >= 2 ? await load(() => api<Hit[]>(`/v1/readmissions/search?q=${encodeURIComponent(q)}`)) : null;
  const who = student ? await load(async () => (await api<Hit[]>(`/v1/readmissions/search?id=${student}`))[0] ?? null) : null;
  const history = student ? await load(() => api<ReadmissionRow[]>(`/v1/readmissions/students/${student}`)) : null;
  const plan = student && sp.term && Number.isInteger(term) && term >= 1 ? await load(() => api<ReadmissionPlan>(`/v1/readmissions/students/${student}/preview?rejoinedOn=${on}&rejoinTerm=${term}`)) : null;
  return (
    <>
      <PageHeader title={t('ra.title')} subtitle={t('ra.subtitle')} />
      <CurriculumTabs current="readmission" />
      <div className="grid gap-6">
        {!student ? (
          <Card title={t('ra.findTitle')}>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-[14rem] flex-1 gap-1.5">
                <Label htmlFor="ra-q">{t('ra.find')}</Label>
                <Input id="ra-q" name="q" defaultValue={q} placeholder={t('ra.findHint')} data-testid="ra-q" />
              </div>
              <Button type="submit">
                {t('ra.search')}
              </Button>
            </form>
            {hits?.error !== undefined && hits && <ErrorState message={hits.error} />}
            {hits?.data && (
              <ul className="mt-4 mb-0 grid list-none gap-1.5 p-0" data-testid="ra-hits">
                {hits.data.length === 0 && <li className="text-sm text-muted-foreground">{t('ra.noHits')}</li>}
                {hits.data.slice(0, 20).map((h) => (
                  <li key={h.id}>
                    <Link className="flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" href={`/curriculum/readmission?student=${h.id}`}>
                      <b className="font-medium">{h.name}</b>
                      <span className="text-muted-foreground">
                        {h.section} · {h.rollNo} · {h.program}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : who?.error !== undefined ? (
          <ErrorState message={who!.error!} />
        ) : (
          <>
            <Card
              title={who?.data?.name ?? ''}
              subtitle={who?.data ? `${who.data.section} · ${who.data.rollNo}` : undefined}
              action={
                <span className="flex flex-wrap gap-3 text-sm">
                  <Link className="underline underline-offset-2" href={`/students/${student}`}>
                    {t('ra.profile')}
                  </Link>
                  <Link className="underline underline-offset-2" href="/curriculum/readmission">
                    {t('ra.other')}
                  </Link>
                </span>
              }
            >
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="student" value={student} />
                <div className="grid gap-1.5">
                  <Label htmlFor="ra-on">{t('ra.rejoinedOn')}</Label>
                  <Input id="ra-on" name="on" type="date" defaultValue={on} required className="w-44" data-testid="ra-on" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ra-term">{t('ra.rejoinTerm')}</Label>
                  <Input id="ra-term" name="term" type="number" min={1} max={20} defaultValue={sp.term ?? ''} required className="w-28" data-testid="ra-term" />
                </div>
                <Button type="submit" variant="outline" data-testid="ra-preview">
                  {t('ra.preview')}
                </Button>
              </form>
            </Card>
            {plan?.error !== undefined && plan && (
              <p role="alert" className="m-0 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="ra-plan-error">
                {plan.error}
              </p>
            )}
            {plan?.data && <ReadmissionPlanView plan={plan.data} canApply={canReadmit(me?.roles ?? [])} />}
            <section className="grid gap-2">
              <h2 className="m-0 text-base font-semibold">{t('ra.history')}</h2>
              {history?.error !== undefined && history ? <ErrorState message={history.error} /> : <ReadmissionHistory rows={history?.data ?? []} />}
            </section>
          </>
        )}
        {!student && !hits && <EmptyState title={t('ra.startTitle')} description={t('ra.startSub')} />}
      </div>
    </>
  );
}
