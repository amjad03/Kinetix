'use client';

import { FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ProfileHeader, type ProfileCover } from './ProfileHeader';
import { Card, StatusPill, TabPanel, Tabs, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';

export interface ActivityItem {
  id: string;
  /** ISO timestamp. */
  at: string;
  actor: string;
  action: string;
  detail?: ReactNode;
  tone?: Tone;
}

export interface RecordDocument {
  id: string;
  name: string;
  href: string;
  meta?: string;
}

export interface RelatedList {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/** Who did what and when, newest first: the audit trail under a record or an approval. */
export function ActivityTimeline({ items, empty }: { items: ActivityItem[]; empty?: string }) {
  const { t, fmt } = useI18n();
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty ?? t('tpl.noActivity')}</p>;
  return (
    <ol className="relative grid gap-4 border-l pl-5" data-testid="activity-timeline">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span aria-hidden className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background', a.tone === 'danger' ? 'bg-red' : a.tone === 'success' ? 'bg-primary' : 'bg-border-strong')} />
          <p className="text-sm">
            <span className="font-semibold">{a.actor}</span> {a.action}
          </p>
          <p className="text-xs text-muted-foreground">{fmt.dateTime(a.at)}</p>
          {a.detail && <div className="mt-1 text-sm text-muted-foreground">{a.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

/**
 * RecordPage (docs/product/ERP_UI_PATTERNS.md): one record (student, invoice, purchase order,
 * leave request...) with its title, status, key facts and actions, then tabs: Overview, the related
 * lists, Documents and Activity. An approval or workflow goes in `aside` (WorkflowStepper +
 * ApprovalPanel), shown beside the tabs on wide screens and above them on phones.
 */
export function RecordPage({
  title,
  subtitle,
  status,
  facts = [],
  primary,
  secondary,
  overview,
  related = [],
  documents,
  activity,
  aside,
  initialTab = 'overview',
  profile,
}: {
  title: string;
  subtitle?: ReactNode;
  status?: { label: string; tone?: Tone };
  /** Four to six facts that identify the record at a glance (number, amount, owner, dates). */
  facts?: { label: string; value: ReactNode }[];
  /** The one main action (Approve, Pay, Issue). */
  primary?: ReactNode;
  /** Lesser actions (Edit, Print, a ⋯ menu). */
  secondary?: ReactNode;
  overview: ReactNode;
  related?: RelatedList[];
  /** A list of files, or your own uploader/list; omitted hides the tab. */
  documents?: RecordDocument[] | ReactNode;
  /** The audit trail; omitted hides the tab. */
  activity?: ActivityItem[];
  aside?: ReactNode;
  initialTab?: string;
  /** Profile layout (people): a cover header with avatar, chips and the facts instead of the plain header. */
  profile?: { cover?: ProfileCover; chips?: string[] };
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const items = [
    { value: 'overview', label: t('tpl.overview') },
    ...related.map((r) => ({ value: r.value, label: r.label, count: r.count })),
    ...(documents !== undefined ? [{ value: 'documents', label: t('tpl.documents'), count: Array.isArray(documents) ? documents.length : undefined }] : []),
    ...(activity !== undefined ? [{ value: 'activity', label: t('tpl.activity') }] : []),
  ];

  return (
    <div className="grid gap-6" data-testid="record-page">
      {profile ? (
        <ProfileHeader title={title} subtitle={subtitle} status={status} facts={facts} chips={profile.chips} cover={profile.cover} actions={(primary || secondary) && (<>{secondary}{primary}</>)} />
      ) : (
      <PageHeader
        title={title}
        subtitle={
          (subtitle || status) && (
            <span className="flex flex-wrap items-center gap-2">
              {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
              {subtitle}
            </span>
          )
        }
        actions={
          (primary || secondary) && (
            <>
              {secondary}
              {primary}
            </>
          )
        }
      />
      )}
      {!profile && facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border bg-card p-5 shadow-card sm:grid-cols-3 lg:grid-cols-6">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 truncate text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={cn('grid gap-6', aside && 'xl:grid-cols-[minmax(0,1fr)_360px]')}>
        {aside && <div className="grid content-start gap-6 xl:order-2">{aside}</div>}
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} items={items} label={title} />
          <TabPanel value="overview" active={tab}>
            {overview}
          </TabPanel>
          {related.map((r) => (
            <TabPanel key={r.value} value={r.value} active={tab}>
              {r.content}
            </TabPanel>
          ))}
          <TabPanel value="documents" active={tab}>
            {Array.isArray(documents) ? (
              <Card>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('tpl.noDocuments')}</p>
                ) : (
                  <ul className="divide-y">
                    {documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-3">
                        <FileText aria-hidden className="size-4 text-muted-foreground" />
                        <a href={d.href} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                          {d.name}
                        </a>
                        {d.meta && <span className="text-xs text-muted-foreground">{d.meta}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : (
              documents
            )}
          </TabPanel>
          <TabPanel value="activity" active={tab}>
            <Card>
              <ActivityTimeline items={activity ?? []} />
            </Card>
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
