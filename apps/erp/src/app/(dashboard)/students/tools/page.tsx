import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { RosterTools, type ToolClass } from '@/components/students/RosterTools';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { canChangeLifecycle } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { RecordsPage } from '@/lib/records';
import { getI18n } from '@/i18n/server';

import { ArrowUpDown } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.tools') };
}

type ClassRow = { id: string; displayName: string; programId: string; programName: string; term: number; academicYearId: string; isCurrentYear: boolean; studentCount: number };

/** Every class of the current year (the classes list, page by page). */
async function currentClasses(): Promise<ToolClass[]> {
  const out: ToolClass[] = [];
  for (let page = 1; page < 50; page++) {
    const res = await api<RecordsPage<ClassRow>>(`/v1/records/classes?pageSize=200&page=${page}&sort=programme:asc`);
    for (const c of res.rows) if (c.isCurrentYear) out.push({ id: c.id, name: c.displayName, programId: c.programId, programName: c.programName, term: c.term, yearId: c.academicYearId, students: c.studentCount });
    if (page * res.pageSize >= res.total) break;
  }
  return out;
}

/** Roll numbers and sections: renumbering rules and reshuffles, with promotion one click away. */
export default async function StudentToolsPage() {
  const me = await requireSection('students');
  if (me && !canChangeLifecycle(me.roles)) redirect('/students');
  const { t } = await getI18n();
  const classes = await load(currentClasses);
  return (
    <>
      <PageHeader
        title={t('si.tab.tools')}
        subtitle={t('si.tools.subtitle')}
        actions={
          <LinkButton href="/students/promotion" variant="outlined" startIcon={<ArrowUpDown />}>
            {t('stu.promotion')}
          </LinkButton>
        }
      />
      <StudentsTabs current="tools" />
      {classes.error !== undefined ? <ErrorState message={classes.error} /> : <RosterTools classes={classes.data} />}
    </>
  );
}
