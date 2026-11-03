import type { Metadata } from 'next';
import { HostelLinks } from '@/components/hostel/HostelLinks';
import { LhtDesk, type DeskTask } from '@/components/lht/LhtDesk';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatGrid, StatTile, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hsp.gate.title') };
}

interface OutNow {
  studentId: string;
  studentName: string;
  rollNo: string;
  place: string;
  outAt: string;
  passReason: string | null;
  expectedBackAt: string | null;
  overdue: boolean;
}

/**
 * The hostel gate: the guard scans a resident's QR (from the student app) as they go out or come in, and sees who is
 * out now and who is overdue. A move without the QR is entered by hand on the gate log, with the reason.
 */
export default async function HostelGatePage() {
  await requireSection('hostel');
  const { t, fmt } = await getI18n();
  const out = await load(() => api<OutNow[]>('/v1/hostel/gate/out-now'));
  const header = <PageHeader title={t('hsp.gate.title')} subtitle={t('hsp.gate.sub')} actions={<><LhtLinks module="hostel" here="home" /><HostelLinks here="gate" /></>} />;
  if (out.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={out.error} />
      </>
    );
  const rows = out.data;
  const overdue = rows.filter((r) => r.overdue).length;
  const direction = { out: t('hsp.dir.out'), in: t('hsp.dir.in') };
  const scan: DeskTask = {
    id: 'gate-scan',
    title: t('hsp.gate.scan'),
    hint: t('hsp.gate.scanHint'),
    path: '/v1/hostel/gate/scan',
    submit: t('hsp.gate.scanGo'),
    fields: [
      { name: 'code', label: t('hsp.gate.code'), type: 'text', required: true, hint: t('hsp.gate.codeHint') },
      { name: 'direction', label: t('hsp.gate.direction'), type: 'select', options: [{ value: 'out', label: direction.out }, { value: 'in', label: direction.in }], hint: t('hsp.gate.directionHint') },
      { name: 'gate', label: t('hsp.gate.gate'), type: 'text' },
    ],
    result: [
      { key: 'studentName', label: t('hsp.c.student') },
      { key: 'rollNo', label: t('hsp.c.rollNo') },
      { key: 'direction', label: t('hsp.gate.direction'), words: direction },
      { key: 'withPass', label: t('hsp.gate.withPass'), kind: 'yes' },
      { key: 'minutesLate', label: t('hsp.gate.minutesLate') },
    ],
  };

  return (
    <>
      {header}
      <StatGrid min={140}>
        <StatTile label={t('hsp.gate.outNow')} value={fmt.number(rows.length)} testId="hp-gate-out" />
        <StatTile label={t('hsp.gate.overdue')} value={fmt.number(overdue)} tone={overdue ? 'warning' : 'default'} caption={overdue ? t('hsp.gate.overdueHelp') : undefined} testId="hp-gate-overdue" />
        <StatTile label={t('hsp.gate.lateToday')} value={t('hsp.gate.see')} href="/hostel/records?view=hostel-late-entries&f.when=week" />
      </StatGrid>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid gap-5">
          <LhtDesk tasks={[scan]} />
          <Card title={t('hsp.gate.byHand')} testId="hp-gate-hand">
            <p className="mt-0 mb-3 text-sm text-muted-foreground">{t('hsp.gate.byHandHint')}</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/hostel/records?view=hostel-gate-log" variant="outlined">
                {t('hsp.gate.log')}
              </LinkButton>
              <LinkButton href="/hostel/records?view=hostel-gate-passes&f.status=requested" variant="outlined">
                {t('hsp.gate.passes')}
              </LinkButton>
            </div>
          </Card>
        </div>
        <Card title={t('hsp.gate.outNow')} subtitle={t('hsp.gate.outNowSub')} padded={false} testId="hp-gate-outnow">
          {rows.length === 0 ? (
            <p className="m-0 px-5 py-4 text-sm text-muted-foreground">{t('hsp.gate.allIn')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-[13px] text-muted-foreground">
                    <th className="px-5 py-2 font-medium">{t('hsp.c.student')}</th>
                    <th className="py-2 pr-3 font-medium">{t('hsp.c.place')}</th>
                    <th className="py-2 pr-3 font-medium">{t('hsp.c.wentOut')}</th>
                    <th className="py-2 pr-3 font-medium">{t('hsp.c.pass')}</th>
                    <th className="py-2 pr-5 font-medium">{t('hsp.c.backBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.studentId} className="border-b last:border-0">
                      <td className="px-5 py-2">
                        <span className="font-medium">{r.studentName}</span>
                        <span className="block text-[13px] text-muted-foreground">{r.rollNo}</span>
                      </td>
                      <td className="py-2 pr-3">{r.place}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmt.dateTime(r.outAt)}</td>
                      <td className="py-2 pr-3">{r.passReason ?? t('hsp.gate.local')}</td>
                      <td className="py-2 pr-5 whitespace-nowrap">
                        {r.expectedBackAt ? fmt.dateTime(r.expectedBackAt) : t('hsp.gate.byCurfew')}
                        {r.overdue && (
                          <span className="ml-2">
                            <StatusPill tone="danger">{t('hsp.gate.isOverdue')}</StatusPill>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
