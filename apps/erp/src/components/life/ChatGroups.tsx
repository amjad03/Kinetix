'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { openLinkedGroup, saveGroupSettings, syncGroup } from '@/app/(dashboard)/chat/group-actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, SelectInput, SwitchField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ChatThread } from '@/lib/chat';

type Opt = { id: string; name: string };

/** Opens (or returns) the group chat of a class or a club: its teachers or coordinator as admins, its students as members. */
export function LinkedGroupDialog({ sections, clubs, onClose, onCreated }: { sections: Opt[]; clubs: Opt[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'section' | 'club'>(sections.length ? 'section' : 'club');
  const [target, setTarget] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [quiet, setQuiet] = useState(true);
  const [from, setFrom] = useState('21:00');
  const [to, setTo] = useState('07:00');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const list = kind === 'section' ? sections : clubs;
  return (
    <Dialog
      title={t('cd.group.title')}
      size="sm"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button
            disabled={busy || !target}
            data-testid="cd-group-open"
            onClick={() =>
              start(async () => {
                const r = await openLinkedGroup({ kind, id: target, postPolicy: adminsOnly ? 'admins' : 'all', quietStart: quiet ? from : null, quietEnd: quiet ? to : null });
                if (!r.ok) return setError(r.error);
                onCreated(r.data.id);
              })
            }
          >
            {t('cd.group.open')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-[13px] text-muted-foreground">{t('cd.group.help')}</p>
        <SelectInput label={t('cd.group.for')} value={kind} onChange={(e) => { setKind(e.target.value as 'section' | 'club'); setTarget(''); }} options={[{ value: 'section', label: t('cd.group.class') }, { value: 'club', label: t('cd.group.club') }]} />
        <SelectInput label={kind === 'section' ? t('cd.group.class') : t('cd.group.club')} value={target} onChange={(e) => setTarget(String(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} empty={t('cd.group.choose')} />
        <SwitchField label={t('cd.group.adminsOnly')} checked={adminsOnly} onChange={setAdminsOnly} />
        <SwitchField label={t('cd.group.quiet')} checked={quiet} onChange={setQuiet} />
        {quiet && (
          <div className="flex items-end gap-3">
            <TextInput label={t('cd.group.from')} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextInput label={t('cd.group.to')} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
        {error && <p role="alert" className="m-0 text-sm text-red-ink">{error}</p>}
      </div>
    </Dialog>
  );
}

/** A group's admins choose who may post and the quiet hours, and bring the members in line with the class or club. */
export function GroupSettingsDialog({ thread, onClose }: { thread: ChatThread; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [adminsOnly, setAdminsOnly] = useState(thread.postPolicy === 'admins');
  const [quiet, setQuiet] = useState(!!thread.quietStart);
  const [from, setFrom] = useState(thread.quietStart ?? '21:00');
  const [to, setTo] = useState(thread.quietEnd ?? '07:00');
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog
      title={t('cd.group.settings')}
      size="sm"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await saveGroupSettings(thread.id, { postPolicy: adminsOnly ? 'admins' : 'all', quietStart: quiet ? from : null, quietEnd: quiet ? to : null });
                if (!r.ok) return setNote(r.error);
                router.refresh();
                onClose();
              })
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <SwitchField label={t('cd.group.adminsOnly')} checked={adminsOnly} onChange={setAdminsOnly} />
        <SwitchField label={t('cd.group.quiet')} checked={quiet} onChange={setQuiet} />
        {quiet && (
          <div className="flex items-end gap-3">
            <TextInput label={t('cd.group.from')} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextInput label={t('cd.group.to')} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
        {thread.linkedKind && (
          <Button
            variant="outline"
            className="w-fit"
            disabled={busy}
            data-testid="cd-group-sync"
            onClick={() =>
              start(async () => {
                const r = await syncGroup(thread.id);
                setNote(r.ok ? t('cd.group.synced', { added: r.data.added, removed: r.data.removed }) : r.error);
                router.refresh();
              })
            }
          >
            {t('cd.group.sync')}
          </Button>
        )}
        {note && <p className="m-0 text-sm">{note}</p>}
      </div>
    </Dialog>
  );
}

/** The line above the composer when this person may not post now. */
export function postBlock(thread: ChatThread, t: ReturnType<typeof useI18n>['t'], now = new Date()): string | null {
  if (thread.kind !== 'group' || thread.myRole === 'owner' || thread.myRole === 'admin') return null;
  if (thread.postPolicy === 'admins') return t('cd.group.adminsOnlyNote');
  if (thread.quietStart && thread.quietEnd) {
    const hm = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const inside = thread.quietStart < thread.quietEnd ? hm >= thread.quietStart && hm < thread.quietEnd : hm >= thread.quietStart || hm < thread.quietEnd;
    if (inside) return t('cd.group.quietNote', { until: thread.quietEnd });
  }
  return null;
}
