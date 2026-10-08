'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addItem, addModule, announce, removeItem, removeModule, setStatus } from '@/app/(dashboard)/courses/actions';
import { ActionButton, Bar, FormDialog, Pill, useToast } from '@/components/ops/kit';
import { Card } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { LMS_KINDS, type LmsCourse } from '@/lib/lms';

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
      {course.description && <Typography sx={{ mb: 2 }}>{course.description}</Typography>}
      {course.modules.length === 0 && <Typography color="text.secondary">{t('lms.noModules')}</Typography>}
      {course.modules.map((m) => (
        <Card key={m.id} sx={{ mb: 2 }} testId="module">
          <Typography variant="h6" component="h2">{m.title}</Typography>
          {m.items.map((i) => (
            <Typography key={i.id} component="div" sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.5 }}>
              <Pill label={t(`lms.kind.${i.kind}`)} />
              {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
              {course.canManage && <ActionButton label={t('lms.remove')} tone="error" run={() => removeItem(course.id, i.id)} onDone={toast} />}
            </Typography>
          ))}
          {course.canManage && (
            <Bar>
              <Button size="small" onClick={() => setDlg({ item: m.id })}>{t('lms.addItem')}</Button>
              <ActionButton label={t('lms.removeModule')} tone="error" run={() => removeModule(course.id, m.id)} onDone={toast} />
            </Bar>
          )}
        </Card>
      ))}
      <Typography variant="h6" component="h2" sx={{ mt: 3 }}>{t('lms.announcements')}</Typography>
      {course.announcements.length === 0 && <Typography color="text.secondary">{t('lms.noAnnouncements')}</Typography>}
      {course.announcements.map((a) => (
        <Typography key={a.id} component="div" sx={{ py: 0.5 }}>
          <strong>{a.title}</strong> <span style={{ opacity: 0.7 }}>{fmt.date(a.createdAt, 'short')}</span>
          <div>{a.body}</div>
        </Typography>
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
