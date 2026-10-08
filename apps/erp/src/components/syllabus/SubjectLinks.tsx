'use client';

import LinkOff from '@mui/icons-material/LinkOff';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { linkSubject } from '@/app/(dashboard)/syllabus/actions';
import { DataTable } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Course, Curriculum, SubjectLink } from '@/lib/types';

const NONE = '';

/** Each of the institution's subjects, and the library course its class uses (the board's Books panel, KINETIX AI). */
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
                <Typography variant="subtitle2">{s.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.code}
                </Typography>
              </>
            ),
          },
          { id: 'classes', header: t('syl.col.classes'), sort: (s) => s.classes.join(', '), cell: (s) => (s.classes.length ? s.classes.join(', ') : <Box component="span" sx={{ color: 'text.secondary' }}>{t('syl.noClass')}</Box>) },
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                            <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                              <LinkOff fontSize="small" /> {t('syl.notLinked')}
                            </Box>
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
                      </Box>
                    ) : course ? (
                      <Typography component={Link} href={`/syllabus/${course.id}`} variant="body2" sx={{ color: 'primary.main' }}>
                        {course.title}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('syl.notLinked')}
                      </Typography>
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
