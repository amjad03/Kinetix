'use client';

import { GraduationCap, MessageCircle, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { channelMessages, learnersOf, openPlans, saveLearnerRules, sendMentorMessage } from '@/app/(dashboard)/mentoring/depth-actions';
import { useRead } from '@/components/campus-life/CampusLifeDesk';
import { Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { StatGrid, StatTile } from '@/components/StatTile';
import { CheckboxField, EmptyState, SectionTitle, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { LearnerRow, LearnerRules, MentorChannel, MentorMessage, MentorStat, OutcomeStats } from '@/lib/life';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useKitColumns, emptyFor } from './kit';

/** Mentor assignments as a record kit list: assign, change mentor (with a reason), end, import, export, history. */
export function AssignmentsList({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'wd.col.student', sortKey: 'student', rowHeader: true },
    { key: 'rollNo', header: 'wd.col.roll', hideBelow: 'sm' },
    { key: 'className', header: 'wd.col.class', sortKey: 'className' },
    { key: 'mentorName', header: 'wd.col.mentor', sortKey: 'mentor' },
    { key: 'startedOn', header: 'wd.col.from', kind: 'date', sortKey: 'started', hideBelow: 'sm' },
    { key: 'endedOn', header: 'wd.col.to', kind: 'date', hideBelow: 'md' },
    { key: 'sessions', header: 'wd.col.sessions', kind: 'number' },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('wd.tab.assignments')}
      columns={columns}
      extraParams={{ tab: 'assignments' }}
      testId="wd-assignments"
      empty={emptyFor(meta, <EmptyState icon={<UsersRound />} title={t('wd.empty.assignTitle')}>{t('wd.empty.assign')}</EmptyState>)}
    />
  );
}

const LEVEL_TONE: Record<LearnerRow['level'], boolean> = { slow: true, average: false, advanced: false, not_enough: false };

