'use client';

import { ShieldAlert, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { liftBlock } from '@/app/(dashboard)/conversations/actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, EmptyState, LinkTabs, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ChatBlock, ModerationReport } from '@/lib/communication';
import { ModerateDialog } from './SafetyDialogs';

/**
 * Conversations > Moderation: messages the language filter flagged or someone reported, with the leader's decision
 * (dismiss, remove the message, warn in the thread, or stop the sender writing), and the people stopped from writing.
 */
export function ModerationPanel({ reports, total, status, blocks }: { reports: ModerationReport[]; total: number; status: string; blocks: ChatBlock[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [acting, setActing] = useState<{ report: ModerationReport; action: 'dismiss' | 'hide' | 'warn' | 'block' } | null>(null);
  const [busy, start] = useTransition();
  const cols: Column<ModerationReport>[] = [
    { id: 'when', header: t('fs.col.when'), rowHeader: true, cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
    { id: 'message', header: t('fs.col.message'), cell: (r) => <span className={`block min-w-[200px] max-w-[360px] whitespace-normal ${r.message.hidden ? 'italic text-muted-foreground' : ''}`}>{r.message.body}</span> },
    { id: 'sender', header: t('fs.col.sender'), cell: (r) => <span className="flex flex-wrap items-center gap-1.5">{r.sender}{r.senderBlocked && <StatusPill tone="danger">{t('fs.blocked')}</StatusPill>}</span>, sort: (r) => r.sender },
    { id: 'thread', header: t('fs.col.thread'), cell: (r) => t('fs.threadLine', { student: r.student, staff: r.staff, family: r.family }), hideBelow: 'md' },
    { id: 'reason', header: t('fs.col.reason'), cell: (r) => <StatusPill tone={r.reason === 'filter' ? 'warning' : 'danger'}>{t(`fs.reason.${r.reason === 'filter' ? `filter.${r.note}` : r.reason}` as MessageKey)}</StatusPill>, sort: (r) => r.reason },
    { id: 'by', header: t('fs.col.by'), cell: (r) => r.reporter ?? t('fs.byFilter'), hideBelow: 'lg' },
    {
      id: 'actions',
      header: '',
      align: 'right',
      csv: false,
      cell: (r) =>
        r.status === 'open' ? (
          <span className="flex flex-wrap justify-end gap-1.5">
            {(['dismiss', 'warn', 'hide', 'block'] as const).map((a) => (
              <Button key={a} size="sm" variant={a === 'block' || a === 'hide' ? 'destructive' : 'outline'} onClick={() => setActing({ report: r, action: a })} data-testid={`fs-mod-${a}`}>
                {t(`fs.mod.${a}` as MessageKey)}
              </Button>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t(`fs.mod.${r.action ?? 'dismiss'}` as MessageKey)}{r.resolutionNote ? `: ${r.resolutionNote}` : ''}</span>
        ),
    },
  ];
  const blockCols: Column<ChatBlock>[] = [
    { id: 'name', header: t('fs.col.person'), rowHeader: true, cell: (b) => b.fullName, sort: (b) => b.fullName },
    { id: 'reason', header: t('fs.col.reason'), cell: (b) => <span className="block max-w-[320px] whitespace-normal">{b.reason}</span> },
    { id: 'scope', header: t('fs.col.scope'), cell: (b) => (b.staffId ? t('fs.scope.staff') : t('fs.scope.all')) },
    { id: 'until', header: t('fs.col.until'), cell: (b) => (b.until ? fmt.dateTime(b.until) : t('fs.block.untilLifted')) },
    { id: 'by', header: t('fs.col.by'), cell: (b) => b.blockedBy ?? '-', hideBelow: 'md' },
    {
      id: 'actions',
      header: '',
      align: 'right',
      csv: false,
      cell: (b) => (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await liftBlock(b.id);
              if (!r.ok) return toast.error(r.error);
              toast.success(t('fs.lifted'));
              router.refresh();
            })
          }
          data-testid="fs-lift"
        >
          {t('fs.lift')}
        </Button>
      ),
    },
  ];
  return (
    <div className="grid gap-6" data-testid="fs-moderation">
      <LinkTabs
        label={t('fs.mod.title')}
        value={status}
        items={(['open', 'actioned', 'dismissed'] as const).map((s) => ({ value: s, label: t(`fs.st.${s}` as MessageKey), href: `/conversations?tab=moderation&status=${s}`, ...(s === status ? { count: total } : {}) }))}
      />
      <DataTable
        rows={reports}
        columns={cols}
        rowId={(r) => r.id}
        label={t('fs.mod.title')}
        empty={<EmptyState icon={<ShieldAlert />} title={t(`fs.empty.${status}` as MessageKey)}>{t('fs.emptyHelp')}</EmptyState>}
        exportName="chat-moderation"
      />
      <section aria-labelledby="fs-blocks">
        <h3 id="fs-blocks" className="mb-2 text-sm font-semibold">{t('fs.blocks', { n: blocks.length })}</h3>
        <DataTable rows={blocks} columns={blockCols} rowId={(b) => b.id} label={t('fs.blocks', { n: blocks.length })} empty={<EmptyState icon={<UserX />} title={t('fs.noBlocks')} />} />
      </section>
      {acting && (
        <ModerateDialog
          report={acting.report}
          action={acting.action}
          onClose={(m) => {
            setActing(null);
            if (m) {
              toast.success(m);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
