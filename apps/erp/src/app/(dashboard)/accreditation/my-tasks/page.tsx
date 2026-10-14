import type { Metadata } from 'next';
import NextLink from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ClipboardList } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/States';
import { Card, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import type { TaskStatus } from '@/lib/accreditation-ui';

interface MyTask {
  id: string;
  framework: string;
  frameworkTitle: string;
  cycle: string;
  scope: string;
  kind: 'metric' | 'criterion';
  title: string;
  status: TaskStatus;
  dueOn: string | null;
  note: string;
  metrics: { code: string; title: string }[];
}

const TONE = { assigned: 'neutral', in_progress: 'info', submitted: 'warning', approved: 'success', returned: 'danger' } as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acx.my.title') };
}

/** Accreditation work assigned to me: each metric or criterion with its framework, cycle, due date and review status. */
export default async function MyTasksPage() {
  await requireSection('facultyEvidence');
  const { t, fmt } = await getI18n();
  const data = await load(() => api<MyTask[]>('/v1/accreditation/my-tasks'));
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={t('acx.my.title')} subtitle={t('acx.my.sub')} />
        <ErrorState message={data.error} />
      </>
    );
  const tasks = data.data;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t('acx.my.title')} subtitle={t('acx.my.sub')} />
      <Card padded={false} testId="acx-my-tasks">
        {tasks.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={t('acx.my.none')} />
        ) : (
          <ul className="m-0 list-none p-0">
            {tasks.map((x) => {
              const overdue = !!x.dueOn && x.dueOn < today && x.status !== 'approved' && x.status !== 'submitted';
              const href = x.kind === 'metric' ? `/accreditation/${x.framework}/metrics/${encodeURIComponent(x.scope)}?cycle=${x.cycle}` : null;
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13px] font-semibold">{x.kind === 'metric' ? `${x.scope} ${x.title}` : x.title}</b>
                    <span className="block text-xs text-muted-foreground">
                      {x.frameworkTitle} · {x.cycle}
                      {x.dueOn ? ` · ${t('acx.r.due', { date: fmt.date(x.dueOn) })}` : ''}
                    </span>
                    {x.note && <span className="mt-0.5 block text-xs text-muted-foreground">{x.note}</span>}
                    {x.kind === 'criterion' && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {x.metrics.map((m) => (
                          <NextLink key={m.code} href={`/accreditation/${x.framework}/metrics/${encodeURIComponent(m.code)}?cycle=${x.cycle}`} title={m.title} className="rounded-md border bg-card px-2 py-0.5 text-xs font-medium text-foreground no-underline hover:bg-accent">
                            {m.code}
                          </NextLink>
                        ))}
                      </span>
                    )}
                  </span>
                  <StatusPill tone={overdue ? 'danger' : TONE[x.status]}>{overdue ? t('acx.t.overdue') : t(`acx.ts.${x.status}` as MessageKey)}</StatusPill>
                </>
              );
              return (
                <li key={x.id} className="border-t first:border-t-0">
                  {href ? (
                    <NextLink href={href} className="flex items-center gap-3 px-5 py-3 text-foreground no-underline hover:bg-accent/50">
                      {body}
                    </NextLink>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
