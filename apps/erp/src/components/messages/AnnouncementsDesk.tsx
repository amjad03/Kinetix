'use client';

import { BellRing, Copy, FileText, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import { announcementRecipients, deleteAnnouncement, deleteTemplate, duplicateAnnouncement, recallAnnouncement, remindUnread, saveTemplate, sendAnnouncementNow } from '@/app/(dashboard)/messages/actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, Dialog, FormField, Sheet, StatusPill, TabPanel, Tabs, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { APP_CHANNELS, CHANNELS, fileSize, pctOf, type AnnChannel, type AnnRecipient, type Announcement, type AnnTemplate, type AppChannel } from '@/lib/communication';
import type { Structure } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AnnouncementComposer } from './AnnouncementComposer';
import { RichText } from './RichText';

type Tab = 'compose' | 'sent' | 'scheduled' | 'drafts' | 'templates' | 'alerts';

/**
 * Communication > Messages: write one announcement for boards and the Teacher, Student and Parent apps,
 * follow its delivery, remind those who have not read it, and keep drafts, scheduled messages and templates.
 * The board-only alerts (including emergencies) keep their own tab.
 */
export function AnnouncementsDesk({
  structure,
  departments,
  items,
  templates,
  boardAlerts,
  initialTab,
}: {
  structure: Structure;
  departments: { id: string; name: string }[];
  items: Announcement[];
  templates: AnnTemplate[];
  boardAlerts: ReactNode;
  initialTab: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((['compose', 'sent', 'scheduled', 'drafts', 'templates', 'alerts'] as string[]).includes(initialTab) ? (initialTab as Tab) : 'compose');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const sent = items.filter((a) => a.status === 'sent' || a.status === 'recalled');
  const scheduled = items.filter((a) => a.status === 'scheduled');
  const drafts = items.filter((a) => a.status === 'draft');
  const open = items.find((a) => a.id === openId) ?? null;

  const run = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done: string, after?: (data: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error);
      toast.success(done);
      after?.(r.data);
      router.refresh();
    });
  const edit = (a: Announcement) => {
    setEditing(a);
    setOpenId(null);
    setTab('compose');
  };
  const [templateSeed, setTemplateSeed] = useState<AnnTemplate | null>(null);
  /** Bumped to start the composer afresh (a template chosen, a message saved). */
  const [composeKey, setComposeKey] = useState(0);
  const useTemplate = (tpl: AnnTemplate) => {
    setEditing(null);
    setTemplateSeed(tpl);
    setComposeKey((k) => k + 1);
    setTab('compose');
  };

  const channelsCell = (a: Announcement) => (
    <span className="flex flex-wrap gap-1">
      {CHANNELS.filter((c) => a.channels.includes(c)).map((c) => (
        <StatusPill key={c} tone="neutral">
          {t(`comm.ch.${c}` as MessageKey)}
        </StatusPill>
      ))}
    </span>
  );
  const titleCell = (a: Announcement) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <b className="font-medium">{a.title}</b>
      {a.priority === 'important' && <StatusPill tone="warning">{t('comm.pri.important')}</StatusPill>}
      {a.requiresAck && <StatusPill tone="info">{t('comm.ackShort')}</StatusPill>}
    </span>
  );

  const sentCols: Column<Announcement>[] = [
    { id: 'title', header: t('msg.title'), rowHeader: true, cell: titleCell, sort: (a) => a.title },
    { id: 'sent', header: t('comm.col.sent'), cell: (a) => <When iso={a.sentAt} />, sort: (a) => a.sentAt ?? '' },
    { id: 'channels', header: t('comm.channels'), cell: channelsCell, sort: (a) => a.channels.join(','), hideBelow: 'lg' },
    { id: 'recipients', header: t('comm.col.recipients'), align: 'right', cell: (a) => a.stats.recipients, sort: (a) => a.stats.recipients },
    { id: 'delivered', header: t('comm.col.delivered'), align: 'right', cell: (a) => <Pct n={a.stats.deliveredPct} />, sort: (a) => a.stats.deliveredPct, hideBelow: 'md' },
    { id: 'read', header: t('comm.col.read'), align: 'right', cell: (a) => <Pct n={a.stats.readPct} />, sort: (a) => a.stats.readPct },
    { id: 'ack', header: t('comm.col.ack'), align: 'right', cell: (a) => (a.requiresAck ? <Pct n={a.stats.acknowledgedPct} /> : '—'), sort: (a) => (a.requiresAck ? a.stats.acknowledgedPct : -1), hideBelow: 'md' },
    { id: 'status', header: t('comm.col.status'), cell: (a) => <StatusPill tone={a.status === 'recalled' ? 'danger' : 'success'}>{t(`comm.status.${a.status}` as MessageKey)}</StatusPill>, sort: (a) => a.status },
  ];
  const pendingCols = (kind: 'scheduled' | 'drafts'): Column<Announcement>[] => [
    { id: 'title', header: t('msg.title'), rowHeader: true, cell: titleCell, sort: (a) => a.title },
    kind === 'scheduled'
      ? { id: 'when', header: t('comm.col.sendAt'), cell: (a) => <When iso={a.sendAt} />, sort: (a) => a.sendAt ?? '' }
      : { id: 'when', header: t('comm.col.updated'), cell: (a) => <When iso={a.updatedAt} />, sort: (a) => a.updatedAt },
    { id: 'channels', header: t('comm.channels'), cell: channelsCell, sort: (a) => a.channels.join(','), hideBelow: 'md' },
    {
      id: 'actions',
      header: '',
      align: 'right',
      csv: false,
      cell: (a) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), edit(a))} data-testid={`ann-edit-${a.id}`}>
            <Pencil />
            {t('comm.edit')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={(e) => (e.stopPropagation(), run(() => sendAnnouncementNow(a.id), t('comm.toast.sent')))}>
            <Send />
            {t('comm.sendNow')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={(e) => (e.stopPropagation(), run(() => deleteAnnouncement(a.id), t('comm.toast.deleted')))} aria-label={t('comm.delete')}>
            <Trash2 />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <Tabs
        label={t('nav.messages')}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'compose', label: editing ? t('comm.tab.edit') : t('comm.tab.compose') },
          { value: 'sent', label: t('comm.tab.sent'), count: sent.length },
          { value: 'scheduled', label: t('comm.tab.scheduled'), count: scheduled.length },
          { value: 'drafts', label: t('comm.tab.drafts'), count: drafts.length },
          { value: 'templates', label: t('comm.tab.templates'), count: templates.length },
          { value: 'alerts', label: t('comm.tab.alerts') },
        ]}
      />
      <TabPanel value="compose" active={tab}>
        <div className="max-w-[880px]">
          <AnnouncementComposer
            key={editing?.id ?? `new-${composeKey}`}
            seed={templateSeed}
            structure={structure}
            departments={departments}
            templates={templates}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSaved={(a, how) => {
              setEditing(null);
              setTemplateSeed(null);
              setComposeKey((k) => k + 1);
              toast.success(how === 'sent' ? t('comm.toast.sentTo', { n: a.stats.recipients }) : how === 'scheduled' ? t('comm.toast.scheduled') : t('comm.toast.drafted'));
              setTab(how === 'sent' ? 'sent' : how === 'scheduled' ? 'scheduled' : 'drafts');
              router.refresh();
            }}
          />
        </div>
      </TabPanel>
      <TabPanel value="sent" active={tab}>
        <DataTable
          testId="ann-sent"
          label={t('comm.tab.sent')}
          columns={sentCols}
          rows={sent}
          rowId={(a) => a.id}
          onRowClick={(a) => setOpenId(a.id)}
          highlight={(a) => a.id === openId}
          exportName="announcements"
          filters={[
            { id: 'priority', label: t('msg.priority'), options: [{ value: 'important', label: t('comm.pri.important') }, { value: 'normal', label: t('comm.pri.normal') }], match: (a, v) => a.priority === v },
            { id: 'channel', label: t('comm.channels'), options: CHANNELS.map((c) => ({ value: c, label: t(`comm.ch.${c}` as MessageKey) })), match: (a, v) => a.channels.includes(v as AnnChannel) },
          ]}
          empty={<p className="py-8 text-center text-sm text-muted-foreground">{t('comm.empty.sent')}</p>}
        />
      </TabPanel>
      <TabPanel value="scheduled" active={tab}>
        <DataTable testId="ann-scheduled" label={t('comm.tab.scheduled')} columns={pendingCols('scheduled')} rows={scheduled} rowId={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} bare empty={<p className="py-8 text-center text-sm text-muted-foreground">{t('comm.empty.scheduled')}</p>} />
      </TabPanel>
      <TabPanel value="drafts" active={tab}>
        <DataTable testId="ann-drafts" label={t('comm.tab.drafts')} columns={pendingCols('drafts')} rows={drafts} rowId={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} bare empty={<p className="py-8 text-center text-sm text-muted-foreground">{t('comm.empty.drafts')}</p>} />
      </TabPanel>
      <TabPanel value="templates" active={tab}>
        <Templates templates={templates} onUse={useTemplate} />
      </TabPanel>
      <TabPanel value="alerts" active={tab}>
        <p className="mb-4 max-w-[720px] text-[13px] text-muted-foreground">{t('comm.alertsHelp')}</p>
        {boardAlerts}
      </TabPanel>

      {open && (
        <Detail
          a={open}
          busy={busy}
          onClose={() => setOpenId(null)}
          onEdit={() => edit(open)}
          onRecall={() => run(() => recallAnnouncement(open.id), t('comm.toast.recalled'))}
          onDelete={() => run(() => deleteAnnouncement(open.id), t('comm.toast.deleted'), () => setOpenId(null))}
          onDuplicate={() =>
            run(
              () => duplicateAnnouncement(open.id),
              t('comm.toast.duplicated'),
              (d) => edit(d as Announcement),
            )
          }
          onRemind={() => run(() => remindUnread(open.id), t('comm.toast.reminded'))}
        />
      )}
    </>
  );
}

