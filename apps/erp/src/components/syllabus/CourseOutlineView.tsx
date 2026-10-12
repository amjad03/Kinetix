'use client';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useEffect, useState, useTransition } from 'react';
import { addTopic, deleteTopic, editTopic, getTopic, type TopicInput } from '@/app/(dashboard)/syllabus/actions';
import type { CourseOutline, Topic } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import { ListEditor } from './ListEditor';

import { Alert, Button, ButtonBase, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar } from '@/components/kx';
import { ChevronRight, Pencil as EditOutlined, Plus as Add, Trash2 as DeleteOutlined } from 'lucide-react';
type Chapter = CourseOutline['chapters'][number];
type TopicRow = Chapter['topics'][number];

function OwnChip() {
  const { t } = useI18n();
  return <StatusPill tone="info">{t('syl.yourTopic')}</StatusPill>;
}
const ownChip = <OwnChip />;

/** A course's chapters and topics; the institution's own topics can be added, edited and deleted. */
export function CourseOutlineView({ course, canEdit }: { course: CourseOutline; canEdit: boolean }) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<TopicRow | null>(null);
  const [adding, setAdding] = useState<Chapter | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-col gap-4" data-testid="chapters">
        {course.chapters.map((ch, i) => (
          <Card key={ch.id} data-testid="chapter">
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <p className="text-[13px] leading-[19px] text-muted-foreground min-w-[24px] tabular-nums">
                {i + 1}
              </p>
              <h2 className="text-base leading-6 tracking-[0.1px] font-medium flex-1 min-w-0">
                {ch.title}
              </h2>
              {ch.own && ownChip}
              {canEdit && (
                <Button size="small" startIcon={<Add />} onClick={() => setAdding(ch)} aria-label={t('syl.addTopicTo', { title: ch.title })}>
                  {t('syl.addTopic')}
                </Button>
              )}
            </div>
            {ch.topics.length === 0 ? (
              <p className="text-[13px] leading-[19px] text-muted-foreground px-5 pb-4 pl-15">
                {t('syl.noTopics')}
              </p>
            ) : (
              <ul className="list-none m-0 p-0 pb-2">
                {ch.topics.map((tp) => (
                  <li key={tp.id}>
                    <ButtonBase className="w-full text-left flex items-center gap-3 pl-15 pr-4 py-2.5 hover:bg-accent"
                      onClick={() => setViewing(tp)}
                      data-testid="topic"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm leading-[21px]">{tp.title}</p>
                          {tp.own && ownChip}
                        </div>
                        {tp.summary && (
                          <p className="text-[13px] leading-[19px] text-muted-foreground mt-0.5">
                            {tp.summary}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="text-muted-foreground" />
                    </ButtonBase>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      {viewing && <TopicDialog courseId={course.id} row={viewing} canEdit={canEdit} onClose={(msg) => (setViewing(null), msg && setToast(msg))} />}
      {adding && (
        <TopicForm
          title={t('syl.addTopicTitle', { title: adding.title })}
          initial={{ title: '', summary: '', notes: [''], outcomes: [] }}
          submitLabel={t('syl.addTopic')}
          onSubmit={(input) => addTopic(course.id, adding.id, input)}
          onClose={(saved) => {
            setAdding(null);
            if (saved) setToast(t('syl.added', { title: saved.title }));
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

/** Reads a topic's notes and outcomes; own topics can be edited or deleted from here. */
function TopicDialog({ courseId, row, canEdit, onClose }: { courseId: string; row: TopicRow; canEdit: boolean; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getTopic(row.id).then((res) => {
      if (!live) return;
      if (res.ok) setTopic(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [row.id]);

  if (mode === 'edit' && topic) {
    return (
      <TopicForm
        title={t('syl.editTopic')}
        initial={{ title: topic.title, summary: topic.summary, notes: topic.notes, outcomes: topic.outcomes }}
        submitLabel={t('common.save')}
        onSubmit={(input) => editTopic(courseId, topic.id, input)}
        onClose={(saved) => (saved ? onClose(t('syl.saved', { title: saved.title })) : setMode('view'))}
      />
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="topic-title" scroll="paper">
      <DialogTitle className="flex items-center gap-2 flex-wrap" id="topic-title">
        {row.title}
        {row.own && ownChip}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!topic && !error && <CircularProgress className="block mx-auto my-8" size={24} />}
        {topic && mode === 'delete' && (
          <Alert className="mb-4" severity="warning">
            {t('syl.deleteConfirm', { title: topic.title })}
          </Alert>
        )}
        {topic && (
          <div data-testid="topic-detail">
            {topic.chapter && (
              <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mb-2">
                {topic.chapter.title}
              </p>
            )}
            {topic.summary && <p className="text-sm leading-[21px]">{topic.summary}</p>}
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mt-5 mb-1">
              {t('syl.notes')}
            </h6>
            {topic.notes.length ? (
              <ol className="m-0 pl-5 [&_li]:mb-1.5 text-[13px] leading-[19px]">
                {topic.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('syl.noNotes')}
              </p>
            )}
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mt-5 mb-1">
              {t('syl.outcomes')}
            </h6>
            {topic.outcomes.length ? (
              <ul className="m-0 pl-5 [&_li]:mb-1.5 text-[13px] leading-[19px]">
                {topic.outcomes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('syl.noOutcomes')}
              </p>
            )}
            {!topic.own && (
              <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-6">
                {t('syl.fromLibrary')}
              </p>
            )}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        {topic?.own && canEdit && mode === 'view' && (
          <>
            <Button className="mr-auto" color="error" startIcon={<DeleteOutlined />} onClick={() => setMode('delete')}>
              {t('common.delete')}
            </Button>
            <Button startIcon={<EditOutlined />} onClick={() => setMode('edit')}>
              {t('common.edit')}
            </Button>
          </>
        )}
        {mode === 'delete' && topic ? (
          <>
            <Button onClick={() => setMode('view')} disabled={pending}>
              {t('syl.keep')}
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteTopic(courseId, topic.id);
                  if (res.ok) onClose(t('syl.deleted', { title: topic.title }));
                  else setError(res.error);
                })
              }
            >
              {t('syl.deleteTopic')}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => onClose()}>
            {t('common.close')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function TopicForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: TopicInput;
  submitLabel: string;
  onSubmit: (input: TopicInput) => Promise<{ ok: true; data: Topic } | { ok: false; error: string }>;
  onClose: (saved?: Topic) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<TopicInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TopicInput>(k: K, v: TopicInput[K]) => setValue((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="topic-form-title" scroll="paper">
      <form className="contents"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await onSubmit(value);
            if (res.ok) onClose(res.data);
            else setError(res.error);
          });
        }}
      >
        <DialogTitle id="topic-form-title">{title}</DialogTitle>
        <DialogContent dividers>
          <div className="flex flex-col gap-5">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('syl.form.title')} required>
              <TextInput value={value.title} onChange={(e) => set('title', e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 200 } }} />
            </FormField>
            <FormField label={t('syl.form.summary')}>
              <TextInput
                value={value.summary}
                onChange={(e) => set('summary', e.target.value)}
                multiline
                minRows={2}
                helperText={t('syl.form.summaryHelp')}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
            </FormField>
            <ListEditor
              label={t('syl.notes')}
              itemLabel={t('syl.form.note')}
              addLabel={t('syl.form.addNote')}
              removeLabel={(n) => t('syl.form.remove', { item: t('syl.form.note'), n })}
              items={value.notes}
              onChange={(v) => set('notes', v)}
              max={30}
              maxLength={1000}
              placeholder={t('syl.form.notePlaceholder')}
            />
            <ListEditor
              label={t('syl.outcomes')}
              itemLabel={t('syl.form.outcome')}
              addLabel={t('syl.form.addOutcome')}
              removeLabel={(n) => t('syl.form.remove', { item: t('syl.form.outcome'), n })}
              items={value.outcomes}
              onChange={(v) => set('outcomes', v)}
              max={15}
              maxLength={500}
              placeholder={t('syl.form.outcomePlaceholder')}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !value.title.trim()} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
