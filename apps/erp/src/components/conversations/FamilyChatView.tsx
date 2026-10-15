'use client';

import { BellOff, BellRing, Building2, Check, CheckCheck, ChevronLeft, CircleCheck, Clock, FileText, Info, Lock, LockOpen, MessageCircle, Paperclip, Plus, Search, Send, ShieldCheck, UserRoundCog, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { assignThread, markFamilyRead, muteThread, searchStudents, sendFamilyMessage, setThreadStatus, startFamilyThread, studentFamily } from '@/app/(dashboard)/conversations/actions';
import { initials } from '@/components/initials';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Dialog, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ATTACH_ACCEPT, ATTACH_TYPES, MAX_FILE_BYTES, fileSize, fileToBase64, type FamilyMessage, type FamilyThread, type FamilyThreadPage, type ThreadStatus } from '@/lib/communication';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'unread' | 'open' | 'closed' | 'resolved';
const FILTERS: Filter[] = ['all', 'unread', 'open', 'closed', 'resolved'];
const POLL_MS = 10_000;
const dayKey = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
const STATUS_TONE: Record<ThreadStatus, 'success' | 'neutral' | 'info'> = { open: 'success', closed: 'neutral', resolved: 'info' };

function Avatar({ name, size = 'md', office }: { name: string; size?: 'sm' | 'md' | 'lg'; office?: boolean }) {
  const box = { sm: 'size-7 text-[11px]', md: 'size-10 text-sm', lg: 'size-[64px] text-xl' }[size];
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold', box, office ? 'bg-amber-soft text-amber-ink' : 'bg-teal-500/15 text-teal-700 dark:text-teal-300')}>
      {office ? <Building2 className="size-4" /> : initials(name) || '?'}
    </span>
  );
}

/**
 * Family chat for staff in the ERP: the thread list (search, open / closed / resolved / unread, by class),
 * the conversation with attachments and sent / delivered / read ticks grouped by day, and the thread's
 * details with close, reopen, resolve, mute and reassign. Leaders can open any thread read-only (audited).
 */