function When({ iso }: { iso: string | null }) {
  const { fmt } = useI18n();
  return <span className="whitespace-nowrap">{iso ? fmt.dateTime(iso) : '—'}</span>;
}

function Pct({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2 tabular-nums">
      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:inline-block" aria-hidden>
        <span className="block h-full rounded-full bg-teal" style={{ width: `${n}%` }} />
      </span>
      {n}%
    </span>
  );
}

/** One message: its text, delivery by channel, who has not read it, and what can be done with it. */
function Detail({ a, busy, onClose, onEdit, onRecall, onDelete, onDuplicate, onRemind }: { a: Announcement; busy: boolean; onClose: () => void; onEdit: () => void; onRecall: () => void; onDelete: () => void; onDuplicate: () => void; onRemind: () => void }) {
  const { t, fmt } = useI18n();
  const [filter, setFilter] = useState<'unread' | 'unacknowledged' | 'undelivered' | 'all'>(a.requiresAck ? 'unacknowledged' : 'unread');
  const [channel, setChannel] = useState<AppChannel | ''>('');
  const [people, setPeople] = useState<AnnRecipient[] | null>(null);
  const [error, setError] = useState('');
  const [confirmRecall, setConfirmRecall] = useState(false);
  const live = a.status === 'sent';
  const load = useCallback(async () => {
    if (a.status !== 'sent' && a.status !== 'recalled') return;
    const r = await announcementRecipients(a.id, filter, channel);
    if (r.ok) {
      setPeople(r.data);
      setError('');
    } else setError(r.error);
  }, [a.id, a.status, filter, channel]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the recipient list from the API when the filter or the counts change
    void load();
  }, [load, a.stats.read, a.stats.acknowledged, a.lastRemindedAt]);

  const cols: Column<AnnRecipient>[] = [
    { id: 'name', header: t('comm.col.person'), rowHeader: true, cell: (r) => r.fullName, sort: (r) => r.fullName },
    { id: 'app', header: t('comm.col.app'), cell: (r) => t(`comm.ch.${r.channel}` as MessageKey), sort: (r) => r.channel },
    { id: 'detail', header: t('comm.col.detail'), cell: (r) => r.detail ?? '—', sort: (r) => r.detail ?? '', hideBelow: 'md' },
    { id: 'phone', header: t('comm.col.phone'), cell: (r) => r.phone ?? '—', sort: (r) => r.phone ?? '', hideBelow: 'lg' },
    { id: 'state', header: t('comm.col.status'), cell: (r) => <StatusPill tone={r.acknowledgedAt ? 'success' : r.readAt ? 'info' : r.deliveredAt ? 'neutral' : 'warning'}>{t(r.acknowledgedAt ? 'comm.rs.acknowledged' : r.readAt ? 'comm.rs.read' : r.deliveredAt ? 'comm.rs.delivered' : 'comm.rs.notDelivered')}</StatusPill>, sort: (r) => (r.acknowledgedAt ? 3 : r.readAt ? 2 : r.deliveredAt ? 1 : 0) },
  ];

  return (
    <Sheet
      open
      width={720}
      title={a.title}
      subtitle={`${t(`comm.status.${a.status}` as MessageKey)} · ${a.sentAt ? fmt.dateTime(a.sentAt) : a.sendAt ? t('comm.scheduledFor', { when: fmt.dateTime(a.sendAt) }) : t('comm.notSent')} · ${a.sender.fullName}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onDuplicate} data-testid="ann-duplicate">
            <Copy />
            {t('comm.duplicate')}
          </Button>
          {(a.status === 'draft' || a.status === 'scheduled') && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil />
              {t('comm.edit')}
            </Button>
          )}
          {a.status === 'sent' && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmRecall(true)} data-testid="ann-recall">
              <Undo2 />
              {t('comm.recall')}
            </Button>
          )}
          {a.status !== 'sent' && (
            <Button variant="destructive" disabled={busy} onClick={onDelete} data-testid="ann-delete">
              <Trash2 />
              {t('comm.delete')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5" data-testid="ann-detail">
        <div className="rounded-lg border bg-background p-4">
          <RichText body={a.body} />
          {a.attachments.length > 0 && (
            <ul className="mt-3 grid gap-1.5">
              {a.attachments.map((f) => (
                <li key={f.id}>
                  <a className="inline-flex items-center gap-2 text-sm hover:underline" href={`/api/download?kind=announcement-file&id=${a.id}&file=${f.id}`}>
                    <FileText className="size-4 text-muted-foreground" />
                    {f.name}
                    <span className="text-xs text-muted-foreground">{fileSize(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {[a.priority === 'important' ? t('comm.pri.important') : t('comm.pri.normal'), a.requiresAck ? t('comm.ackShort') : null, a.expiresAt ? t('comm.expiresOn', { when: fmt.dateTime(a.expiresAt) }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>

        {(a.status === 'sent' || a.status === 'recalled') && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label={t('comm.col.recipients')} value={fmt.number(a.stats.recipients)} />
              <Stat label={t('comm.col.delivered')} value={`${a.stats.deliveredPct}%`} sub={fmt.number(a.stats.delivered)} />
              <Stat label={t('comm.col.read')} value={`${a.stats.readPct}%`} sub={fmt.number(a.stats.read)} />
              <Stat label={t('comm.col.ack')} value={a.requiresAck ? `${a.stats.acknowledgedPct}%` : '—'} sub={a.requiresAck ? fmt.number(a.stats.acknowledged) : undefined} />
            </div>
            <table className="w-full text-sm" data-testid="ann-by-channel">
              <caption className="mb-2 text-left text-[13px] font-semibold">{t('comm.byChannel')}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 text-left font-medium">{t('comm.col.app')}</th>
                  <th className="py-1.5 text-right font-medium">{t('comm.col.recipients')}</th>
                  <th className="py-1.5 text-right font-medium">{t('comm.col.delivered')}</th>
                  <th className="py-1.5 text-right font-medium">{t('comm.col.read')}</th>
                  <th className="py-1.5 text-right font-medium">{t('comm.col.ack')}</th>
                </tr>
              </thead>
              <tbody>
                {APP_CHANNELS.filter((c) => a.channels.includes(c)).map((c) => {
                  const s = a.stats.byChannel[c];
                  return (
                    <tr key={c} className="border-b last:border-0">
                      <th scope="row" className="py-1.5 text-left font-normal">{t(`comm.ch.${c}` as MessageKey)}</th>
                      <td className="py-1.5 text-right tabular-nums">{fmt.number(s.recipients)}</td>
                      <td className="py-1.5 text-right tabular-nums">{pctOf(s.delivered, s.recipients)}%</td>
                      <td className="py-1.5 text-right tabular-nums">{pctOf(s.read, s.recipients)}%</td>
                      <td className="py-1.5 text-right tabular-nums">{a.requiresAck ? `${pctOf(s.acknowledged, s.recipients)}%` : '—'}</td>
                    </tr>
                  );
                })}
                {a.channels.includes('boards') && (
                  <tr>
                    <th scope="row" className="py-1.5 text-left font-normal">{t('comm.ch.boards')}</th>
                    <td className="py-1.5 text-right tabular-nums" colSpan={4}>
                      {a.stats.boards ? t('comm.boardsShown', { n: a.stats.boards.displayed, of: a.stats.boards.boards }) : t('comm.noBoards')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="grid gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1.5 text-[13px] font-semibold">
                  {t('comm.show')}
                  <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-9 rounded-md border bg-background px-2 text-sm font-normal" data-testid="ann-filter">
                    {(['unread', 'unacknowledged', 'undelivered', 'all'] as const).map((f) => (
                      <option key={f} value={f}>
                        {t(`comm.filter.${f}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[13px] font-semibold">
                  {t('comm.col.app')}
                  <select value={channel} onChange={(e) => setChannel(e.target.value as AppChannel | '')} className="h-9 rounded-md border bg-background px-2 text-sm font-normal">
                    <option value="">{t('comm.allApps')}</option>
                    {APP_CHANNELS.filter((c) => a.channels.includes(c)).map((c) => (
                      <option key={c} value={c}>
                        {t(`comm.ch.${c}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                {live && (
                  <Button variant="outline" disabled={busy || (a.requiresAck ? a.stats.acknowledged : a.stats.read) >= a.stats.recipients} onClick={onRemind} data-testid="ann-remind">
                    <BellRing />
                    {a.requiresAck ? t('comm.remindUnacked') : t('comm.remindUnread')}
                  </Button>
                )}
              </div>
              {a.lastRemindedAt && <p className="text-xs text-muted-foreground">{t('comm.lastReminded', { when: fmt.dateTime(a.lastRemindedAt) })}</p>}
              {error && <p className="text-sm text-red-ink">{error}</p>}
              <DataTable testId="ann-recipients" label={t('comm.recipients')} columns={cols} rows={people ?? []} rowId={(r) => `${r.userId}:${r.channel}`} loading={people === null} pageSize={10} exportName="recipients" empty={<p className="py-6 text-center text-sm text-muted-foreground">{t('comm.everyoneDone')}</p>} />
            </div>
          </>
        )}
      </div>
      {confirmRecall && (
        <Dialog
          title={t('comm.recallTitle')}
          onClose={() => setConfirmRecall(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmRecall(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => (setConfirmRecall(false), onRecall())} data-testid="ann-recall-confirm">
                {t('comm.recall')}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">{t('comm.recallBody')}</p>
        </Dialog>
      )}
    </Sheet>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <b className="text-lg tabular-nums">{value}</b>
      {sub && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

/** Built-in notices and the institution's own templates. */
function Templates({ templates, onUse }: { templates: AnnTemplate[]; onUse: (t: AnnTemplate) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<AnnTemplate | 'new' | null>(null);
  const [busy, start] = useTransition();
  const cols: Column<AnnTemplate>[] = [
    { id: 'name', header: t('comm.tpl.name'), rowHeader: true, cell: (x) => <b className="font-medium">{x.name}</b>, sort: (x) => x.name },
    { id: 'title', header: t('msg.title'), cell: (x) => x.title, sort: (x) => x.title, hideBelow: 'md' },
    { id: 'kind', header: t('comm.tpl.kind'), cell: (x) => <StatusPill tone={x.builtIn ? 'neutral' : 'info'}>{x.builtIn ? t('comm.tpl.builtIn') : t('comm.tpl.own')}</StatusPill>, sort: (x) => (x.builtIn ? 1 : 0) },
    {
      id: 'actions',
      header: '',
      align: 'right',
      csv: false,
      cell: (x) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onUse(x)} data-testid={`tpl-use-${x.id}`}>
            {t('comm.tpl.use')}
          </Button>
          {!x.builtIn && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(x)} aria-label={t('comm.edit')}>
                <Pencil />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={t('comm.delete')}
                onClick={() =>
                  start(async () => {
                    const r = await deleteTemplate(x.id);
                    if (!r.ok) return toast.error(r.error);
                    toast.success(t('comm.toast.deleted'));
                    router.refresh();
                  })
                }
              >
                <Trash2 />
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing('new')} data-testid="tpl-new">
          <Plus />
          {t('comm.tpl.new')}
        </Button>
      </div>
      <DataTable testId="ann-templates" label={t('comm.tab.templates')} columns={cols} rows={templates} rowId={(x) => x.id} bare />
      {editing && <TemplateForm tpl={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateForm({ tpl, onClose }: { tpl: AnnTemplate | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(tpl?.name ?? '');
  const [title, setTitle] = useState(tpl?.title ?? '');
  const [body, setBody] = useState(tpl?.body ?? '');
  const [priority, setPriority] = useState<'normal' | 'important'>(tpl?.priority ?? 'normal');
  const [busy, start] = useTransition();
  const ok = name.trim() && title.trim() && body.trim();
  return (
    <Dialog
      title={tpl ? t('comm.tpl.edit') : t('comm.tpl.new')}
      onClose={onClose}
      busy={busy}
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!ok || busy}
            onClick={() =>
              start(async () => {
                const r = await saveTemplate(tpl?.id ?? null, { name: name.trim(), title: title.trim(), body: body.trim(), priority, requiresAck: tpl?.requiresAck ?? false, channels: tpl?.channels ?? [] });
                if (!r.ok) return toast.error(r.error);
                toast.success(t('comm.tpl.saved'));
                onClose();
                router.refresh();
              })
            }
            data-testid="tpl-save"
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('comm.tpl.name')} required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
        </FormField>
        <FormField label={t('msg.title')} required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
        </FormField>
        <FormField label={t('msg.body')} required helper={t('comm.fmt.hint')}>
          <TextInput value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={5} slotProps={{ htmlInput: { maxLength: 5000 } }} />
        </FormField>
        <div role="radiogroup" aria-label={t('msg.priority')} className="flex gap-2">
          {(['normal', 'important'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={cn('rounded-md border px-3 py-1.5 text-sm', priority === p ? 'border-primary bg-secondary font-semibold' : 'bg-background')}>
              {t(`comm.pri.${p}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
