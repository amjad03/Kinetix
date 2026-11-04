'use client';
import { useState } from 'react';
import { addModule, announce, removeItem, removeModule, setStatus } from '@/app/(dashboard)/courses/actions';
import { addPassItem, editItem, moveItem, saveCompletion } from '@/app/(dashboard)/courses/pass-actions';
import { ActionButton, Bar, FormDialog, Pill, useToast } from '@/components/ops/kit';
import { Card } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { LmsCourse, LmsItem } from '@/lib/lms';
import { COMPLETION_RULES, ITEM_KINDS, rulesFor, type ItemKind } from '@/lib/lms-pass';
import { AccessBadges, EngagementDialog, ItemAccessDialog } from '@/components/life/LmsExtras';

import { Button } from '@/components/kx';
type Dialog = 'module' | 'announce' | 'engagement' | 'completion' | { item: string } | { access: LmsItem } | { edit: LmsItem };

/** Content the course can link by id: quizzes of the class, SCORM and cmi5 packages, and the course's live classes. */
export interface CourseRefs { quizzes: { id: string; title: string }[]; packages: { id: string; title: string; version: string }[]; live: { id: string; title: string }[] }

export function CourseDesk({ course, refs }: { course: LmsCourse; refs: CourseRefs }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const published = course.status === 'published';
  const order = () => course.modules.map((m) => ({ id: m.id, itemIds: m.items.map((i) => i.id) }));
  const move = (moduleId: string, index: number, by: -1 | 1) => {
    const next = order();
    const m = next.find((x) => x.id === moduleId)!;
    const j = index + by;
    if (j < 0 || j >= m.itemIds.length) return Promise.resolve({ ok: true as const, data: null });
    [m.itemIds[index], m.itemIds[j]] = [m.itemIds[j], m.itemIds[index]];
    return moveItem(course.id, next);
  };
  const refOptions = [
    ...refs.quizzes.map((q) => ({ value: q.id, label: `${t('lms.kind.quiz')}: ${q.title}` })),
    ...refs.packages.map((p) => ({ value: p.id, label: `${p.version === 'cmi5' ? 'cmi5' : 'SCORM'}: ${p.title}` })),
    ...refs.live.map((l) => ({ value: l.id, label: `${t('lms.kind.live')}: ${l.title}` })),
  ];
  return (
    <>
      <Bar>
        <Pill label={t(`lms.status.${course.status}`)} warn={!published} />
        {course.canManage && (
          <>
            <ActionButton label={t(published ? 'lms.unpublish' : 'lms.publish')} run={() => setStatus(course.id, published ? 'draft' : 'published')} onDone={toast} />
            <Button variant="outlined" onClick={() => setDlg('module')} data-testid="add-module">{t('lms.addModule')}</Button>
            <Button variant="outlined" onClick={() => setDlg('announce')}>{t('lms.announce')}</Button>
            <Button variant="outlined" onClick={() => setDlg('engagement')} data-testid="course-engagement">{t('ld.eng.title')}</Button>
            <Button variant="outlined" onClick={() => setDlg('completion')} data-testid="course-completion">{t('lp.completion.title')}</Button>
          </>
        )}
      </Bar>
      <p className="text-sm leading-[21px] mb-4 text-muted-foreground" data-testid="completion-rule">
        {t('lp.completion.summary', { pct: course.completionPct ?? 100 })}
        {course.minGradePct !== null && course.minGradePct !== undefined ? ` ${t('lp.completion.grade', { pct: course.minGradePct })}` : ''}
        {course.certificate ? ` ${t('lp.completion.cert')}` : ''}
      </p>
      {course.description && <p className="text-sm leading-[21px] mb-4">{course.description}</p>}
      {course.modules.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('lms.noModules')}</p>}
      {course.modules.map((m) => (
        <Card className="mb-4" key={m.id} testId="module">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px]">{m.title}</h2>
          {m.items.map((i, idx) => (
            <div className="text-sm leading-[21px] flex flex-wrap gap-2 items-center py-1" key={i.id} data-testid="course-item">
              <Pill label={t(`lms.kind.${i.kind}`)} />
              <span className="min-w-0 break-words">{i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}</span>
              <span className="text-xs text-muted-foreground">{t(`lp.rule.${i.completionRule ?? 'view'}`)}{i.passPct ? ` ${i.passPct}%` : ''}</span>
              <AccessBadges item={i} course={course} />
              {course.canManage && (
                <span className="flex flex-wrap gap-1 ml-auto">
                  <ActionButton label="↑" run={() => move(m.id, idx, -1)} onDone={toast} disabled={idx === 0} />
                  <ActionButton label="↓" run={() => move(m.id, idx, 1)} onDone={toast} disabled={idx === m.items.length - 1} />
                  <Button size="small" onClick={() => setDlg({ edit: i })}>{t('lp.edit')}</Button>
                  <Button size="small" onClick={() => setDlg({ access: i })}>{t('ld.acc.title')}</Button>
                  <ActionButton label={t('lms.remove')} tone="error" run={() => removeItem(course.id, i.id)} onDone={toast} />
                </span>
              )}
            </div>
          ))}
          {course.canManage && (
            <Bar>
              <Button size="small" onClick={() => setDlg({ item: m.id })} data-testid="add-item">{t('lms.addItem')}</Button>
              <ActionButton label={t('lms.removeModule')} tone="error" run={() => removeModule(course.id, m.id)} onDone={toast} />
            </Bar>
          )}
        </Card>
      ))}
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6">{t('lms.announcements')}</h2>
      {course.announcements.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('lms.noAnnouncements')}</p>}
      {course.announcements.map((a) => (
        <div className="text-sm leading-[21px] py-1" key={a.id}>
          <strong>{a.title}</strong> <span style={{ opacity: 0.7 }}>{fmt.date(a.createdAt.slice(0, 10), 'short')}</span>
          <div>{a.body}</div>
        </div>
      ))}
      {dlg === 'module' && <FormDialog title={t('lms.addModule')} onSubmit={(v) => addModule(course.id, v)} onClose={done} fields={[{ name: 'title', label: t('lms.fTitle'), required: true }]} />}
      {dlg === 'announce' && <FormDialog title={t('lms.announce')} onSubmit={(v) => announce(course.id, v)} onClose={done} fields={[{ name: 'title', label: t('lms.fTitle'), required: true }, { name: 'body', label: t('lms.fBody'), kind: 'multiline' }]} />}
      {dlg === 'engagement' && <EngagementDialog courseId={course.id} onClose={() => setDlg(null)} />}
      {dlg === 'completion' && (
        <FormDialog
          title={t('lp.completion.title')}
          intro={<p className="text-sm text-muted-foreground">{t('lp.completion.intro')}</p>}
          onSubmit={(v) => saveCompletion(course.id, v)}
          onClose={done}
          fields={[
            { name: 'completionPct', label: t('lp.completion.pct'), kind: 'number', required: true, init: String(course.completionPct ?? 100) },
            { name: 'minGradePct', label: t('lp.completion.minGrade'), kind: 'number', init: course.minGradePct === null || course.minGradePct === undefined ? '' : String(course.minGradePct) },
            { name: 'certificate', label: t('lp.completion.certificate'), kind: 'select', required: true, init: course.certificate ? 'yes' : 'no', options: [{ value: 'yes', label: t('lp.yes') }, { value: 'no', label: t('lp.no') }] },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'access' in dlg && <ItemAccessDialog course={course} item={dlg.access} onClose={done} />}
      {dlg && typeof dlg === 'object' && 'edit' in dlg && (
        <FormDialog
          title={t('lp.edit')}
          onSubmit={(v) => editItem(course.id, dlg.edit.id, v)}
          onClose={done}
          fields={[
            { name: 'title', label: t('lms.fTitle'), required: true, init: dlg.edit.title },
            ...(dlg.edit.kind === 'page' ? [{ name: 'body', label: t('lp.fBody'), kind: 'multiline' as const, init: dlg.edit.body ?? '' }] : []),
            { name: 'completionRule', label: t('lp.fRule'), kind: 'select', required: true, init: dlg.edit.completionRule ?? 'view', options: rulesFor(dlg.edit.kind as ItemKind).map((r) => ({ value: r, label: t(`lp.rule.${r}`) })) },
            { name: 'passPct', label: t('lp.fPass'), kind: 'number', init: dlg.edit.passPct ? String(dlg.edit.passPct) : '' },
            { name: 'durationMin', label: t('lp.fMinutes'), kind: 'number', init: dlg.edit.durationMin ? String(dlg.edit.durationMin) : '' },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'item' in dlg && (
        <FormDialog
          title={t('lms.addItem')}
          intro={<p className="text-sm text-muted-foreground">{t('lp.addIntro')}</p>}
          onSubmit={(v) => addPassItem(course.id, dlg.item, { ...v, refId: v.refId || v.refUuid || '' })}
          onClose={done}
          fields={[
            { name: 'kind', label: t('lms.fKind'), kind: 'select', required: true, options: ITEM_KINDS.map((k) => ({ value: k, label: t(`lms.kind.${k}`) })) },
            { name: 'title', label: t('lms.fTitle'), required: true },
            { name: 'body', label: t('lp.fBody'), kind: 'multiline' },
            { name: 'url', label: t('lms.fUrl') },
            ...(refOptions.length ? [{ name: 'refId', label: t('lp.fLinked'), kind: 'select' as const, options: refOptions }] : []),
            { name: 'refUuid', label: t('lms.fRef'), kind: 'uuid' },
            { name: 'completionRule', label: t('lp.fRule'), kind: 'select', options: COMPLETION_RULES.map((r) => ({ value: r, label: t(`lp.rule.${r}`) })) },
            { name: 'passPct', label: t('lp.fPass'), kind: 'number' },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
