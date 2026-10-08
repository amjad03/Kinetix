'use client';

import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import DoneAll from '@mui/icons-material/DoneAll';
import FamilyRestroomOutlined from '@mui/icons-material/FamilyRestroomOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, useTransition, type ReactNode } from 'react';
import { DataTable } from '@/components/ui';
import { clearBroadcast, deliveryReport } from '@/app/(dashboard)/messages/actions';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import type { DeliveryReport, SentBroadcast, Structure } from '@/lib/types';
import { MiniBar } from '../Bars';
import { EmptyState } from '../States';
import { PriorityChip } from './priorities';

function audienceLabel(b: SentBroadcast, s: Structure, t: TFunction): string {
  const a = b.audience;
  if (a.all) return t('msg.mode.all');
  const names = (ids: string[] | undefined, list: { id: string; name?: string; displayName?: string }[]) =>
    (ids ?? []).map((id) => {
      const x = list.find((l) => l.id === id);
      return x?.name ?? x?.displayName ?? t('msg.removed');
    });
  const parts = [...names(a.campusIds, s.campuses), ...names(a.programIds, s.programs), ...names(a.sectionIds, s.sections)];
  if (a.deviceIds?.length) parts.push(t.plural('msg.boards', a.deviceIds.length));
  return parts.join(', ') || '—';
}