export function FamilyChatView({
  meId,
  threads,
  open,
  sections,
  staff,
  allView,
  isLeader,
  timeZone,
}: {
  meId: string;
  threads: FamilyThread[];
  open: FamilyThreadPage | null;
  sections: { id: string; displayName: string }[];
  staff: { id: string; fullName: string }[];
  allView: boolean;
  isLeader: boolean;
  timeZone: string;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [section, setSection] = useState('');
  const [info, setInfo] = useState(true);
  const [mobileThread, setMobileThread] = useState(!!open);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [busy, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = open?.conversation ?? null;
  const currentId = current?.id ?? '';

  // Realtime over the shared socket bridge; polling every 10 s keeps it fresh if that is unavailable.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/chat-live');
      es.onmessage = (ev) => {
        const e = JSON.parse(ev.data) as { type: string };
        if (e.type === 'message.new' || e.type === 'message.read' || e.type === 'conversation.changed') router.refresh();
      };
    } catch {
      /* polling below */
    }
    const timer = window.setInterval(() => document.visibilityState === 'visible' && router.refresh(), POLL_MS);
    return () => {
      es?.close();
      window.clearInterval(timer);
    };
  }, [router]);

  // Opening a thread with unread messages marks it read (the family sees the ticks turn blue).
  useEffect(() => {
    if (current && current.side === 'staff' && current.unread > 0) void markFamilyRead(current.id).then(() => router.refresh());
  }, [current, router]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open?.messages.length, currentId]);

  const counts = useMemo(
    () => ({
      all: threads.length,
      unread: threads.filter((x) => x.unread > 0).length,
      open: threads.filter((x) => x.status === 'open').length,
      closed: threads.filter((x) => x.status === 'closed').length,
      resolved: threads.filter((x) => x.status === 'resolved').length,
    }),
    [threads],
  );
  const needle = q.trim().toLowerCase();
  const shown = threads.filter(
    (x) =>
      (filter === 'all' || (filter === 'unread' ? x.unread > 0 : x.status === filter)) &&
      (!section || x.sectionId === section) &&
      (!needle || [x.student.fullName, x.family.fullName, x.staff.fullName, x.className].some((s) => s.toLowerCase().includes(needle))),
  );
  const href = (params: Record<string, string>) => `${pathname}?${new URLSearchParams({ ...(allView ? { view: 'all' } : {}), ...params })}`;
  const select = (id: string) => {
    setMobileThread(true);
    setError('');
    router.push(href({ t: id }), { scroll: false });
  };

  const send = () => {
    if (!current || (!text.trim() && !file)) return;
    start(async () => {
      setError('');
      const att = file ? { filename: file.name, contentType: file.type, contentBase64: await fileToBase64(file) } : undefined;
      const r = await sendFamilyMessage(current.id, text.trim(), att);
      if (!r.ok) return setError(r.error);
      setText('');
      setFile(null);
      router.refresh();
    });
  };
  const pickFile = (f: File | null) => {
    setError('');
    if (!f) return setFile(null);
    if (!ATTACH_TYPES.includes(f.type)) return setError(t('comm.err.fileType', { name: f.name }));
    if (f.size > MAX_FILE_BYTES) return setError(t('comm.err.fileSize', { name: f.name }));
    setFile(f);
  };
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setError('');
      router.refresh();
    });

  /** A guardian's relation to the student, or "Student" when the student writes for themselves. */
  const familyLabel = (x: FamilyThread) => (x.relation ? t('fc.relation', { relation: x.relation }) : t('fc.student'));
  const title = (x: FamilyThread) => `${x.family.fullName}${familyLabel(x) ? ` (${familyLabel(x)})` : ''}`;

  const row = (x: FamilyThread) => (
    <li key={x.id}>
      <button type="button" onClick={() => select(x.id)} aria-current={x.id === currentId} data-testid="fc-thread" className={cn('flex w-full items-start gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-muted', x.id === currentId && 'bg-muted')}>
        <Avatar name={x.family.fullName} office={x.kind === 'office'} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <span className="truncate">{x.family.fullName}</span>
            {x.kind === 'office' && <span className="rounded-[5px] bg-amber-soft px-1.5 text-[10.5px] font-semibold text-amber-ink">{t('fc.office')}</span>}
            {x.muted && <BellOff className="size-3 text-muted-foreground" aria-label={t('fc.muted')} />}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {t('fc.about', { student: x.student.fullName, className: x.className })}
          </span>
          <span className={cn('block truncate text-[12.5px]', x.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>{x.lastMessage ?? (x.side === 'leader' ? t('fc.hiddenUntilOpened') : t('fc.noMessages'))}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 text-[11.5px] text-muted-foreground">
          {x.lastMessageAt ? (dayKey(x.lastMessageAt, timeZone) === dayKey(new Date().toISOString(), timeZone) ? fmt.time(x.lastMessageAt) : fmt.date(dayKey(x.lastMessageAt, timeZone), 'short')) : ''}
          {x.unread > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">{x.unread}</span>}
          {x.status !== 'open' && <span className="text-[10.5px]">{t(`fc.status.${x.status}` as MessageKey)}</span>}
        </span>
      </button>
    </li>
  );

  const canAct = current?.side === 'staff';
  const readOnly = !!current && current.side === 'leader';

  return (
    <div className="-m-4 grid h-[calc(100dvh-105px)] min-h-[520px] overflow-hidden border-t bg-card grid-cols-[minmax(0,1fr)] md:-m-6 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_auto]" data-testid="family-chat">
      {/* On a phone the list (and its heading) is hidden while a thread is open. */}
      {mobileThread && <h1 className="sr-only md:hidden">{allView ? t('fc.allThreads') : t('nav.conversations')}</h1>}
      <section aria-label={t('fc.list')} className={cn('flex min-h-0 flex-col border-r', mobileThread && 'hidden md:flex')}>
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="flex items-center gap-2">
            <h1 className="m-0 min-w-0 flex-1 text-[17px] leading-8 font-bold">{allView ? t('fc.allThreads') : t('nav.conversations')}</h1>
            {/* Icon buttons keep the title on one line in the 340px list column. */}
            {isLeader && (
              <Button size="icon" variant={allView ? 'secondary' : 'outline'} className="size-8" onClick={() => router.push(allView ? pathname : `${pathname}?view=all`)} aria-pressed={allView} aria-label={t('fc.safeguarding')} title={t('fc.safeguarding')} data-testid="fc-all-view">
                <ShieldCheck />
              </Button>
            )}
            {!allView && (
              <Button size="icon" variant="outline" className="size-8" aria-label={t('fc.new')} onClick={() => setNewOpen(true)} data-testid="fc-new">
                <Plus />
              </Button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fc.search')} aria-label={t('fc.search')} className="h-9 pl-9" data-testid="fc-search" />
            </div>
            <select value={section} onChange={(e) => setSection(e.target.value)} aria-label={t('fc.byClass')} className="h-9 max-w-[140px] rounded-md border bg-background px-2 text-sm" data-testid="fc-class">
              <option value="">{t('fc.allClasses')}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div role="tablist" aria-label={t('fc.filter')} className="mt-2 flex gap-1 overflow-x-auto border-b px-2">
          {FILTERS.map((k) => (
            <button key={k} role="tab" type="button" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('-mb-px shrink-0 border-b-2 px-2 py-2.5 text-[13px] font-medium', filter === k ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')} data-testid={`fc-filter-${k}`}>
              {t(`fc.filter.${k}` as MessageKey)} <span className="text-xs text-muted-foreground">{counts[k]}</span>
            </button>
          ))}
        </div>
        {allView && <p className="mx-3 mt-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-xs text-amber-ink">{t('fc.auditList')}</p>}
        <div className="min-h-0 flex-1 overflow-auto px-2 pt-1.5 pb-3">
          <ul>{shown.map(row)}</ul>
          {shown.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">{threads.length ? t('fc.nothing') : t('fc.empty')}</p>}
        </div>
      </section>

      <section aria-label={current ? title(current) : t('nav.conversations')} className={cn('flex min-h-0 min-w-0 flex-col', !mobileThread && 'hidden md:flex')}>
        {current && open ? (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <Button size="icon" variant="ghost" className="size-8 md:hidden" aria-label={t('fc.back')} onClick={() => setMobileThread(false)}>
                <ChevronLeft />
              </Button>
              <Avatar name={current.family.fullName} office={current.kind === 'office'} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{title(current)}</b>
                <span className="block truncate text-xs text-muted-foreground">
                  {t('fc.about', { student: current.student.fullName, className: current.className })} · {current.kind === 'office' ? t('fc.officeWith', { name: current.staff.fullName }) : t('fc.with', { name: current.staff.fullName })}
                </span>
              </div>
              <StatusPill tone={STATUS_TONE[current.status]}>{t(`fc.status.${current.status}` as MessageKey)}</StatusPill>
              <Button size="icon" variant={info ? 'secondary' : 'ghost'} aria-label={t('fc.info')} aria-pressed={info} onClick={() => setInfo((v) => !v)} className="hidden xl:inline-flex">
                <Info />
              </Button>
            </header>
            {readOnly && (
              <p className="flex items-center gap-1.5 border-b bg-amber-soft px-4 py-2 text-xs text-amber-ink" data-testid="fc-audited">
                <ShieldCheck className="size-3.5" />
                {t('fc.auditThread')}
              </p>
            )}
            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-background px-4 py-5 md:px-6" aria-live="polite" data-testid="fc-messages">
              {open.messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">{t('fc.startHint')}</p>}
              {open.messages.map((m, i) => (
                <MessageRow key={m.id} m={m} thread={current} meId={meId} sep={i === 0 || dayKey(m.createdAt, timeZone) !== dayKey(open.messages[i - 1].createdAt, timeZone)} timeZone={timeZone} />
              ))}
            </div>
            {error && <p role="alert" className="border-t bg-red-soft px-4 py-2 text-sm text-red-ink">{error}</p>}
            {!readOnly && (
              <>
                {file && (
                  <div className="flex items-center gap-2 border-t px-4 py-2 text-sm">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{fileSize(file.size)}</span>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={t('comm.removeFile', { name: file.name })} onClick={() => setFile(null)}>
                      <X />
                    </Button>
                  </div>
                )}
                {current.status === 'closed' && <p className="border-t bg-muted px-4 py-2 text-xs text-muted-foreground">{t('fc.closedNote')}</p>}
                <form
                  className="flex items-center gap-2 border-t px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <input ref={fileRef} type="file" hidden accept={ATTACH_ACCEPT} onChange={(e) => (pickFile(e.target.files?.[0] ?? null), (e.target.value = ''))} data-testid="fc-file" />
                  <Button type="button" size="icon" variant="ghost" className="size-10" aria-label={t('fc.attach')} onClick={() => fileRef.current?.click()}>
                    <Paperclip />
                  </Button>
                  <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={t('fc.placeholder', { name: current.family.fullName })} aria-label={t('fc.message')} autoComplete="off" className="h-10 rounded-xl" data-testid="fc-input" />
                  <Button type="submit" disabled={busy || (!text.trim() && !file)} className="h-10 rounded-xl" data-testid="fc-send">
                    <Send />
                    <span className="hidden sm:inline">{t('fc.send')}</span>
                  </Button>
                </form>
              </>
            )}
          </>
        ) : (
          <div className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-10 text-teal" />
            {threads.length ? t('fc.pick') : t('fc.empty')}
          </div>
        )}
      </section>

      {current && open && info && (
        <aside aria-label={t('fc.info')} className="hidden w-[300px] flex-col gap-5 overflow-auto border-l px-4 py-5 xl:flex" data-testid="fc-info">
          <div className="text-center">
            <div className="flex justify-center">
              <Avatar name={current.student.fullName} size="lg" />
            </div>
            <b className="mt-2.5 block text-base">{current.student.fullName}</b>
            <span className="text-xs text-muted-foreground">
              {current.className} · {t('fc.roll', { roll: current.student.rollNo })}
            </span>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('fc.participants')}</h4>
            <ul className="grid gap-2 text-sm">
              <li className="flex items-center gap-2.5">
                <Avatar name={current.family.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-medium">{current.family.fullName}</b>
                  <span className="text-xs text-muted-foreground">{familyLabel(current)}</span>
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Avatar name={current.staff.fullName} size="sm" office={current.kind === 'office'} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-medium">{current.staff.id === meId ? t('fc.you', { name: current.staff.fullName }) : current.staff.fullName}</b>
                  <span className="text-xs text-muted-foreground">{current.kind === 'office' ? t('fc.officeAssignee') : t('fc.teacher')}</span>
                </span>
              </li>
            </ul>
          </div>
          {open.officeHours && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              {t('fc.hoursNote', { start: open.officeHours.start, end: open.officeHours.end })}
            </p>
          )}
          {canAct && (
            <div className="grid gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('fc.actions')}</h4>
              {current.status !== 'open' ? (
                <Button variant="outline" disabled={busy} onClick={() => act(() => setThreadStatus(current.id, 'open'))} data-testid="fc-reopen">
                  <LockOpen />
                  {t('fc.reopen')}
                </Button>
              ) : (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => act(() => setThreadStatus(current.id, 'resolved'))} data-testid="fc-resolve">
                    <CircleCheck />
                    {t('fc.resolve')}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => act(() => setThreadStatus(current.id, 'closed'))} data-testid="fc-close">
                    <Lock />
                    {t('fc.close')}
                  </Button>
                </>
              )}
              <Button variant="outline" disabled={busy} onClick={() => act(() => muteThread(current.id, !current.muted))} data-testid="fc-mute">
                {current.muted ? <BellRing /> : <BellOff />}
                {current.muted ? t('fc.unmute') : t('fc.mute')}
              </Button>
              <Assign staff={staff.filter((s) => s.id !== current.staff.id)} busy={busy} onAssign={(id) => act(() => assignThread(current.id, id))} />
            </div>
          )}
          {readOnly && isLeader && <Assign staff={staff.filter((s) => s.id !== current.staff.id)} busy={busy} onAssign={(id) => act(() => assignThread(current.id, id))} />}
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('fc.files')}</h4>
            <ul className="grid gap-1.5 text-sm">
              {open.messages.filter((m) => m.attachment).map((m) => (
                <li key={m.id}>
                  <a className="flex items-center gap-2 hover:underline" href={`/api/download?kind=conversation-file&id=${current.id}&msg=${m.id}`}>
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="truncate">{m.attachment!.name}</span>
                  </a>
                </li>
              ))}
              {!open.messages.some((m) => m.attachment) && <li className="text-muted-foreground">{t('fc.noFiles')}</li>}
            </ul>
          </div>
        </aside>
      )}

      {newOpen && <NewThread onClose={() => setNewOpen(false)} onCreated={(id) => (setNewOpen(false), select(id))} />}
    </div>
  );
}

function MessageRow({ m, thread, meId, sep, timeZone }: { m: FamilyMessage; thread: FamilyThread; meId: string; sep: boolean; timeZone: string }) {
  const { t, fmt } = useI18n();
  const fromStaff = m.side === 'staff';
  const mine = m.senderId === meId;
  const file = m.attachment ? `/api/download?kind=conversation-file&id=${thread.id}&msg=${m.id}` : null;
  return (
    <>
      {sep && <div className="self-center rounded-full border bg-card px-2.5 py-0.5 text-[11.5px] text-muted-foreground">{fmt.date(dayKey(m.createdAt, timeZone))}</div>}
      {m.kind === 'system' ? (
        <div className="self-center text-[11.5px] text-muted-foreground" data-testid="fc-system">
          {m.body} · {fmt.time(m.createdAt)}
        </div>
      ) : (
        <div className={cn('flex max-w-[78%] items-end gap-2.5 md:max-w-[70%]', fromStaff && 'flex-row-reverse self-end')} data-testid="fc-message" data-side={m.side}>
          {!fromStaff && <Avatar name={m.senderName} size="sm" />}
          <div className="min-w-0">
            <div className={cn('rounded-[14px] border px-3 py-2 text-[13.5px] break-words whitespace-pre-wrap', fromStaff ? 'rounded-br-[4px] border-primary bg-primary text-primary-foreground' : 'rounded-bl-[4px] bg-card')}>
              {fromStaff && !mine && <div className="mb-0.5 text-xs font-semibold opacity-80">{m.senderName}</div>}
              {m.body}
              {m.attachment && file && (
                <a href={file} className={cn('mt-1.5 flex min-w-[200px] items-center gap-2.5 rounded-[10px] border p-2 text-foreground no-underline', fromStaff ? 'border-transparent bg-card' : 'bg-background')} data-testid="fc-attachment">
                  {m.attachment.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a private file through the download route, not an optimisable asset
                    <img src={file} alt={m.attachment.name} className="max-h-40 max-w-[220px] rounded-md object-cover" />
                  ) : (
                    <>
                      <span className="grid size-9 place-items-center rounded-lg bg-sky-500/12 text-sky-700">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-[13px]">{m.attachment.name}</b>
                        <span className="text-xs text-muted-foreground">{fileSize(m.attachment.size)}</span>
                      </span>
                    </>
                  )}
                </a>
              )}
            </div>
            <div className={cn('mt-1 flex items-center gap-1 text-[11px] text-muted-foreground', fromStaff && 'justify-end')}>
              {fmt.time(m.createdAt)}
              {m.status && (
                <span title={t(`fc.tick.${m.status}` as MessageKey)} aria-label={t(`fc.tick.${m.status}` as MessageKey)} data-testid="fc-tick" data-status={m.status}>
                  {m.status === 'sent' ? <Check className="size-3.5" /> : <CheckCheck className={cn('size-3.5', m.status === 'read' && 'text-sky-600')} />}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Assign({ staff, busy, onAssign }: { staff: { id: string; fullName: string }[]; busy: boolean; onAssign: (id: string) => void }) {
  const { t } = useI18n();
  const [id, setId] = useState('');
  return (
    <div className="grid gap-1.5">
      <label htmlFor="fc-assign" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('fc.assign')}
      </label>
      <div className="flex items-end gap-2">
        <select id="fc-assign" value={id} onChange={(e) => setId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" data-testid="fc-assign">
          <option value="">{t('fc.assignPick')}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={!id || busy} onClick={() => (onAssign(id), setId(''))}>
          <UserRoundCog />
          {t('fc.assignGo')}
        </Button>
      </div>
    </div>
  );
}

/** Start a thread with a student's family: find the student, pick the parent (or the student). */
function NewThread({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; fullName: string; rollNo: string; className: string }[]>([]);
  const [family, setFamily] = useState<Awaited<ReturnType<typeof studentFamily>> | null>(null);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const searching = q.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const r = await searchStudents(q.trim());
      if (live) setFound(r.ok ? r.data : []);
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, searching]);
  const fam = family?.ok ? family.data : null;
  return (
    <Dialog title={t('fc.new')} onClose={onClose} busy={busy}>
      <div className="grid gap-3" data-testid="fc-new-dialog">
        {!fam ? (
          <>
            <label className="grid gap-1.5 text-[13px] font-semibold">
              {t('fc.findStudent')}
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('comm.people.placeholder')} className="h-10 font-normal" autoFocus />
            </label>
            <ul className="max-h-60 overflow-auto rounded-md border">
              {(searching ? found : []).map((s) => (
                <li key={s.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => start(async () => setFamily(await studentFamily(s.id)))}>
                    <span className="flex-1 truncate">{s.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.className} · {s.rollNo}
                    </span>
                  </button>
                </li>
              ))}
              {searching && found.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('comm.people.none')}</li>}
            </ul>
            {family && !family.ok && <p className="text-sm text-red-ink">{family.error}</p>}
          </>
        ) : (
          <>
            <p className="text-sm">
              <b>{fam.student.fullName}</b> · {fam.student.className}
            </p>
            <ul className="grid gap-1.5">
              {fam.people.map((p) => (
                <li key={p.id}>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await startFamilyThread({ studentId: fam.student.id, withUserId: p.id, office: fam.office });
                        if (!r.ok) return setError(r.error);
                        onCreated(r.data.id);
                      })
                    }
                  >
                    {p.fullName} <span className="text-xs text-muted-foreground">({p.relation === 'self' ? t('fc.student') : p.relation})</span>
                  </Button>
                </li>
              ))}
              {fam.people.length === 0 && <li className="text-sm text-muted-foreground">{t('fc.noFamily')}</li>}
            </ul>
            <Button variant="ghost" className="w-fit" onClick={() => setFamily(null)}>
              <ChevronLeft />
              {t('fc.back')}
            </Button>
          </>
        )}
        {error && <p className="text-sm text-red-ink">{error}</p>}
      </div>
    </Dialog>
  );
}
