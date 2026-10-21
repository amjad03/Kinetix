import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxPrograms') };
}

/**
 * Programmes, their subjects by term, and the library course (units and topics) each subject uses.
 * Editing happens on the existing pages: Syllabus links subjects and edits topics, the timetable
 * and the import and setup pages add programmes and subjects.
 */
export default async function ProgramsPage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  if (structure.error !== undefined) return <ErrorState message={structure.error} />;
  const { programs, subjects, sections } = structure.data;
  return (
    <>
      <PageHeader
        title={t('nav.zxPrograms')}
        subtitle={t('zx.p.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/syllabus" variant="contained">
              {t('zx.p.topics')}
            </LinkButton>
            <LinkButton href="/timetable" variant="outlined">
              {t('nav.timetable')}
            </LinkButton>
          </div>
        }
      />
      {programs.length === 0 && <p className="text-sm text-muted-foreground">{t('zx.p.none')}</p>}
      <div className="grid gap-4" data-testid="zx-programs">
        {programs.map((p) => {
          const own = subjects.filter((s) => s.programId === p.id);
          const terms = [...new Set(own.map((s) => s.term))].sort((a, b) => a - b);
          return (
            <Card key={p.id} title={p.name} subtitle={t('zx.p.counts', { subjects: own.length, sections: sections.filter((s) => s.programId === p.id).length })} testId="zx-program">
              {terms.map((term) => (
                <div key={term} className="mb-3">
                  <p className="mb-1 text-[13px] font-semibold">{t('zx.term', { n: term })}</p>
                  <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                    {own
                      .filter((s) => s.term === term)
                      .map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1">
                            {s.code} · {s.name}
                          </span>
                          {s.courseId ? (
                            <>
                              <Link className="text-primary hover:underline" href={`/zynetix/library?subject=${s.id}`}>
                                {t('zx.p.content')}
                              </Link>
                              <Link className="text-primary hover:underline" href={`/syllabus/${s.courseId}`}>
                                {t('zx.p.topicsOne')}
                              </Link>
                            </>
                          ) : (
                            <StatusPill tone="warning">{t('zx.lib.notLinked')}</StatusPill>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </>
  );
}
