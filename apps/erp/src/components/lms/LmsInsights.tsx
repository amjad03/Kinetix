'use client';
import { useState } from 'react';
import { createPath, saveLmsSettings, setPathStatus } from '@/app/(dashboard)/courses/pass-actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { SectionTitle, StatGrid, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { SETTING_FLAGS, SETTING_NUMBERS, type Evidence, type LearningPath, type LmsOverview, type LmsSettings } from '@/lib/lms-pass';

import { Button } from '@/components/kx';

/** The institution's LMS at a glance. */
export function OverviewTab({ o }: { o: LmsOverview }) {
  const { t, fmt } = useI18n();
  const kinds = Object.entries(o.itemsByKind).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <StatGrid>
        <StatTile label={t('lp.ov.courses')} value={o.published} caption={t('lp.ov.ofCourses', { n: o.courses })} testId="ov-courses" />
        <StatTile label={t('lp.ov.active7')} value={o.active7} caption={t('lp.ov.active30', { n: o.active30 })} />
        <StatTile label={t('lp.ov.items')} value={o.items} caption={t('lp.ov.completions', { n: fmt.number(o.completions) })} />
        <StatTile label={t('lp.ov.attempts')} value={o.attempts} caption={t('lp.ov.quizzes', { n: o.quizzes })} />
        <StatTile label={t('lp.ov.flagged')} value={o.flagged} tone={o.flagged ? 'warning' : 'default'} />
        <StatTile label={t('lp.ov.live')} value={o.live} caption={t('lp.ov.joins', { n: o.liveJoins })} />
        <StatTile label={t('lp.ov.forum')} value={o.posts30} caption={t('lp.ov.reports', { n: o.openReports })} />
        <StatTile label={t('lp.ov.certificates')} value={o.certificates} caption={t('lp.ov.paths', { n: o.paths })} />
      </StatGrid>
      <SectionTitle>{t('lp.ov.byKind')}</SectionTitle>
      <Grid testId="ov-kinds" empty={t('lms.noModules')} rows={kinds} cols={[{ label: t('lms.fKind'), cell: ([k]) => t(`lms.kind.${k}` as MessageKey) }, { label: t('lp.ov.count'), cell: ([, n]) => n, num: true }]} />
    </>
  );
}

/** NAAC 2.3.2 and NBA evidence: teachers using the LMS, with the CSV for the upload. */
export function EvidenceTab({ e }: { e: Evidence }) {
  const { t } = useI18n();
  return (
    <>
      <StatGrid>
        <StatTile label={t('lp.ev.teachers')} value={e.teachers} />
        <StatTile label={t('lp.ev.using')} value={e.teachersUsingLms} />
        <StatTile label={t('lp.ev.pct')} value={`${e.pctTeachersUsingLms}%`} testId="ev-pct" />
      </StatGrid>
      <p className="text-sm text-muted-foreground mb-3">{t('lp.ev.intro')}</p>
      <Bar>
        <a className="text-sm" href="/api/download?kind=lms-evidence" data-testid="evidence-csv">{t('lp.ev.csv')}</a>
      </Bar>
      <Grid
        testId="evidence-table"
        exportName="naac-2.3.2"
        empty={t('lp.ev.empty')}
        rows={e.rows}
        cols={[
          { label: t('lp.ev.teacher'), cell: (r) => r.name, sort: (r) => r.name },
          { label: t('lp.ev.courses'), cell: (r) => `${r.published}/${r.courses}`, sort: (r) => r.published },
          { label: t('lp.ev.items'), cell: (r) => r.items, num: true },
          { label: t('lp.ev.pages'), cell: (r) => r.pages, num: true },
          { label: t('lp.ev.videos'), cell: (r) => r.videos, num: true },
          { label: t('lp.ev.quizzes'), cell: (r) => r.quizzes, num: true },
          { label: t('lp.ev.live'), cell: (r) => r.live, num: true },
          { label: t('lp.ev.learners'), cell: (r) => r.learners, num: true },
          { label: t('lp.ev.uses'), cell: (r) => <Pill label={r.usesLms ? t('lp.yes') : t('lp.no')} warn={!r.usesLms} />, sort: (r) => (r.usesLms ? 1 : 0) },
        ]}
      />
    </>
  );
}

