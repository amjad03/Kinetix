'use client';

import { CircleCheck, Hourglass, LogIn, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, DataTable, EmptyState, LineChart, Sheet, StatGrid, StatTile, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { AGE_BUCKETS, approvalHref, deviceName, type ApprovalsReport, type SignInReport, type UsageReport } from '@/lib/governance-access';
import { auditArea, auditChanges, auditValue, type AuditItem } from '@/lib/govern';
import { useRoleName } from './UsersAccess';

/** "fee_accounts" → "Fee accounts": an audit area or field name as words. */
export const words = (s: string) => s.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** The audit log page's rows; a row opens the entry with each changed field before and after. */
export function AuditLogTable({ items }: { items: AuditItem[] }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<AuditItem | null>(null);
  const columns: Column<AuditItem>[] = [
    { id: 'when', header: t('audit.col.when'), rowHeader: true, cell: (r) => <span className="whitespace-nowrap">{fmt.dateTime(r.at)}</span> },
    { id: 'actor', header: t('audit.col.actor'), cell: (r) => r.actorName ?? (r.actorType === 'system' ? t('audit.system') : (r.actorId?.slice(0, 8) ?? '—')) },
    {
      id: 'action',
      header: t('audit.col.action'),
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusPill tone="neutral">{words(auditArea(r.action))}</StatusPill>
          <span className="font-mono text-[12px]">{r.action}</span>
        </span>
      ),
    },
    { id: 'subject', header: t('audit.col.subject'), hideBelow: 'md', cell: (r) => (r.subjectType ? `${words(r.subjectType)}${r.subjectId ? ` · ${r.subjectId.slice(0, 8)}` : ''}` : '—') },
    {
      id: 'changes',
      header: t('ga.audit.col.changes'),
      hideBelow: 'sm',
      cell: (r) => {
        const c = auditChanges(r.data);
        return c.length ? t('ga.audit.fields', { n: c.length, list: c.slice(0, 3).map((x) => words(x.field)).join(', ') }) : <span className="text-muted-foreground">—</span>;
      },
    },
  ];
  return (
    <>
      <DataTable label={t('nav.audit')} columns={columns} rows={items} rowId={(r) => String(r.id)} onRowClick={setOpen} pageSize={50} testId="audit-table" exportName="audit-page" empty={<EmptyState icon={<ScrollText />} title={t('ga.audit.none')}>{t('ga.audit.noneBody')}</EmptyState>} />
      {open && (
        <Sheet open title={open.action} subtitle={fmt.dateTime(open.at)} onClose={() => setOpen(null)} width={560}>
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm" data-testid="audit-entry">
            <dt className="text-muted-foreground">{t('audit.col.actor')}</dt>
            <dd className="m-0">{open.actorName ?? (open.actorType === 'system' ? t('audit.system') : (open.actorId ?? '—'))}</dd>
            <dt className="text-muted-foreground">{t('audit.col.subject')}</dt>
            <dd className="m-0 break-all">{open.subjectType ? `${words(open.subjectType)} ${open.subjectId ?? ''}` : '—'}</dd>
          </dl>
          {auditChanges(open.data).length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">{t('ga.audit.field')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('ga.audit.before')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('ga.audit.after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditChanges(open.data).map((c) => (
                    <tr key={c.field} className="border-b align-top last:border-b-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium">{words(c.field)}</th>
                      <td className="px-3 py-2 break-words text-red-ink line-through decoration-red-ink/40">{auditValue(c.before)}</td>
                      <td className="px-3 py-2 break-words text-green-ink">{auditValue(c.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {open.data !== null && (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm text-muted-foreground">{t('ga.audit.raw')}</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-[12px] whitespace-pre-wrap">{JSON.stringify(open.data, null, 2)}</pre>
            </details>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Sign-ins: totals, a line per day, people with repeated failures and the latest attempts. */
export function SignInsView({ data }: { data: SignInReport }) {
  const { t, fmt } = useI18n();
  const peak = Math.max(1, ...data.byDay.map((d) => d.ok + d.failed));
  const columns: Column<SignInReport['items'][number]>[] = [
    { id: 'when', header: t('audit.col.when'), rowHeader: true, sort: (r) => r.at, cell: (r) => <span className="whitespace-nowrap">{fmt.dateTime(r.at)}</span> },
    { id: 'who', header: t('ga.signins.col.who'), sort: (r) => r.name ?? '', cell: (r) => (r.userId ? <Link href={`/settings/users?q=${encodeURIComponent(r.email ?? r.name ?? '')}`}>{r.name ?? r.email ?? r.userId.slice(0, 8)}</Link> : '—') },
    { id: 'result', header: t('ga.signins.col.result'), sort: (r) => r.action, cell: (r) => <StatusPill tone={r.action === 'auth.sign_in' ? 'success' : 'danger'}>{t(`ga.signin.${r.action.replace('auth.', '')}` as MessageKey)}</StatusPill> },
    { id: 'method', header: t('ga.signins.col.method'), hideBelow: 'sm', cell: (r) => (r.data?.method ? t(`ga.signins.method.${r.data.method === 'otp' ? 'otp' : r.data.method === 'sso' ? 'sso' : 'password'}`) : '') },
    { id: 'from', header: t('ga.signins.col.from'), hideBelow: 'md', cell: (r) => [r.data?.device ?? r.device ?? (r.userAgent ? deviceName({ label: '', userAgent: r.userAgent }) : null), r.data?.ip ?? r.ip].filter(Boolean).join(' · ') },
  ];
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('ga.signins.stat.ok')} value={fmt.number(data.totals.ok)} icon={<LogIn />} caption={t('ga.signins.stat.people', { n: data.totals.people })} />
        <StatTile label={t('ga.signins.stat.failed')} value={fmt.number(data.totals.failed)} tone={data.totals.failed ? 'warning' : 'default'} />
        <StatTile label={t('ga.signins.stat.never')} value={fmt.number(data.totals.neverSignedIn)} caption={t('ga.signins.stat.neverHelp')} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('ga.signins.byDay')}>
          {data.byDay.length ? (
            <LineChart
              labels={data.byDay.map((d) => fmt.date(d.day, 'dayMonth'))}
              series={[
                { key: 'ok', label: t('ga.signins.stat.ok'), values: data.byDay.map((d) => d.ok) },
                { key: 'failed', label: t('ga.signins.stat.failed'), values: data.byDay.map((d) => d.failed), color: 'var(--chart-5)' },
              ]}
              max={peak}
              unit=""
              area={false}
              ariaLabel={t('ga.signins.byDay')}
            />
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{t('ga.signins.noneInRange')}</p>
          )}
        </Card>
        <Card title={t('ga.signins.repeat')} subtitle={t('ga.signins.repeatHelp')}>
          {data.repeatFailures.length ? (
            <ul className="m-0 list-none divide-y p-0 text-sm">
              {data.repeatFailures.map((r) => (
                <li key={r.userId ?? r.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{r.name ?? '—'}</span>
                  <StatusPill tone="danger">{t('ga.signins.failures', { n: r.n })}</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{t('ga.signins.noRepeat')}</p>
          )}
        </Card>
      </div>
      <div className="mt-6">
        <DataTable label={t('ga.signins.title')} columns={columns} rows={data.items} rowId={(r) => String(r.id)} exportName="sign-ins" testId="signins-table" empty={<EmptyState icon={<LogIn />} title={t('ga.signins.noneInRange')} />} />
      </div>
    </>
  );
}

/** Usage: what each area of the product and each role did in the range, and the busiest people. */
export function UsageView({ data }: { data: UsageReport }) {
  const { t, fmt } = useI18n();
  const roleName = useRoleName();
  const peak = Math.max(1, ...data.byDay.map((d) => d.actions));
  const areaCols: Column<UsageReport['byArea'][number]>[] = [
    { id: 'area', header: t('ga.usage.col.area'), rowHeader: true, sort: (r) => r.area, cell: (r) => words(r.area) },
    { id: 'actions', header: t('ga.usage.col.actions'), align: 'right', sort: (r) => r.actions, cell: (r) => fmt.number(r.actions) },
    { id: 'people', header: t('ga.usage.col.people'), align: 'right', sort: (r) => r.people, cell: (r) => fmt.number(r.people) },
    { id: 'last', header: t('ga.usage.col.last'), hideBelow: 'sm', sort: (r) => r.last, cell: (r) => fmt.relative(r.last) },
  ];
  const roleCols: Column<UsageReport['byRole'][number]>[] = [
    { id: 'role', header: t('ga.usage.col.role'), rowHeader: true, sort: (r) => r.role, cell: (r) => roleName(r.role) },
    { id: 'actions', header: t('ga.usage.col.actions'), align: 'right', sort: (r) => r.actions, cell: (r) => fmt.number(r.actions) },
    { id: 'people', header: t('ga.usage.col.people'), align: 'right', sort: (r) => r.people, cell: (r) => fmt.number(r.people) },
  ];
  const peopleCols: Column<UsageReport['people'][number]>[] = [
    { id: 'name', header: t('ga.usage.col.person'), rowHeader: true, sort: (r) => r.name ?? '', cell: (r) => r.name ?? '—' },
    { id: 'actions', header: t('ga.usage.col.actions'), align: 'right', sort: (r) => r.actions, cell: (r) => fmt.number(r.actions) },
    { id: 'areas', header: t('ga.usage.col.areas'), align: 'right', hideBelow: 'sm', sort: (r) => r.areas, cell: (r) => fmt.number(r.areas) },
    { id: 'last', header: t('ga.usage.col.last'), hideBelow: 'sm', sort: (r) => r.last, cell: (r) => fmt.relative(r.last) },
  ];
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('ga.usage.stat.actions')} value={fmt.number(data.totals.actions)} />
        <StatTile label={t('ga.usage.stat.active')} value={fmt.number(data.totals.activePeople)} />
        <StatTile label={t('ga.usage.stat.areas')} value={fmt.number(data.byArea.length)} />
      </StatGrid>
      <Card title={t('ga.usage.byDay')}>
        {data.byDay.length ? (
          <LineChart labels={data.byDay.map((d) => fmt.date(d.day, 'dayMonth'))} series={[{ key: 'actions', label: t('ga.usage.stat.actions'), values: data.byDay.map((d) => d.actions) }]} max={peak} unit="" ariaLabel={t('ga.usage.byDay')} />
        ) : (
          <p className="m-0 text-sm text-muted-foreground">{t('ga.usage.none')}</p>
        )}
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DataTable label={t('ga.usage.byArea')} columns={areaCols} rows={data.byArea} rowId={(r) => r.area} exportName="usage-by-area" testId="usage-areas" empty={<EmptyState icon={<ScrollText />} title={t('ga.usage.none')} />} />
        <DataTable label={t('ga.usage.byRole')} columns={roleCols} rows={data.byRole} rowId={(r) => r.role} exportName="usage-by-role" empty={<EmptyState icon={<ScrollText />} title={t('ga.usage.none')} />} />
      </div>
      <div className="mt-6">
        <DataTable label={t('ga.usage.people')} columns={peopleCols} rows={data.people} rowId={(r) => r.userId ?? r.name ?? ''} exportName="usage-by-person" empty={<EmptyState icon={<ScrollText />} title={t('ga.usage.none')} />} />
      </div>
    </>
  );
}

/** Pending approvals by age: per source in four age buckets, the oldest items and who they wait on. */
export function ApprovalsView({ data }: { data: ApprovalsReport }) {
  const { t, fmt } = useI18n();
  const total = data.summary.reduce((a, s) => a + s.total, 0);
  const overWeek = data.summary.reduce((a, s) => a + s.d8_30 + s.d31, 0);
  const oldestCols: Column<ApprovalsReport['oldest'][number]>[] = [
    { id: 'title', header: t('ga.appr.col.item'), rowHeader: true, sort: (r) => r.title, cell: (r) => {
        const href = approvalHref(r.source);
        return href ? <Link href={href}>{r.title}</Link> : r.title;
      },
    },
    { id: 'source', header: t('ga.appr.col.source'), sort: (r) => r.source, cell: (r) => <StatusPill tone="neutral">{t(`ga.appr.source.${r.source}`)}</StatusPill> },
    { id: 'waiting', header: t('ga.appr.col.waitingOn'), hideBelow: 'sm', sort: (r) => r.waitingOn ?? '', cell: (r) => r.waitingOn ?? '—' },
    { id: 'since', header: t('ga.appr.col.since'), hideBelow: 'md', sort: (r) => r.since, cell: (r) => fmt.date(r.since.slice(0, 10), 'short') },
    { id: 'days', header: t('ga.appr.col.days'), align: 'right', sort: (r) => r.days, cell: (r) => <span className={r.days > 7 ? 'font-semibold text-red-ink' : ''}>{fmt.number(r.days)}</span> },
  ];
  const personCols: Column<ApprovalsReport['byPerson'][number]>[] = [
    { id: 'who', header: t('ga.appr.col.waitingOn'), rowHeader: true, sort: (r) => r.waitingOn, cell: (r) => r.waitingOn },
    { id: 'total', header: t('ga.appr.col.pending'), align: 'right', sort: (r) => r.total, cell: (r) => fmt.number(r.total) },
    { id: 'over', header: t('ga.appr.col.overWeek'), align: 'right', sort: (r) => r.overWeek, cell: (r) => (r.overWeek ? <span className="text-red-ink">{fmt.number(r.overWeek)}</span> : '0') },
  ];
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('ga.appr.stat.pending')} value={fmt.number(total)} icon={<Hourglass />} />
        <StatTile label={t('ga.appr.stat.overWeek')} value={fmt.number(overWeek)} tone={overWeek ? 'warning' : 'default'} />
        <StatTile label={t('ga.appr.stat.oldest')} value={data.oldest[0] ? t('ga.appr.days', { n: data.oldest[0].days }) : '—'} />
      </StatGrid>
      <Card title={t('ga.appr.byAge')}>
        {total ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="approvals-ageing">
              <thead>
                <tr className="border-b text-left text-[12px] text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('ga.appr.col.source')}</th>
                  {AGE_BUCKETS.map((b) => (
                    <th key={b} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">{t(`ga.appr.bucket.${b}`)}</th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right font-medium">{t('ga.appr.col.pending')}</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((s) => (
                  <tr key={s.source} className="border-b last:border-b-0">
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium whitespace-nowrap">{t(`ga.appr.source.${s.source}`)}</th>
                    {AGE_BUCKETS.map((b, i) => (
                      <td key={b} className={`px-3 py-2.5 text-right tabular-nums ${s[b] && i >= 2 ? 'font-semibold text-red-ink' : s[b] ? '' : 'text-muted-foreground'}`}>{fmt.number(s[b])}</td>
                    ))}
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{fmt.number(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<CircleCheck />} title={t('ga.appr.none')}>
            {t('ga.appr.noneBody')}
          </EmptyState>
        )}
      </Card>
      {total > 0 && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DataTable label={t('ga.appr.oldest')} columns={oldestCols} rows={data.oldest} rowId={(r) => `${r.source}-${r.id}`} exportName="pending-approvals" testId="approvals-oldest" />
          <DataTable label={t('ga.appr.byPerson')} columns={personCols} rows={data.byPerson} rowId={(r) => r.waitingOn} exportName="pending-by-person" />
        </div>
      )}
    </>
  );
}
