'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { DataTable } from '@/components/ui';
import { clearBroadcast, deliveryReport } from '@/app/(dashboard)/messages/actions';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import type { DeliveryReport, SentBroadcast, Structure } from '@/lib/types';
import { MiniBar } from '../Bars';
import { EmptyState } from '../States';
import { PriorityChip } from './priorities';

import { Alert, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Tooltip } from '@/components/kx';
import { CheckCheck as DoneAll, Eye as VisibilityOutlined, Megaphone as CampaignOutlined, Presentation as CastForEducationOutlined, Users as FamilyRestroomOutlined, UsersRound as GroupsOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <span className="inline-flex items-center gap-1.5 [&_svg]:text-[18px] [&_svg]:text-muted-foreground">
        {icon}
        <span className="text-[13px] leading-[19px] tabular-nums">
          {children}
        </span>
      </span>
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
    <div className="grid gap-3" data-testid="sent-messages">
      {items.map((b) => {
        const d = b.delivery;
        const state = b.clearedAt ? 'cleared' : b.active ? 'active' : 'expired';
        return (
          <Card className={cn(state === 'active' && b.priority === 'emergency' ? 'border-destructive' : '')} key={b.id} component="article" data-testid="sent-message">
            <div className="p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityChip priority={b.priority} />
                {state === 'active' ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('msg.state.active')}
                    icon={<span className="w-[8px] h-[8px] rounded-full bg-green ml-[8px_!important]" />}
                  />
                ) : (
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {state === 'cleared' ? t('msg.state.cleared', { date: fmt.dateTime(b.clearedAt!, timeZone) }) : t('msg.state.expired', { date: fmt.dateTime(b.expiresAt, timeZone) })}
                  </span>
                )}
                <div className="flex-1" />
                <Tooltip title={fmt.dateTime(b.createdAt, timeZone)}>
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground" suppressHydrationWarning>
                    {fmt.relative(b.createdAt, now, timeZone)}
                  </span>
                </Tooltip>
              </div>
              <h3 className="text-base leading-6 font-medium tracking-[0.1px] mt-2">
                {b.title}
              </h3>
              <p className="text-[13px] leading-[19px] text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-3 overflow-hidden"
              >
                {b.body}
              </p>
              <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-2">
                {t('msg.to', { audience: audienceLabel(b, structure, t), name: b.sender.fullName })}
                {state === 'active' ? ` · ${t('msg.until', { time: `${fmt.time(b.expiresAt, timeZone)}${new Date(b.expiresAt).toDateString() !== now.toDateString() ? `, ${fmt.dateTime(b.expiresAt, timeZone, false)}` : ''}` })}` : ''}
              </p>

              <div className="mt-3 pt-3 border-t border-border grid grid-cols-[1fr_auto] items-center gap-4"
              >
                <div className="flex items-center gap-x-5 gap-y-2 flex-wrap" data-testid="delivery">
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
                </div>
                <div className="flex gap-2 items-center">
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
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      <Dialog open={!!report} onClose={() => setReport(null)} fullWidth maxWidth="sm" aria-labelledby="delivery-title">
        <DialogTitle id="delivery-title">{t('msg.delivery')}</DialogTitle>
        <DialogContent>
          {report && (
            <p className="text-[13px] leading-[19px] text-muted-foreground mb-4">
              {t('msg.sentAt', { title: report.b.title, date: fmt.dateTime(report.b.createdAt, timeZone) })}
            </p>
          )}
          {report?.error && <Alert severity="error">{report.error}</Alert>}
          {report && !report.data && !report.error && (
            <div className="grid place-items-center py-8">
              <CircularProgress size={28} />
            </div>
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
                { id: 'c1', header: t('msg.col.displayed'), sort: (r) => r.displayedAt ?? '', cell: (r) => (<>{r.displayedAt ? fmt.dateTime(r.displayedAt, timeZone) : <span className="text-muted-foreground">{t('msg.notYet')}{r.lastSeenAt ? '' : t('msg.offline')}</span>}</>) },
                { id: 'c2', header: t('msg.col.acknowledged'), sort: (r) => r.acknowledgedAt ?? '', cell: (r) => (<>{r.acknowledgedAt ? fmt.dateTime(r.acknowledgedAt, timeZone) : <span className="text-muted-foreground">—</span>}</>) },
              ]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReport(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </div>
  );
}
