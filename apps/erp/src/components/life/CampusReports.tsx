'use client';

import { Grid, Pill } from '@/components/ops/kit';
import { StatGrid, StatTile } from '@/components/StatTile';
import { SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { EventRegisterRow, NaacLife, ParticipationRow, UnitHoursRow } from '@/lib/life';

/** The NAAC numbers for campus life (5.3, 3.4, 7.1), the event register, participation by class and unit hours. */
export function CampusReports({ naac, register, participation, hours }: { naac: NaacLife; register: EventRegisterRow[]; participation: ParticipationRow[]; hours: UnitHoursRow[] }) {
  const { t, fmt } = useI18n();
  return (
    <div className="flex flex-col gap-6" data-testid="lf-reports">
      <div>
        <SectionTitle>{t('lf.rep.naac', { year: naac.year })}</SectionTitle>
        <StatGrid min={150}>
          <StatTile label={t('lf.rep.m531')} value={naac.m531.awards} caption={t('lf.rep.m531c')} testId="lf-m531" />
          <StatTile label={t('lf.rep.m533')} value={naac.m533.events} caption={t('lf.rep.m533c')} />
          <StatTile label={t('lf.rep.m343')} value={naac.m343.programmes} caption={t('lf.rep.m343c')} />
          <StatTile label={t('lf.rep.m344')} value={naac.m344.students} caption={t('lf.rep.m344c', { n: fmt.number(naac.m344.reached) })} />
          <StatTile label={t('lf.rep.m711')} value={naac.m711.gender} caption={t('lf.rep.m711c', { n: naac.m711.sustainability })} />
        </StatGrid>
      </div>
      <div>
        <SectionTitle>{t('lf.rep.register')}</SectionTitle>
        <Grid
          testId="lf-event-register"
          exportName="event-register"
          empty={t('cl.noEvents')}
          rows={register}
          cols={[
            { label: t('lf.col.event'), cell: (r) => r.title },
            { label: t('lf.col.type'), cell: (r) => t(`cl.evType.${r.eventType}` as MessageKey), sort: (r) => r.eventType },
            { label: t('lf.col.date'), cell: (r) => fmt.date(r.startsAt.slice(0, 10), 'short'), sort: (r) => r.startsAt },
            { label: t('lf.col.registered'), cell: (r) => r.registered + r.external, num: true },
            { label: t('lf.col.attended'), cell: (r) => r.attended, num: true },
            { label: t('lf.col.budget'), cell: (r) => fmt.rupees(r.budgetPaise), num: true, sort: (r) => r.budgetPaise },
            { label: t('lf.col.spent'), cell: (r) => fmt.rupees(r.spentPaise), num: true, sort: (r) => r.spentPaise },
            { label: t('lf.col.fees'), cell: (r) => fmt.rupees(r.feesPaise), num: true, sort: (r) => r.feesPaise },
            { label: t('lf.col.report'), cell: (r) => (r.hasReport ? t('ops.yes') : r.status === 'cancelled' ? t('lf.rep.cancelled') : <Pill warn label={t('lf.rep.missing')} />), sort: (r) => (r.hasReport ? 1 : 0) },
            { label: t('lf.col.refundsDue'), cell: (r) => r.refundsDue, num: true },
          ]}
        />
      </div>
      <div>
        <SectionTitle>{t('lf.rep.participation')}</SectionTitle>
        <Grid
          testId="lf-participation"
          exportName="participation"
          empty={t('lf.rep.noStudents')}
          rows={participation}
          cols={[
            { label: t('lf.col.class'), cell: (r) => r.className },
            { label: t('lf.col.students'), cell: (r) => r.students, num: true },
            { label: t('lf.col.inClubs'), cell: (r) => r.inClubs, num: true },
            { label: t('lf.col.inUnits'), cell: (r) => r.inUnits, num: true },
            { label: t('lf.col.attendedEvents'), cell: (r) => r.attendedEvents, num: true },
            { label: t('lf.col.withAwards'), cell: (r) => r.withAchievements, num: true },
          ]}
        />
      </div>
      <div>
        <SectionTitle>{t('lf.rep.hours')}</SectionTitle>
        <Grid
          testId="lf-unit-hours"
          exportName="unit-hours"
          empty={t('lf.unit.noMembers')}
          rows={hours}
          cols={[
            { label: t('lf.col.unit'), cell: (r) => r.unit },
            { label: t('ops.f.student'), cell: (r) => `${r.fullName} (${r.rollNo})` },
            { label: t('lf.col.class'), cell: (r) => r.className },
            { label: t('lf.col.hours'), cell: (r) => fmt.number(r.hours), num: true, sort: (r) => r.hours },
            { label: t('lf.col.camps'), cell: (r) => r.camps, num: true },
            { label: t('lf.col.target'), cell: (r) => (r.complete === null ? '-' : <Pill warn={!r.complete} label={r.complete ? t('lf.unit.met') : t('lf.unit.short')} />), sort: (r) => (r.complete ? 1 : 0) },
          ]}
        />
      </div>
    </div>
  );
}
