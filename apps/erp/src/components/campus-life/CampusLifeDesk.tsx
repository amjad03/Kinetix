'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import {
  addAction, addActivity, addClub, addCommittee, addCommitteeMember, addEvent, addMeeting, checkIn, clubActivities, clubMembers, committeeMeetings, committeeMembers, decideMember, endTenure, eventRegistrations, eventStep, eventSummary, markAttendance, meetingActions, saveMinutes, setActionStatus, setMemberRole,
} from '@/app/(dashboard)/campus-life/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { AchievementsTab, ClubExtras, CommitteeExtras, EventExtras } from '@/components/campus-life/LifeExtras';
import { CheckboxField } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import {
  ACTION_STATUSES, AUDIENCES, CLUB_CATEGORIES, COMMITTEE_ROLES, EVENT_TYPES,
  type ActionItem, type CampusEvent, type Club, type ClubActivity, type ClubMember, type Committee, type CommitteeMember, type EventRegistration, type EventSummary, type Meeting,
} from '@/lib/clife';
import type { ActionResult } from '@/lib/types';

/** Loads a read-only list for a dialog and reloads it after a change. */
function useRead<T>(load: () => Promise<ActionResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, []);
  useEffect(() => {
    let live = true;
    void run().then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

const opts = (t: (k: MessageKey) => string, prefix: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}` as MessageKey) }));

export function CampusLifeDesk({ clubs, committees, events, initialTab }: { clubs: Club[]; committees: Committee[]; events: CampusEvent[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<'club' | 'committee' | 'event' | { club: Club } | { committee: Committee } | { event: CampusEvent } | { checkIn: CampusEvent } | null>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const add = (label: string, k: 'club' | 'committee' | 'event') => (
    <Button variant="outlined" onClick={() => setDlg(k)}>{label}</Button>
  );
  const yesNo = [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }];

  return (
    <>
      <Tabbed
        label={t('nav.campusLife')}
        initial={initialTab}
        tabs={[
          {
            id: 'clubs',
            label: t('cl.tab.clubs', { n: clubs.length }),
            node: (
              <>
                <Bar>{add(t('cl.addClub'), 'club')}</Bar>
                <Grid
                  testId="cl-clubs"
                  empty={t('cl.noClubs')}
                  rows={clubs}
                  cols={[
                    { label: t('cl.col.club'), cell: (c) => c.name },
                    { label: t('cl.col.category'), cell: (c) => t(`cl.cat.${c.category}` as MessageKey) },
                    { label: t('cl.col.members'), cell: (c) => c.members, num: true },
                    { label: t('cl.col.pending'), cell: (c) => (c.pending ? <Pill warn label={String(c.pending)} /> : 0), num: true, sort: (c) => c.pending },
                    { label: '', cell: (c) => <Button size="small" onClick={() => setDlg({ club: c })}>{t('cl.manage')}</Button> },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'committees',
            label: t('cl.tab.committees', { n: committees.length }),
            node: (
              <>
                <Bar>{add(t('cl.addCommittee'), 'committee')}</Bar>
                <Grid
                  testId="cl-committees"
                  empty={t('cl.noCommittees')}
                  rows={committees}
                  cols={[
                    { label: t('cl.col.committee'), cell: (c) => c.name },
                    { label: t('cl.col.statutory'), cell: (c) => (c.statutory ? <Pill label={t('cl.statutory')} /> : '-'), sort: (c) => (c.statutory ? 1 : 0) },
                    { label: t('cl.col.current'), cell: (c) => c.members, num: true },
                    { label: t('cl.col.openActions'), cell: (c) => c.openActions, num: true },
                    { label: '', cell: (c) => <Button size="small" onClick={() => setDlg({ committee: c })}>{t('cl.manage')}</Button> },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'events',
            label: t('cl.tab.events', { n: events.length }),
            node: (
              <>
                <Bar>{add(t('cl.addEvent'), 'event')}</Bar>
                <Grid
                  testId="cl-events"
                  empty={t('cl.noEvents')}
                  rows={events}
                  cols={[
                    { label: t('cl.col.event'), cell: (e) => e.title },
                    { label: t('cl.col.when'), cell: (e) => fmt.dateTime(e.startsAt), sort: (e) => e.startsAt },
                    { label: t('cl.col.venue'), cell: (e) => e.venue || '-' },
                    { label: t('cl.col.seats'), cell: (e) => `${e.registered} / ${e.capacity}`, sort: (e) => e.registered },
                    { label: t('cl.col.waitlist'), cell: (e) => e.waitlisted, num: true },
                    { label: t('cl.col.checkedIn'), cell: (e) => e.checkedIn, num: true },
                    { label: t('ops.f.status'), cell: (e) => <Pill warn={e.status === 'cancelled'} label={t(`cl.evStatus.${e.status}` as MessageKey)} /> },
                    {
                      label: '',
                      cell: (e) => (
                        <>
                          {e.status === 'draft' && <ActionButton label={t('cl.publish')} run={() => eventStep(e.id, 'publish')} onDone={toast} />}
                          {e.status === 'published' && <Button size="small" onClick={() => setDlg({ checkIn: e })}>{t('cl.checkIn')}</Button>}
                          <Button size="small" onClick={() => setDlg({ event: e })}>{t('cl.registrations')}</Button>
                          {e.status !== 'cancelled' && <ActionButton tone="error" label={t('cl.cancelEvent')} run={() => eventStep(e.id, 'cancel')} onDone={toast} />}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          { id: 'achievements', label: t('pwb.cl.tab'), node: <AchievementsTab /> },
        ]}
      />

      {dlg === 'club' && (
        <FormDialog
          title={t('cl.addClub')}
          onSubmit={addClub}
          onClose={done}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'category', label: t('cl.col.category'), kind: 'select', init: 'general', options: opts(t, 'cl.cat', CLUB_CATEGORIES) },
            { name: 'coordinator', label: t('cl.coordinator'), kind: 'uuid' },
            { name: 'description', label: t('cl.description'), kind: 'multiline' },
          ]}
        />
      )}
      {dlg === 'committee' && (
        <FormDialog
          title={t('cl.addCommittee')}
          onSubmit={addCommittee}
          onClose={done}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'statutory', label: t('cl.statutoryQ'), kind: 'select', init: 'no', options: yesNo },
            { name: 'description', label: t('cl.description'), kind: 'multiline' },
          ]}
        />
      )}
      {dlg === 'event' && (
        <FormDialog
          title={t('cl.addEvent')}
          onSubmit={addEvent}
          onClose={done}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'eventType', label: t('cl.evType'), kind: 'select', init: 'other', options: opts(t, 'cl.evType', EVENT_TYPES) },
            { name: 'venue', label: t('cl.col.venue') },
            { name: 'capacity', label: t('cl.capacity'), kind: 'number', required: true },
            { name: 'startsAt', label: t('cl.startsAt'), kind: 'datetime', required: true },
            { name: 'endsAt', label: t('cl.endsAt'), kind: 'datetime', required: true },
            { name: 'audience', label: t('cl.audience'), kind: 'select', init: 'all', options: opts(t, 'cl.aud', AUDIENCES) },
            { name: 'fee', label: t('cl.fee'), kind: 'rupees' },
            { name: 'description', label: t('cl.description'), kind: 'multiline' },
            { name: 'publish', label: t('cl.publishNow'), kind: 'select', init: 'no', options: yesNo },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'club' in dlg && <ClubDialog club={dlg.club} onClose={() => setDlg(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && 'committee' in dlg && <CommitteeDialog committee={dlg.committee} onClose={() => setDlg(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && 'event' in dlg && <EventDialog event={dlg.event} onClose={() => setDlg(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && 'checkIn' in dlg && <FormDialog title={`${t('cl.checkIn')} · ${dlg.checkIn.title}`} intro={t('cl.checkInHelp')} onSubmit={(v) => checkIn(dlg.checkIn.id, v)} onClose={done} fields={[{ name: 'token', label: t('cl.token'), required: true }]} />}
      {toastNode}
    </>
  );
}

type Toast = (m: string) => void;

/** Members with their requests and points, and activities with attendance, for one club. */
function ClubDialog({ club, onClose, toast }: { club: Club; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const members = useRead<ClubMember[]>(() => clubMembers(club.id));
  const activities = useRead<ClubActivity[]>(() => clubActivities(club.id));
  const [sub, setSub] = useState<'activity' | { attend: ClubActivity } | null>(null);
  const refresh = (m: string) => {
    toast(m);
    members.reload();
    activities.reload();
  };
  const active = (members.data ?? []).filter((m) => m.status === 'active');
  return (
    <InfoDialog title={club.name} onClose={onClose}>
      {members.error && <Typography color="error">{members.error}</Typography>}
      <Typography variant="h6" sx={{ fontSize: '1.0625rem', mb: 1 }}>{t('cl.members')}</Typography>
      <Grid
        testId="cl-members"
        empty={t('cl.noMembers')}
        rows={(members.data ?? []).filter((m) => m.status === 'requested' || m.status === 'active')}
        cols={[
          { label: t('ops.f.student'), cell: (m) => `${m.fullName} (${m.rollNo})` },
          { label: t('ops.f.status'), cell: (m) => <Pill warn={m.status === 'requested'} label={t(`cl.mStatus.${m.status}` as MessageKey)} /> },
          { label: t('cl.role'), cell: (m) => t(`cl.role.${m.role}` as MessageKey) },
          { label: t('cl.points'), cell: (m) => m.points, num: true },
          {
            label: '',
            cell: (m) =>
              m.status === 'requested' ? (
                <>
                  <ActionButton label={t('cl.approve')} run={() => decideMember(club.id, m.id, 'approve')} onDone={refresh} />
                  <ActionButton tone="error" label={t('cl.reject')} run={() => decideMember(club.id, m.id, 'reject')} onDone={refresh} />
                </>
              ) : (
                <ActionButton label={m.role === 'lead' ? t('cl.makeMember') : t('cl.makeLead')} run={() => setMemberRole(club.id, m.id, m.role === 'lead' ? 'member' : 'lead')} onDone={refresh} />
              ),
          },
        ]}
      />
      <Stack sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", mt: 3, mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.0625rem' }}>{t('cl.activities')}</Typography>
        <Button variant="outlined" size="small" onClick={() => setSub('activity')}>{t('cl.addActivity')}</Button>
      </Stack>
      <Grid
        testId="cl-activities"
        empty={t('cl.noActivities')}
        rows={activities.data ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (a) => a.title },
          { label: t('ops.f.date'), cell: (a) => fmt.date(a.activityOn, 'short'), sort: (a) => a.activityOn },
          { label: t('cl.points'), cell: (a) => a.points, num: true },
          { label: t('cl.attended'), cell: (a) => a.attended, num: true },
          { label: '', cell: (a) => <Button size="small" onClick={() => setSub({ attend: a })} disabled={active.length === 0}>{t('cl.markAttendance')}</Button> },
        ]}
      />
      {sub === 'activity' && (
        <FormDialog
          title={t('cl.addActivity')}
          onSubmit={(v) => addActivity(club.id, v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'activityOn', label: t('ops.f.date'), kind: 'date', required: true }, { name: 'points', label: t('cl.points'), kind: 'number', init: '0' }]}
        />
      )}
      <ClubExtras clubId={club.id} members={members.data ?? []} toast={toast} />
      {sub && typeof sub === 'object' && (
        <AttendanceDialog
          activity={sub.attend}
          members={active}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
        />
      )}
    </InfoDialog>
  );
}

/** Ticks the members who attended; points go to each. */
function AttendanceDialog({ activity, members, onClose }: { activity: ClubActivity; members: ClubMember[]; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  return (
    <InfoDialog title={`${t('cl.markAttendance')} · ${activity.title}`} onClose={() => onClose()}>
      <Stack>
        {members.map((m) => (
          <CheckboxField
            key={m.studentId}
            label={`${m.fullName} (${m.rollNo})`}
            checked={picked.has(m.studentId)}
            onChange={(on) => setPicked((s) => {
              const n = new Set(s);
              if (on) n.add(m.studentId);
              else n.delete(m.studentId);
              return n;
            })}
          />
        ))}
      </Stack>
      {err && <Typography color="error">{err}</Typography>}
      <Button
        sx={{ mt: 2 }}
        variant="contained"
        disabled={picked.size === 0}
        onClick={async () => {
          const r = await markAttendance(activity.id, [...picked]);
          if (r.ok) onClose(t('ops.saved'));
          else setErr(r.error);
        }}
      >
        {t('cl.saveAttendance', { n: picked.size })}
      </Button>
    </InfoDialog>
  );
}

/** Members and tenure, meetings with minutes, and action items for one committee. */
function CommitteeDialog({ committee, onClose, toast }: { committee: Committee; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const members = useRead<CommitteeMember[]>(() => committeeMembers(committee.id));
  const meetings = useRead<Meeting[]>(() => committeeMeetings(committee.id));
  const [sub, setSub] = useState<'member' | 'meeting' | { end: CommitteeMember } | { minutes: Meeting } | { actions: Meeting } | null>(null);
  const refresh = (m: string) => {
    toast(m);
    members.reload();
    meetings.reload();
  };
  const closeSub = (m?: string) => {
    setSub(null);
    if (m) refresh(m);
  };
  return (
    <InfoDialog title={committee.name} onClose={onClose}>
      {committee.description && <Typography sx={{ mb: 2 }}>{committee.description}</Typography>}
      <Stack sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.0625rem' }}>{t('cl.cmMembers')}</Typography>
        <Button variant="outlined" size="small" onClick={() => setSub('member')}>{t('cl.addMember')}</Button>
      </Stack>
      <Grid
        testId="cl-cm-members"
        empty={t('cl.noMembers')}
        rows={members.data ?? []}
        cols={[
          { label: t('ops.f.name'), cell: (m) => m.fullName },
          { label: t('cl.role'), cell: (m) => t(`cl.cmRole.${m.role}` as MessageKey) },
          { label: t('cl.tenure'), cell: (m) => `${fmt.date(m.tenureStart, 'short')} - ${m.tenureEnd ? fmt.date(m.tenureEnd, 'short') : t('cl.ongoing')}`, sort: (m) => m.tenureStart },
          { label: '', cell: (m) => (m.current ? <Button size="small" onClick={() => setSub({ end: m })}>{t('cl.endTenure')}</Button> : <Pill label={t('cl.ended')} />) },
        ]}
      />
      <Stack sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", mt: 3, mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.0625rem' }}>{t('cl.meetings')}</Typography>
        <Button variant="outlined" size="small" onClick={() => setSub('meeting')}>{t('cl.addMeeting')}</Button>
      </Stack>
      <Grid
        testId="cl-meetings"
        empty={t('cl.noMeetings')}
        rows={meetings.data ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (m) => m.title },
          { label: t('ops.f.date'), cell: (m) => fmt.date(m.meetingOn, 'short'), sort: (m) => m.meetingOn },
          { label: t('ops.f.status'), cell: (m) => <Pill warn={m.status === 'cancelled'} label={t(`cl.mtStatus.${m.status}` as MessageKey)} /> },
          { label: t('cl.col.openActions'), cell: (m) => `${m.openActions} / ${m.actions}`, sort: (m) => m.openActions },
          {
            label: '',
            cell: (m) => (
              <>
                {m.status !== 'cancelled' && <Button size="small" onClick={() => setSub({ minutes: m })}>{t('cl.minutes')}</Button>}
                <Button size="small" onClick={() => setSub({ actions: m })}>{t('cl.actionItems')}</Button>
              </>
            ),
          },
        ]}
      />
      <CommitteeExtras committee={committee} meetings={meetings.data ?? []} toast={toast} />
      {sub === 'member' && (
        <FormDialog
          title={t('cl.addMember')}
          onSubmit={(v) => addCommitteeMember(committee.id, v)}
          onClose={closeSub}
          fields={[
            { name: 'userId', label: t('cl.userId'), kind: 'uuid', required: true },
            { name: 'role', label: t('cl.role'), kind: 'select', init: 'member', options: opts(t, 'cl.cmRole', COMMITTEE_ROLES) },
            { name: 'tenureStart', label: t('cl.tenureStart'), kind: 'date', required: true },
            { name: 'tenureEnd', label: t('cl.tenureEnd'), kind: 'date' },
          ]}
        />
      )}
      {sub === 'meeting' && (
        <FormDialog
          title={t('cl.addMeeting')}
          onSubmit={(v) => addMeeting(committee.id, v)}
          onClose={closeSub}
          fields={[{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'meetingOn', label: t('ops.f.date'), kind: 'date', required: true }, { name: 'agenda', label: t('cl.agenda'), kind: 'multiline' }]}
        />
      )}
      {sub && typeof sub === 'object' && 'end' in sub && <FormDialog title={`${t('cl.endTenure')} · ${sub.end.fullName}`} onSubmit={(v) => endTenure(committee.id, sub.end.id, v.tenureEnd)} onClose={closeSub} fields={[{ name: 'tenureEnd', label: t('cl.tenureEnd'), kind: 'date', required: true }]} />}
      {sub && typeof sub === 'object' && 'minutes' in sub && (
        <FormDialog
          title={`${t('cl.minutes')} · ${sub.minutes.title}`}
          intro={sub.minutes.agenda ? `${t('cl.agenda')}: ${sub.minutes.agenda}` : undefined}
          onSubmit={(v) => saveMinutes(sub.minutes.id, v)}
          onClose={closeSub}
          fields={[{ name: 'minutes', label: t('cl.minutes'), kind: 'multiline', required: true, init: sub.minutes.minutes }]}
        />
      )}
      {sub && typeof sub === 'object' && 'actions' in sub && <ActionsDialog meeting={sub.actions} onClose={() => closeSub()} toast={toast} />}
    </InfoDialog>
  );
}

/** Action items of one meeting: owner, due date, status. */
function ActionsDialog({ meeting, onClose, toast }: { meeting: Meeting; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const items = useRead<ActionItem[]>(() => meetingActions(meeting.id));
  const [adding, setAdding] = useState(false);
  const refresh = (m: string) => {
    toast(m);
    items.reload();
  };
  return (
    <InfoDialog title={`${t('cl.actionItems')} · ${meeting.title}`} onClose={onClose}>
      <Bar>
        <Button variant="outlined" size="small" onClick={() => setAdding(true)}>{t('cl.addAction')}</Button>
      </Bar>
      <Grid
        testId="cl-actions"
        empty={t('cl.noActions')}
        rows={items.data ?? []}
        tint={(a) => a.overdue}
        cols={[
          { label: t('ops.f.title'), cell: (a) => a.title },
          { label: t('cl.owner'), cell: (a) => a.ownerName },
          { label: t('ops.f.dueOn'), cell: (a) => fmt.date(a.dueOn, 'short'), sort: (a) => a.dueOn },
          { label: t('ops.f.status'), cell: (a) => <Pill warn={a.overdue} label={a.overdue ? t('cl.overdue') : t(`cl.acStatus.${a.status}` as MessageKey)} /> },
          { label: '', cell: (a) => ACTION_STATUSES.filter((s) => s !== a.status).map((s) => <ActionButton key={s} label={t(`cl.acStatus.${s}` as MessageKey)} run={() => setActionStatus(a.id, s)} onDone={refresh} />) },
        ]}
      />
      {adding && (
        <FormDialog
          title={t('cl.addAction')}
          onSubmit={(v) => addAction(meeting.id, v)}
          onClose={(m) => {
            setAdding(false);
            if (m) refresh(m);
          }}
          fields={[{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'ownerUserId', label: t('cl.ownerId'), kind: 'uuid', required: true }, { name: 'dueOn', label: t('ops.f.dueOn'), kind: 'date', required: true }] satisfies Field[]}
        />
      )}
    </InfoDialog>
  );
}

/** Registrations and the attendance and feedback summary for one event. */
function EventDialog({ event, onClose, toast }: { event: CampusEvent; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const regs = useRead<EventRegistration[]>(() => eventRegistrations(event.id));
  const sum = useRead<EventSummary>(() => eventSummary(event.id));
  const s = sum.data;
  return (
    <InfoDialog title={event.title} onClose={onClose}>
      {s && (
        <Typography sx={{ mb: 2 }} data-testid="cl-event-summary">
          {t('cl.summary', { registered: s.registered, waitlisted: s.waitlisted, attended: s.attended, percent: s.attendancePercent })}
          {s.averageRating !== null && ` · ${t('cl.rating', { avg: s.averageRating, n: s.feedbackCount })}`}
          {event.feePaise > 0 && ` · ${t('cl.expectedFees', { amount: fmt.rupees(s.expectedFeePaise) })}`}
        </Typography>
      )}
      <Grid
        testId="cl-registrations"
        empty={t('cl.noRegistrations')}
        rows={(regs.data ?? []).filter((r) => r.status !== 'cancelled')}
        cols={[
          { label: t('ops.f.student'), cell: (r) => `${r.fullName} (${r.rollNo})` },
          { label: t('ops.f.status'), cell: (r) => <Pill warn={r.status === 'waitlisted'} label={t(`cl.regStatus.${r.status}` as MessageKey)} /> },
          { label: t('cl.col.checkedIn'), cell: (r) => (r.checkedInAt ? fmt.dateTime(r.checkedInAt) : '-'), sort: (r) => r.checkedInAt ?? '' },
        ]}
      />
      <EventExtras event={event} toast={toast} />
    </InfoDialog>
  );
}
