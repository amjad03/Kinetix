'use client';

import Add from '@mui/icons-material/Add';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, useTransition } from 'react';
import { addTopic, deleteTopic, editTopic, getTopic, type TopicInput } from '@/app/(dashboard)/syllabus/actions';
import type { CourseOutline, Topic } from '@/lib/types';
import { ListEditor } from './ListEditor';

type Chapter = CourseOutline['chapters'][number];
type TopicRow = Chapter['topics'][number];

const ownChip = <Chip size="small" label="Your topic" sx={{ bgcolor: 'm3.tertiaryContainer', color: 'm3.onTertiaryContainer', height: 22 }} />;

/** A course's chapters and topics; the institution's own topics can be added, edited and deleted. */
export function CourseOutlineView({ course, canEdit }: { course: CourseOutline; canEdit: boolean }) {
  const [viewing, setViewing] = useState<TopicRow | null>(null);
  const [adding, setAdding] = useState<Chapter | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <Stack spacing={2} data-testid="chapters">
        {course.chapters.map((ch, i) => (
          <Card key={ch.id} data-testid="chapter">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, pt: 2, pb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 24, fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </Typography>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
                {ch.title}
              </Typography>
              {ch.own && ownChip}
              {canEdit && (
                <Button size="small" startIcon={<Add />} onClick={() => setAdding(ch)} aria-label={`Add a topic to ${ch.title}`}>
                  Add topic
                </Button>
              )}
            </Box>
            {ch.topics.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 2, pl: 7.5 }}>
                No topics yet.
              </Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pb: 1 }}>
                {ch.topics.map((t) => (
                  <li key={t.id}>
                    <ButtonBase
                      onClick={() => setViewing(t)}
                      data-testid="topic"
                      sx={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1.5, pl: 7.5, pr: 2, py: 1.25, '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body1">{t.title}</Typography>
                          {t.own && ownChip}
                        </Box>
                        {t.summary && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {t.summary}
                          </Typography>
                        )}
                      </Box>
                      <ChevronRight sx={{ color: 'text.secondary' }} />
                    </ButtonBase>
                  </li>
                ))}
              </Box>
            )}
          </Card>
        ))}
      </Stack>

      {viewing && <TopicDialog courseId={course.id} row={viewing} canEdit={canEdit} onClose={(msg) => (setViewing(null), msg && setToast(msg))} />}
      {adding && (
        <TopicForm
          title={`Add a topic to “${adding.title}”`}
          initial={{ title: '', summary: '', notes: [''], outcomes: [] }}
          submitLabel="Add topic"
          onSubmit={(input) => addTopic(course.id, adding.id, input)}
          onClose={(saved) => {
            setAdding(null);
            if (saved) setToast(`Added “${saved.title}”`);
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

/** Reads a topic's notes and outcomes; own topics can be edited or deleted from here. */
function TopicDialog({ courseId, row, canEdit, onClose }: { courseId: string; row: TopicRow; canEdit: boolean; onClose: (message?: string) => void }) {
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
        title="Edit topic"
        initial={{ title: topic.title, summary: topic.summary, notes: topic.notes, outcomes: topic.outcomes }}
        submitLabel="Save"
        onSubmit={(input) => editTopic(courseId, topic.id, input)}
        onClose={(saved) => (saved ? onClose(`Saved “${saved.title}”`) : setMode('view'))}
      />
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="topic-title" scroll="paper">
      <DialogTitle id="topic-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {row.title}
        {row.own && ownChip}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!topic && !error && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 4 }} />}
        {topic && mode === 'delete' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Delete “{topic.title}”? Teachers will no longer see it on the board, and KINETIX AI stops using it.
          </Alert>
        )}
        {topic && (
          <Box data-testid="topic-detail">
            {topic.chapter && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                {topic.chapter.title}
              </Typography>
            )}
            {topic.summary && <Typography variant="body1">{topic.summary}</Typography>}
            <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 0.5 }}>
              Notes
            </Typography>
            {topic.notes.length ? (
              <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 }, typography: 'body2' }}>
                {topic.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No notes.
              </Typography>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 0.5 }}>
              Learning outcomes
            </Typography>
            {topic.outcomes.length ? (
              <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 }, typography: 'body2' }}>
                {topic.outcomes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                None listed.
              </Typography>
            )}
            {!topic.own && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3 }}>
                From the KINETIX library. Library topics can&apos;t be edited; add your own topic to the chapter instead.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {topic?.own && canEdit && mode === 'view' && (
          <>
            <Button color="error" startIcon={<DeleteOutlined />} onClick={() => setMode('delete')} sx={{ mr: 'auto' }}>
              Delete
            </Button>
            <Button startIcon={<EditOutlined />} onClick={() => setMode('edit')}>
              Edit
            </Button>
          </>
        )}
        {mode === 'delete' && topic ? (
          <>
            <Button onClick={() => setMode('view')} disabled={pending}>
              Keep it
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteTopic(courseId, topic.id);
                  if (res.ok) onClose(`Deleted “${topic.title}”`);
                  else setError(res.error);
                })
              }
            >
              Delete topic
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => onClose()}>
            Close
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
  const [value, setValue] = useState<TopicInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TopicInput>(k: K, v: TopicInput[K]) => setValue((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="topic-form-title" scroll="paper">
      <Box
        component="form"
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
        sx={{ display: 'contents' }}
      >
        <DialogTitle id="topic-form-title">{title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Title" value={value.title} onChange={(e) => set('title', e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField
              label="Summary"
              value={value.summary}
              onChange={(e) => set('summary', e.target.value)}
              multiline
              minRows={2}
              helperText="One or two lines: what the topic covers."
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
            <ListEditor label="Notes" itemLabel="Note" items={value.notes} onChange={(v) => set('notes', v)} max={30} maxLength={1000} placeholder="A point teachers and KINETIX AI can use" />
            <ListEditor
              label="Learning outcomes"
              itemLabel="Outcome"
              items={value.outcomes}
              onChange={(v) => set('outcomes', v)}
              max={15}
              maxLength={500}
              placeholder="Students can…"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !value.title.trim()} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
