'use client';

import { Check, CheckCheck, ChevronLeft, Clock, FileText, Info, Mail, MessageCircle, Paperclip, Pin, PinOff, Plus, Search, Send, Settings2, ShieldCheck, Users, UsersRound, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { addMembers, markRead, pinThread, sendMessage, startThread, typing } from '@/app/(dashboard)/chat/actions';
import { initials } from '@/components/initials';
import { GroupSettingsDialog, LinkedGroupDialog, postBlock } from '@/components/life/ChatGroups';
import { Button } from '@/components/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/shadcn/dialog';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { threadName, type ChatMember, type ChatMessage, type ChatPerson, type ChatThread } from '@/lib/chat';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'unread' | 'groups' | 'external';
const TABS: Tab[] = ['all', 'unread', 'groups', 'external'];
const AV_TONES = ['bg-teal-500/15 text-teal-700', 'bg-violet-500/15 text-violet-700', 'bg-amber-500/18 text-amber-700', 'bg-pink-500/15 text-pink-700', 'bg-sky-500/15 text-sky-700', 'bg-green-500/15 text-green-700', 'bg-indigo-500/15 text-indigo-700'];
const tone = (s: string) => AV_TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_TONES.length];
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));

function Avatar({ name, group, size = 'md' }: { name: string; group?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'size-7 text-[11px]', md: 'size-10 text-sm', lg: 'size-[72px] text-2xl' }[size];
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold dark:brightness-125', box, tone(name))}>
      {group ? <Users className={size === 'lg' ? 'size-7' : 'size-4'} /> : initials(name) || '?'}
    </span>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export function ChatView({ meId, threads, people, open, tab: initialTab, groupSources }: { meId: string; threads: ChatThread[]; people: ChatPerson[]; open: { thread: ChatThread; members: ChatMember[]; messages: ChatMessage[] } | null; tab: string; groupSources?: { sections: { id: string; name: string }[]; clubs: { id: string; name: string }[] } }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>((TABS as string[]).includes(initialTab) ? (initialTab as Tab) : 'all');
  const [q, setQ] = useState('');
  const [info, setInfo] = useState(true);
  const [mobileThread, setMobileThread] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [typingName, setTypingName] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [groupDlg, setGroupDlg] = useState<'linked' | 'settings' | null>(null);
  const [busy, start] = useTransition();
  const lastTyping = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = open?.thread ?? null;
  const currentId = current?.id ?? '';

  // Realtime: refresh on new messages and receipts, show "typing" for a few seconds.
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number | undefined;
    try {
      es = new EventSource('/api/chat-live');
      es.onmessage = (ev) => {
        const e = JSON.parse(ev.data) as { type: string; threadId: string | null; userId: string | null; name: string | null };
        if (e.type === 'chat.typing' && e.threadId === currentId && e.userId !== meId) {
          setTypingName(e.name ?? '');
          window.clearTimeout(timer);
          timer = window.setTimeout(() => setTypingName(''), 4000);
        } else if (e.type === 'chat.message' || (e.type === 'chat.read' && e.userId !== meId)) {
          if (e.type === 'chat.message') setTypingName('');
          router.refresh();
        }
      };
    } catch {
      /* no realtime: the page still works on reload */
    }
    return () => {
      es?.close();
      window.clearTimeout(timer);
    };
  }, [currentId, meId, router]);

  // Opening a thread with unread messages marks it read (the sender sees the double tick turn blue).
  useEffect(() => {
    if (current && current.unread > 0) void markRead(current.id).then(() => router.refresh());
  }, [current, router]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open?.messages.length, currentId]);

  const counts = useMemo(
    () => ({ all: threads.length, unread: threads.filter((x) => x.unread > 0).length, groups: threads.filter((x) => x.kind === 'group').length, external: threads.filter((x) => x.kind === 'external').length }),
    [threads],
  );
  const shown = threads.filter((x) => (tab === 'all' || (tab === 'unread' && x.unread > 0) || (tab === 'groups' && x.kind === 'group') || (tab === 'external' && x.kind === 'external')) && threadName(x).toLowerCase().includes(q.toLowerCase()));
  const select = (id: string) => {
    setMobileThread(true);
    setError('');
    router.push(`${pathname}?t=${id}&tab=${tab}`, { scroll: false });
  };

  const others = (open?.members ?? []).filter((m) => m.id !== meId);
  const readByAll = (m: ChatMessage) => others.length > 0 && others.every((o) => o.lastReadAt && o.lastReadAt >= m.createdAt);
  const readBySome = (m: ChatMessage) => others.some((o) => o.lastReadAt && o.lastReadAt >= m.createdAt);

  const send = () => {
    if (!current || (!text.trim() && !file)) return;
    start(async () => {
      setError('');
      const att = file ? { filename: file.name, contentType: file.type || 'application/octet-stream', contentBase64: await fileToBase64(file) } : undefined;
      const r = await sendMessage(current.id, text.trim(), att);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText('');
      setFile(null);
      router.refresh();
    });
  };
  const onType = (v: string) => {
    setText(v);
    if (current && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      void typing(current.id);
    }
  };

  const row = (x: ChatThread) => {
    const name = threadName(x);
    const lm = x.lastMessage;
    const preview = lm ? (lm.attachment && !lm.body ? t('v2.chat.attachment') : lm.body) : t('v2.chat.noMessages');
    return (
      <li key={x.id}>
        <button type="button" onClick={() => select(x.id)} aria-current={x.id === currentId} data-testid="chat-thread" className={cn('flex w-full items-start gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-muted', x.id === currentId && 'bg-muted')}>
          <Avatar name={name} group={x.kind === 'group'} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              <span className="truncate">{name}</span>
              {x.kind === 'external' && <span className="rounded-[5px] bg-amber-soft px-1.5 text-[10.5px] font-semibold text-amber-ink">{x.channel === 'whatsapp' ? 'WhatsApp' : t('v2.chat.email')}</span>}
            </span>
            <span className={cn('block truncate text-[12.5px]', x.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {x.kind === 'group' && lm?.senderName ? `${lm.senderName.replace(/^(Dr|Prof|Mr|Mrs|Ms|Capt)\.?\s+/i, '').split(' ')[0]}: ` : ''}
              {preview}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5 text-[11.5px] text-muted-foreground">
            {x.lastMessageAt ? fmt.time(x.lastMessageAt) : ''}
            {x.unread > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">{x.unread}</span>}
          </span>
        </button>
      </li>
    );
  };

  const pinned = shown.filter((x) => x.pinned);
  const name = current ? threadName(current) : '';

  return (
    <div className="-m-4 grid h-[calc(100dvh-105px)] min-h-[480px] overflow-hidden border-t bg-card grid-cols-[minmax(0,1fr)] md:-m-6 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_auto]" data-testid="chat">
      {/* Conversation list */}
      <section aria-label={t('v2.chat.list')} className={cn('flex min-h-0 flex-col border-r', mobileThread && 'hidden md:flex')}>
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="flex items-center gap-2">
            <b className="flex-1 text-[17px]">{t('v2.chat.title')}</b>
            <Button size="icon" variant="outline" className="size-8" aria-label={t('v2.chat.new')} onClick={() => setNewOpen(true)} data-testid="chat-new">
              <Plus />
            </Button>
            {groupSources && (groupSources.sections.length > 0 || groupSources.clubs.length > 0) && (
              <Button size="icon" variant="outline" className="size-8" aria-label={t('cd.group.title')} title={t('cd.group.title')} onClick={() => setGroupDlg('linked')} data-testid="chat-linked-group">
                <UsersRound />
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('v2.chat.search')} aria-label={t('v2.chat.search')} className="pl-9" />
          </div>
        </div>
        <div role="tablist" className="mt-2 flex gap-1 border-b px-2">
          {TABS.map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-2 py-2.5 text-[13px] font-medium', tab === k ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')} data-testid={`chat-tab-${k}`}>
              {t(`v2.chat.tab.${k}` as MessageKey)} <span className="text-xs text-muted-foreground">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pt-1.5 pb-3">
          {pinned.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                <Pin className="size-3" />
                {t('v2.chat.pinned')}
              </div>
              <ul>{pinned.map(row)}</ul>
              <div className="px-2 pt-2.5 pb-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{t('v2.chat.recent')}</div>
            </>
          )}
          <ul>{shown.filter((x) => !x.pinned).map(row)}</ul>
          {shown.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">{threads.length ? t('v2.chat.nothing') : t('v2.chat.empty')}</p>}
        </div>
      </section>

      {/* Thread */}
      <section aria-label={name || t('v2.chat.title')} className={cn('flex min-h-0 min-w-0 flex-col', !mobileThread && 'hidden md:flex')}>
        {current && open ? (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <Button size="icon" variant="ghost" className="size-8 md:hidden" aria-label={t('v2.chat.back')} onClick={() => setMobileThread(false)}>
                <ChevronLeft />
              </Button>
              <Avatar name={name} group={current.kind === 'group'} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{name}</b>
                <span className="block truncate text-xs text-muted-foreground">
                  {current.kind === 'group' ? t('v2.chat.members', { n: current.memberCount }) : current.kind === 'external' ? `${current.contactAddress} · ${t(`v2.chat.kind.${current.contactKind ?? 'other'}` as MessageKey)}` : (others[0]?.roles ?? []).map((r) => t(`role.${r}` as MessageKey)).join(' · ')}
                </span>
              </div>
              {current.kind === 'group' && (current.myRole === 'owner' || current.myRole === 'admin') && (
                <Button size="icon" variant="ghost" aria-label={t('cd.group.settings')} onClick={() => setGroupDlg('settings')} data-testid="chat-group-settings">
                  <Settings2 />
                </Button>
              )}
              <Button size="icon" variant="ghost" aria-label={current.pinned ? t('v2.chat.unpin') : t('v2.chat.pin')} onClick={() => start(async () => void (await pinThread(current.id, !current.pinned), router.refresh()))}>
                {current.pinned ? <PinOff /> : <Pin />}
              </Button>
              <Button size="icon" variant={info ? 'secondary' : 'ghost'} aria-label={t('v2.chat.info')} aria-pressed={info} onClick={() => setInfo((v) => !v)} className="hidden xl:inline-flex">
                <Info />
              </Button>
            </header>
            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto bg-background px-4 py-5 md:px-6" aria-live="polite" data-testid="chat-messages">
              {current.kind === 'external' && (
                <div className="flex items-center gap-1.5 self-center rounded-full bg-amber-soft px-2.5 py-0.5 text-[11.5px] text-amber-ink">
                  <ShieldCheck className="size-3" />
                  {t('v2.chat.externalNote')}
                </div>
              )}
              {open.messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">{t('v2.chat.startHint')}</p>}
              {open.messages.map((m, i) => {
                const mine = m.senderId === meId;
                const day = dayKey(m.createdAt);
                const sep = i === 0 || day !== dayKey(open.messages[i - 1].createdAt);
                const who = m.direction === 'inbound' ? (current.contactName ?? m.externalFrom ?? '') : (m.senderName ?? '');
                return (
                  <div key={m.id} className="contents">
                    {sep && <div className="self-center rounded-full border bg-card px-2.5 py-0.5 text-[11.5px] text-muted-foreground">{fmt.date(day)}</div>}
                    <div className={cn('flex max-w-[78%] items-end gap-2.5 md:max-w-[72%]', mine && 'flex-row-reverse self-end')} data-testid="chat-message">
                      {!mine && <Avatar name={who} size="sm" />}
                      <div className="min-w-0">
                        <div className={cn('rounded-[14px] border px-3 py-2 text-[13.5px] break-words whitespace-pre-wrap', mine ? 'rounded-br-[4px] border-primary bg-primary text-primary-foreground' : 'rounded-bl-[4px] bg-card')}>
                          {!mine && current.kind !== 'direct' && <div className="mb-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">{who}</div>}
                          {m.body}
                          {m.attachment && (
                            <a href={`/api/download?kind=chat-file&id=${current.id}&msg=${m.id}`} className={cn('mt-1.5 flex min-w-[200px] items-center gap-2.5 rounded-[10px] border p-2 text-foreground no-underline', mine ? 'border-transparent bg-card' : 'bg-background')} data-testid="chat-attachment">
                              <span className="grid size-9 place-items-center rounded-lg bg-sky-500/12 text-sky-700">
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <b className="block truncate text-[13px]">{m.attachment.name}</b>
                                <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(m.attachment.size / 1024))} KB</span>
                              </span>
                            </a>
                          )}
                        </div>
                        <div className={cn('mt-1 flex items-center gap-1 text-[11px] text-muted-foreground', mine && 'justify-end')}>
                          {fmt.time(m.createdAt)}
                          {m.direction === 'outbound' && (
                            <span className="inline-flex items-center gap-0.5" title={t(`v2.chat.delivery.${m.delivery ?? 'sent'}` as MessageKey)}>
                              {m.delivery === 'queued' ? <Clock className="size-3" /> : m.delivery === 'failed' ? <X className="size-3 text-red-600" /> : current.channel === 'whatsapp' ? <MessageCircle className="size-3" /> : <Mail className="size-3" />}
                              {t(`v2.chat.delivery.${m.delivery ?? 'sent'}` as MessageKey)}
                            </span>
                          )}
                          {mine && m.direction === 'internal' && (
                            <span title={readByAll(m) ? t('v2.chat.read') : t('v2.chat.delivered')} aria-label={readByAll(m) ? t('v2.chat.read') : t('v2.chat.delivered')}>
                              {readBySome(m) ? <CheckCheck className={cn('size-3.5', readByAll(m) && 'text-sky-600')} /> : <Check className="size-3.5" />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {typingName && (
                <div className="flex items-end gap-2.5" aria-label={t('v2.chat.typing', { name: typingName })} data-testid="chat-typing">
                  <Avatar name={typingName} size="sm" />
                  <div className="flex gap-1 rounded-[14px] rounded-bl-[4px] border bg-card px-3.5 py-3">
                    {[0, 1, 2].map((i) => (
                      <i key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
{postBlock(current, t) && <p className="border-t bg-amber-soft px-4 py-2 text-sm text-amber-ink" data-testid="chat-post-block">{postBlock(current, t)}</p>}
                        {error && <p role="alert" className="border-t bg-red-soft px-4 py-2 text-sm text-red-ink">{error}</p>}
            {file && (
              <div className="flex items-center gap-2 border-t px-4 py-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <Button size="icon" variant="ghost" className="size-7" aria-label={t('v2.chat.removeFile')} onClick={() => setFile(null)}>
                  <X />
                </Button>
              </div>
            )}
            <form
              className="flex items-center gap-2 border-t px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.pptx,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="chat-file" />
              <Button type="button" size="icon" variant="ghost" aria-label={t('v2.chat.attach')} onClick={() => fileRef.current?.click()}>
                <Paperclip />
              </Button>
              <Input value={text} onChange={(e) => onType(e.target.value)} placeholder={t('v2.chat.placeholder', { name })} aria-label={t('v2.chat.message')} autoComplete="off" className="h-10 rounded-xl" data-testid="chat-input" />
              <Button type="submit" disabled={busy || (!text.trim() && !file)} className="h-10 rounded-xl" data-testid="chat-send">
                <Send />
                <span className="hidden sm:inline">{t('v2.chat.send')}</span>
              </Button>
            </form>
          </>
        ) : (
          <div className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-10 text-teal" />
            {t('v2.chat.empty')}
            <Button className="mt-4" onClick={() => setNewOpen(true)}>
              <Plus />
              {t('v2.chat.new')}
            </Button>
          </div>
        )}
      </section>

      {/* Info panel */}
      {current && open && info && (
        <aside aria-label={t('v2.chat.info')} className="hidden w-[300px] flex-col gap-5 overflow-auto border-l px-4.5 py-5 xl:flex">
          <div className="text-center">
            <div className="flex justify-center">
              <Avatar name={name} group={current.kind === 'group'} size="lg" />
            </div>
            <b className="mt-2.5 block text-base">{name}</b>
            <span className="text-xs text-muted-foreground">{current.kind === 'group' ? t('v2.chat.members', { n: current.memberCount }) : current.kind === 'external' ? t(`v2.chat.kind.${current.contactKind ?? 'other'}` as MessageKey) : t('v2.chat.direct')}</span>
            {current.description && <p className="mt-2 text-sm text-muted-foreground">{current.description}</p>}
          </div>
          {current.kind === 'external' && (
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('v2.chat.contact')}</h4>
              <dl className="grid gap-1.5 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t('v2.chat.channel')}</dt><dd>{current.channel === 'whatsapp' ? 'WhatsApp' : t('v2.chat.email')}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t('v2.chat.address')}</dt><dd className="truncate">{current.contactAddress}</dd></div>
              </dl>
              {current.replyTo && <p className="mt-2 text-xs break-all text-muted-foreground">{t('v2.chat.replyTo', { address: current.replyTo })}</p>}
              {current.channel === 'whatsapp' && <p className="mt-2 rounded-md bg-amber-soft p-2 text-xs text-amber-ink">{t('v2.chat.waQueued')}</p>}
            </div>
          )}
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{current.kind === 'direct' ? t('v2.chat.people') : t('v2.chat.staffMembers', { n: open.members.length })}</h4>
            <ul className="grid gap-2">
              {open.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={m.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-medium">{m.id === meId ? t('v2.chat.you', { name: m.fullName }) : m.fullName}</b>
                    <span className="block truncate text-xs text-muted-foreground">{(m.roles ?? []).map((r) => t(`role.${r}` as MessageKey)).join(' · ')}</span>
                  </span>
                  {m.role === 'owner' && <span className="text-[11px] text-muted-foreground">{t('v2.chat.owner')}</span>}
                </li>
              ))}
            </ul>
            {current.kind !== 'direct' && <AddPeople people={people.filter((p) => !open.members.some((m) => m.id === p.id))} onAdd={(ids) => start(async () => void (await addMembers(current.id, ids), router.refresh()))} />}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('v2.chat.files')}</h4>
            <ul className="grid gap-1.5 text-sm">
              {open.messages.filter((m) => m.attachment).map((m) => (
                <li key={m.id}>
                  <a className="flex items-center gap-2 hover:underline" href={`/api/download?kind=chat-file&id=${current.id}&msg=${m.id}`}>
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="truncate">{m.attachment!.name}</span>
                  </a>
                </li>
              ))}
              {!open.messages.some((m) => m.attachment) && <li className="text-muted-foreground">{t('v2.chat.noFiles')}</li>}
            </ul>
          </div>
        </aside>
      )}

      <NewThread open={newOpen} onOpenChange={setNewOpen} people={people} onCreated={(id) => select(id)} />
      {groupDlg === 'linked' && groupSources && <LinkedGroupDialog sections={groupSources.sections} clubs={groupSources.clubs} onClose={() => setGroupDlg(null)} onCreated={(id) => { setGroupDlg(null); select(id); }} />}
      {groupDlg === 'settings' && current && <GroupSettingsDialog thread={current} onClose={() => setGroupDlg(null)} />}
    </div>
  );
}

function AddPeople({ people, onAdd }: { people: ChatPerson[]; onAdd: (ids: string[]) => void }) {
  const { t } = useI18n();
  const [id, setId] = useState('');
  if (people.length === 0) return null;
  return (
    <div className="mt-3 flex gap-2">
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label={t('v2.chat.addPeople')} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
        <option value="">{t('v2.chat.addPeople')}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" disabled={!id} onClick={() => (onAdd([id]), setId(''))}>
        {t('v2.chat.add')}
      </Button>
    </div>
  );
}

function NewThread({ open, onOpenChange, people, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; people: ChatPerson[]; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'direct' | 'group' | 'external'>('direct');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [contactName, setContactName] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [contactKind, setContactKind] = useState('parent');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const list = people.filter((p) => p.fullName.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  const toggle = (id: string) => setPicked((x) => (kind === 'direct' ? [id] : x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const submit = () =>
    start(async () => {
      setError('');
      const r =
        kind === 'direct'
          ? await startThread({ kind, userId: picked[0] })
          : kind === 'group'
            ? await startThread({ kind, title, userIds: picked })
            : await startThread({ kind, channel, contactName, contactAddress, contactKind, userIds: picked });
      if (!r.ok) return setError(r.error);
      onOpenChange(false);
      setPicked([]);
      setTitle('');
      setContactName('');
      setContactAddress('');
      onCreated(r.data.id);
    });
  const ready = kind === 'direct' ? picked.length === 1 : kind === 'group' ? title.trim() && picked.length > 0 : contactName.trim() && contactAddress.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="chat-new-dialog">
        <DialogHeader>
          <DialogTitle>{t('v2.chat.new')}</DialogTitle>
          <DialogDescription>{t('v2.chat.newLead')}</DialogDescription>
        </DialogHeader>
        <div role="group" className="grid grid-cols-3 rounded-lg border p-0.5 text-sm">
          {(['direct', 'group', 'external'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => (setKind(k), setPicked([]))} className={cn('rounded-md py-1.5', kind === k ? 'bg-muted font-semibold' : 'text-muted-foreground')}>
              {t(`v2.chat.newKind.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        {kind === 'group' && (
          <div className="grid gap-1.5">
            <Label htmlFor="cg-title">{t('v2.chat.groupName')}</Label>
            <Input id="cg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
        {kind === 'external' && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ce-ch">{t('v2.chat.channel')}</Label>
                <select id="ce-ch" value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'whatsapp')} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="email">{t('v2.chat.email')}</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-kind">{t('v2.chat.contactKind')}</Label>
                <select id="ce-kind" value={contactKind} onChange={(e) => setContactKind(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {['parent', 'vendor', 'university', 'other'].map((k) => (
                    <option key={k} value={k}>
                      {t(`v2.chat.kind.${k}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ce-name">{t('v2.chat.contactName')}</Label>
              <Input id="ce-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ce-addr">{channel === 'email' ? t('v2.chat.email') : t('v2.auth.phone')}</Label>
              <Input id="ce-addr" type={channel === 'email' ? 'email' : 'tel'} value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} />
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="cn-q">{kind === 'direct' ? t('v2.chat.pickOne') : t('v2.chat.pickStaff')}</Label>
          <Input id="cn-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('v2.chat.searchPeople')} />
          <ul className="max-h-48 overflow-auto rounded-md border">
            {list.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm hover:bg-muted">
                  <input type={kind === 'direct' ? 'radio' : 'checkbox'} name="cn-person" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">{p.roles.map((r) => t(`role.${r}` as MessageKey)).join(', ')}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-ink">
            {error}
          </p>
        )}
        <Button disabled={!ready || busy} onClick={submit} data-testid="chat-create">
          {t('v2.chat.start')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
