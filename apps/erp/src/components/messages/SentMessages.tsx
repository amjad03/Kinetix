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
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, useTransition, type ReactNode } from 'react';
import { clearBroadcast, deliveryReport } from '@/app/(dashboard)/messages/actions';
import { formatDateTime, formatTime, relativeTime } from '@/lib/dates';
import type { DeliveryReport, SentBroadcast, Structure } from '@/lib/types';
import { MiniBar } from '../Bars';
import { EmptyState } from '../States';
import { PriorityChip } from './priorities';

function audienceLabel(b: SentBroadcast, s: Structure): string {
  const a = b.audience;
  if (a.all) return 'Whole school';
  const names = (ids: string[] | undefined, list: { id: string; name?: string; displayName?: string }[]) =>
    (ids ?? []).map((id) => {
      const x = list.find((l) => l.id === id);
      return x?.name ?? x?.displayName ?? 'Removed';
    });
  const parts = [...names(a.campusIds, s.campuses), ...names(a.programIds, s.programs), ...names(a.sectionIds, s.sections)];
  if (a.deviceIds?.length) parts.push(`${a.deviceIds.length} ${a.deviceIds.length === 1 ? 'board' : 'boards'}`);
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
  const canClear = (b: SentBroadcast) => isAdmin || b.sender.id === userId;
  const [pending, start] = useTransition();
  const [clearing, setClearing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState<{ b: SentBroadcast; data?: DeliveryReport; error?: string } | null>(null);
  const now = new Date();

  if (items.length === 0)
    return (
      <EmptyState icon={<CampaignOutlined />} title="No messages yet" testId="no-messages">
        Messages you circulate appear here, with how many boards showed them and how many families were notified.
      </EmptyState>
    );

  const clear = (b: SentBroadcast) => {
    setClearing(b.id);
    start(async () => {
      const res = await clearBroadcast(b.id);
      setClearing(null);
      setToast(res.ok ? (b.priority === 'emergency' ? `All clear sent for “${b.title}”` : `Cleared “${b.title}” from boards`) : res.error);
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
                    label="Active"
                    icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'kx.success', ml: '8px !important' }} />}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {state === 'cleared' ? `Cleared ${formatDateTime(b.clearedAt!, timeZone)}` : `Expired ${formatDateTime(b.expiresAt, timeZone)}`}
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title={formatDateTime(b.createdAt, timeZone)}>
                  <Typography variant="caption" color="text.secondary">
                    {relativeTime(b.createdAt, now, timeZone)}
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
                To {audienceLabel(b, structure)} · by {b.sender.fullName}
                {state === 'active' ? ` · until ${formatTime(b.expiresAt, timeZone)}${new Date(b.expiresAt).toDateString() !== now.toDateString() ? `, ${formatDateTime(b.expiresAt, timeZone, false)}` : ''}` : ''}
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
                    <Stat icon={<CastForEducationOutlined />} title="Boards that showed the message, of boards it was sent to">
                      {d.displayed}/{d.boards} {d.boards === 1 ? 'board' : 'boards'} displayed
                    </Stat>
                  ) : (
                    <Stat icon={<CastForEducationOutlined />} title="Class and program messages reach boards only while a teacher is teaching that class">
                      No board was in class
                    </Stat>
                  )}
                  {d.boards > 0 && <MiniBar value={(d.displayed / d.boards) * 100} width={64} color="kx.success" label={`${d.displayed} of ${d.boards} displayed`} />}
                  {b.requiresAck && (
                    <Stat icon={<DoneAll />} title="Boards where a teacher acknowledged the message">
                      {d.acknowledged} acknowledged
                    </Stat>
                  )}
                  <Stat icon={<FamilyRestroomOutlined />} title="Students and parents notified in their apps">
                    {d.families} notified in apps
                  </Stat>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button size="small" startIcon={<VisibilityOutlined />} onClick={() => openReport(b)}>
                    Delivery
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
                      {b.priority === 'emergency' ? 'All clear' : 'Clear'}
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          </Card>
        );
      })}

      <Dialog open={!!report} onClose={() => setReport(null)} fullWidth maxWidth="sm" aria-labelledby="delivery-title">
        <DialogTitle id="delivery-title">Delivery</DialogTitle>
        <DialogContent>
          {report && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              “{report.b.title}” · sent {formatDateTime(report.b.createdAt, timeZone)}
            </Typography>
          )}
          {report?.error && <Alert severity="error">{report.error}</Alert>}
          {report && !report.data && !report.error && (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {report?.data && report.data.total === 0 && (
            <EmptyState dense icon={<GroupsOutlined />} title="No boards were sent this message">
              {report.b.audience.all
                ? 'There were no enrolled boards when it was sent.'
                : 'Class and program messages reach boards only while a teacher is teaching that class. Families were still notified.'}
            </EmptyState>
          )}
          {report?.data && report.data.total > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Board</TableCell>
                  <TableCell>Displayed</TableCell>
                  <TableCell>Acknowledged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.data.devices.map((r) => (
                  <TableRow key={r.deviceId}>
                    <TableCell>{r.deviceName}</TableCell>
                    <TableCell>{r.displayedAt ? formatDateTime(r.displayedAt, timeZone) : <Box component="span" sx={{ color: 'text.secondary' }}>Not yet{r.lastSeenAt ? '' : ' · offline'}</Box>}</TableCell>
                    <TableCell>{r.acknowledgedAt ? formatDateTime(r.acknowledgedAt, timeZone) : <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReport(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </Box>
  );
}
