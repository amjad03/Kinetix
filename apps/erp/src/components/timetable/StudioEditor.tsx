'use client';

import { AlertTriangle, Copy, FileText, Lock, LockOpen, Move, RefreshCw, Send, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type DragEvent } from 'react';
import { discardVersion, duplicateVersion, lockSlot, moveSlot, publishVersion, regenerate, removeVersionSlot } from '@/app/(dashboard)/timetable/studio/actions';
import { Grid, type Col } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, SelectInput, StatGrid, StatTile, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { weekdayName, weekdayNameShort } from '@/lib/dates';
import { clashesAt, slotsFor, STATUS_TONE, type StudioSlot, type VersionDetail, type ViewBy, type WorkloadRow } from '@/lib/timetable-studio';
import { cn } from '@/lib/utils';

type Hover = { key: string; clashes: string[] } | null;

/**
 * One timetable version: the week grid of a class, teacher or room with drag-and-drop (a lab block or a parallel
 * elective moves together; the cell turns red over a clash, and the API checks again on drop), locks, what the
 * generator could not place and why, every clash left, the teachers' load, what publishing changes, and publishing.
 */
export function StudioEditor({ v, canEdit }: { v: VersionDetail; canEdit: boolean }) {
  const { t, fmt, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const draft = v.status === 'draft' && canEdit;
  const [by, setBy] = useState<ViewBy>('class');
  const [id, setId] = useState<string>(v.classes[0]?.id ?? '');
  const [dragging, setDragging] = useState<StudioSlot | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [moving, setMoving] = useState<StudioSlot | null>(null);
  const [publishing, setPublishing] = useState(false);

  const teachers = useMemo(() => [...new Map(v.slots.map((s) => [s.teacherId, s.teacher])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [v.slots]);
  const roomList = useMemo(() => [...new Map(v.slots.filter((s) => s.roomId).map((s) => [s.roomId!, s.room ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [v.slots]);
  const choices = by === 'class' ? v.classes.map((c) => ({ value: c.id, label: c.displayName })) : by === 'teacher' ? teachers.map(([value, label]) => ({ value, label })) : roomList.map(([value, label]) => ({ value, label }));
  const current = choices.some((c) => c.value === id) ? id : (choices[0]?.value ?? '');
  const shown = slotsFor(v.slots, by, current);
  const problemIds = new Set(v.problems.map((p) => p.slotId));
  const unplaced = (v.report.unplaced ?? []).reduce((n, u) => n + u.missing, 0);
  const over = v.workload.filter((w) => w.status === 'over').length;

  const run = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done?: string, after?: (d: never) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error);
      if (done) toast.success(done);
      if (after) after(res.data as never);
      else router.refresh();
    });

  const drop = (slot: StudioSlot, day: number, startsAt: string) =>
    start(async () => {
      setHover(null);
      setDragging(null);
      if (slot.dayOfWeek === day && slot.startsAt === startsAt) return;
      const res = await moveSlot(v.id, slot.id, { dayOfWeek: day, startsAt });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('tts2.moved'));
      router.refresh();
    });

  const onOver = (e: DragEvent, day: number, startsAt: string) => {
    if (!dragging) return;
    e.preventDefault();
    const key = `${day}|${startsAt}`;
    if (hover?.key !== key) setHover({ key, clashes: clashesAt(v.slots, dragging, { dayOfWeek: day, startsAt }) });
  };

  const workCols: Col<WorkloadRow>[] = [
    { label: t('tts2.w.teacher'), cell: (r) => r.teacher },
    { label: t('tts2.w.here'), cell: (r) => r.periods, num: true },
    { label: t('tts2.w.elsewhere'), cell: (r) => r.elsewhere, num: true },
    { label: t('tts2.w.total'), cell: (r) => `${r.total} / ${r.limit}`, sort: (r) => r.total },
    { label: t('tts2.w.maxDay'), cell: (r) => `${r.maxDay} / ${r.dayLimit}`, sort: (r) => r.maxDay },
    { label: t('tts2.w.lab'), cell: (r) => r.labPeriods, num: true },
    { label: t('tts2.w.status'), cell: (r) => <StatusPill tone={r.status === 'over' ? 'danger' : 'success'}>{t(`tts2.w.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[v.status]}>{t(`tts2.status.${v.status}` as MessageKey)}</StatusPill>
          <span className="text-sm text-muted-foreground">
            v{v.versionNo} · {v.classes.map((c) => c.displayName).join(', ')}
            {v.effectiveFrom ? ` · ${t('tts2.from', { date: fmt.date(v.effectiveFrom, 'short') })}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" asChild>
            <a href={`/api/download?kind=tt-grid&version=${v.id}&by=${by}&id=${current}`} data-testid="version-pdf">
              <FileText />
              {t('atd.pdf')}
            </a>
          </Button>
          {canEdit && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => duplicateVersion(v.id), t('tts2.duplicated'), (d: { id: string }) => router.push(`/timetable/studio/${d.id}`))} data-testid="duplicate-version">
              <Copy />
              {t('tts2.duplicate')}
            </Button>
          )}
          {draft && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => run(() => regenerate(v.id), t('tts2.regenerated'))} data-testid="regenerate">
                <RefreshCw />
                {t('tts2.regenerate')}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => discardVersion(v.id), t('tts2.discarded'))}>
                <Trash2 />
                {t('tts2.discard')}
              </Button>
              <Button disabled={pending} onClick={() => setPublishing(true)} data-testid="publish-version">
                <Send />
                {t('tts2.publish')}
              </Button>
            </>
          )}
        </div>
      </div>

      <StatGrid min={150}>
        <StatTile label={t('tts2.s.periods')} value={fmt.number(v.slots.length)} caption={t('tts2.s.placed', { n: fmt.number(v.report.placed ?? v.slots.length) })} />
        <StatTile label={t('tts2.s.unplaced')} value={fmt.number(unplaced)} caption={unplaced ? t('tts2.s.unplacedHelp') : t('tts2.s.allPlaced')} />
        <StatTile label={t('tts2.s.clashes')} value={fmt.number(v.problems.length)} caption={v.problems.length ? t('tts2.s.fixFirst') : t('tts2.s.noClash')} />
        <StatTile label={t('tts2.s.over')} value={fmt.number(over)} caption={t('tts2.s.teachers', { n: fmt.number(v.workload.length) })} />
      </StatGrid>

      <Card title={t('tts2.grid')} subtitle={draft ? t('tts2.gridHelp') : undefined} action={
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('tts2.viewBy')}>
            <SelectInput value={by} onChange={(e) => setBy(e.target.value as ViewBy)} options={(['class', 'teacher', 'room'] as const).map((x) => ({ value: x, label: t(`tts2.by.${x}` as MessageKey) }))} />
          </FormField>
          <FormField label={t(`tts2.by.${by}` as MessageKey)}>
            <SelectInput value={current} onChange={(e) => setId(e.target.value)} options={choices} data-testid="view-of" />
          </FormField>
        </div>
      }>
        <div className="overflow-x-auto" data-testid="studio-grid">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]" aria-label={t('tts2.grid')}>
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] w-[88px] border-b bg-muted px-2 py-2 text-left" scope="col">{t('tts2.day')}</th>
                {v.periods.map((p, i) => (
                  <th key={p.startsAt} scope="col" className="border-b bg-muted px-2 py-2 text-left font-semibold">
                    {i + 1}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {p.startsAt}–{p.endsAt}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.days.map((d) => (
                <tr key={d}>
                  <th scope="row" className="sticky left-0 z-[1] border-b bg-card px-2 py-2 text-left align-top font-semibold">
                    <span className="hidden sm:inline">{weekdayName(d, locale)}</span>
                    <span className="sm:hidden">{weekdayNameShort(d, locale)}</span>
                  </th>
                  {v.periods.map((p) => {
                    const key = `${d}|${p.startsAt}`;
                    const here = shown.filter((s) => s.dayOfWeek === d && s.startsAt < p.endsAt && p.startsAt < s.endsAt);
                    const hot = hover?.key === key;
                    return (
                      <td
                        key={p.startsAt}
                        data-cell={key}
                        onDragOver={(e) => draft && onOver(e, d, p.startsAt)}
                        onDragLeave={() => hot && setHover(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draft && dragging) drop(dragging, d, p.startsAt);
                        }}
                        className={cn('h-[74px] min-w-[120px] border-b border-l px-1.5 py-1 align-top', hot && (hover!.clashes.length ? 'bg-red-50 outline outline-2 outline-red-400 dark:bg-red-950/40' : 'bg-teal-50 outline outline-2 outline-teal-500 dark:bg-teal-950/40'))}
                      >
                        {hot && hover!.clashes.length > 0 && <p className="mb-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{hover!.clashes.map((c) => t(`tts2.clash.${c}` as MessageKey)).join(', ')}</p>}
                        <div className="grid gap-1">
                          {here.map((s) => (
                            <SlotCard key={s.id} s={s} by={by} draft={draft} problem={problemIds.has(s.id)} onDragStart={() => setDragging(s)} onDragEnd={() => { setDragging(null); setHover(null); }} onMove={() => setMoving(s)} onLock={() => run(() => lockSlot(v.id, s.id, !s.locked))} onRemove={() => run(() => removeVersionSlot(v.id, s.id), t('tts2.removed'))} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={t('tts2.problems')} subtitle={t('tts2.problemsHelp')}>
          {v.problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tts2.noProblems')}</p>
          ) : (
            <ul className="grid gap-2 text-sm" data-testid="problems">
              {v.problems.map((p, i) => {
                const s = v.slots.find((x) => x.id === p.slotId);
                return (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <span>
                      {s ? <strong>{`${weekdayNameShort(s.dayOfWeek, locale)} ${s.startsAt} ${s.subjectCode} ${s.section}: `}</strong> : null}
                      {p.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title={t('tts2.unplaced')} subtitle={t('tts2.unplacedHelp')}>
          {(v.report.unplaced ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tts2.allPlaced')}</p>
          ) : (
            <ul className="grid gap-2 text-sm" data-testid="unplaced">
              {v.report.unplaced!.map((u, i) => (
                <li key={i}>
                  <strong>{u.label}</strong>
                  {u.missing ? ` · ${t.plural('tts2.missing', u.missing)}` : ''} · {t(`tts2.why.${u.reason}` as MessageKey)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4">
        <Card title={t('tts2.workload')} subtitle={t('tts2.workloadHelp')}>
          <Grid cols={workCols} rows={v.workload} empty={t('tts2.noWorkload')} emptyIcon={<Users />} testId="workload" exportName="version-workload" tint={(r) => r.status === 'over'} />
        </Card>
        {v.status === 'draft' && (
          <Card title={t('tts2.diff')} subtitle={t('tts2.diffHelp')}>
            <Grid
              cols={[
                { label: t('tts2.col.class'), cell: (r) => r.section },
                { label: t('tts2.d.added'), cell: (r) => r.added, num: true },
                { label: t('tts2.d.removed'), cell: (r) => r.removed, num: true },
                { label: t('tts2.d.kept'), cell: (r) => r.kept, num: true },
              ]}
              rows={v.diff}
              empty={t('tts2.noDiff')}
              testId="diff"
            />
          </Card>
        )}
      </div>

      {moving && <MoveDialog v={v} slot={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); router.refresh(); }} />}
      {publishing && <PublishDialog v={v} onClose={() => setPublishing(false)} />}
    </>
  );
}

function SlotCard({ s, by, draft, problem, onDragStart, onDragEnd, onMove, onLock, onRemove }: { s: StudioSlot; by: ViewBy; draft: boolean; problem: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: () => void; onLock: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const movable = draft && !s.locked;
  const tone = s.kind === 'lab' ? 'border-l-violet-500' : s.kind === 'elective' ? 'border-l-amber-500' : s.kind === 'tutorial' ? 'border-l-sky-500' : 'border-l-teal-600';
  return (
    <div
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', s.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      data-testid="studio-slot"
      data-slot-id={s.id}
      className={cn('group rounded-md border border-l-4 bg-card px-1.5 py-1 shadow-xs', tone, movable && 'cursor-grab active:cursor-grabbing', problem && 'ring-2 ring-red-400')}
      title={[s.subject, s.teacher, s.room, s.section].filter(Boolean).join(' · ')}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold leading-tight">
          {s.subjectCode}
          {s.batch ? ` · ${s.batch}` : ''}
        </span>
        {s.locked && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t('tts2.locked')} />}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{by === 'class' ? s.teacher : s.section}</div>
      <div className="truncate text-[11px] text-muted-foreground">{by === 'room' ? s.teacher : (s.room ?? t('tts2.noRoom'))}</div>
      {draft && (
        <div className="mt-0.5 flex gap-0.5 opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
          {!s.locked && (
            <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={onMove} aria-label={t('tts2.move')}>
              <Move className="size-3.5" />
            </button>
          )}
          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={onLock} aria-label={s.locked ? t('tts2.unlock') : t('tts2.lock')}>
            {s.locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
          </button>
          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={onRemove} aria-label={t('tts2.remove')}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The keyboard way to move a period: pick the day and period, see the clashes, move. */
function MoveDialog({ v, slot, onClose, onDone }: { v: VersionDetail; slot: StudioSlot; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [day, setDay] = useState(String(slot.dayOfWeek));
  const [at, setAt] = useState(slot.startsAt);
  const [problems, setProblems] = useState<string[] | null>(null);
  const check = () =>
    start(async () => {
      const res = await moveSlot(v.id, slot.id, { dayOfWeek: Number(day), startsAt: at }, true);
      if (!res.ok) return toast.error(res.error);
      setProblems(res.data.problems.map((p) => p.message));
    });
  const go = () =>
    start(async () => {
      const res = await moveSlot(v.id, slot.id, { dayOfWeek: Number(day), startsAt: at });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('tts2.moved'));
      onDone();
    });
  return (
    <Dialog
      title={t('tts2.moveTitle', { what: `${slot.subjectCode} ${slot.section}` })}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={check} disabled={pending}>
            {t('tts2.check')}
          </Button>
          <Button onClick={go} disabled={pending}>
            {t('tts2.move')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('tts2.day')}>
          <SelectInput value={day} onChange={(e) => setDay(e.target.value)} options={v.days.map((d) => ({ value: String(d), label: weekdayName(d, locale) }))} />
        </FormField>
        <FormField label={t('tts2.period')}>
          <SelectInput value={at} onChange={(e) => setAt(e.target.value)} options={v.periods.map((p, i) => ({ value: p.startsAt, label: `${i + 1} · ${p.startsAt}–${p.endsAt}` }))} />
        </FormField>
      </div>
      {problems && (
        <div className="mt-3 text-sm" role="status">
          {problems.length === 0 ? <p className="text-teal-700 dark:text-teal-300">{t('tts2.free')}</p> : problems.map((p, i) => <p key={i} className="text-red-700 dark:text-red-300">{p}</p>)}
        </div>
      )}
    </Dialog>
  );
}

function PublishDialog({ v, onClose }: { v: VersionDetail; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState('');
  const [notify, setNotify] = useState(true);
  const go = () =>
    start(async () => {
      const res = await publishVersion(v.id, from || null, notify);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('tts2.published', { n: fmt.number(res.data.published), told: fmt.number(res.data.told) }));
      onClose();
      router.refresh();
    });
  const removed = v.diff.reduce((n, d) => n + d.removed, 0);
  return (
    <Dialog
      title={t('tts2.publishTitle')}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={go} disabled={pending || v.problems.some((p) => p.kind !== 'capacity')} data-testid="confirm-publish">
            <Send />
            {t('tts2.publish')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">{t('tts2.publishBody', { n: fmt.number(v.slots.length), removed: fmt.number(removed), classes: fmt.number(v.classes.length) })}</p>
      {v.problems.some((p) => p.kind !== 'capacity') && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-300">{t('tts2.publishBlocked')}</p>}
      <div className="grid gap-3">
        <FormField label={t('tts2.f.from')} helper={t('tts2.f.fromHelp')}>
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <CheckboxField label={t('tts2.f.notify')} checked={notify} onChange={setNotify} />
      </div>
    </Dialog>
  );
}
