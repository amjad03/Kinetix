'use client';
import { useState, useTransition } from 'react';
import { cancelLive, confirmLive, issueCertificates, liveAttendance, moderate, revokeCertificate, scheduleLive } from '@/app/(dashboard)/courses/pass-actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { StatGrid, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { liveState, riskCounts, type AtRisk, type CourseCerts, type ForumQueue, type LiveAttendance, type LiveSession, type QueueItem } from '@/lib/lms-pass';

import { Button } from '@/components/kx';

/** Live classes of a course: schedule, cancel, and turn the joins into the period's attendance. */
export function LiveTab({ courseId, sessions, canManage }: { courseId: string; sessions: LiveSession[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const [att, setAtt] = useState<{ id: string; data: LiveAttendance | null; error?: string } | null>(null);
  const now = new Date();
  const showAttendance = async (id: string) => {
    setAtt({ id, data: null });
    const r = await liveAttendance(id);
    setAtt(r.ok ? { id, data: r.data } : { id, data: null, error: r.error });
  };
  return (
    <>
      {canManage && (
        <Bar>
          <Button variant="contained" onClick={() => setOpen(true)} data-testid="schedule-live">{t('lp.live.schedule')}</Button>
        </Bar>
      )}
      <Grid
        testId="live-table"
        empty={t('lp.live.empty')}
        rows={sessions}
        cols={[
          { label: t('lp.live.title'), cell: (s) => s.title, sort: (s) => s.title },
          { label: t('lp.live.when'), cell: (s) => `${fmt.date(s.startsAt.slice(0, 10), 'short')} ${fmt.time(s.startsAt)}`, sort: (s) => s.startsAt },
          { label: t('lp.live.provider'), cell: (s) => t(`lp.provider.${s.provider}` as MessageKey) },
          { label: t('lp.live.state'), cell: (s) => <Pill label={t(`lp.live.${liveState(s, now)}`)} warn={liveState(s, now) === 'cancelled'} /> },
          { label: t('lp.live.joined'), cell: (s) => s.joined, num: true },
          { label: t('lp.live.attendance'), cell: (s) => (s.attendanceMarkedAt ? t('lp.live.marked') : s.slotId ? t('lp.live.notMarked') : t('lp.live.noPeriod')) },
          {
            label: '',
            cell: (s) =>
              canManage ? (
                <span className="flex gap-1">
                  {liveState(s, now) !== 'upcoming' && s.status === 'scheduled' && <Button size="small" onClick={() => showAttendance(s.id)}>{t('lp.live.fromJoins')}</Button>}
                  {s.status === 'scheduled' && liveState(s, now) !== 'over' && <ActionButton label={t('lp.live.cancel')} tone="error" run={() => cancelLive(courseId, s.id)} onDone={toast} />}
                </span>
              ) : null,
          },
        ]}
      />
      {open && (
        <FormDialog
          title={t('lp.live.schedule')}
          intro={<p className="text-sm text-muted-foreground">{t('lp.live.intro')}</p>}
          onSubmit={(v) => scheduleLive(courseId, v)}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
          fields={[
            { name: 'title', label: t('lp.live.title'), required: true },
            { name: 'startsAt', label: t('lp.live.when'), kind: 'datetime', required: true },
            { name: 'durationMin', label: t('lp.live.minutes'), kind: 'number', required: true, init: '45' },
            { name: 'joinUrl', label: t('lp.live.link'), required: true },
          ]}
        />
      )}
      {att && <AttendanceDialog courseId={courseId} att={att} onClose={(m) => { setAtt(null); if (m) toast(m); }} />}
      {toastNode}
    </>
  );
}

function AttendanceDialog({ courseId, att, onClose }: { courseId: string; att: { id: string; data: LiveAttendance | null; error?: string }; onClose: (m?: string) => void }) {
  const { t, fmt } = useI18n();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const d = att.data;
  return (
    <InfoDialog title={t('lp.live.fromJoins')} onClose={() => onClose()}>
      {att.error && <p className="text-sm text-red-ink">{att.error}</p>}
      {d && (
        <>
          <p className="text-sm text-muted-foreground mb-3">{t('lp.live.suggestIntro', { min: d.lateAfterMin })}</p>
          <Grid
            testId="live-attendance"
            empty={t('ld.hw.noStudents')}
            rows={d.rows}
            cols={[
              { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
              { label: t('lp.live.firstJoin'), cell: (r) => (r.firstJoinedAt ? fmt.time(r.firstJoinedAt) : '-') },
              { label: t('lp.live.joins'), cell: (r) => r.joins, num: true },
              { label: t('lp.live.suggested'), cell: (r) => <Pill label={t(`lp.att.${r.suggested}`)} warn={r.suggested === 'absent'} /> },
            ]}
          />
          {err && <p className="text-sm text-red-ink">{err}</p>}
          <Bar>
            <Button
              variant="contained"
              disabled={pending || !d.slotId}
              data-testid="confirm-live-attendance"
              onClick={() =>
                start(async () => {
                  const r = await confirmLive(courseId, att.id, d.rows.map((x) => ({ studentId: x.id, status: x.suggested })));
                  if (r.ok) onClose(t('lp.live.saved'));
                  else setErr(r.error);
                })
              }
            >
              {t('lp.live.confirm')}
            </Button>
            {!d.slotId && <span className="text-sm text-muted-foreground">{t('lp.live.noPeriod')}</span>}
          </Bar>
        </>
      )}
    </InfoDialog>
  );
}

/** Students at risk in the course, with the reasons by the institution's thresholds. */
export function RiskTab({ data }: { data: AtRisk }) {
  const { t, fmt } = useI18n();
  const n = riskCounts(data.students);
  return (
    <>
      <StatGrid>
        <StatTile label={t('lp.risk.high')} value={n.high} tone={n.high ? 'warning' : 'default'} testId="risk-high" />
        <StatTile label={t('lp.risk.medium')} value={n.medium} />
        <StatTile label={t('lp.risk.low')} value={n.low} />
        <StatTile label={t('lp.risk.none')} value={n.none} />
      </StatGrid>
      <p className="text-sm text-muted-foreground mb-3">{t('lp.risk.rules', { days: data.thresholds.inactiveDays, eng: data.thresholds.engagementBelowPct, quiz: data.thresholds.quizBelowPct, overdue: data.thresholds.overdueCount })}</p>
      <Grid
        testId="risk-table"
        exportName="at-risk"
        empty={t('ld.hw.noStudents')}
        rows={data.students}
        tint={(r) => r.level === 'high'}
        cols={[
          { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
          { label: t('lp.risk.level'), cell: (r) => <Pill label={t(`lp.risk.${r.level}`)} warn={r.level === 'high' || r.level === 'medium'} />, sort: (r) => ['high', 'medium', 'low', 'none'].indexOf(r.level) },
          { label: t('lp.risk.reasons'), cell: (r) => r.reasons.map((x) => t(`lp.reason.${x}`)).join(', ') || '-', wrap: true },
          { label: t('ld.eng.engagement'), cell: (r) => `${r.engagementPct}%`, sort: (r) => r.engagementPct, num: true },
          { label: t('lp.risk.quiz'), cell: (r) => (r.quizPct === null ? '-' : `${Math.round(r.quizPct)}%`), sort: (r) => r.quizPct ?? -1, num: true },
          { label: t('lp.risk.overdue'), cell: (r) => r.overdue, num: true },
          { label: t('lp.risk.live'), cell: (r) => `${r.liveJoined}/${r.liveHeld}`, sort: (r) => r.liveJoined },
          { label: t('ld.eng.last'), cell: (r) => (r.lastActiveAt ? fmt.relative(r.lastActiveAt) : t('lp.never')), sort: (r) => r.lastActiveAt ?? '' },
        ]}
      />
    </>
  );
}

/** Each student's completion and certificate; issue to everyone who meets the rules, or revoke one. */
export function CertificatesTab({ courseId, data, canRevoke }: { courseId: string; data: CourseCerts; canRevoke: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [revoke, setRevoke] = useState<string | null>(null);
  const eligible = data.rows.filter((r) => r.completion.eligible && !r.certificate).length;
  return (
    <>
      <StatGrid>
        <StatTile label={t('lp.cert.issued')} value={data.rows.filter((r) => r.certificate && !r.certificate.revokedAt).length} testId="certs-issued" />
        <StatTile label={t('lp.cert.eligible')} value={eligible} />
        <StatTile label={t('lp.cert.rule')} value={`${data.completionPct}%`} caption={data.minGradePct !== null ? t('lp.completion.grade', { pct: data.minGradePct }) : undefined} />
      </StatGrid>
      <Bar>
        {data.certificate ? <ActionButton label={t('lp.cert.issue', { n: eligible })} run={() => issueCertificates(courseId)} onDone={toast} disabled={!eligible} /> : <span className="text-sm text-muted-foreground">{t('lp.cert.off')}</span>}
      </Bar>
      <Grid
        testId="certs-table"
        exportName="course-completion"
        empty={t('ld.hw.noStudents')}
        rows={data.rows}
        cols={[
          { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
          { label: t('lp.cert.done'), cell: (r) => `${r.completion.done}/${r.completion.total} (${r.completion.pct}%)`, sort: (r) => r.completion.pct },
          { label: t('lp.cert.grade'), cell: (r) => (r.completion.grade === null ? '-' : `${r.completion.grade}%`), num: true },
          { label: t('lp.cert.status'), cell: (r) => (r.certificate ? <Pill label={r.certificate.revokedAt ? t('lp.cert.revoked') : r.certificate.serial} warn={!!r.certificate.revokedAt} /> : r.completion.eligible ? t('lp.cert.ready') : r.completion.missing.map((m) => t(`lp.missing.${m}`)).join(', ')), sort: (r) => (r.certificate ? 2 : r.completion.eligible ? 1 : 0) },
          { label: t('lp.cert.on'), cell: (r) => (r.certificate ? fmt.date(r.certificate.issuedAt.slice(0, 10), 'short') : '') },
          {
            label: '',
            cell: (r) =>
              r.certificate ? (
                <span className="flex gap-1">
                  <a className="text-sm" href={`/api/download?kind=lms-certificate&id=${r.certificate.id}`}>{t('lp.cert.pdf')}</a>
                  {canRevoke && !r.certificate.revokedAt && <Button size="small" color="error" onClick={() => setRevoke(r.certificate!.id)}>{t('lp.cert.revoke')}</Button>}
                </span>
              ) : null,
          },
        ]}
      />
      {revoke && <FormDialog title={t('lp.cert.revoke')} onSubmit={(v) => revokeCertificate(courseId, revoke, v)} onClose={(m) => { setRevoke(null); if (m) toast(m); }} fields={[{ name: 'reason', label: t('lp.cert.reason'), required: true, kind: 'multiline' }]} />}
      {toastNode}
    </>
  );
}

/** Held and reported discussions and replies, to approve, hide or dismiss. */
export function ModerationTab({ courseId, queue }: { courseId: string; queue: ForumQueue }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const rows: (QueueItem & { kind: 'thread' | 'post' })[] = [...queue.threads.map((x) => ({ ...x, kind: 'thread' as const })), ...queue.posts.map((x) => ({ ...x, kind: 'post' as const }))];
  return (
    <>
      <Grid
        testId="moderation-table"
        empty={t('lp.mod.empty')}
        rows={rows}
        cols={[
          { label: t('lp.mod.what'), cell: (r) => (r.kind === 'thread' ? r.title : `${t('lp.mod.replyIn')} ${r.thread}`), wrap: true },
          { label: t('lp.mod.text'), cell: (r) => r.body, wrap: true },
          { label: t('lp.mod.author'), cell: (r) => r.author },
          { label: t('lp.mod.when'), cell: (r) => fmt.relative(r.createdAt), sort: (r) => r.createdAt },
          { label: t('lp.mod.state'), cell: (r) => <Pill label={r.held ? t('lp.mod.held') : r.hidden ? t('lp.mod.hidden') : t('lp.mod.reported', { n: r.reports })} warn={r.reports > 0} /> },
          { label: t('lp.mod.reasons'), cell: (r) => r.reasons.map((x) => t(`lp.reportReason.${x.reason}` as MessageKey) + (x.note ? `: ${x.note}` : '')).join('; ') || '-', wrap: true },
          {
            label: '',
            cell: (r) => (
              <span className="flex gap-1">
                <ActionButton label={t('lp.mod.approve')} run={() => moderate(courseId, r.kind, r.id, 'approve')} onDone={toast} />
                <ActionButton label={t('lp.mod.hide')} tone="error" run={() => moderate(courseId, r.kind, r.id, 'hide')} onDone={toast} />
                {r.reports > 0 && <ActionButton label={t('lp.mod.dismiss')} run={() => moderate(courseId, r.kind, r.id, 'dismiss')} onDone={toast} />}
              </span>
            ),
          },
        ]}
      />
      {toastNode}
    </>
  );
}
