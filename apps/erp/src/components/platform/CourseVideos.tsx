'use client';
import { useEffect, useState, useTransition } from 'react';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { addVideo, deleteVideo, editVideo, getTopicVideos, importPlaylist, previewPlaylist, reorderVideos } from '@/app/(dashboard)/platform/concept-videos/actions';
import { useI18n } from '@/i18n/client';
import { filterChapters, formatDuration, importItems, initialChoices, isPlaylistLink, move, thumbnail, watchUrl, youtubeId, type ImportChoice } from '@/lib/concept-videos';
import type { ConceptVideo, PlatformCourseTree, PlaylistPreview, VideoLanguage } from '@/lib/types';
import { LANG_LABEL, VideoCountChip } from './VideoLibrary';

import { Alert, Button, ButtonBase, Card, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Snackbar, Switch, TextField, Tooltip } from '@/components/kx';
import { ArrowDown as ArrowDownward, ArrowUp as ArrowUpward, ChevronDown as ExpandMore, ChevronUp as ExpandLess, ExternalLink as OpenInNew, ListPlus as PlaylistAdd, Pencil as EditOutlined, Plus as Add, Search, Trash2 as DeleteOutlined } from 'lucide-react';
type Chapter = PlatformCourseTree['chapters'][number];
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];