function Stat({ icon, children, title }: { icon: ReactNode; children: ReactNode; title: string }) {
  return (
    <Tooltip title={title}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, '& svg': { fontSize: 18, color: 'text.secondary' } }}>
        {icon}
        <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {children}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export function SentMessages({
  items,
  structure,
  timeZone,
  userId,
  isAdmin,
}: {
  items: SentBroadcast[];
  structure: Structure;
  timeZone: string;
  userId: string;
  /** Principal and admin can clear any message; others only their own. */
  isAdmin: boolean;
}) {
  const { t, fmt } = useI18n();
  const canClear = (b: SentBroadcast) => isAdmin || b.sender.id === userId;
  const [pending, start] = useTransition();
  const [clearing, setClearing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState<{ b: SentBroadcast; data?: DeliveryReport; error?: string } | null>(null);
  const now = new Date();

  if (items.length === 0)
    return (
      <EmptyState icon={<CampaignOutlined />} title={t('msg.none')} testId="no-messages">
        {t('msg.noneBody')}
      </EmptyState>
    );

  const clear = (b: SentBroadcast) => {
    setClearing(b.id);
    start(async () => {
      const res = await clearBroadcast(b.id);
      setClearing(null);
      setToast(res.ok ? (b.priority === 'emergency' ? t('msg.allClearSent', { title: b.title }) : t('msg.cleared', { title: b.title })) : res.error);
    });
  };

  const openReport = async (b: SentBroadcast) => {
    setReport({ b });
    const res = await deliveryReport(b.id);
    setReport(res.ok ? { b, data: res.data } : { b, error: res.error });
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="sent-messages">
      {items.map((b) => {
        const d = b.delivery;
        const state = b.clearedAt ? 'cleared' : b.active ? 'active' : 'expired';
        return (
          <Card key={b.id} component="article" data-testid="sent-message" sx={{ borderColor: state === 'active' && b.priority === 'emergency' ? 'error.main' : undefined }}>
            <Box sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <PriorityChip priority={b.priority} />
                {state === 'active' ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('msg.state.active')}
                    icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'kx.success', ml: '8px !important' }} />}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {state === 'cleared' ? t('msg.state.cleared', { date: fmt.dateTime(b.clearedAt!, timeZone) }) : t('msg.state.expired', { date: fmt.dateTime(b.expiresAt, timeZone) })}
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title={fmt.dateTime(b.createdAt, timeZone)}>
                  <Typography variant="caption" color="text.secondary" suppressHydrationWarning>
                    {fmt.relative(b.createdAt, now, timeZone)}
                  </Typography>
                </Tooltip>
              </Box>
              <Typography variant="subtitle1" component="h3" sx={{ mt: 1 }}>
                {b.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {b.body}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                {t('msg.to', { audience: audienceLabel(b, structure, t), name: b.sender.fullName })}
                {state === 'active' ? ` · ${t('msg.until', { time: `${fmt.time(b.expiresAt, timeZone)}${new Date(b.expiresAt).toDateString() !== now.toDateString() ? `, ${fmt.dateTime(b.expiresAt, timeZone, false)}` : ''}` })}` : ''}
              </Typography>

              <Box
                sx={{
                  mt: 1.5,
                  pt: 1.5,
                  borderTop: 1,
                  borderColor: 'm3.outlineVariant',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 2.5, rowGap: 1, flexWrap: 'wrap' }} data-testid="delivery">
                  {d.boards > 0 ? (
                    <Stat icon={<CastForEducationOutlined />} title={t('msg.displayedTip')}>
                      {t.plural('msg.displayed', d.boards, { n: d.displayed })}
                    </Stat>
                  ) : (
                    <Stat icon={<CastForEducationOutlined />} title={t('msg.noBoardTip')}>
                      {t('msg.noBoard')}
                    </Stat>
                  )}
                  {d.boards > 0 && <MiniBar value={(d.displayed / d.boards) * 100} width={64} color="kx.success" label={t('msg.displayedBar', { n: d.displayed, d: d.boards })} />}
                  {b.requiresAck && (
                    <Stat icon={<DoneAll />} title={t('msg.ackTip')}>
                      {t('msg.acknowledged', { n: d.acknowledged })}
                    </Stat>
                  )}
                  <Stat icon={<FamilyRestroomOutlined />} title={t('msg.familiesTip')}>
                    {t('msg.families', { n: d.families })}
                  </Stat>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button size="small" startIcon={<VisibilityOutlined />} onClick={() => openReport(b)}>
                    {t('msg.delivery')}
                  </Button>
                  {state === 'active' && canClear(b) && (
                    <Button
                      size="small"
                      variant={b.priority === 'emergency' ? 'contained' : 'outlined'}
                      color={b.priority === 'emergency' ? 'error' : 'primary'}
                      onClick={() => clear(b)}
                      disabled={pending && clearing === b.id}
                      startIcon={pending && clearing === b.id ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                      {b.priority === 'emergency' ? t('msg.allClear') : t('msg.clear')}
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          </Card>
        );
      })}

      <Dialog open={!!report} onClose={() => setReport(null)} fullWidth maxWidth="sm" aria-labelledby="delivery-title">
        <DialogTitle id="delivery-title">{t('msg.delivery')}</DialogTitle>
        <DialogContent>
          {report && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('msg.sentAt', { title: report.b.title, date: fmt.dateTime(report.b.createdAt, timeZone) })}
            </Typography>
          )}
          {report?.error && <Alert severity="error">{report.error}</Alert>}
          {report && !report.data && !report.error && (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {report?.data && report.data.total === 0 && (
            <EmptyState dense icon={<GroupsOutlined />} title={t('msg.noBoardsSent')}>
              {report.b.audience.all ? t('msg.noBoardsAll') : t('msg.noBoardsSome')}
            </EmptyState>
          )}
          {report?.data && report.data.total > 0 && (
            <DataTable
              label={t('msg.col.board')}
              rows={report.data.devices}
              rowId={(r) => String(r.deviceId)}
              columns={[
                { id: 'c0', header: t('msg.col.board'), rowHeader: true, sort: (r) => r.deviceName, cell: (r) => r.deviceName },
                { id: 'c1', header: t('msg.col.displayed'), sort: (r) => r.displayedAt ?? '', cell: (r) => (<>{r.displayedAt ? fmt.dateTime(r.displayedAt, timeZone) : <Box component="span" sx={{ color: 'text.secondary' }}>{t('msg.notYet')}{r.lastSeenAt ? '' : t('msg.offline')}</Box>}</>) },
                { id: 'c2', header: t('msg.col.acknowledged'), sort: (r) => r.acknowledgedAt ?? '', cell: (r) => (<>{r.acknowledgedAt ? fmt.dateTime(r.acknowledgedAt, timeZone) : <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>}</>) },
              ]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReport(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </Box>
  );
}
