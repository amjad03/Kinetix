'use client';

import { X } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { createSchedule, findPeople, updateSchedule, type ScheduleInput } from '@/app/(dashboard)/reports/studio-actions';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { Input } from '@/components/shadcn/input';
import { Dialog, FormGrid, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { parseEmails, SHARE_ROLES, type Filter, type Person, type ScheduleRow } from '@/lib/report-studio';
import type { ActionResult } from '@/lib/types';
import { Labelled, Pick, tk } from './controls';

/** Role checkboxes (sharing a report or dashboard, sending a schedule, a role's home dashboard). */
export function RolePicker({ value, onChange, label, help, roles = [...SHARE_ROLES] }: { value: string[]; onChange: (v: string[]) => void; label: string; help?: string; roles?: string[] }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-[13px] font-semibold">{label}</legend>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {roles.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <Checkbox checked={value.includes(r)} onCheckedChange={(c) => onChange(c ? [...value, r] : value.filter((x) => x !== r))} />
            {tk(t, `role.${r}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface SaveValues {
  name: string;
  description: string;
  folder: string;
  sharedRoles: string[];
}

/** Name, describe, file and share a report (save, save as new, rename, move or share use it). */
export function SaveDialog({ title, initial, folders, onSave, onClose, fields = ['name', 'description', 'folder', 'share'] }: { title: string; initial: SaveValues; folders: string[]; onSave: (v: SaveValues) => Promise<ActionResult<unknown>>; onClose: () => void; fields?: ('name' | 'description' | 'folder' | 'share')[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (fields.includes('name') && !v.name.trim()) return setError(t('rs.save.nameNeeded'));
    start(async () => {
      const res = await onSave({ ...v, name: v.name.trim(), folder: v.folder.trim() });
      if (res.ok) {
        toast.success(t('rs.saved'));
        onClose();
      } else setError(res.error);
    });
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={pending}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('rs.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="rs-save-submit">
            {t('rs.save.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red-ink">
            {error}
          </p>
        )}
        {fields.includes('name') && <TextInput label={t('rs.save.name')} required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} slotProps={{ htmlInput: { maxLength: 120, 'data-testid': 'rs-save-name' } }} />}
        {fields.includes('description') && <TextInput label={t('rs.save.description')} multiline minRows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} slotProps={{ htmlInput: { maxLength: 500 } }} />}
        {fields.includes('folder') && (
          <Labelled label={t('rs.save.folder')} htmlFor="rs-folder">
            <Input id="rs-folder" list="rs-folders" className="h-9" value={v.folder} maxLength={60} onChange={(e) => setV({ ...v, folder: e.target.value })} placeholder={t('rs.folder.none')} />
            <datalist id="rs-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <span className="text-xs text-muted-foreground">{t('rs.save.folderHint')}</span>
          </Labelled>
        )}
        {fields.includes('share') && <RolePicker label={t('rs.save.share')} help={t('rs.save.shareHint')} value={v.sharedRoles} onChange={(sharedRoles) => setV({ ...v, sharedRoles })} />}
      </div>
    </Dialog>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Email a report on a schedule: when, which file, and to whom (roles, people or addresses of staff). */
export function ScheduleDialog({ source, title, runtime, existing, onClose }: { source: { reportId: string } | { libraryKey: string } | null; title: string; runtime: Filter[]; existing?: ScheduleRow; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<ScheduleInput>(() => ({
    name: existing?.name ?? title,
    frequency: existing?.frequency ?? 'weekly',
    hour: existing?.hour ?? 7,
    weekday: existing?.weekday ?? 1,
    monthDay: existing?.monthDay ?? 1,
    format: existing?.format ?? 'xlsx',
    runtime: existing?.runtime ?? runtime,
    recipients: existing?.recipients ?? { emails: [], userIds: [], roles: [] },
  }));
  const [emails, setEmails] = useState(v.recipients.emails.join(', '));
  const [people, setPeople] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<Person[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!q.trim()) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await findPeople(q);
      if (live && res.ok) setPeople(res.data);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const time = (h: number) => fmt.time(`2026-01-01T${String(h).padStart(2, '0')}:00:00+05:30`);
  const submit = () => {
    const recipients = { emails: parseEmails(emails), userIds: [...new Set([...v.recipients.userIds, ...chosen.map((p) => p.id)])], roles: v.recipients.roles };
    if (!recipients.emails.length && !recipients.userIds.length && !recipients.roles.length) return setError(t('rs.s.needRecipient'));
    start(async () => {
      const input = { ...v, recipients };
      const res = existing ? await updateSchedule(existing.id, input) : source ? await createSchedule(source, input) : { ok: false as const, error: t('rs.s.saveFirst') };
      if (res.ok) {
        toast.success(t('rs.s.created'));
        onClose();
      } else setError(res.error);
    });
  };

  return (
    <Dialog
      title={existing ? t('rs.s.edit') : t('rs.s.title')}
      onClose={onClose}
      busy={pending}
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('rs.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="rs-schedule-submit">
            {t('rs.save.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red-ink">
            {error}
          </p>
        )}
        <TextInput label={t('rs.s.name')} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <div className="flex flex-wrap items-end gap-3">
          <Labelled label={t('rs.s.frequency')}>
            <Pick label={t('rs.s.frequency')} value={v.frequency} onChange={(f) => setV({ ...v, frequency: f as ScheduleInput['frequency'] })} options={(['daily', 'weekly', 'monthly'] as const).map((f) => ({ value: f, label: t(`rs.s.${f}`) }))} className="w-[140px]" />
          </Labelled>
          {v.frequency === 'weekly' && (
            <Labelled label={t('rs.s.weekday')}>
              <Pick label={t('rs.s.weekday')} value={String(v.weekday)} onChange={(d) => setV({ ...v, weekday: Number(d) })} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: tk(t, `rs.weekday.${d}`) }))} className="w-[140px]" />
            </Labelled>
          )}
          {v.frequency === 'monthly' && (
            <Labelled label={t('rs.s.monthDay')}>
              <Pick label={t('rs.s.monthDay')} value={String(v.monthDay)} onChange={(d) => setV({ ...v, monthDay: Number(d) })} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} className="w-[100px]" />
            </Labelled>
          )}
          <Labelled label={t('rs.s.hour')}>
            <Pick label={t('rs.s.hour')} value={String(v.hour)} onChange={(h) => setV({ ...v, hour: Number(h) })} options={HOURS.map((h) => ({ value: String(h), label: time(h) }))} className="w-[120px]" />
          </Labelled>
          <Labelled label={t('rs.s.format')}>
            <Pick label={t('rs.s.format')} value={v.format} onChange={(f) => setV({ ...v, format: f as ScheduleInput['format'] })} options={(['xlsx', 'pdf', 'csv'] as const).map((f) => ({ value: f, label: t(`rs.export.${f}`) }))} className="w-[150px]" />
          </Labelled>
        </div>
        {v.runtime.length > 0 && <p className="text-xs text-muted-foreground">{t('rs.s.filtersNote')}</p>}
        <RolePicker label={t('rs.s.roles')} value={v.recipients.roles} onChange={(roles) => setV({ ...v, recipients: { ...v.recipients, roles } })} />
        <Labelled label={t('rs.s.people')} htmlFor="rs-people">
          <Input id="rs-people" className="h-9" placeholder={t('rs.s.searchPeople')} value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim() && people.length > 0 && (
            <ul className="max-h-40 list-none overflow-y-auto rounded-md border p-1">
              {people
                .filter((p) => !chosen.some((c) => c.id === p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => (setChosen([...chosen, p]), setQ(''))}>
                      <span>{p.name}</span>
                      <span className="truncate text-muted-foreground">{p.email}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {(chosen.length > 0 || v.recipients.userIds.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {chosen.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {p.name}
                  <button type="button" aria-label={t('rs.b.remove')} onClick={() => setChosen(chosen.filter((c) => c.id !== p.id))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {v.recipients.userIds.length > 0 && <span className="text-xs text-muted-foreground">{t('rs.s.morePeople', { n: v.recipients.userIds.length })}</span>}
            </div>
          )}
        </Labelled>
        <FormGrid cols={1}>
          <TextInput label={t('rs.s.emails')} multiline minRows={2} value={emails} onChange={(e) => setEmails(e.target.value)} helper={t('rs.s.emailsHint')} />
        </FormGrid>
      </div>
    </Dialog>
  );
}
