'use client';

import Add from '@mui/icons-material/Add';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PlaylistAdd from '@mui/icons-material/PlaylistAdd';
import Search from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState, useTransition } from 'react';
import { addVideo, deleteVideo, editVideo, getTopicVideos, importPlaylist, previewPlaylist, reorderVideos } from '@/app/(dashboard)/platform/concept-videos/actions';
import { useI18n } from '@/i18n/client';
import { filterChapters, formatDuration, importItems, initialChoices, isPlaylistLink, move, thumbnail, watchUrl, youtubeId, type ImportChoice } from '@/lib/concept-videos';
import type { ConceptVideo, PlatformCourseTree, PlaylistPreview, VideoLanguage } from '@/lib/types';
import { LANG_LABEL, VideoCountChip } from './VideoLibrary';

type Chapter = PlatformCourseTree['chapters'][number];
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];

function Thumb({ id, title, width = 120 }: { id: string; title: string; width?: number }) {
  const { t } = useI18n();
  return (
    <Box
      component="img"
      src={thumbnail(id)}
      alt={t('pv.thumbAlt', { title })}
      loading="lazy"
      referrerPolicy="no-referrer"
      sx={{ width, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '8px', bgcolor: 'm3.surfaceContainerHighest', flexShrink: 0 }}
    />
  );
}

