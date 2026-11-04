'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { addMember, endTenure, saveProfile, scheduleMeeting } from '@/app/(dashboard)/governance/pass-actions';
import { Button } from '@/components/kx';
import { ActionButton, FormDialog, Grid, useToast, type Field } from '@/components/ops/kit';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { issueWords } from '@/components/governance/words';
import { MEMBER_CATEGORIES, MEMBER_ROLES, minutesTone, type CommitteeDetail, type CommitteeMember } from '@/lib/governance-pass';

const KINDS = ['iqac', 'anti_ragging', 'anti_ragging_squad', 'icc', 'grievance_redressal', 'sc_st_cell', 'minority_cell', 'equal_opportunity_cell', 'governing_body', 'academic_council', 'board_of_studies', 'finance_committee', 'other'] as const;

/** A committee's profile, members in office (with what the regulation asks of them) and its meetings. */
export function CommitteeDetailDesk({ c, people }: { c: CommitteeDetail; people: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<'profile' | 'member' | 'meeting' | null>(null);
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const done = (msg?: string) => {
    setOpen(null);
    if (msg) {
      toast(msg);
      router.refresh();
    }
  };
  const issues = c.compliance?.issues ?? [];
  const yesNo = [
    { value: 'yes', label: t('common.yes') },
    { value: 'no', label: t('common.no') },
  ];
  const profileFields: Field[] = [
    { name: 'kind', label: t('gp.f.kind'), kind: 'select', options: KINDS.map((k) => ({ value: k, label: t(`gp.kind.${k}` as MessageKey) })), init: c.kind, required: true },
    { name: 'mandate', label: t('gp.f.mandate'), kind: 'multiline', init: c.mandate },
    { name: 'meetingsPerYear', label: t('gp.f.meetingsPerYear'), kind: 'number', init: String(c.meetingsPerYear) },
    { name: 'quorumPct', label: t('gp.f.quorumPct'), kind: 'number', init: String(c.quorumPct) },
    { name: 'constitutedOn', label: t('gp.f.constitutedOn'), kind: 'date', init: c.constitutedOn ?? '' },
    { name: 'orderRef', label: t('gp.f.orderRef'), init: c.orderRef },
    { name: 'helpline', label: t('gp.f.helpline'), init: c.helpline },
    { name: 'email', label: t('gp.f.email'), init: c.email },
    { name: 'public', label: t('gp.f.public'), kind: 'select', options: yesNo, init: c.public ? 'yes' : 'no' },
  ];
  const memberFields: Field[] = [
    { name: 'userId', label: t('gp.f.person'), kind: 'select', options: [{ value: '', label: t('gp.f.personNone') }, ...people.map((p) => ({ value: p.id, label: p.name }))] },
    { name: 'rollNo', label: t('gp.f.rollNo') },
    { name: 'name', label: t('gp.f.outsideName') },
    { name: 'role', label: t('gp.f.role'), kind: 'select', options: MEMBER_ROLES.map((r) => ({ value: r, label: t(`gp.role.${r}` as MessageKey) })), init: 'member', required: true },
    { name: 'category', label: t('gp.f.category'), kind: 'select', options: MEMBER_CATEGORIES.map((r) => ({ value: r, label: t(`gp.cat.${r}` as MessageKey) })), init: 'internal', required: true },
    { name: 'gender', label: t('gp.f.gender'), kind: 'select', options: [{ value: '', label: t('gp.g.fromProfile') }, ...(['female', 'male', 'other'] as const).map((g) => ({ value: g, label: t(`gp.g.${g}` as MessageKey) }))] },
    { name: 'designation', label: t('gp.f.designation') },
    { name: 'phone', label: t('gp.f.phone') },
    { name: 'contactPublic', label: t('gp.f.contactPublic'), kind: 'select', options: yesNo, init: 'no' },
    { name: 'tenureStart', label: t('gp.f.tenureStart'), kind: 'date', init: today, required: true },
    { name: 'tenureEnd', label: t('gp.f.tenureEnd'), kind: 'date' },
  ];
  const meetingFields: Field[] = [
    { name: 'title', label: t('gp.f.meetingTitle'), required: true },
    { name: 'meetingOn', label: t('gp.f.meetingOn'), kind: 'date', required: true },
    { name: 'startsAt', label: t('gp.f.startsAt'), kind: 'time' },
    { name: 'venue', label: t('gp.f.venue') },
    { name: 'agenda', label: t('gp.f.agendaLines'), kind: 'multiline' },
  ];
  const current = c.members.filter((m) => m.current);
  const past = c.members.filter((m) => !m.current);
  return (
    <>
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="m-0 text-[15px] font-semibold">{t('gp.d.profile')}</h2>
            {c.canManage && (
              <Button size="small" startIcon={<Pencil className="size-3.5" />} onClick={() => setOpen('profile')} data-testid="gov-edit-profile">
                {t('gp.d.edit')}
              </Button>
            )}
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">{t('gp.f.kind')}</dt>
            <dd className="m-0">{t(`gp.kind.${c.kind}` as MessageKey)}</dd>
            <dt className="text-muted-foreground">{t('gp.f.meetingsPerYear')}</dt>
            <dd className="m-0">{fmt.number(c.meetingsPerYear)}</dd>
            <dt className="text-muted-foreground">{t('gp.f.quorumPct')}</dt>
            <dd className="m-0">{fmt.number(c.quorumPct)}%</dd>
            <dt className="text-muted-foreground">{t('gp.f.constitutedOn')}</dt>
            <dd className="m-0">{c.constitutedOn ? fmt.date(c.constitutedOn, 'short') : '-'}</dd>
            <dt className="text-muted-foreground">{t('gp.f.orderRef')}</dt>
            <dd className="m-0 break-words">{c.orderRef || '-'}</dd>
            <dt className="text-muted-foreground">{t('gp.f.helpline')}</dt>
            <dd className="m-0 break-words">{[c.helpline, c.email].filter(Boolean).join(' · ') || '-'}</dd>
            <dt className="text-muted-foreground">{t('gp.f.public')}</dt>
            <dd className="m-0">{c.public ? t('common.yes') : t('common.no')}</dd>
          </dl>
          {c.mandate && <p className="mt-2 mb-0 text-[13px] text-muted-foreground">{c.mandate}</p>}
        </Card>
        <Card>
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.d.composition')}</h2>
          {issues.length === 0 ? (
            <p className="m-0 text-[13px] text-green-ink" data-testid="gov-composition-ok">{t('gp.c.compositionOk')}</p>
          ) : (
            <ul className="m-0 list-disc pl-5 text-[13px]" data-testid="gov-issues">
              {issues.map((i, n) => (
                <li key={n} className="mb-1">{issueWords(t, i)}</li>
              ))}
            </ul>
          )}
          {c.rule && <p className="mt-3 mb-0 text-[12px] text-muted-foreground">{t(`gp.basis.${c.kind}` as MessageKey)}</p>}
        </Card>
        <Card>
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.d.year')}</h2>
          {c.compliance ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">{t('gp.col.meetings')}</dt>
              <dd className="m-0">{t('gp.c.meetingsOf', { held: c.compliance.meetingsHeld, expected: c.compliance.meetingsExpected, norm: c.compliance.meetingsNorm })}</dd>
              <dt className="text-muted-foreground">{t('gp.col.minutesPending')}</dt>
              <dd className="m-0">{fmt.number(c.compliance.minutesPending)}</dd>
              <dt className="text-muted-foreground">{t('gp.col.actions')}</dt>
              <dd className="m-0">{t('gp.c.actionsOverdue', { open: c.compliance.openActions, overdue: c.compliance.overdueActions })}</dd>
              <dt className="text-muted-foreground">{t('gp.d.women')}</dt>
              <dd className="m-0">{t('gp.d.womenOf', { women: c.compliance.women, members: c.compliance.members })}</dd>
            </dl>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t('gp.d.inactive')}</p>
          )}
        </Card>
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-semibold">{t('gp.d.members', { n: current.length })}</h2>
        {c.canManage && (
          <Button variant="contained" startIcon={<UserPlus className="size-4" />} onClick={() => setOpen('member')} data-testid="gov-add-member">
            {t('gp.d.addMember')}
          </Button>
        )}
      </div>
      <Grid<CommitteeMember>
        testId="gov-members"
        empty={t('gp.d.noMembers')}
        rows={current}
        cols={[
          { label: t('gp.col.name'), cell: (m) => <b className="font-[550]">{m.name}</b>, sort: (m) => m.name },
          { label: t('gp.f.role'), cell: (m) => t(`gp.role.${m.role}` as MessageKey), sort: (m) => m.role },
          { label: t('gp.f.category'), cell: (m) => t(`gp.cat.${m.category}` as MessageKey), sort: (m) => m.category },
          { label: t('gp.f.gender'), cell: (m) => (m.gender ? t(`gp.g.${m.gender}` as MessageKey) : '-'), sort: (m) => m.gender },
          { label: t('gp.f.designation'), cell: (m) => m.designation || '-' },
          { label: t('gp.f.tenureStart'), cell: (m) => fmt.date(m.tenureStart, 'short'), sort: (m) => m.tenureStart },
          { label: t('gp.f.tenureEnd'), cell: (m) => (m.tenureEnd ? fmt.date(m.tenureEnd, 'short') : '-'), sort: (m) => m.tenureEnd ?? '' },
          { label: '', cell: (m) => (c.canManage ? <ActionButton label={t('gp.d.endTenure')} run={() => endTenure(c.id, m.id, today)} onDone={(msg) => done(msg)} /> : null) },
        ]}
      />
      {past.length > 0 && <p className="text-[13px] text-muted-foreground">{t('gp.d.past', { names: past.map((m) => m.name).join(', ') })}</p>}

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-semibold">{t('gp.d.meetings')}</h2>
        {c.canManage && (
          <Button variant="contained" startIcon={<CalendarPlus className="size-4" />} onClick={() => setOpen('meeting')} data-testid="gov-schedule">
            {t('gp.d.schedule')}
          </Button>
        )}
      </div>
      <Grid<CommitteeDetail['meetings'][number]>
        testId="gov-meetings"
        empty={t('gp.d.noMeetings')}
        rows={c.meetings}
        cols={[
          { label: t('gp.f.meetingTitle'), cell: (m) => <Link href={`/governance/meetings/${m.id}`} className="font-[550]">{m.title}</Link>, sort: (m) => m.title },
          { label: t('gp.f.meetingOn'), cell: (m) => fmt.date(m.meetingOn, 'short'), sort: (m) => m.meetingOn },
          { label: t('gp.col.status'), cell: (m) => t(`gp.ms.${m.status}` as MessageKey), sort: (m) => m.status },
          { label: t('gp.col.present'), num: true, cell: (m) => fmt.number(m.present), sort: (m) => m.present },
          { label: t('gp.col.minutes'), cell: (m) => <StatusPill tone={minutesTone(m.minutesStatus)}>{t(`gp.mn.${m.minutesStatus}` as MessageKey)}</StatusPill>, sort: (m) => m.minutesStatus },
          { label: t('gp.col.actions'), num: true, cell: (m) => fmt.number(m.actions), sort: (m) => m.actions },
        ]}
      />

      {open === 'profile' && <FormDialog title={t('gp.d.edit')} fields={profileFields} onSubmit={(v) => saveProfile(c.id, v)} onClose={done} />}
      {open === 'member' && <FormDialog title={t('gp.d.addMember')} intro={<p className="m-0 text-[13px] text-muted-foreground">{t('gp.d.memberHint')}</p>} fields={memberFields} onSubmit={(v) => addMember(c.id, v)} onClose={done} />}
      {open === 'meeting' && <FormDialog title={t('gp.d.schedule')} intro={<p className="m-0 text-[13px] text-muted-foreground">{t('gp.d.agendaHint')}</p>} fields={meetingFields} onSubmit={(v) => scheduleMeeting(c.id, v)} onClose={done} />}
      {toastNode}
    </>
  );
}
