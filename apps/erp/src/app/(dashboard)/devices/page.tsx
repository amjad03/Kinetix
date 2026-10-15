import type { Metadata } from 'next';
import { DeviceMenu } from '@/components/devices/DeviceMenu';
import { OfflineKeyCard } from '@/components/devices/OfflineKeyCard';
import type { SigningKeyInfo } from '@/lib/staff-changes';
import { TableFrame } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { TIMEZONE } from '@/lib/school';
import type { DeviceActionRow, Fleet, FleetBoard, Structure } from '@/lib/types';

import { Alert, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@/components/kx';
import { RadioTower as SettingsRemoteOutlined } from 'lucide-react';

/** A remote action's name; an action type this ERP does not know is shown as written, not as a message key. */
function actionName(t: (k: MessageKey) => string, type: string) {
  const key = `devices.act.${type}` as MessageKey;
  const text = t(key);
  return text === key ? type.replace(/_/g, ' ') : text.replace('…', '');
}
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.devices') };
}

const THRESHOLDS = [1, 2, 4, 8, 24, 72];
const LOW_STORAGE_MB = 1024;

const gb = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ hours?: string }> }) {
  const me = await requireSection('devices');
  const sp = await searchParams;
  const hours = THRESHOLDS.includes(Number(sp.hours)) ? Number(sp.hours) : 4;
  const [fleet, history, structure, offlineKey] = await Promise.all([
    load(() => api<Fleet>(`/v1/devices/fleet?hours=${hours}`)),
    load(() => api<DeviceActionRow[]>('/v1/devices/fleet/actions')),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<SigningKeyInfo>('/v1/pairing/signing-key')),
  ]);
  const { t, fmt } = await getI18n();
  const list: FleetBoard[] = fleet.data?.boards ?? [];
  const now = new Date();
  const online = list.filter((b) => b.online).length;
  const enrolled = list.filter((b) => b.enrolled).length;
  const lowStorage = list.filter((b) => b.health?.storageFreeMb !== undefined && b.health.storageFreeMb < LOW_STORAGE_MB).length;
  const alerts = list.filter((b) => b.alert);

  return (
    <>
      <PageHeader
        title={t('nav.devices')}
        subtitle={t('devices.subtitle')}
        actions={<UrlSelect label={t('devices.threshold')} param="hours" value={String(hours)} minWidth={170} testId="devices-threshold" options={THRESHOLDS.map((n) => ({ value: String(n), label: t('devices.threshold.hours', { n }) }))} />}
      />
      {offlineKey.error === undefined && <OfflineKeyCard info={offlineKey.data} canRotate={(me?.roles ?? []).includes('tenant_admin')} />}
      {fleet.error !== undefined ? (
        <ErrorState message={fleet.error} />
      ) : list.length === 0 ? (
        <EmptyState icon={<SettingsRemoteOutlined />} title={t('devices.none')} testId="no-devices">
          {t('devices.noneBody')}
        </EmptyState>
      ) : (
        <>
          {alerts.length > 0 && (
            <Alert className="mb-4" severity="warning" data-testid="offline-alert">
              {t('devices.alertBanner', { n: alerts.length, hours, names: alerts.map((b) => b.name).join(', ') })}
            </Alert>
          )}
          <StatGrid min={200}>
            <StatTile label={t('devices.stat.boards')} value={list.length} />
            <StatTile label={t('devices.stat.online')} value={online} unit={t('boards.stat.of', { n: enrolled })} />
            <StatTile
              label={t('devices.stat.alerts')}
              value={alerts.length}
              tone={alerts.length ? 'warning' : 'default'}
              caption={alerts.length ? t('devices.stat.alertsCaption', { hours }) : t('devices.stat.alertsNone')}
              testId="stat-alerts"
            />
            <StatTile label={t('devices.stat.lowStorage')} value={lowStorage} tone={lowStorage ? 'warning' : 'default'} caption={t('devices.stat.lowStorageCaption')} />
          </StatGrid>
          <div className="mt-6" />
          <TableFrame testId="devices-table">
            <Table className="min-w-[1000px]">
              <TableHead>
                <TableRow>
                  {(['board', 'status', 'version', 'kiosk', 'class', 'storage', 'power', 'lastSeen'] as const).map((k) => (
                    <TableCell key={k}>{t(`devices.col.${k}` as MessageKey)}</TableCell>
                  ))}
                  <TableCell aria-label={t('devices.col.actions')} />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((b) => {
                  const h = b.health;
                  const dash = <span className="text-muted-foreground">—</span>;
                  return (
                    <TableRow className={b.alert ? 'bg-accent' : undefined} key={b.id} hover data-testid="device-row">
                      <TableCell>
                        <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{b.name}</h6>
                        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                          {b.room ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {!b.enrolled ? (
                          <Chip size="small" variant="outlined" label={t('devices.waiting')} />
                        ) : b.online ? (
                          <Chip className="bg-orange-soft text-orange-ink" size="small" label={t('devices.online')} />
                        ) : (
                          <Chip size="small" color={b.alert ? 'warning' : 'default'} label={b.offlineHours >= 1 ? t('devices.offlineFor', { hours: Math.floor(b.offlineHours) }) : t('devices.offline')} />
                        )}
                        {b.locked && <Chip className="ml-1" size="small" color="error" variant="outlined" label={t('devices.locked')} />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {b.appVersion ? `v${b.appVersion}` : dash}
                        <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                          {h?.os ? [h.os, h.osVersion].filter(Boolean).join(' ') : (b.platform ?? '')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {h?.kiosk ? t(`devices.kiosk.${h.kiosk}` as MessageKey) : dash}
                        {b.kioskOverride !== null && (
                          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                            {t('devices.kiosk.override')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{b.currentClass ?? <p className="text-[13px] leading-[19px] text-muted-foreground">{t('devices.noClass')}</p>}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {h?.storageFreeMb !== undefined ? (
                          <Typography variant="body2" color={h.storageFreeMb < LOW_STORAGE_MB ? 'warning.main' : 'text.primary'}>
                            {h.storageTotalMb ? t('devices.storage', { free: gb(h.storageFreeMb), total: gb(h.storageTotalMb) }) : gb(h.storageFreeMb)}
                          </Typography>
                        ) : (
                          dash
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {h?.battery ? `${t('devices.battery', { n: h.battery.percent })}${h.battery.charging ? ` · ${t('devices.charging')}` : ''}` : b.healthAt ? t('devices.mains') : dash}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {b.lastSeenAt ? (
                          <Tooltip title={fmt.dateTime(b.lastSeenAt, TIMEZONE)}>
                            <span>{fmt.relative(b.lastSeenAt, now, TIMEZONE)}</span>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">{t('devices.never')}</span>
                        )}
                      </TableCell>
                      <TableCell align="right" padding="checkbox">
                        {b.enrolled && <DeviceMenu id={b.id} name={b.name} locked={b.locked} roomId={b.roomId} rooms={structure.data?.rooms ?? []} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableFrame>

          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-8 mb-3">
            {t('devices.history')}
          </h2>
          {(history.data ?? []).length === 0 ? (
            <p className="text-sm leading-[21px] text-muted-foreground">{t('devices.history.none')}</p>
          ) : (
            <TableFrame testId="device-history">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {(['when', 'board', 'action', 'by', 'status'] as const).map((k) => (
                      <TableCell key={k}>{t(`devices.history.${k}` as MessageKey)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(history.data ?? []).slice(0, 20).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{fmt.dateTime(a.createdAt, TIMEZONE)}</TableCell>
                      <TableCell>{a.device}</TableCell>
                      <TableCell>{actionName(t, a.type)}</TableCell>
                      <TableCell>{a.by ?? '—'}</TableCell>
                      <TableCell>
                        <Tooltip title={a.error ?? ''}>
                          <span>{t(`devices.status.${a.status}` as MessageKey)}</span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          )}
        </>
      )}
    </>
  );
}
