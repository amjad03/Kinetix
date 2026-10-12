import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { Card, ErrorState, StatusPill } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { KINDS, label, recordHref, REPORTS, kindSlug, type Overview } from '@/lib/exam-office';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xo.title') };
}

const INBOX: { key: string; href: string }[] = [
  { key: 'qp_scrutiny', href: '/exams/office/question-paper' },
  { key: 'qp_sealed', href: '/exams/office/question-paper' },
  { key: 'mod_open', href: '/exams/office/paper' },
  { key: 'reval_open', href: '/exams/office/revaluation' },
  { key: 'cert_open', href: '/exams/office/certificate' },
];

/** The exam office desk: where every session stands in its workflow, what waits on the office, registers and reports. */
export default async function ExamOfficePage() {
  await requireSection('exams');
  const { t, fmt } = await getI18n();
  const data = await load(() => api<Overview>('/v1/exam-office/overview'));
  return (
    <>
      <PageHeader
        title={t('xo.title')}
        subtitle={t('xo.subtitle')}
        actions={
          <LinkButton href="/exams/office/settings" variant="outlined" startIcon={<Settings />}>
            {t('xo.settings')}
          </LinkButton>
        }
      />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card title={t('xo.sessions')}>
              {data.data.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('xo.noSessions')}</p>
              ) : (
                <ul className="grid gap-4">
                  {data.data.sessions.map((s) => (
                    <li key={s.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={recordHref('session', s.id)} className="font-semibold hover:underline">
                            {s.name}
                          </Link>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {s.programme} · {fmt.date(s.starts_on.slice(0, 10), 'short')} – {fmt.date(s.ends_on.slice(0, 10), 'short')}
                          </p>
                        </div>
                        <StatusPill tone={s.pending ? 'warning' : s.stage ? 'info' : 'success'}>{s.pending ? t('xo.waiting') : s.stage ? `${t('xo.now')}: ${label(t, 'xo.s.', s.stage)}` : t('xo.done')}</StatusPill>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.done} aria-label={t('xo.progress', { done: s.done, total: s.total })}>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(s.done / s.total) * 100}%` }} />
                        </div>
                        <span className="text-xs whitespace-nowrap text-muted-foreground">{t('xo.progress', { done: s.done, total: s.total })}</span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
                        {(
                          [
                            ['candidates', s.candidates],
                            ['fees_open', s.feeOpen],
                            ['scripts_open', s.scriptsOpen],
                            ['moderations_open', s.moderationsOpen],
                            ['revaluations_open', s.revaluationsOpen],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-xs text-muted-foreground">{label(t, 'xo.c.', k)}</dt>
                            <dd className="font-semibold">{fmt.number(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t('xo.inbox')}>
              <ul className="grid gap-1">
                {INBOX.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                      <span>{label(t, 'xo.cnt.', i.key)}</span>
                      <span className="font-semibold">{fmt.number(data.data.counts[i.key] ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title={t('xo.registers')}>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {KINDS.map((k) => (
                <li key={k}>
                  <Link href={`/exams/office/${kindSlug(k)}`} className="block rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted">
                    {label(t, 'xo.k.', k)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('xo.reports')}>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {REPORTS.map((r) => (
                <li key={r}>
                  <Link href={`/exams/office/reports/${r.replaceAll('_', '-')}${data.data.sessions[0] ? `?sessionId=${data.data.sessions[0].id}` : ''}`} className="block rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted">
                    {label(t, 'xo.r.', r)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