function Thumb({ id, title, width = 120 }: { id: string; title: string; width?: number }) {
  const { t } = useI18n();
  return (
    <img className="aspect-[16/9] object-cover rounded-[8px] bg-accent shrink-0" style={{ width }}
      src={thumbnail(id)}
      alt={t('pv.thumbAlt', { title })}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function LanguageSelect({ value, onChange, testId }: { value: VideoLanguage; onChange: (l: VideoLanguage) => void; testId?: string }) {
  const { t } = useI18n();
  return (
    <FormField label={t('pv.language')}>
      <TextInput className="min-w-[140px]" select value={value} onChange={(e) => onChange(e.target.value as VideoLanguage)} slotProps={{ htmlInput: { 'data-testid': testId } }}>
        {LANGS.map((l) => (
          <MenuItem key={l} value={l}>
            {t(LANG_LABEL[l])}
          </MenuItem>
        ))}
      </TextInput>
    </FormField>
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
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <TextField className="flex-[1_1_280px] max-w-[420px]"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pv.search')}
          slotProps={{ htmlInput: { 'aria-label': t('pv.search') }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
        />
        <FormControlLabel control={<Switch checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />} label={t('pv.missingOnly')} />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground py-8 text-center">
          {t('pv.noResults')}
        </p>
      ) : (
        <div className="flex flex-col gap-4" data-testid="video-chapters">
          {shown.map((ch) => (
            <Card key={ch.id} data-testid="video-chapter">
              <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                <h2 className="text-base leading-6 tracking-[0.1px] font-medium flex-1 min-w-0">
                  {ch.title}
                </h2>
                <Button size="small" startIcon={<PlaylistAdd />} onClick={() => setImporting(ch)}>
                  {t('pv.importPlaylist')}
                </Button>
              </div>
              <ul className="list-none m-0 p-0 pb-2">
                {ch.topics.map((tp) => {
                  const expanded = open.has(tp.id);
                  return (
                    <li key={tp.id} id={`topic-${tp.id}`}>
                      <ButtonBase className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-accent"
                        onClick={() => toggle(tp.id)}
                        aria-expanded={expanded}
                        aria-label={t('pv.showVideos', { title: tp.title })}
                        data-testid="video-topic"
                      >
                        <p className="text-sm leading-[21px] flex-1 min-w-0">
                          {tp.title}
                        </p>
                        <VideoCountChip n={tp.videos} />
                        {expanded ? <ExpandLess className="text-muted-foreground" /> : <ExpandMore className="text-muted-foreground" />}
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
              </ul>
            </Card>
          ))}
        </div>
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
    return <div className="px-5 pb-4">{error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={20} />}</div>;
  }

  return (
    <div className="px-5 pb-4 pt-1" data-testid="topic-videos">
      {error && (
        <Alert className="mb-3" severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <ol className="flex flex-col gap-2 list-none m-0 p-0" aria-label={t('pv.topicVideos', { title: topicTitle })}>
        {videos.map((v, i) => (
          <li className="flex items-center gap-3 p-2 rounded-[12px] bg-muted" key={v.id} data-testid="topic-video">
            <Thumb id={v.youtubeVideoId} title={v.title} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] leading-[19px] font-medium">
                {v.title}
              </p>
              <div className="flex gap-2 items-center mt-1 flex-wrap">
                <Chip className="h-[22px]" size="small" label={t(LANG_LABEL[v.language])} />
                {v.durationSeconds ? (
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {formatDuration(v.durationSeconds)}
                  </span>
                ) : null}
                {v.channelTitle && (
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {v.channelTitle}
                  </span>
                )}
              </div>
            </div>
            <Tooltip title={t('pv.moveUp')}>
              <span>
                <IconButton size="small" disabled={i === 0 || pending} onClick={() => reorder(i, -1)} aria-label={t('pv.moveUp')}>
                  <ArrowUpward className="size-5" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('pv.moveDown')}>
              <span>
                <IconButton size="small" disabled={i === videos.length - 1 || pending} onClick={() => reorder(i, 1)} aria-label={t('pv.moveDown')}>
                  <ArrowDownward className="size-5" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('pv.open')}>
              <IconButton size="small" component="a" href={watchUrl(v.youtubeVideoId)} target="_blank" rel="noopener noreferrer" aria-label={t('pv.open')}>
                <OpenInNew className="size-5" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('pv.editVideo')}>
              <IconButton size="small" onClick={() => setEditing(v)} aria-label={t('pv.editVideo')}>
                <EditOutlined className="size-5" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('pv.remove')}>
              <IconButton size="small" onClick={() => setRemoving(v)} aria-label={t('pv.remove')}>
                <DeleteOutlined className="size-5" />
              </IconButton>
            </Tooltip>
          </li>
        ))}
      </ol>
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
            <p className="text-sm leading-[21px]">{t('pv.removeConfirm', { title: removing.title })}</p>
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
    </div>
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
    <form className="flex gap-3 flex-wrap items-start mt-3"
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
    >
      {id && <Thumb id={id} title={title || url} width={96} />}
      <FormField label={t('pv.link')}>
        <TextInput className="flex-[2_1_260px]"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={!!hint}
          helperText={hint ?? t('pv.linkHelp')}
          slotProps={{ htmlInput: { 'data-testid': 'video-link' } }}
        />
      </FormField>
      <FormField label={t('pv.titleOptional')}>
        <TextInput className="flex-[2_1_220px]" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      </FormField>
      <LanguageSelect value={language} onChange={setLanguage} />
      <Button type="submit" variant="contained" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : <Add />} disabled={!id || pending}>
        {t('pv.addVideo')}
      </Button>
      {error && (
        <Alert className="basis-full" severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </form>
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
        <div className="flex flex-col gap-4 pt-2">
          <Thumb id={video.youtubeVideoId} title={video.title} width={240} />
          <FormField label={t('pv.title')}>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </FormField>
          <LanguageSelect value={language} onChange={setLanguage} />
          {error && <Alert severity="error">{error}</Alert>}
        </div>
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
          <div className="flex flex-col gap-4">
            <FormRow component="form" className="gap-3"
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
            >
              <FormField label={t('pv.import.link')}>
                <TextInput className="flex-[1_1_320px]" value={url} onChange={(e) => setUrl(e.target.value)} />
              </FormField>
              <Button type="submit" variant="outlined" disabled={!url.trim() || pending}>
                {t('pv.import.find')}
              </Button>
            </FormRow>
            {error && <Alert severity="error">{error}</Alert>}
            {preview && preview.videos.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('pv.import.empty')}</p>}
            {preview && preview.videos.length > 0 && (
              <>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {t('pv.import.help')}
                </p>
                <LanguageSelect value={language} onChange={setLanguage} />
                <div className="flex flex-col gap-2" data-testid="import-rows">
                  {preview.videos.map((v) => {
                    const c = choices[v.youtubeVideoId];
                    const already = !!c?.topicId && v.alreadyOn.includes(c.topicId);
                    return (
                      <div className="flex items-center gap-3 flex-wrap" key={v.youtubeVideoId}>
                        <Checkbox checked={!!c?.include} onChange={(e) => set(v.youtubeVideoId, { include: e.target.checked })} slotProps={{ input: { 'aria-label': t('pv.import.include', { title: v.title }) } }} />
                        <Thumb id={v.youtubeVideoId} title={v.title} width={96} />
                        <div className="flex-[1_1_220px] min-w-0">
                          <p className="text-[13px] leading-[19px]">{v.title}</p>
                          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                            {formatDuration(v.durationSeconds)}
                            {already ? `${v.durationSeconds ? ' · ' : ''}${t('pv.import.already')}` : ''}
                          </span>
                        </div>
                        <FormField label={t('pv.import.topic')}>
                          <TextInput className="w-[260px]"
                            select
                            value={c?.topicId ?? ''}
                            onChange={(e) => set(v.youtubeVideoId, { topicId: e.target.value, include: !!e.target.value })}
                          >
                            <MenuItem value="">
                              <em>{t('pv.import.noTopic')}</em>
                            </MenuItem>
                            {preview.topics.map((tp) => (
                              <MenuItem key={tp.id} value={tp.id}>
                                {tp.title}
                              </MenuItem>
                            ))}
                          </TextInput>
                        </FormField>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
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