/** Slow and advanced learners of a class under the institution's rules, with plans opened for several at once. */
export function LearnersView({ sections, rules, canSetRules }: { sections: { id: string; name: string }[]; rules: LearnerRules; canSetRules: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [section, setSection] = useState('');
  const [rows, setRows] = useState<LearnerRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<'rules' | 'plans' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const load = (id: string) =>
    start(async () => {
      setSection(id);
      setPicked(new Set());
      setError(null);
      if (!id) return setRows(null);
      const r = await learnersOf(id);
      if (r.ok) setRows(r.data.students);
      else setError(r.error);
    });
  const counts = (l: LearnerRow['level']) => (rows ?? []).filter((r) => r.level === l).length;
  return (
    <>
      <p className="mb-3 mt-0 text-[13px] text-muted-foreground">{t('wd.learn.rules', { slow: rules.slowBelowPct, advanced: rules.advancedFromPct, min: rules.minAssessments })}</p>
      <Bar>
        <SelectInput label={t('wd.col.class')} value={section} onChange={(e) => load(String(e.target.value))} options={sections.map((x) => ({ value: x.id, label: x.name }))} empty={t('lf.pick.class')} />
        {canSetRules && <Button variant="outline" onClick={() => setDlg('rules')}>{t('wd.learn.setRules')}</Button>}
        <Button disabled={!picked.size || busy} onClick={() => setDlg('plans')} data-testid="wd-open-plans">{t('wd.learn.openPlans', { n: picked.size })}</Button>
      </Bar>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      {rows && (
        <>
          <StatGrid min={130}>
            <StatTile label={t('wd.level.slow')} value={counts('slow')} tone={counts('slow') ? 'warning' : 'default'} testId="wd-slow" />
            <StatTile label={t('wd.level.average')} value={counts('average')} />
            <StatTile label={t('wd.level.advanced')} value={counts('advanced')} />
            <StatTile label={t('wd.level.not_enough')} value={counts('not_enough')} />
          </StatGrid>
          <Grid
            testId="wd-learners"
            exportName="learners"
            emptyIcon={<GraduationCap />}
            empty={t('wd.learn.none')}
            rows={rows}
            cols={[
              { label: '', cell: (r) => <CheckboxField label={<span className="sr-only">{t('wd.learn.pick', { name: r.fullName })}</span>} checked={picked.has(r.studentId)} disabled={r.openPlan} onChange={(on) => { const n = new Set(picked); if (on) n.add(r.studentId); else n.delete(r.studentId); setPicked(n); }} /> },
              { label: t('wd.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
              { label: t('wd.col.avg'), cell: (r) => (r.avgPct === null ? '-' : `${r.avgPct}%`), num: true, sort: (r) => r.avgPct ?? -1 },
              { label: t('wd.col.assessments'), cell: (r) => r.assessments, num: true },
              { label: t('wd.col.attendance'), cell: (r) => (r.attendancePct === null ? '-' : `${r.attendancePct}%`), num: true, sort: (r) => r.attendancePct ?? -1 },
              { label: t('wd.col.level'), cell: (r) => <Pill warn={LEVEL_TONE[r.level]} label={t(`wd.level.${r.level}` as MessageKey)} />, sort: (r) => r.level },
              { label: t('wd.col.plan'), cell: (r) => (r.openPlan ? t('ops.yes') : '-') },
            ]}
          />
        </>
      )}
      {dlg === 'rules' && (
        <FormDialog
          title={t('wd.learn.setRules')}
          intro={<p className="text-[13px] text-muted-foreground">{t('wd.learn.rulesHelp')}</p>}
          onSubmit={saveLearnerRules}
          onClose={(m) => {
            setDlg(null);
            if (m) {
              toast(m);
              router.refresh();
              if (section) load(section);
            }
          }}
          fields={[
            { name: 'slowBelowPct', label: t('wd.learn.slowBelow'), kind: 'number', required: true, init: String(rules.slowBelowPct) },
            { name: 'advancedFromPct', label: t('wd.learn.advancedFrom'), kind: 'number', required: true, init: String(rules.advancedFromPct) },
            { name: 'minAssessments', label: t('wd.learn.minAssessments'), kind: 'number', required: true, init: String(rules.minAssessments) },
            { name: 'attendanceBelowPct', label: t('wd.learn.attendanceBelow'), kind: 'number', init: String(rules.attendanceBelowPct) },
          ]}
        />
      )}
      {dlg === 'plans' && (
        <FormDialog
          title={t('wd.learn.openPlans', { n: picked.size })}
          onSubmit={async (v) => {
            const r = await openPlans([...picked], v);
            if (r.ok) toast(t('wd.learn.plansOpened', { n: r.data.created, skipped: r.data.skipped.length }));
            return r;
          }}
          onClose={(m) => {
            setDlg(null);
            if (m && section) load(section);
          }}
          fields={[
            { name: 'goal', label: t('wd.learn.goal'), required: true },
            { name: 'actions', label: t('wd.learn.actions'), kind: 'multiline', required: true },
            { name: 'reviewOn', label: t('wd.learn.reviewOn'), kind: 'date', required: true },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}

/** The signed-in mentor's private channels with their mentees. */
export function ChannelView({ channels, meId }: { channels: MentorChannel[]; meId: string }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<MentorChannel | null>(channels[0] ?? null);
  if (!channels.length) return <EmptyState icon={<MessageCircle />} title={t('wd.chan.noneTitle')}>{t('wd.chan.none')}</EmptyState>;
  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('wd.tab.channel')}>
        {channels.map((c) => (
          <li key={c.assignmentId}>
            <button type="button" onClick={() => setOpen(c)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${open?.assignmentId === c.assignmentId ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}>
              <span>
                {c.studentName}
                <span className="block text-xs text-muted-foreground">{c.className}{c.lastAt ? ` · ${fmt.relative(c.lastAt)}` : ''}</span>
              </span>
              {c.unread > 0 && <Pill warn label={String(c.unread)} />}
            </button>
          </li>
        ))}
      </ul>
      {open && <Thread key={open.assignmentId} channel={open} meId={meId} />}
    </div>
  );
}

function Thread({ channel, meId }: { channel: MentorChannel; meId: string }) {
  const { t, fmt } = useI18n();
  const msgs = useRead<MentorMessage[]>(() => channelMessages(channel.assignmentId));
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <section className="flex min-h-[320px] flex-col rounded-lg border bg-card p-4" aria-label={channel.studentName}>
      <SectionTitle>{channel.studentName}</SectionTitle>
      {!channel.hasLogin && <p className="mt-0 text-[13px] text-muted-foreground">{t('wd.chan.noLogin')}</p>}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto" data-testid="wd-thread">
        {(msgs.data ?? []).map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.senderUserId === meId ? 'self-end bg-teal-soft' : 'self-start bg-muted'}`}>
            <p className="m-0 whitespace-pre-wrap">{m.body}</p>
            <span className="text-[11px] text-muted-foreground">{fmt.dateTime(m.createdAt)}</span>
          </div>
        ))}
        {msgs.data && !msgs.data.length && <p className="text-sm text-muted-foreground">{t('wd.chan.empty')}</p>}
      </div>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <TextInput label={t('wd.chan.message')} value={text} multiline onChange={(e) => setText(e.target.value)} />
        </div>
        <Button
          disabled={busy || !text.trim() || !channel.hasLogin}
          onClick={() =>
            start(async () => {
              const r = await sendMentorMessage(channel.assignmentId, text.trim());
              if (!r.ok) return setError(r.error);
              setText('');
              setError(null);
              msgs.reload();
            })
          }
          data-testid="wd-send"
        >
          {t('wd.chan.send')}
        </Button>
      </div>
    </section>
  );
}

/** Mentoring statistics per mentor and the outcomes of intervention plans. */
export function MentoringReports({ mentors, outcomes }: { mentors: MentorStat[]; outcomes: OutcomeStats }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6" data-testid="wd-mentoring-reports">
      <div>
        <SectionTitle>{t('wd.rep.outcomes')}</SectionTitle>
        <StatGrid min={130}>
          <StatTile label={t('wd.rep.opened')} value={outcomes.opened} />
          <StatTile label={t('wd.rep.closed')} value={outcomes.closed} />
          <StatTile label={t('wd.rep.improved')} value={outcomes.improved} />
          <StatTile label={t('wd.rep.unchanged')} value={outcomes.unchanged} />
          <StatTile label={t('wd.rep.declined')} value={outcomes.declined} tone={outcomes.declined ? 'warning' : 'default'} />
          <StatTile label={t('wd.rep.avgGain')} value={outcomes.avgGain === null ? '-' : `${outcomes.avgGain}`} />
        </StatGrid>
      </div>
      <div>
        <SectionTitle>{t('wd.rep.mentors')}</SectionTitle>
        <Grid
          testId="wd-mentor-stats"
          exportName="mentoring"
          empty={t('wd.empty.assignTitle')}
          rows={mentors}
          cols={[
            { label: t('wd.col.mentor'), cell: (r) => r.mentorName },
            { label: t('wd.col.mentees'), cell: (r) => r.mentees, num: true },
            { label: t('wd.col.sessions90'), cell: (r) => r.sessions90, num: true },
            { label: t('wd.col.perMentee'), cell: (r) => r.sessionsPerMentee, num: true },
            { label: t('wd.col.openPlans'), cell: (r) => r.openPlans, num: true },
            { label: t('wd.col.closedPlans'), cell: (r) => r.closedPlans, num: true },
            { label: t('wd.rep.improved'), cell: (r) => r.improved, num: true },
          ]}
        />
      </div>
    </div>
  );
}