function LanguageSelect({ value, onChange, size = 'small', testId }: { value: VideoLanguage; onChange: (l: VideoLanguage) => void; size?: 'small' | 'medium'; testId?: string }) {
  const { t } = useI18n();
  return (
    <TextField select size={size} label={t('pv.language')} value={value} onChange={(e) => onChange(e.target.value as VideoLanguage)} sx={{ minWidth: 140 }} slotProps={{ htmlInput: { 'data-testid': testId } }}>
      {LANGS.map((l) => (
        <MenuItem key={l} value={l}>
          {t(LANG_LABEL[l])}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * A course's chapters and topics for the platform team: which topics lack videos, each topic's
 * videos (add from a link, reorder, edit, remove) and playlist import per chapter.
 */
export function CourseVideos({ course, playlistImport }: { course: PlatformCourseTree; playlistImport: boolean }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState<Chapter | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Opened from a search result (#topic-…): expand that topic.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.match(/^#topic-(.+)$/)?.[1];
      if (id) setOpen((s) => new Set(s).add(id));
    };
    const timer = setTimeout(fromHash, 0);
    window.addEventListener('hashchange', fromHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('hashchange', fromHash);
    };
  }, []);

  const withCounts = course.chapters.map((c) => ({ ...c, topics: c.topics.map((tp) => ({ ...tp, videos: counts[tp.id] ?? tp.videos })) }));
  const shown = filterChapters(withCounts, query, missingOnly);
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pv.search')}
          slotProps={{ htmlInput: { 'aria-label': t('pv.search') }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
          sx={{ flex: '1 1 280px', maxWidth: 420 }}
        />
        <FormControlLabel control={<Switch checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />} label={t('pv.missingOnly')} />
      </Box>
      {shown.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t('pv.noResults')}
        </Typography>
      ) : (
        <Stack spacing={2} data-testid="video-chapters">
          {shown.map((ch) => (
            <Card key={ch.id} data-testid="video-chapter">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, pt: 2, pb: 1 }}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
                  {ch.title}
                </Typography>
                <Button size="small" startIcon={<PlaylistAdd />} onClick={() => setImporting(ch)}>
                  {t('pv.importPlaylist')}
                </Button>
              </Box>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pb: 1 }}>
                {ch.topics.map((tp) => {
                  const expanded = open.has(tp.id);
                  return (
                    <li key={tp.id} id={`topic-${tp.id}`}>
                      <ButtonBase
                        onClick={() => toggle(tp.id)}
                        aria-expanded={expanded}
                        aria-label={t('pv.showVideos', { title: tp.title })}
                        data-testid="video-topic"
                        sx={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <Typography variant="body1" sx={{ flex: 1, minWidth: 0 }}>
                          {tp.title}
                        </Typography>
                        <VideoCountChip n={tp.videos} />
                        {expanded ? <ExpandLess sx={{ color: 'text.secondary' }} /> : <ExpandMore sx={{ color: 'text.secondary' }} />}
                      </ButtonBase>
                      <Collapse in={expanded} unmountOnExit>
                        <TopicVideos
                          topicId={tp.id}
                          topicTitle={tp.title}
                          courseId={course.id}
                          defaultLanguage={course.language}
                          onCount={(n) => setCounts((c) => ({ ...c, [tp.id]: n }))}
                          onToast={setToast}
                        />
                      </Collapse>
                    </li>
                  );
                })}
              </Box>
            </Card>
          ))}
        </Stack>
      )}
      {importing && (
        <ImportDialog
          chapter={importing}
          courseId={course.id}
          defaultLanguage={course.language}
          available={playlistImport}
          onClose={(msg) => {
            setImporting(null);
            if (msg) {
              // Imported: the page reloads its counts; reopened topics load their videos again.
              setCounts({});
              setOpen(new Set());
              setToast(msg);
            }
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

/** One topic's videos in order, with the form to add one from a link. */
function TopicVideos({
  topicId,
  topicTitle,
  courseId,
  defaultLanguage,
  onCount,
  onToast,
}: {
  topicId: string;
  topicTitle: string;
  courseId: string;
  defaultLanguage: VideoLanguage;
  onCount: (n: number) => void;
  onToast: (m: string) => void;
}) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<ConceptVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConceptVideo | null>(null);
  const [removing, setRemoving] = useState<ConceptVideo | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getTopicVideos(topicId).then((res) => {
      if (!live) return;
      if (res.ok) setVideos(res.data.videos);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [topicId]);

  const update = (list: ConceptVideo[]) => {
    setVideos(list);
    onCount(list.length);
  };

  const reorder = (index: number, delta: number) => {
    if (!videos) return;
    const next = move(videos, index, delta);
    const before = videos;
    setVideos(next);
    start(async () => {
      const res = await reorderVideos(topicId, next.map((v) => v.id));
      if (res.ok) return setVideos(res.data);
      setVideos(before);
      setError(res.error);
    });
  };

  if (!videos) {
    return <Box sx={{ px: 2.5, pb: 2 }}>{error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={20} />}</Box>;
  }

  return (
    <Box sx={{ px: 2.5, pb: 2, pt: 0.5 }} data-testid="topic-videos">
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Stack spacing={1} component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label={t('pv.topicVideos', { title: topicTitle })}>
        {videos.map((v, i) => (
          <Box component="li" key={v.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: '12px', bgcolor: 'm3.surfaceContainerLow' }} data-testid="topic-video">
            <Thumb id={v.youtubeVideoId} title={v.title} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {v.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={t(LANG_LABEL[v.language])} sx={{ height: 22 }} />
                {v.durationSeconds ? (
                  <Typography variant="caption" color="text.secondary">
                    {formatDuration(v.durationSeconds)}
                  </Typography>
                ) : null}
                {v.channelTitle && (
                  <Typography variant="caption" color="text.secondary">
                    {v.channelTitle}
                  </Typography>
                )}
              </Box>
            </Box>
            <Tooltip title={t('pv.moveUp')}>
              <span>
                <IconButton size="small" disabled={i === 0 || pending} onClick={() => reorder(i, -1)} aria-label={t('pv.moveUp')}>
                  <ArrowUpward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('pv.moveDown')}>
              <span>
                <IconButton size="small" disabled={i === videos.length - 1 || pending} onClick={() => reorder(i, 1)} aria-label={t('pv.moveDown')}>
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('pv.open')}>
              <IconButton size="small" component="a" href={watchUrl(v.youtubeVideoId)} target="_blank" rel="noopener noreferrer" aria-label={t('pv.open')}>
                <OpenInNew fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('pv.editVideo')}>
              <IconButton size="small" onClick={() => setEditing(v)} aria-label={t('pv.editVideo')}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('pv.remove')}>
              <IconButton size="small" onClick={() => setRemoving(v)} aria-label={t('pv.remove')}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Stack>
      <AddVideoForm
        courseId={courseId}
        topicId={topicId}
        defaultLanguage={defaultLanguage}
        onAdded={(v) => {
          update([...videos, v]);
          onToast(t('pv.added', { title: v.title }));
        }}
      />
      {editing && (
        <EditVideoDialog
          video={editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) {
              update(videos.map((x) => (x.id === saved.id ? saved : x)));
              onToast(t('pv.saved', { title: saved.title }));
            }
          }}
        />
      )}
      {removing && (
        <Dialog open onClose={() => setRemoving(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('pv.remove')}</DialogTitle>
          <DialogContent>
            <Typography>{t('pv.removeConfirm', { title: removing.title })}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoving(null)}>{t('common.cancel')}</Button>
            <Button
              color="error"
              disabled={pending}
              data-testid="confirm-remove"
              onClick={() =>
                start(async () => {
                  const v = removing;
                  const res = await deleteVideo(courseId, v.id);
                  setRemoving(null);
                  if (!res.ok) return setError(res.error);
                  update(videos.filter((x) => x.id !== v.id));
                  onToast(t('pv.removed', { title: v.title }));
                })
              }
            >
              {t('pv.remove')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

function AddVideoForm({ courseId, topicId, defaultLanguage, onAdded }: { courseId: string; topicId: string; defaultLanguage: VideoLanguage; onAdded: (v: ConceptVideo) => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<VideoLanguage>(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = youtubeId(url);
  const hint = !url.trim() || id ? null : isPlaylistLink(url) ? t('pv.isPlaylist') : t('pv.notALink');

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        start(async () => {
          const res = await addVideo(courseId, topicId, { url, language, title });
          if (!res.ok) return setError(res.error);
          setUrl('');
          setTitle('');
          setError(null);
          onAdded(res.data);
        });
      }}
      sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', mt: 1.5 }}
    >
      {id && <Thumb id={id} title={title || url} width={96} />}
      <TextField
        size="small"
        label={t('pv.link')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        error={!!hint}
        helperText={hint ?? t('pv.linkHelp')}
        sx={{ flex: '2 1 260px' }}
        slotProps={{ htmlInput: { 'data-testid': 'video-link' } }}
      />
      <TextField size="small" label={t('pv.titleOptional')} value={title} onChange={(e) => setTitle(e.target.value)} sx={{ flex: '2 1 220px' }} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <LanguageSelect value={language} onChange={setLanguage} />
      <Button type="submit" variant="contained" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : <Add />} disabled={!id || pending} sx={{ mt: 0.25 }}>
        {t('pv.addVideo')}
      </Button>
      {error && (
        <Alert severity="error" sx={{ flexBasis: '100%' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

function EditVideoDialog({ video, onClose }: { video: ConceptVideo; onClose: (saved?: ConceptVideo) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(video.title);
  const [language, setLanguage] = useState<VideoLanguage>(video.language);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{t('pv.editVideo')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Thumb id={video.youtubeVideoId} title={video.title} width={240} />
          <TextField label={t('pv.title')} value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <LanguageSelect value={language} onChange={setLanguage} size="medium" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={pending || !title.trim()}
          onClick={() =>
            start(async () => {
              const res = await editVideo(video.id, { title, language });
              if (res.ok) onClose(res.data);
              else setError(res.error);
            })
          }
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Playlist import: find the playlist's videos, check each one's topic, import. */
function ImportDialog({ chapter, courseId, defaultLanguage, available, onClose }: { chapter: Chapter; courseId: string; defaultLanguage: VideoLanguage; available: boolean; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<VideoLanguage>(defaultLanguage);
  const [preview, setPreview] = useState<PlaylistPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, ImportChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const items = preview ? importItems(preview, choices) : [];
  const set = (vid: string, c: Partial<ImportChoice>) => setChoices((all) => ({ ...all, [vid]: { ...all[vid], ...c } }));

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="md" fullWidth scroll="paper" aria-labelledby="import-title">
      <DialogTitle id="import-title">{t('pv.import.title', { chapter: chapter.title })}</DialogTitle>
      <DialogContent dividers>
        {!available ? (
          <Alert severity="info" data-testid="import-unavailable">
            {t('pv.import.unavailable')}
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await previewPlaylist(chapter.id, url);
                  if (!res.ok) return setError(res.error);
                  setError(null);
                  setPreview(res.data);
                  setChoices(initialChoices(res.data));
                });
              }}
              sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}
            >
              <TextField size="small" label={t('pv.import.link')} value={url} onChange={(e) => setUrl(e.target.value)} sx={{ flex: '1 1 320px' }} />
              <Button type="submit" variant="outlined" disabled={!url.trim() || pending} sx={{ mt: 0.25 }}>
                {t('pv.import.find')}
              </Button>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            {preview && preview.videos.length === 0 && <Typography color="text.secondary">{t('pv.import.empty')}</Typography>}
            {preview && preview.videos.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {t('pv.import.help')}
                </Typography>
                <LanguageSelect value={language} onChange={setLanguage} />
                <Stack spacing={1} data-testid="import-rows">
                  {preview.videos.map((v) => {
                    const c = choices[v.youtubeVideoId];
                    const already = !!c?.topicId && v.alreadyOn.includes(c.topicId);
                    return (
                      <Box key={v.youtubeVideoId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Checkbox checked={!!c?.include} onChange={(e) => set(v.youtubeVideoId, { include: e.target.checked })} slotProps={{ input: { 'aria-label': t('pv.import.include', { title: v.title }) } }} />
                        <Thumb id={v.youtubeVideoId} title={v.title} width={96} />
                        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                          <Typography variant="body2">{v.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDuration(v.durationSeconds)}
                            {already ? `${v.durationSeconds ? ' · ' : ''}${t('pv.import.already')}` : ''}
                          </Typography>
                        </Box>
                        <TextField
                          select
                          size="small"
                          label={t('pv.import.topic')}
                          value={c?.topicId ?? ''}
                          onChange={(e) => set(v.youtubeVideoId, { topicId: e.target.value, include: !!e.target.value })}
                          sx={{ width: 260 }}
                        >
                          <MenuItem value="">
                            <em>{t('pv.import.noTopic')}</em>
                          </MenuItem>
                          {preview.topics.map((tp) => (
                            <MenuItem key={tp.id} value={tp.id}>
                              {tp.title}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>
                    );
                  })}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.close')}
        </Button>
        {available && preview && (
          <Button
            variant="contained"
            disabled={pending || items.length === 0}
            onClick={() =>
              start(async () => {
                const res = await importPlaylist(courseId, { playlistId: preview.playlistId, chapterId: chapter.id, language, items });
                if (res.ok) onClose(t('pv.import.done', { added: res.data.added, skipped: res.data.skipped }));
                else setError(res.error);
              })
            }
          >
            {t.plural('pv.import.count', items.length)}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