/** Learning paths: courses in order, published to a programme. */
export function PathsTab({ paths, courses, canEdit }: { paths: LearningPath[]; courses: { id: string; title: string; section: string }[]; canEdit: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      {canEdit && (
        <Bar>
          <Button variant="contained" onClick={() => setOpen(true)} data-testid="new-path">{t('lp.path.new')}</Button>
        </Bar>
      )}
      <Grid
        testId="paths-table"
        empty={t('lp.path.empty')}
        rows={paths}
        cols={[
          { label: t('lp.path.title'), cell: (p) => p.title, sort: (p) => p.title },
          { label: t('lp.path.for'), cell: (p) => p.section ?? p.program ?? t('lp.path.everyone') },
          { label: t('lp.path.steps'), cell: (p) => p.steps.map((s, i) => `${i + 1}. ${s.title}${s.required ? '' : ` (${t('lp.path.optional')})`}`).join(' → '), wrap: true },
          { label: t('lp.path.status'), cell: (p) => <Pill label={t(`lp.path.${p.status}`)} warn={p.status === 'draft'} /> },
          { label: t('lp.path.certs'), cell: (p) => (p.certificate ? p.certificates : '-'), num: true },
          { label: '', cell: (p) => (canEdit ? <ActionButton label={p.status === 'published' ? t('lp.path.archive') : t('lp.path.publish')} run={() => setPathStatus(p.id, p.status === 'published' ? 'archived' : 'published')} onDone={toast} /> : null) },
        ]}
      />
      {open && (
        <FormDialog
          title={t('lp.path.new')}
          intro={<p className="text-sm text-muted-foreground">{t('lp.path.intro')}</p>}
          onSubmit={(v) => createPath(v, [v.c1, v.c2, v.c3].filter(Boolean))}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
          fields={[
            { name: 'title', label: t('lp.path.title'), required: true },
            { name: 'description', label: t('lms.fDesc'), kind: 'multiline' },
            ...[1, 2, 3].map((i) => ({ name: `c${i}`, label: t('lp.path.step', { n: i }), kind: 'select' as const, required: i === 1, options: courses.map((c) => ({ value: c.id, label: `${c.title} (${c.section})` })) })),
            { name: 'allRequired', label: t('lp.path.allRequired'), kind: 'select', init: 'no', options: [{ value: 'yes', label: t('lp.yes') }, { value: 'no', label: t('lp.no') }] },
            { name: 'certificate', label: t('lp.completion.certificate'), kind: 'select', init: 'yes', options: [{ value: 'yes', label: t('lp.yes') }, { value: 'no', label: t('lp.no') }] },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}

/** The institution's LMS rules (principal and administrator change them). */
export function SettingsTab({ s, canEdit }: { s: LmsSettings; canEdit: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ['forumModeration', t(`lp.set.mod.${s.forumModeration}`)],
    ...SETTING_NUMBERS.map((k) => [k, String(s[k])] as [string, string]),
    ...SETTING_FLAGS.map((k) => [k, s[k] ? t('lp.yes') : t('lp.no')] as [string, string]),
  ];
  return (
    <>
      {canEdit && (
        <Bar>
          <Button variant="contained" onClick={() => setOpen(true)} data-testid="edit-lms-settings">{t('lp.set.edit')}</Button>
        </Bar>
      )}
      <Grid testId="lms-settings" empty="" rows={rows} cols={[{ label: t('lp.set.rule'), cell: ([k]) => t(`lp.set.${k}` as MessageKey), wrap: true }, { label: t('lp.set.value'), cell: ([, v]) => v }]} />
      {open && (
        <FormDialog
          title={t('lp.set.edit')}
          onSubmit={saveLmsSettings}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
          fields={[
            { name: 'forumModeration', label: t('lp.set.forumModeration'), kind: 'select', init: s.forumModeration, options: ['open', 'hold_students'].map((v) => ({ value: v, label: t(`lp.set.mod.${v}` as MessageKey) })) },
            ...SETTING_NUMBERS.map((k) => ({ name: k, label: t(`lp.set.${k}` as MessageKey), kind: 'number' as const, init: String(s[k]) })),
            ...SETTING_FLAGS.map((k) => ({ name: k, label: t(`lp.set.${k}` as MessageKey), kind: 'select' as const, init: s[k] ? 'yes' : 'no', options: [{ value: 'yes', label: t('lp.yes') }, { value: 'no', label: t('lp.no') }] })),
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
