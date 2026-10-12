'use client';
import { useState } from 'react';
import { addItem, addModule, announce, removeItem, removeModule, setStatus } from '@/app/(dashboard)/courses/actions';
import { ActionButton, Bar, FormDialog, Pill, useToast } from '@/components/ops/kit';
import { Card } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { LMS_KINDS, type LmsCourse } from '@/lib/lms';

import { Button } from '@/components/kx';
type Dialog = 'module' | 'announce' | { item: string };

export function CourseDesk({ course }: { course: LmsCourse }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const published = course.status === 'published';
  return (
    <>
      <Bar>
        <Pill label={t(`lms.status.${course.status}`)} warn={!published} />
        {course.canManage && (
          <>
            <ActionButton label={t(published ? 'lms.unpublish' : 'lms.publish')} run={() => setStatus(course.id, published ? 'draft' : 'published')} onDone={toast} />
            <Button variant="outlined" onClick={() => setDlg('module')} data-testid="add-module">{t('lms.addModule')}</Button>
            <Button variant="outlined" onClick={() => setDlg('announce')}>{t('lms.announce')}</Button>
          </>
        )}
      </Bar>
      {course.description && <p className="text-sm leading-[21px] mb-4">{course.description}</p>}
      {course.modules.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('lms.noModules')}</p>}
      {course.modules.map((m) => (
        <Card className="mb-4" key={m.id} testId="module">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px]">{m.title}</h2>
          {m.items.map((i) => (
            <div className="text-sm leading-[21px] flex gap-2 items-center py-1" key={i.id}>
              <Pill label={t(`lms.kind.${i.kind}`)} />
              {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
              {course.canManage && <ActionButton label={t('lms.remove')} tone="error" run={() => removeItem(course.id, i.id)} onDone={toast} />}
            </div>
          ))}
          {course.canManage && (
            <Bar>
              <Button size="small" onClick={() => setDlg({ item: m.id })}>{t('lms.addItem')}</Button>
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
      {dlg && typeof dlg === 'object' && (
        <FormDialog
          title={t('lms.addItem')}
          onSubmit={(v) => addItem(course.id, dlg.item, v)}
          onClose={done}
          fields={[
            { name: 'kind', label: t('lms.fKind'), kind: 'select', required: true, options: LMS_KINDS.map((k) => ({ value: k, label: t(`lms.kind.${k}`) })) },
            { name: 'title', label: t('lms.fTitle'), required: true },
            { name: 'refId', label: t('lms.fRef'), kind: 'uuid' },
            { name: 'url', label: t('lms.fUrl') },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
