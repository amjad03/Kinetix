'use client';

import { FileText, Paperclip, Star } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ProfileHeader, type ProfileCover, type ProfileMeta } from './ProfileHeader';
import { Card, StatusPill, TabPanel, Tabs, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { announceRecord, rememberRecord, toggleFavRecord, useRecords } from '@/lib/recents';
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
export function ActivityTimeline({ items, empty, compact }: { items: ActivityItem[]; empty?: string; compact?: boolean }) {
  const { t, fmt } = useI18n();
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty ?? t('tpl.noActivity')}</p>;
  if (compact)
    return (
      <ol className="grid" data-testid="activity-timeline">
        {items.map((a, i) => (
          <li key={a.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[9.5px] w-px bg-border" />}
            <span aria-hidden className={cn('relative mt-1 grid size-5 place-items-center rounded-full ring-4 ring-card', a.tone === 'danger' ? 'bg-red-soft' : a.tone === 'success' ? 'bg-teal-soft' : 'bg-muted')}>
              <i className={cn('size-2 rounded-full', a.tone === 'danger' ? 'bg-red' : a.tone === 'success' ? 'bg-primary' : 'bg-border-strong')} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="m-0 min-w-0 truncate text-sm font-medium">{a.action}</p>
                <time dateTime={a.at} className="shrink-0 text-xs text-muted-foreground">{fmt.relative(a.at)}</time>
              </div>
              <p className="m-0 text-xs text-muted-foreground">{a.actor}</p>
              {a.detail && <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground [&_svg]:size-3.5"><Paperclip aria-hidden />{a.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    );
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

export interface AboutSection {
  title: string;
  rows: { icon: ReactNode; label: string; value: ReactNode }[];
}

export interface ProfileLayout {
  /** @deprecated The cover is one neutral pattern now. */
  cover?: ProfileCover;
  chips?: string[];
  /** Small icon facts under the name (class, section, joined date). */
  meta?: ProfileMeta[];
  /** The About card on the Profile tab: titled groups of icon rows. Defaults to the facts. */
  about?: AboutSection[];
  /** Cards on the right of the Profile tab, under the activity (guardians, classes, mentees). */
  side?: { title: string; action?: ReactNode; content: ReactNode }[];
  /** What the record is, for Recent and Favourites ("Student"). */
  kind?: string;
}

/** Segmented pill tabs (profile pages): arrow keys, Home and End move between them. */
function PillTabs({ value, onChange, items, label, id }: { value: string; onChange: (v: string) => void; items: { value: string; label: string; count?: number }[]; label: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((x) => x.value === value);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const it = items[(next + items.length) % items.length];
    onChange(it.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${it.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none] sm:inline-flex" data-testid="pill-tabs">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            id={`${id}-${it.value}`}
            data-value={it.value}
            aria-selected={on}
            aria-controls={`${id}-panel-${it.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              on && 'bg-card text-foreground shadow-sm',
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="rounded-full bg-background px-1.5 text-[11px] tabular-nums text-muted-foreground">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function AboutCard({ sections }: { sections: AboutSection[] }) {
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="m-0 text-[15px] font-semibold">{t('pf.about')}</h2>
      {sections.map((sec, i) => (
        <div key={sec.title + i} className={cn(i > 0 && 'mt-5')}>
          {i > 0 && <p className="mb-2 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{sec.title}</p>}
          <dl className="mt-3 grid gap-3">
            {sec.rows.map((r) => (
              <div key={r.label} className="flex min-w-0 items-start gap-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
                {r.icon}
                <dt className="shrink-0 text-muted-foreground">{r.label}:</dt>
                <dd className="m-0 min-w-0 font-medium break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </Card>
  );
}

/**
 * RecordPage (docs/product/ERP_UI_PATTERNS.md): one record (student, invoice, purchase order,
 * leave request...) with its title, status, key facts and actions, then tabs: Overview, the related
 * lists, Documents and Activity. An approval or workflow goes in `aside` (WorkflowStepper +
 * ApprovalPanel), shown beside the tabs on wide screens and above them on phones.
 * With `profile` (people) it is the AdminCN profile: a cover header, pill tabs and a Profile tab of
 * About (left) and recent activity with related cards (right).
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
  /** Profile layout (people): cover header with avatar and icon facts, pill tabs, About + activity. */
  profile?: ProfileLayout;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const tabsId = useId();
  const pathname = usePathname();
  const { favs } = useRecords();
  const isFav = favs.some((f) => f.href === pathname);
  const kind = profile?.kind;
  useEffect(() => {
    if (!pathname) return;
    rememberRecord({ href: pathname, title, kind });
    announceRecord(pathname, title);
    return () => announceRecord(pathname, null);
  }, [pathname, title, kind]);
  const items = [
    { value: 'overview', label: profile ? t('tpl.profile') : t('tpl.overview') },
    ...related.map((r) => ({ value: r.value, label: r.label, count: r.count })),
    ...(documents !== undefined ? [{ value: 'documents', label: t('tpl.documents'), count: Array.isArray(documents) ? documents.length : undefined }] : []),
    ...(activity !== undefined ? [{ value: 'activity', label: t('tpl.activity') }] : []),
  ];
  const favButton = (
    <button
      type="button"
      onClick={() => toggleFavRecord({ href: pathname, title, kind })}
      aria-pressed={isFav}
      aria-label={t(isFav ? 'pf.favRemove' : 'pf.favAdd')}
      title={t(isFav ? 'pf.favRemove' : 'pf.favAdd')}
      data-testid="record-fav"
      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Star className={cn('size-4', isFav && 'fill-amber-400 text-amber-500')} />
    </button>
  );

  const profileTab = profile && (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
      <div className="grid content-start gap-6">
        <AboutCard sections={profile.about ?? [{ title: t('pf.about'), rows: facts.map((f) => ({ icon: null, label: f.label, value: f.value })) }]} />
      </div>
      <div className="grid min-w-0 content-start gap-6">
        {activity !== undefined && (
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold">{t('pf.recentActivity')}</h2>
              {activity.length > 5 && (
                <button type="button" className="text-xs font-medium text-teal-ink hover:underline" onClick={() => setTab('activity')}>
                  {t('pf.viewAll')}
                </button>
              )}
            </div>
            <ActivityTimeline compact items={activity.slice(0, 5)} />
          </Card>
        )}
        {(profile.side ?? []).length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {profile.side!.map((c) => (
              <Card key={c.title}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="m-0 text-[15px] font-semibold">{c.title}</h2>
                  {c.action}
                </div>
                {c.content}
              </Card>
            ))}
          </div>
        )}
      </div>
      {overview && <div className="min-w-0 lg:col-span-2">{overview}</div>}
    </div>
  );

  return (
    <div className="grid gap-6" data-testid="record-page">
      {profile ? (
        <ProfileHeader title={title} status={status} meta={profile.meta} chips={profile.chips} extra={favButton} actions={(primary || secondary) && (<>{secondary}{primary}</>)} />
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
          {profile ? <PillTabs value={tab} onChange={setTab} items={items} label={title} id={tabsId} /> : <Tabs value={tab} onChange={setTab} items={items} label={title} />}
          <TabPanel value="overview" active={tab} idPrefix={profile ? tabsId : undefined}>
            {profile ? profileTab : overview}
          </TabPanel>
          {related.map((r) => (
            <TabPanel key={r.value} value={r.value} active={tab} idPrefix={profile ? tabsId : undefined}>
              {r.content}
            </TabPanel>
          ))}
          <TabPanel value="documents" active={tab} idPrefix={profile ? tabsId : undefined}>
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
          <TabPanel value="activity" active={tab} idPrefix={profile ? tabsId : undefined}>
            <Card>
              <ActivityTimeline items={activity ?? []} />
            </Card>
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
