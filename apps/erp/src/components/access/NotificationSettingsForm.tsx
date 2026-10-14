'use client';

import { useState, useTransition } from 'react';
import { saveChannels, saveNotificationSettings } from '@/app/(dashboard)/settings/access-actions';
import { Switch } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toggleKind, type NotificationSettings } from '@/lib/governance-access';

const AUDIENCES = ['families', 'staff', 'everyone'] as const;

/** Settings > Notifications: for each kind of app notification, whether it is sent and whether it also buzzes the phone. */
type Channels = { push: boolean; sms: boolean; email: boolean; whatsapp: boolean };
const CHANNELS = ['push', 'sms', 'email', 'whatsapp'] as const;

export function NotificationSettingsForm({ initial, channels }: { initial: NotificationSettings; channels: Channels }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState({ off: initial.off, pushOff: initial.pushOff });
  const [value, setValue] = useState(saved);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const [ch, setCh] = useState(channels);
  const setChannel = (k: keyof Channels, on: boolean) =>
    start(async () => {
      const next = { ...ch, [k]: on };
      const res = await saveChannels(next);
      if (!res.ok) return toast.error(res.error);
      setCh(next);
      toast.success(t('ga.notif.channelSaved'));
    });

  const save = () =>
    start(async () => {
      const res = await saveNotificationSettings(value.off, value.pushOff);
      if (!res.ok) return toast.error(res.error);
      setSaved(res.data);
      setValue(res.data);
      toast.success(t('ga.notif.saved'));
    });

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('ga.notif.channels')} subtitle={t('ga.notif.channelsHelp')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="notif-channels">
          {CHANNELS.map((k) => (
            <label key={k} className="flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              {t(`ga.notif.channel.${k}`)}
              <Switch checked={ch[k]} disabled={busy} onChange={(_, c) => setChannel(k, c)} />
            </label>
          ))}
        </div>
      </Card>
      {AUDIENCES.map((a) => {
        const kinds = initial.kinds.filter((k) => k.audience === a);
        if (!kinds.length) return null;
        return (
          <Card key={a} title={t(`ga.notif.audience.${a}` as MessageKey)} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-[12px] text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                      {t('ga.notif.col.kind')}
                    </th>
                    <th scope="col" className="hidden w-24 px-3 py-2 text-right font-medium sm:table-cell">
                      {t('ga.notif.col.sent30')}
                    </th>
                    <th scope="col" className="w-20 px-2 py-2 text-center font-medium">
                      {t('ga.notif.col.send')}
                    </th>
                    <th scope="col" className="w-20 px-3 py-2 text-center font-medium sm:px-5">
                      {t('ga.notif.col.push')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {kinds.map((k) => {
                    const on = !value.off.includes(k.key);
                    const push = on && !value.pushOff.includes(k.key);
                    const name = t(`ga.notif.kind.${k.key}` as MessageKey);
                    return (
                      <tr key={k.key} className="border-b last:border-b-0" data-testid={`notif-${k.key}`}>
                        <th scope="row" className="px-4 py-2.5 text-left font-normal sm:px-5">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {name}
                            {k.locked && <StatusPill tone="info">{t('ga.notif.always')}</StatusPill>}
                          </span>
                        </th>
                        <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{fmt.number(k.sent30)}</td>
                        <td className="px-2 py-2.5 text-center">
                          <Switch checked={on} disabled={busy || k.locked} onChange={(_, c) => setValue((v) => toggleKind(v, k.key, 'send', c))} inputProps={{ 'aria-label': t('ga.notif.sendAria', { kind: name }) }} />
                        </td>
                        <td className="px-3 py-2.5 text-center sm:px-5">
                          <Switch checked={push} disabled={busy || !on} onChange={(_, c) => setValue((v) => toggleKind(v, k.key, 'push', c))} inputProps={{ 'aria-label': t('ga.notif.pushAria', { kind: name }) }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {dirty && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-card px-4 py-3 shadow-card" data-testid="notif-savebar">
          <span className="mr-auto text-sm text-muted-foreground">{t('ga.notif.unsaved')}</span>
          <Button variant="outline" className="h-9" disabled={busy} onClick={() => setValue(saved)}>
            {t('ga.matrix.discard')}
          </Button>
          <Button className="h-9" disabled={busy} onClick={save} data-testid="notif-save">
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
