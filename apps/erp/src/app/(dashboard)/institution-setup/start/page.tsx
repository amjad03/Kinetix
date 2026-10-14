import { ArrowRight, Award, Building2, Landmark, BookOpen, CalendarDays, Check, ClipboardCheck, Download, Plus, Sparkles, Upload, User, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { summarize, type SetupStepId } from '@/lib/setup';
import { loadSetup } from '@/lib/setup-load';
import { cn } from '@/lib/utils';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('setup.title') };
}

const ICON: Record<SetupStepId, LucideIcon> = { profile: Building2, affiliation: Landmark, programmes: BookOpen, staff: User, students: Users, timetable: CalendarDays, fees: Wallet };

/** Day one for a new college: a seven-step checklist worked out from the data that exists, and the empty dashboard it unlocks. */
export default async function SetupStartPage() {
  const me = await requireSection('institutionSetup');
  if (!me) return null;
  const { t } = await getI18n();
  const steps = await loadSetup();
  const { done, total, next } = summarize(steps);
  const pct = Math.round((done / total) * 100);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const ghosts: { label: string; help: string; icon: LucideIcon; step: SetupStepId | null }[] = [
    { label: t('dash.kpi.students'), help: t('setup.ghost.students'), icon: Users, step: 'students' },
    { label: t('today.stat.attendance'), help: t('setup.ghost.attendance'), icon: ClipboardCheck, step: 'timetable' },
    { label: t('dash.kpi.fees'), help: t('setup.ghost.fees'), icon: Wallet, step: 'fees' },
    { label: t('nav.results'), help: t('setup.ghost.results'), icon: Award, step: null },
  ];
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <>
      <PageHeader title={t('setup.title')} subtitle={t('setup.sub')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-card shadow-card lg:col-span-2" aria-labelledby="ck-h" data-testid="setup-checklist">
          <div className="flex items-start justify-between gap-3 px-[18px] pt-4">
            <div>
              <h2 id="ck-h" className="m-0 text-[15px] font-semibold">
                {t('setup.checklist')}
              </h2>
              <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{t('setup.checklistSub')}</p>
            </div>
            <svg width={52} height={52} viewBox="0 0 52 52" role="img" aria-label={`${pct}%`}>
              <circle cx={26} cy={26} r={r} fill="none" strokeWidth={6} className="stroke-muted" />
              <circle cx={26} cy={26} r={r} fill="none" strokeWidth={6} strokeLinecap="round" className="stroke-teal" strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} transform="rotate(-90 26 26)" />
              <text x={26} y={30} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                {pct}%
              </text>
            </svg>
          </div>
          <ol className="m-0 mt-2.5 list-none p-0">
            {steps.map((s) => {
              const Icon = ICON[s.id];
              const isNext = next?.id === s.id;
              return (
                <li key={s.id} data-done={s.done} className={cn('flex items-start gap-3 border-t px-[18px] py-3.5', isNext && 'bg-teal-soft/40')}>
                  <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-full border-[1.5px]', s.done ? 'border-teal bg-teal text-white' : isNext ? 'border-teal text-teal-ink' : 'border-border-strong text-muted-foreground')}>
                    {s.done ? <Check className="size-3.5" strokeWidth={3} /> : <Icon className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className={cn('block text-[13.5px] font-[550]', s.done && 'text-muted-foreground line-through decoration-1')}>{t(s.title)}</b>
                    <div className="text-[12.5px] text-muted-foreground">{t(s.help)}</div>
                    {isNext && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <LinkButton href={s.href} variant="contained" size="small" startIcon={s.upload ? <Upload /> : <ArrowRight />}>
                          {t(s.upload ? 'setup.upload' : 'setup.start')}
                        </LinkButton>
                      </div>
                    )}
                  </div>
                  <span className="hidden shrink-0 text-[12.5px] text-muted-foreground sm:block">{s.done ? t('setup.done') : `${s.minutes} min`}</span>
                  {!isNext && !s.done && (
                    <LinkButton href={s.href} variant="outlined" size="small">
                      {t('setup.open')}
                    </LinkButton>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <section className="self-start rounded-lg border bg-card shadow-card" aria-labelledby="pg-h">
          <div className="px-[18px] pt-4">
            <h2 id="pg-h" className="m-0 text-[15px] font-semibold">
              {t('setup.progress')}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{t('setup.progressSub', { done, total })}</p>
          </div>
          <div className="px-[18px] pt-4 pb-[18px]">
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <i className="block h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[12.5px] text-muted-foreground">{next ? t('setup.nextUp', { step: t(next.title) }) : t('setup.allSet')}</p>
            <div className="flex items-start gap-3 rounded-xl border border-teal/25 bg-teal-soft px-3.5 py-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-teal-ink" aria-hidden />
              <p className="m-0 text-[12.5px]">
                <Link href="/import/migration" className="underline-offset-2 hover:underline">
                  {t('setup.migrate')}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>

      {next && <h2 className="mt-7 mb-3 text-[15px] font-semibold">{t('setup.dashEmpty')}</h2>}
      {next && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ghosts.map((g) => (
          <div key={g.label} className="rounded-lg border border-dashed border-border-strong bg-card/60 px-[18px] py-4">
            <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
              <span>{g.label}</span>
              <span aria-hidden className="grid size-[30px] place-items-center rounded-[9px] border bg-background">
                <g.icon className="size-[15px]" />
              </span>
            </div>
            <b className="mt-2 block text-[28px] text-faint">—</b>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground">{g.help}</div>
            {g.step && !byId[g.step].done && (
              <LinkButton href={byId[g.step].href} variant="outlined" size="small" endIcon={<ArrowRight />} className="mt-2.5">
                {t('setup.setUp')}
              </LinkButton>
            )}
          </div>
        ))}
      </div>}

      {!byId.students.done && (
        <div className="mt-4 rounded-lg border bg-card p-1 shadow-card">
          <EmptyState
            icon={<Users />}
            title={t('setup.noStudents')}
            testId="setup-no-students"
            actions={
              <>
                <LinkButton href="/import" variant="contained" startIcon={<Upload />}>
                  {t('setup.import')}
                </LinkButton>
                <LinkButton href="/students" variant="outlined" startIcon={<Plus />}>
                  {t('setup.addManual')}
                </LinkButton>
                <LinkButton href="/import" variant="text" startIcon={<Download />}>
                  {t('setup.s.students')}
                </LinkButton>
              </>
            }
          >
            {t('setup.noStudentsHelp')}
          </EmptyState>
        </div>
      )}
    </>
  );
}
