'use client';

import { Bold, CalendarClock, Eye, FileText, Link2, List, ListOrdered, Paperclip, PencilLine, Save, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { previewAudience, saveAnnouncement, searchPeople } from '@/app/(dashboard)/messages/actions';
import { Alert, Autocomplete, Chip } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { FormField, SwitchField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ATTACH_ACCEPT, ATTACH_TYPES, CHANNELS, MAX_FILE_BYTES, fileSize, fileToBase64, type AnnChannel, type AnnPreview, type Announcement, type AnnTemplate, type AudienceScope, type PeopleResult, type PickedPerson } from '@/lib/communication';
import { naturalCompare } from '@/lib/natural';
import type { Structure } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RichText } from './RichText';

interface Option {
  id: string;
  label: string;
  group?: string;
}

const SCOPES: AudienceScope[] = ['all', 'departments', 'programs', 'sections', 'people'];
/** A datetime-local value for an ISO time (the browser's own zone). */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Write an announcement: channels, audience, title and body (bold, lists, links), photos and PDFs,
 * priority, acknowledgement, schedule and expiry. Saves as a draft, sends now, or schedules.
 */
export function AnnouncementComposer({
  structure,
  departments,
  templates,
  editing,
  seed,
  onSaved,
  onCancelEdit,
}: {
  structure: Structure;
  departments: { id: string; name: string }[];
  templates: AnnTemplate[];
  editing: Announcement | null;
  /** A template chosen on the Templates tab, to start from. */
  seed: AnnTemplate | null;
  onSaved: (a: Announcement, how: 'draft' | 'sent' | 'scheduled') => void;
  onCancelEdit: () => void;
}) {
  const { t, fmt } = useI18n();
  const deptOptions = useMemo<Option[]>(() => departments.map((d) => ({ id: d.id, label: d.name })), [departments]);
  const programOptions = useMemo<Option[]>(() => structure.programs.map((p) => ({ id: p.id, label: p.name })), [structure.programs]);
  const programName = useMemo(() => new Map(structure.programs.map((p) => [p.id, p.name])), [structure.programs]);
  const sectionOptions = useMemo<Option[]>(
    () =>
      structure.sections
        .map((s) => ({ id: s.id, label: s.displayName, group: programName.get(s.programId) ?? '' }))
        .sort((a, b) => naturalCompare(a.group, b.group) || naturalCompare(a.label, b.label)),
    [structure.sections, programName],
  );
  // The form starts from the message being edited, or a template, or empty (the parent remounts it for each).
  const from = editing ?? seed;
  const aud = editing?.audience;
  const pick = (opts: Option[], ids?: string[]) => opts.filter((o) => ids?.includes(o.id));
  const [title, setTitle] = useState(from?.title ?? '');
  const [body, setBody] = useState(from?.body ?? '');
  const [preview, setPreview] = useState(false);
  const [channels, setChannels] = useState<AnnChannel[]>(from?.channels.length ? from.channels : ['teacher', 'student', 'parent']);
  const [scope, setScope] = useState<AudienceScope>(aud?.scope ?? 'all');
  const [depts, setDepts] = useState<Option[]>(() => pick(deptOptions, aud?.departmentIds));
  const [programs, setPrograms] = useState<Option[]>(() => pick(programOptions, aud?.programIds));
  const [sections, setSections] = useState<Option[]>(() => pick(sectionOptions, aud?.sectionIds));
  const [people, setPeople] = useState<PickedPerson[]>(editing?.audiencePeople ?? []);
  const [priority, setPriority] = useState<'normal' | 'important'>(from?.priority ?? 'normal');
  const [requiresAck, setRequiresAck] = useState(from?.requiresAck ?? false);
  const [later, setLater] = useState(editing?.status === 'scheduled');
  const [sendAt, setSendAt] = useState(toLocal(editing?.sendAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toLocal(editing?.expiresAt ?? null));
  const [files, setFiles] = useState<File[]>([]);
  const [kept, setKept] = useState<Announcement['attachments']>(editing?.attachments ?? []);
  const [reach, setReach] = useState<AnnPreview | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const audience = useMemo(() => {
    const ids = (xs: Option[]) => xs.map((x) => x.id);
    if (scope === 'all') return { scope };
    if (scope === 'departments') return { scope, departmentIds: ids(depts) };
    if (scope === 'programs') return { scope, programIds: ids(programs) };
    if (scope === 'sections') return { scope, sectionIds: ids(sections) };
    return { scope, userIds: people.filter((p) => p.kind !== 'record').map((p) => p.id), studentIds: people.filter((p) => p.kind === 'record').map((p) => p.id) };
  }, [scope, depts, programs, sections, people]);
  const audienceChosen =
    scope === 'all' || (scope === 'departments' ? depts.length > 0 : scope === 'programs' ? programs.length > 0 : scope === 'sections' ? sections.length > 0 : people.length > 0);

  // How many people the current choice reaches, refreshed as it changes.
  const reachable = channels.length > 0 && audienceChosen;
  useEffect(() => {
    if (!reachable) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const r = await previewAudience(channels, audience);
      if (live) setReach(r.ok ? r.data : null);
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [channels, audience, reachable]);

  const reset = () => {
    setTitle('');
    setBody('');
    setPreview(false);
    setScope('all');
    setDepts([]);
    setPrograms([]);
    setSections([]);
    setPeople([]);
    setPriority('normal');
    setRequiresAck(false);
    setLater(false);
    setSendAt('');
    setExpiresAt('');
    setFiles([]);
    setKept([]);
    setTouched(false);
  };

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setBody(tpl.body);
    setPriority(tpl.priority);
    setRequiresAck(tpl.requiresAck);
    if (tpl.channels.length) setChannels(tpl.channels);
  };

  /** Wraps the selection (or inserts at the cursor) for the toolbar buttons. */
  const format = (kind: 'bold' | 'ul' | 'ol' | 'link') => {
    const el = bodyRef.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    const sel = body.slice(s, e);
    let insert: string;
    if (kind === 'bold') insert = `**${sel || t('comm.fmt.boldText')}**`;
    else if (kind === 'link') insert = `[${sel || t('comm.fmt.linkText')}](https://)`;
    else {
      const lines = (sel || t('comm.fmt.item')).split('\n');
      insert = lines.map((l, i) => `${kind === 'ul' ? '-' : `${i + 1}.`} ${l}`).join('\n');
      if (s > 0 && body[s - 1] !== '\n') insert = `\n${insert}`;
    }
    const next = body.slice(0, s) + insert + body.slice(e);
    setBody(next.slice(0, 5000));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + insert.length, s + insert.length);
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (!ATTACH_TYPES.includes(f.type)) setError(t('comm.err.fileType', { name: f.name }));
      else if (f.size > MAX_FILE_BYTES) setError(t('comm.err.fileSize', { name: f.name }));
      else ok.push(f);
    }
    setFiles((x) => [...x, ...ok].slice(0, Math.max(0, 5 - kept.length)));
  };

  const titleError = touched && !title.trim() ? t('msg.err.title') : '';
  const bodyError = touched && !body.trim() ? t('msg.err.body') : '';
  const channelError = touched && channels.length === 0 ? t('comm.err.channels') : '';
  const audienceError = touched && !audienceChosen ? t('msg.err.audience') : '';
  const whenError = touched && later && !sendAt ? t('comm.err.when') : touched && later && sendAt && new Date(sendAt) <= new Date() ? t('comm.err.past') : '';
  const expiryError = touched && expiresAt && new Date(expiresAt) <= (later && sendAt ? new Date(sendAt) : new Date()) ? t('comm.err.expiry') : '';

  const submit = (mode: 'draft' | 'send') => {
    setTouched(true);
    setError('');
    const invalid = !title.trim() || !body.trim() || (mode === 'send' && (channels.length === 0 || !audienceChosen || !!whenError || !!expiryError));
    if (invalid || (mode === 'send' && later && (!sendAt || new Date(sendAt) <= new Date()))) return;
    start(async () => {
      const attachments = await Promise.all(files.map(async (f) => ({ filename: f.name, contentType: f.type, contentBase64: await fileToBase64(f) })));
      const res = await saveAnnouncement(editing?.id ?? null, {
        title: title.trim(),
        body: body.trim(),
        priority,
        channels: channels.length ? channels : ['parent'],
        audience: audienceChosen ? audience : { scope: 'all' },
        requiresAck,
        sendAt: later ? fromLocal(sendAt) : null,
        expiresAt: fromLocal(expiresAt),
        attachments,
        keepAttachmentIds: kept.map((k) => k.id),
        mode,
      });
      if (!res.ok) return setError(res.error);
      reset();
      onSaved(res.data, res.data.status === 'sent' ? 'sent' : res.data.status === 'scheduled' ? 'scheduled' : 'draft');
    });
  };

  const toggleChannel = (c: AnnChannel) => setChannels((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));
  const multi = (label: string, options: Option[], value: Option[], set: (v: Option[]) => void, testId: string) => (
    <Autocomplete
      className="bg-card"
      multiple
      options={options}
      groupBy={options.some((o) => o.group) ? (o) => o.group ?? '' : undefined}
      value={value}
      onChange={(_, v) => set(v)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      disableCloseOnSelect
      renderValue={(vals, getItemProps) =>
        vals.map((o, index) => {
          const { key, ...rest } = getItemProps({ index });
          return <Chip key={key} size="small" label={o.label} {...rest} />;
        })
      }
      renderInput={(params) => (
        <FormField id={params.id} label={label} required>
          <TextInput {...params} error={!!audienceError} helperText={audienceError || undefined} />
        </FormField>
      )}
      data-testid={testId}
    />
  );

  return (
    <section className="rounded-xl border bg-card p-5 md:p-6 grid gap-5" aria-labelledby="ann-compose-title" data-testid="ann-composer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ann-compose-title" className="text-[1.25rem] leading-7 font-medium">
            {editing ? t('comm.compose.editTitle') : t('comm.compose.title')}
          </h2>
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-1">{t('comm.compose.help')}</p>
        </div>
        {templates.length > 0 && !editing && (
          <label className="grid gap-1.5 text-[13px] font-semibold">
            {t('comm.useTemplate')}
            <select className="h-10 min-w-[220px] rounded-md border bg-background px-2 text-sm font-normal" value="" onChange={(e) => applyTemplate(e.target.value)} data-testid="ann-template">
              <option value="">{t('comm.pickTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-[13px] leading-5 font-semibold mb-2">{t('comm.channels')}</legend>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4" role="group" aria-label={t('comm.channels')}>
          {CHANNELS.map((c) => {
            const on = channels.includes(c);
            return (
              <button
                type="button"
                key={c}
                aria-pressed={on}
                onClick={() => toggleChannel(c)}
                className={cn('rounded-[10px] border px-3 py-2.5 text-left text-sm transition-colors', on ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-background hover:bg-muted')}
                data-testid={`ann-channel-${c}`}
              >
                <b className="block font-medium">{t(`comm.ch.${c}` as MessageKey)}</b>
                <span className="text-xs text-muted-foreground">{t(`comm.ch.${c}.help` as MessageKey)}</span>
              </button>
            );
          })}
        </div>
        {channelError && <p className="mt-1.5 text-xs text-red-ink" role="alert">{channelError}</p>}
      </fieldset>

      <fieldset className="border-0 p-0 m-0 grid gap-3">
        <legend className="text-[13px] leading-5 font-semibold mb-2">{t('msg.sendTo')}</legend>
        <div role="radiogroup" aria-label={t('msg.audience')} className="flex flex-wrap gap-1 rounded-lg border p-0.5 w-fit">
          {SCOPES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className={cn('rounded-md px-3 py-1.5 text-sm', scope === s ? 'bg-muted font-semibold' : 'text-muted-foreground')} data-testid={`ann-scope-${s}`}>
              {t(`comm.scope.${s}` as MessageKey)}
            </button>
          ))}
        </div>
        {scope === 'departments' && multi(t('comm.scope.departments'), deptOptions, depts, setDepts, 'ann-depts')}
        {scope === 'programs' && multi(t('comm.scope.programs'), programOptions, programs, setPrograms, 'ann-programs')}
        {scope === 'sections' && multi(t('comm.scope.sections'), sectionOptions, sections, setSections, 'ann-sections')}
        {scope === 'people' && <PeoplePicker picked={people} onChange={setPeople} error={audienceError} />}
        <p className="text-xs text-muted-foreground" data-testid="ann-reach" aria-live="polite">
          {reach && reachable
            ? t('comm.reach', { people: fmt.number(reach.people), teacher: fmt.number(reach.teacher), student: fmt.number(reach.student), parent: fmt.number(reach.parent), boards: fmt.number(reach.boards) })
            : t(`comm.scope.${scope}.help` as MessageKey)}
        </p>
      </fieldset>

      <FormField label={t('msg.title')} required>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} error={!!titleError} helperText={titleError || `${title.length}/120`} slotProps={{ htmlInput: { maxLength: 120 } }} required data-testid="ann-title" />
      </FormField>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-[13px] leading-5 font-semibold">
            {t('msg.body')}
            <span aria-hidden className="ml-1 text-red-ink">*</span>
          </span>
          <div className="flex items-center gap-1" role="toolbar" aria-label={t('comm.fmt.toolbar')}>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t('comm.fmt.bold')} onClick={() => format('bold')} disabled={preview}>
              <Bold />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t('comm.fmt.ul')} onClick={() => format('ul')} disabled={preview}>
              <List />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t('comm.fmt.ol')} onClick={() => format('ol')} disabled={preview}>
              <ListOrdered />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t('comm.fmt.link')} onClick={() => format('link')} disabled={preview}>
              <Link2 />
            </Button>
            <Button type="button" size="sm" variant={preview ? 'secondary' : 'ghost'} aria-pressed={preview} onClick={() => setPreview((v) => !v)} data-testid="ann-preview">
              {preview ? <PencilLine /> : <Eye />}
              {preview ? t('comm.fmt.edit') : t('comm.fmt.preview')}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="min-h-[132px] rounded-md border bg-background px-3.5 py-3">{body.trim() ? <RichText body={body} /> : <p className="text-sm text-muted-foreground">{t('comm.fmt.nothing')}</p>}</div>
        ) : (
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={6}
            aria-label={t('msg.body')}
            aria-invalid={!!bodyError}
            className={cn('min-h-[132px] w-full rounded-md border bg-background px-3.5 py-3 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring', bodyError && 'border-destructive')}
            data-testid="ann-body"
          />
        )}
        <p className={cn('text-xs', bodyError ? 'text-red-ink' : 'text-muted-foreground')}>{bodyError || `${t('comm.fmt.hint')} · ${body.length}/5000`}</p>
      </div>

      <div className="grid gap-2">
        <span className="text-[13px] leading-5 font-semibold">{t('comm.attachments')}</span>
        <ul className="grid gap-1.5">
          {kept.map((f) => (
            <AttachmentRow key={f.id} name={f.name} size={f.size} onRemove={() => setKept((x) => x.filter((y) => y.id !== f.id))} />
          ))}
          {files.map((f, i) => (
            <AttachmentRow key={`${f.name}-${i}`} name={f.name} size={f.size} onRemove={() => setFiles((x) => x.filter((_, j) => j !== i))} />
          ))}
        </ul>
        <div>
          <input ref={fileRef} type="file" hidden multiple accept={ATTACH_ACCEPT} onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} data-testid="ann-file" />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={kept.length + files.length >= 5}>
            <Paperclip />
            {t('comm.attach')}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">{t('comm.attachHelp')}</span>
        </div>
      </div>

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-[13px] leading-5 font-semibold mb-2">{t('msg.priority')}</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('msg.priority')}>
          {(['normal', 'important'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={cn('rounded-[10px] border px-3 py-2.5 text-left', priority === p ? (p === 'important' ? 'border-amber-ink bg-amber-soft text-amber-ink' : 'border-primary bg-secondary text-secondary-foreground') : 'bg-background hover:bg-muted')} data-testid={`ann-priority-${p}`}>
              <b className="block text-sm font-medium">{t(`comm.pri.${p}` as MessageKey)}</b>
              <span className="text-xs opacity-80">{t(`comm.pri.${p}.help` as MessageKey)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <SwitchField label={t('msg.ack')} checked={requiresAck} onChange={(v: boolean) => setRequiresAck(v)} />
        <p className="text-xs text-muted-foreground">{t('comm.ackHelp')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 items-start">
        <div className="grid gap-2">
          <SwitchField label={t('comm.later')} checked={later} onChange={(v: boolean) => setLater(v)} />
          {later && (
            <FormField label={t('comm.sendAt')} required error={whenError || undefined}>
              <TextInput type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} data-testid="ann-send-at" />
            </FormField>
          )}
        </div>
        <FormField label={t('comm.expiresAt')} helper={t('comm.expiresHelp')} error={expiryError || undefined}>
          <TextInput type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid="ann-expires-at" />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {editing && (
          <Button type="button" variant="ghost" onClick={() => (reset(), onCancelEdit())}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={pending} onClick={() => submit('draft')} data-testid="ann-save-draft">
          <Save />
          {t('comm.saveDraft')}
        </Button>
        <Button type="button" disabled={pending} onClick={() => submit('send')} data-testid="ann-send">
          {later ? <CalendarClock /> : <Send />}
          {later ? t('comm.schedule') : t('comm.sendNow')}
        </Button>
      </div>
    </section>
  );
}

function AttachmentRow({ name, size, onRemove }: { name: string; size: number; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
      <FileText className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-xs text-muted-foreground">{fileSize(size)}</span>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t('comm.removeFile', { name })} onClick={onRemove}>
        <X />
      </Button>
    </li>
  );
}

/** Search staff, parents, students and student records by name, phone or roll number, and pick several. */
function PeoplePicker({ picked, onChange, error }: { picked: PickedPerson[]; onChange: (v: PickedPerson[]) => void; error: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PeopleResult | null>(null);
  const searching = q.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const r = await searchPeople(q.trim());
      if (live) setFound(r.ok ? r.data : null);
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, searching]);
  const has = (id: string) => picked.some((p) => p.id === id);
  const add = (p: PickedPerson) => !has(p.id) && onChange([...picked, p]);
  const results: PickedPerson[] = found && searching
    ? [
        ...found.users.map((u) => ({ id: u.id, fullName: u.fullName, kind: u.kind, detail: u.phone ?? undefined })),
        ...found.students.map((s) => ({ id: s.id, fullName: s.fullName, kind: 'record' as const, detail: `${s.className} · ${s.rollNo}` })),
      ]
    : [];
  return (
    <div className="grid gap-2" data-testid="ann-people">
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('comm.people.search')}
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('comm.people.placeholder')} className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm font-normal" data-testid="ann-people-search" />
        </span>
      </label>
      {found && searching && (
        <ul className="max-h-56 overflow-auto rounded-md border bg-background" aria-label={t('comm.people.results')}>
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('comm.people.none')}</li>}
          {results.map((p) => (
            <li key={`${p.kind}-${p.id}`}>
              <button type="button" disabled={has(p.id)} onClick={() => add(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">
                <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(`comm.people.kind.${p.kind}` as MessageKey)}
                  {p.detail ? ` · ${p.detail}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <Chip key={p.id} size="small" label={`${p.fullName} · ${t(`comm.people.kind.${p.kind}` as MessageKey)}`} onDelete={() => onChange(picked.filter((x) => x.id !== p.id))} />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-ink" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">{t('comm.people.help')}</p>
    </div>
  );
}
