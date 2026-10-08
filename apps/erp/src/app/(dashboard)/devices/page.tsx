import SettingsRemoteOutlined from '@mui/icons-material/SettingsRemoteOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { DeviceMenu } from '@/components/devices/DeviceMenu';
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.devices') };
}

const THRESHOLDS = [1, 2, 4, 8, 24, 72];
const LOW_STORAGE_MB = 1024;

const gb = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ hours?: string }> }) {
  await requireSection('devices');
  const sp = await searchParams;
  const hours = THRESHOLDS.includes(Number(sp.hours)) ? Number(sp.hours) : 4;
  const [fleet, history, structure] = await Promise.all([
    load(() => api<Fleet>(`/v1/devices/fleet?hours=${hours}`)),
    load(() => api<DeviceActionRow[]>('/v1/devices/fleet/actions')),
    load(() => api<Structure>('/v1/admin/structure')),
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
      {fleet.error !== undefined ? (
        <ErrorState message={fleet.error} />
      ) : list.length === 0 ? (
        <EmptyState icon={<SettingsRemoteOutlined />} title={t('devices.none')} testId="no-devices">
          {t('devices.noneBody')}
        </EmptyState>
      ) : (
        <>
          {alerts.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="offline-alert">
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
          <Box sx={{ mt: 3 }} />
          <TableFrame testId="devices-table">
            <Table sx={{ minWidth: 1000 }}>
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
                  const dash = <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>;
                  return (
                    <TableRow key={b.id} hover data-testid="device-row" sx={b.alert ? { bgcolor: 'action.hover' } : undefined}>
                      <TableCell>
                        <Typography variant="subtitle2">{b.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {b.room ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {!b.enrolled ? (
                          <Chip size="small" variant="outlined" label={t('devices.waiting')} />
                        ) : b.online ? (
                          <Chip size="small" label={t('devices.online')} sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />
                        ) : (
                          <Chip size="small" color={b.alert ? 'warning' : 'default'} label={b.offlineHours >= 1 ? t('devices.offlineFor', { hours: Math.floor(b.offlineHours) }) : t('devices.offline')} />
                        )}
                        {b.locked && <Chip size="small" color="error" variant="outlined" label={t('devices.locked')} sx={{ ml: 0.5 }} />}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {b.appVersion ? `v${b.appVersion}` : dash}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {h?.os ? [h.os, h.osVersion].filter(Boolean).join(' ') : (b.platform ?? '')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {h?.kiosk ? t(`devices.kiosk.${h.kiosk}` as MessageKey) : dash}
                        {b.kioskOverride !== null && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {t('devices.kiosk.override')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{b.currentClass ?? <Typography variant="body2" color="text.secondary">{t('devices.noClass')}</Typography>}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {h?.storageFreeMb !== undefined ? (
                          <Typography variant="body2" color={h.storageFreeMb < LOW_STORAGE_MB ? 'warning.main' : 'text.primary'}>
                            {h.storageTotalMb ? t('devices.storage', { free: gb(h.storageFreeMb), total: gb(h.storageTotalMb) }) : gb(h.storageFreeMb)}
                          </Typography>
                        ) : (
                          dash
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {h?.battery ? `${t('devices.battery', { n: h.battery.percent })}${h.battery.charging ? ` · ${t('devices.charging')}` : ''}` : b.healthAt ? t('devices.mains') : dash}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {b.lastSeenAt ? (
                          <Tooltip title={fmt.dateTime(b.lastSeenAt, TIMEZONE)}>
                            <span>{fmt.relative(b.lastSeenAt, now, TIMEZONE)}</span>
                          </Tooltip>
                        ) : (
                          <Box component="span" sx={{ color: 'text.secondary' }}>{t('devices.never')}</Box>
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

          <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 1.5 }}>
            {t('devices.history')}
          </Typography>
          {(history.data ?? []).length === 0 ? (
            <Typography color="text.secondary">{t('devices.history.none')}</Typography>
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
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt.dateTime(a.createdAt, TIMEZONE)}</TableCell>
                      <TableCell>{a.device}</TableCell>
                      <TableCell>{t(`devices.act.${a.type}` as MessageKey).replace('…', '')}</TableCell>
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
