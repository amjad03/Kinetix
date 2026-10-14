'use client';

import { CopyCheck, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { enquiryDuplicates, mergeEnquiries } from '@/app/(dashboard)/admissions/desk-actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, EmptyState, StatusPill, useToast, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Counsellor } from '@/lib/admissions';
import type { DuplicateEnquiry, LeadTemplate } from '@/lib/admissions-desk';
import { EnquiryDesk } from './EnquiryBoard';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type EnquiryRow = Row & { name: string; phone: string; email: string | null; programName: string | null; source: string; stage: string; counsellorName: string | null; nextFollowUpOn: string | null; leadScore: number; city: string | null; campaignName: string | null; lastActivity: string | null; activities: number; mergedIntoId: string | null; createdAt: string };

const STAGE_TONE: Record<string, Tone> = { new: 'info', contacted: 'neutral', counselling: 'warning', applied: 'info', converted: 'success', lost: 'danger', deferred: 'neutral' };

/**
 * Enquiries as a record kit list: search, filters (stage, source, counsellor, programme, campaign, follow-up due),
 * bulk reassign (Move), bulk follow-up dates, DLT-registered messages, mark lost with a reason, duplicates and merge,
 * import from fairs and spreadsheets, export, history and saved views.
 */
export function EnquiryRecords({ meta, page, state, templates, counsellors, today }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; templates: LeadTemplate[]; counsellors: Counsellor[]; today: string }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [dups, setDups] = useState<{ row: EnquiryRow; list: DuplicateEnquiry[] } | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const e = (x: Row) => x as EnquiryRow;
  const findDups = (x: Row) =>
    start(async () => {
      const res = await enquiryDuplicates(x.id);
      if (!res.ok) return toast.error(res.error);
      if (!res.data.length) return toast.info(t('adk.dup.none'));
      setDups({ row: e(x), list: res.data });
    });
  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: t('adk.col.enquirer'),
      sortKey: 'name',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="min-w-0">
          <b className="block truncate font-[550]">{e(x).name}</b>
          <small className="block truncate text-xs text-muted-foreground">{[e(x).phone, e(x).city].filter(Boolean).join(' · ')}</small>
        </span>
      ),
    },
    { id: 'programme', header: t('adk.col.programme'), sortKey: 'programme', hideBelow: 'md', cell: (x) => e(x).programName ?? <span className="text-muted-foreground">{t('adm.enquiry.anyProgram')}</span> },
    { id: 'source', header: t('adk.col.source'), hideBelow: 'lg', cell: (x) => t(`adm.source.${e(x).source}` as MessageKey) },
    { id: 'stage', header: t('adk.col.stage'), sortKey: 'stage', cell: (x) => <StatusPill tone={STAGE_TONE[e(x).stage] ?? 'neutral'}>{t(`adm.stage.${e(x).stage}` as MessageKey)}</StatusPill> },
    { id: 'counsellor', header: t('adk.col.counsellor'), sortKey: 'counsellor', hideBelow: 'md', cell: (x) => e(x).counsellorName ?? <span className="text-muted-foreground">{t('adk.unassigned')}</span> },
    {
      id: 'followUp',
      header: t('adk.col.followUp'),
      sortKey: 'followUp',
      hideBelow: 'sm',
      cell: (x) => {
        const d = e(x).nextFollowUpOn;
        if (!d) return <span className="text-muted-foreground">—</span>;
        return <span className={d < today ? 'font-semibold text-red-ink' : d === today ? 'font-semibold text-amber-ink' : undefined}>{fmt.date(d, 'short')}</span>;
      },
    },
    { id: 'score', header: t('adk.col.score'), sortKey: 'score', align: 'right', hideBelow: 'lg', cell: (x) => e(x).leadScore },
    { id: 'campaign', header: t('adk.col.campaign'), defaultHidden: true, cell: (x) => e(x).campaignName ?? '—' },
    { id: 'lastActivity', header: t('adk.col.lastActivity'), sortKey: 'lastActivity', defaultHidden: true, cell: (x) => (e(x).lastActivity ? fmt.date(String(e(x).lastActivity).slice(0, 10), 'short') : '—') },
    { id: 'created', header: t('adk.col.received'), sortKey: 'created', hideBelow: 'lg', cell: (x) => fmt.date(e(x).createdAt.slice(0, 10), 'short') },
  ];
  const usable = templates.filter((x) => x.usable);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('adk.tab.enquiries')}
        columns={columns}
        onView={(x) => setOpen(x.id)}
        rowActionKeys={['message', 'lost']}
        actionParams={{
          message: [{ key: 'templateId', label: t('adk.msg.template'), type: 'select', required: true, options: usable.map((x) => ({ value: x.id, label: `${x.key} · ${t(`adk.msg.channel.${x.channel}` as MessageKey)} · ${x.locale}` })), help: usable.length ? t('adk.msg.help') : t('adk.msg.noTemplates') }],
          lost: [{ key: 'reason', label: t('adk.lostWhy'), type: 'textarea', required: true, min: 3 }],
        }}
        extraRowActions={(x) => [{ id: 'dups', label: t('adk.dup.find'), icon: <CopyCheck />, onSelect: () => findDups(x) }]}
        empty={
          <EmptyState icon={<Inbox />} title={t('adk.enq.none')} testId="no-enquiries">
            {t('adk.enq.noneBody')}
          </EmptyState>
        }
      />
      {open && <EnquiryDesk id={open} counsellors={counsellors} today={today} onClose={() => setOpen(null)} />}
      {dups && <MergeDialog keep={dups.row} list={dups.list} onClose={() => setDups(null)} />}
    </>
  );
}

function MergeDialog({ keep, list, onClose }: { keep: EnquiryRow; list: DuplicateEnquiry[]; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(list.filter((d) => d.stage !== 'converted').map((d) => d.id));
  const [pending, start] = useTransition();
  const merge = () =>
    start(async () => {
      const res = await mergeEnquiries(keep.id, chosen);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('adk.dup.merged', { n: res.data.merged }));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={t('adk.dup.title', { name: keep.name })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={merge} disabled={pending || chosen.length === 0} data-testid="merge">
            {t('adk.dup.merge', { n: chosen.length })}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-[13px] text-muted-foreground">{t('adk.dup.help')}</p>
        {list.map((d) => (
          <CheckboxField
            key={d.id}
            disabled={d.stage === 'converted'}
            checked={chosen.includes(d.id)}
            onChange={(v) => setChosen(v ? [...chosen, d.id] : chosen.filter((x) => x !== d.id))}
            label={
              <span>
                <b className="font-[550]">{d.name}</b> · {d.phone}
                {d.email ? ` · ${d.email}` : ''} · {t(`adm.stage.${d.stage}` as MessageKey)} · {fmt.date(d.createdAt.slice(0, 10), 'short')}
                <small className="block text-xs text-muted-foreground">{d.reasons.map((r) => t(`adk.dup.reason.${r.toLowerCase().replace(/\s+/g, '_')}` as MessageKey)).join(', ')}</small>
              </span>
            }
          />
        ))}
      </div>
    </Dialog>
  );
}
