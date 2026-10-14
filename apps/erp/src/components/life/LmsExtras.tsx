'use client';

import { useState, useTransition } from 'react';
import { assignSlowLearners, classStudents, courseAnalytics, saveItemAccess, type CourseAnalytics } from '@/app/(dashboard)/courses/depth-actions';
import { useRead } from '@/components/campus-life/CampusLifeDesk';
import { Grid, InfoDialog, Pill } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, SectionTitle, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { LmsCourse, LmsItem } from '@/lib/lms';

/** The access rules shown on an item: its release date, what must be finished first, and a remedial audience. */
export function AccessBadges({ item, course }: { item: LmsItem; course: LmsCourse }) {
  const { t, fmt } = useI18n();
  const [now] = useState(() => Date.now());
  const pre = item.prerequisiteItemId ? course.modules.flatMap((m) => m.items).find((i) => i.id === item.prerequisiteItemId) : null;
  return (
    <>
      {item.releaseAt && <Pill label={t('ld.acc.from', { at: fmt.dateTime(item.releaseAt) })} warn={Date.parse(item.releaseAt) > now} />}
      {pre && <Pill label={t('ld.acc.after', { title: pre.title })} />}
      {item.audienceStudentIds?.length ? <Pill label={t('ld.acc.remedial', { n: item.audienceStudentIds.length })} /> : null}
    </>
  );
}

/** Sets when an item opens, what comes first, and who it is for (everyone, chosen students or the slow learners). */
export function ItemAccessDialog({ course, item, onClose }: { course: LmsCourse; item: LmsItem; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const roster = useRead(() => classStudents(course.sectionId));
  const [releaseAt, setReleaseAt] = useState(item.releaseAt ? toLocalInput(item.releaseAt) : '');
  const [pre, setPre] = useState(item.prerequisiteItemId ?? '');
  const [audience, setAudience] = useState<Set<string>>(new Set(item.audienceStudentIds ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const others = course.modules.flatMap((m) => m.items).filter((i) => i.id !== item.id);
  const save = () =>
    start(async () => {
      const at = releaseAt ? new Date(releaseAt) : null;
      if (at && Number.isNaN(at.getTime())) return setError(t('ops.err.field', { field: t('ld.acc.release') }));
      const r = await saveItemAccess(course.id, item.id, { releaseAt: at ? at.toISOString() : '', prerequisiteItemId: pre, audienceStudentIds: [...audience] });
      if (!r.ok) return setError(r.error);
      onClose(t('ops.saved'));
    });
  return (
    <InfoDialog title={`${t('ld.acc.title')} · ${item.title}`} onClose={() => onClose()}>
      <div className="flex flex-col gap-3">
        <TextInput label={t('ld.acc.release')} type="datetime-local" value={releaseAt} onChange={(e) => setReleaseAt(e.target.value)} />
        <SelectInput label={t('ld.acc.prerequisite')} value={pre} onChange={(e) => setPre(String(e.target.value))} options={others.map((i) => ({ value: i.id, label: i.title }))} empty={t('ld.acc.none')} />
        <SectionTitle>{t('ld.acc.audience')}</SectionTitle>
        <p className="m-0 text-[13px] text-muted-foreground">{t('ld.acc.audienceHelp')}</p>
        <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto" data-testid="ld-audience">
          {(roster.data?.rows ?? []).map((x) => (
            <CheckboxField
              key={x.id}
              label={`${x.rollNo} ${x.fullName}`}
              checked={audience.has(x.id)}
              onChange={(on) => {
                const n = new Set(audience);
                if (on) n.add(x.id);
                else n.delete(x.id);
                setAudience(n);
              }}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await assignSlowLearners(course.id, item.id);
              if (!r.ok) return setError(r.error);
              onClose(t('ld.acc.slowSet', { n: r.data.students }));
            })
          }
        >
          {t('ld.acc.slow')}
        </Button>
        <Button variant="outline" onClick={() => onClose()}>{t('common.cancel')}</Button>
        <Button disabled={busy} onClick={save} data-testid="ld-access-save">{t('rk.save')}</Button>
      </div>
    </InfoDialog>
  );
}

/** "2026-10-14T09:30" in the browser's zone, for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Learning analytics: who opens and finishes what, and how much each item is used. */
export function EngagementDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const d = useRead<CourseAnalytics>(() => courseAnalytics(courseId));
  return (
    <InfoDialog title={t('ld.eng.title')} onClose={onClose}>
      {d.error && <p className="text-sm text-red-ink">{d.error}</p>}
      <SectionTitle>{t('ld.eng.students')}</SectionTitle>
      <Grid
        testId="ld-engagement"
        exportName="engagement"
        empty={t('ld.hw.noStudents')}
        rows={d.data?.students ?? []}
        cols={[
          { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
          { label: t('ld.eng.opened'), cell: (r) => r.opened, num: true },
          { label: t('ld.eng.finished'), cell: (r) => r.completed, num: true },
          { label: t('ld.eng.engagement'), cell: (r) => <Pill warn={r.engagementPct < 30} label={`${r.engagementPct}%`} />, sort: (r) => r.engagementPct },
          { label: t('ld.eng.last'), cell: (r) => (r.lastActiveAt ? fmt.relative(r.lastActiveAt) : '-'), sort: (r) => r.lastActiveAt ?? '' },
        ]}
      />
      <SectionTitle>{t('ld.eng.items')}</SectionTitle>
      <Grid
        testId="ld-usage"
        exportName="material-usage"
        empty={t('lms.noModules')}
        rows={d.data?.items ?? []}
        cols={[
          { label: t('ld.eng.item'), cell: (r) => r.title, wrap: true },
          { label: t('ld.eng.module'), cell: (r) => r.module },
          { label: t('ld.eng.views'), cell: (r) => r.views, num: true },
          { label: t('ld.eng.reach'), cell: (r) => `${r.reachPct}%`, num: true, sort: (r) => r.reachPct },
          { label: t('ld.eng.finished'), cell: (r) => r.completed, num: true },
        ]}
      />
    </InfoDialog>
  );
}
