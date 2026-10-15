'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { linkSubject } from '@/app/(dashboard)/syllabus/actions';
import { DataTable } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Course, Curriculum, SubjectLink } from '@/lib/types';

import { CircularProgress, ListSubheader, MenuItem, Select, Snackbar } from '@/components/kx';
import { Unlink as LinkOff } from 'lucide-react';
const NONE = '';

/** Each of the institution's subjects, and the library course its class uses (the board's Books panel, ZYNETIX AI). */
export function SubjectLinks({ subjects, courses, curricula, canLink }: { subjects: SubjectLink[]; courses: Course[]; curricula: Curriculum[]; canLink: boolean }) {
  const { t } = useI18n();
  const [links, setLinks] = useState(() => new Map(subjects.map((s) => [s.id, s.courseId])));
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();
  const byId = new Map(courses.map((c) => [c.id, c]));

  const change = (s: SubjectLink, courseId: string | null) => {
    const before = links.get(s.id) ?? null;
    setLinks((m) => new Map(m).set(s.id, courseId));
    setBusy(s.id);
    start(async () => {
      const res = await linkSubject(s.id, courseId);
      setBusy(null);
      if (res.ok) setToast(courseId ? t('syl.nowUses', { name: s.name, course: byId.get(courseId)?.title ?? t('syl.theCourse') }) : t('syl.unlinked', { name: s.name }));
      else {
        setLinks((m) => new Map(m).set(s.id, before));
        setToast(res.error);
      }
    });
  };

  return (
    <>
      <DataTable
        testId="subject-links"
        label={t('syl.col.subject')}
        rows={subjects}
        rowId={(s) => s.id}
        exportName="subject-links"
        rowAttrs={() => ({ 'data-testid': 'subject-row' })}
        columns={[
          {
            id: 'subject',
            header: t('syl.col.subject'),
            rowHeader: true,
            sort: (s) => s.name,
            csv: (s) => `${s.name} (${s.code})`,
            cell: (s) => (
              <>
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{s.name}</h6>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {s.code}
                </span>
              </>
            ),
          },
          { id: 'classes', header: t('syl.col.classes'), sort: (s) => s.classes.join(', '), cell: (s) => (s.classes.length ? s.classes.join(', ') : <span className="text-muted-foreground">{t('syl.noClass')}</span>) },
          {
            id: 'course',
            header: t('syl.col.course'),
            width: '48%',
            sort: (s) => {
              const linked = links.get(s.id) ?? null;
              return (linked ? byId.get(linked)?.title : undefined) ?? '';
            },
            cell: (s) => {
              const linked = links.get(s.id) ?? null;
              const course = linked ? byId.get(linked) : undefined;
              return (
                <>
                  {canLink ? (
                      <div className="flex items-center gap-2">
                        <Select
                          size="small"
                          fullWidth
                          displayEmpty
                          value={linked ?? NONE}
                          onChange={(e) => change(s, e.target.value || null)}
                          disabled={busy === s.id}
                          inputProps={{ 'aria-label': t('syl.courseFor', { name: s.name }) }}
                          data-testid="subject-course"
                        >
                          <MenuItem value={NONE}>
                            <span className="text-muted-foreground inline-flex items-center gap-2">
                              <LinkOff className="size-5" /> {t('syl.notLinked')}
                            </span>
                          </MenuItem>
                          {curricula.flatMap((cur) => {
                            const list = courses.filter((c) => c.curriculumCode === cur.code);
                            return list.length
                              ? [
                                  <ListSubheader key={`h-${cur.code}`}>{cur.name}</ListSubheader>,
                                  ...list.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                      {c.title}
                                    </MenuItem>
                                  )),
                                ]
                              : [];
                          })}
                        </Select>
                        {busy === s.id && <CircularProgress size={18} aria-label={t('syl.saving')} />}
                      </div>
                    ) : course ? (
                      <Link className="text-[13px] leading-[19px] text-teal-ink" href={`/syllabus/${course.id}`}>
                        {course.title}
                      </Link>
                    ) : (
                      <p className="text-[13px] leading-[19px] text-muted-foreground">
                        {t('syl.notLinked')}
                      </p>
                    )}
                </>
              );
            },
          },
        ]}
      />
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}
