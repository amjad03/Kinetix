'use client';

import Add from '@mui/icons-material/Add';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import IosShare from '@mui/icons-material/IosShare';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
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
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addVideo, getMine, removeVideo, reorderVideos, shareVideo } from '@/app/(dashboard)/topic-videos/actions';
import { useI18n } from '@/i18n/client';
import { move, thumbnail, watchUrl, youtubeId } from '@/lib/concept-videos';
import { canRequestShare, countsByTopic, sourceLabel, splitByScope, statusLabel } from '@/lib/topic-videos';
import type { CourseOutline, ManagedVideo, TopicVideoCount, VideoLanguage } from '@/lib/types';
import { LANG_LABEL } from '@/components/platform/VideoLibrary';

const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];

function VideoRow({ v, canEdit, first, last, onMove, onRemove, onShare, busy }: { v: ManagedVideo; canEdit: boolean; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; onShare?: () => void; busy: boolean }) {
  const { t } = useI18n();
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1, flexWrap: 'wrap' }} data-testid="topic-video">
      <Box component="img" src={thumbnail(v.youtubeVideoId)} alt={t('tv.thumbAlt', { title: v.title })} loading="lazy" referrerPolicy="no-referrer" sx={{ width: 104, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '8px', bgcolor: 'm3.surfaceContainerHighest' }} />
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontWeight: 500 }}>{v.title}</Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mt: 0.5 }}>
          <Chip size="small" label={t(sourceLabel(v.source))} />
          <Chip size="small" variant="outlined" label={t(LANG_LABEL[v.language])} />
          {v.source === 'teacher' && <Chip size="small" variant="outlined" color={v.shareStatus === 'rejected' ? 'error' : v.shareStatus === 'approved' ? 'success' : 'default'} label={t(statusLabel(v.shareStatus))} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {v.source === 'teacher' ? [t('tv.addedBy', { name: v.createdByName ?? '' }), v.sections.length ? t('tv.forClasses', { classes: v.sections.map((s) => s.displayName).join(', ') }) : ''].filter(Boolean).join(' · ') : ''}
          {v.shareStatus === 'rejected' && v.reviewReason ? ` ${t('tv.reasonShown', { reason: v.reviewReason })}` : ''}
        </Typography>
      </Box>
      <Tooltip title={t('tv.open')}>
        <IconButton component="a" href={watchUrl(v.youtubeVideoId)} target="_blank" rel="noreferrer" aria-label={t('tv.open')}>
          <OpenInNew />
        </IconButton>
      </Tooltip>
      {canEdit && (
        <>
          <IconButton aria-label={t('tv.moveUp')} disabled={first || busy} onClick={() => onMove(-1)}>
            <ArrowUpward />
          </IconButton>
          <IconButton aria-label={t('tv.moveDown')} disabled={last || busy} onClick={() => onMove(1)}>
            <ArrowDownward />
          </IconButton>
        </>
      )}
      {onShare && canRequestShare(v) && (
        <Button size="small" startIcon={<IosShare />} disabled={busy} onClick={onShare}>
          {t('tv.share')}
        </Button>
      )}
      {canEdit && (
        <IconButton aria-label={t('tv.remove')} color="error" disabled={busy} onClick={onRemove}>
          <DeleteOutlined />
        </IconButton>
      )}
    </Box>
  );
}

function AddDialog({ open, admin, classes, defaultLanguage, onClose, onAdd }: { open: boolean; admin: boolean; classes: { id: string; displayName: string }[]; defaultLanguage: VideoLanguage; onClose: () => void; onAdd: (input: { url: string; language: VideoLanguage; title?: string; sectionIds?: string[] }) => Promise<string | null> }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<VideoLanguage>(defaultLanguage);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = youtubeId(url);
  const submit = () =>
    start(async () => {
      const err = await onAdd({ url, language, title: title.trim() || undefined, sectionIds: admin ? undefined : [...picked] });
      if (err) return setError(err);
      setUrl('');
      setTitle('');
      setPicked(new Set());
      setError(null);
      onClose();
    });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('tv.addVideo')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus label={t('tv.link')} value={url} onChange={(e) => setUrl(e.target.value)} helperText={url && !id ? t('tv.notALink') : t('tv.linkHelp')} error={!!url && !id} fullWidth />
          {id && <Box component="img" src={thumbnail(id)} alt="" referrerPolicy="no-referrer" sx={{ width: 160, aspectRatio: '16 / 9', borderRadius: '8px' }} />}
          <TextField label={t('tv.titleOptional')} value={title} onChange={(e) => setTitle(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField select label={t('tv.language')} value={language} onChange={(e) => setLanguage(e.target.value as VideoLanguage)}>
            {LANGS.map((l) => (
              <MenuItem key={l} value={l}>
                {t(LANG_LABEL[l])}
              </MenuItem>
            ))}
          </TextField>
          {!admin && (
            <Box>
              <Typography variant="subtitle2">{t('tv.classes')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {classes.length ? t('tv.classesHelp') : t('tv.noClasses')}
              </Typography>
              {classes.map((c) => (
                <FormControlLabel key={c.id} control={<Checkbox checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />} label={c.displayName} />
              ))}
            </Box>
          )}
          {error && (
            <Typography color="error" role="alert">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('tv.cancel')}</Button>
        <Button variant="contained" disabled={pending || !id || (!admin && picked.size === 0)} onClick={submit}>
          {t('tv.addVideo')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * A course's chapters and topics with the institution's own videos. The principal and admin add
 * and order the institution's videos and see teachers'; anyone else (a head of department) adds
 * videos for their own classes and asks for them to be shared.
 */
export function TopicVideos({ course, counts, admin, classes }: { course: CourseOutline; counts: TopicVideoCount[]; admin: boolean; classes: { id: string; displayName: string }[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [videos, setVideos] = useState<Record<string, ManagedVideo[]>>({});
  const [live, setLive] = useState<Record<string, TopicVideoCount>>(countsByTopic(counts));
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = (topicId: string, list: ManagedVideo[]) => {
    setVideos((m) => ({ ...m, [topicId]: list }));
    const s = splitByScope(list);
    setLive((c) => ({ ...c, [topicId]: { topicId, institution: s.institution.length, teacher: s.teacher.length, pending: list.filter((v) => v.shareStatus === 'pending').length } }));
  };
  const toggle = (topicId: string) => {
    if (open === topicId) return setOpen(null);
    setOpen(topicId);
    if (!videos[topicId]) start(async () => { const r = await getMine(topicId); if (r.ok) show(topicId, r.data); else setError(r.error); });
  };
  const q = query.trim().toLowerCase();
  const chapters = course.chapters.map((c) => ({ ...c, topics: c.topics.filter((tp) => !q || tp.title.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) })).filter((c) => c.topics.length > 0);
  const reorder = (topicId: string, scope: 'institution' | 'teacher', list: ManagedVideo[], from: number, dir: -1 | 1) =>
    start(async () => {
      const ids = move(list.map((v) => v.id), from, dir);
      const r = await reorderVideos(topicId, scope, ids);
      if (!r.ok) return setError(r.error);
      show(topicId, [...(videos[topicId] ?? []).filter((v) => v.source !== scope), ...r.data]);
    });
  const remove = (topicId: string, v: ManagedVideo) =>
    start(async () => {
      if (!window.confirm(t('tv.removeConfirm', { title: v.title }))) return;
      const r = await removeVideo(v.id);
      if (!r.ok) return setError(r.error);
      show(topicId, (videos[topicId] ?? []).filter((x) => x.id !== v.id));
      setToast(t('tv.removed', { title: v.title }));
    });
  const share = (topicId: string, v: ManagedVideo) =>
    start(async () => {
      const r = await shareVideo(v.id);
      if (!r.ok) return setError(r.error);
      show(topicId, (videos[topicId] ?? []).map((x) => (x.id === v.id ? r.data : x)));
      setToast(t('tv.shareSent'));
    });

  return (
    <>
      <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('tv.search')} slotProps={{ htmlInput: { 'aria-label': t('tv.search') }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} sx={{ mb: 2, width: { xs: '100%', sm: 360 } }} />
      {error && (
        <Typography color="error" role="alert" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}
      {chapters.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t('tv.noResults')}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {chapters.map((ch) => (
            <Card key={ch.id}>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 500, px: 2.5, pt: 2, pb: 1 }}>
                {ch.title}
              </Typography>
              {ch.topics.map((tp) => {
                const c = live[tp.id];
                const list = videos[tp.id];
                const split = splitByScope(list ?? []);
                return (
                  <Box key={tp.id} sx={{ borderTop: 1, borderColor: 'divider' }} data-testid="topic-row">
                    <ButtonBase onClick={() => toggle(tp.id)} aria-expanded={open === tp.id} sx={{ width: '100%', px: 2.5, py: 1.5, justifyContent: 'flex-start', gap: 1.5, textAlign: 'left' }}>
                      <Typography sx={{ flex: 1 }}>{tp.title}</Typography>
                      {!!c?.institution && <Chip size="small" label={t('tv.institutionCount', { count: c.institution })} />}
                      {admin && !!c?.teacher && <Chip size="small" variant="outlined" label={t('tv.teacherCount', { count: c.teacher })} />}
                      {admin && !!c?.pending && <Chip size="small" color="warning" label={t('tv.pendingBadge', { count: c.pending })} />}
                      {open === tp.id ? <ExpandLess /> : <ExpandMore />}
                    </ButtonBase>
                    <Collapse in={open === tp.id} unmountOnExit>
                      <Box sx={{ px: 2.5, pb: 2 }}>
                        {admin && (
                          <>
                            <Typography variant="subtitle2">{t('tv.yours')}</Typography>
                            {split.institution.map((v, i) => (
                              <VideoRow key={v.id} v={v} canEdit first={i === 0} last={i === split.institution.length - 1} busy={pending} onMove={(d) => reorder(tp.id, 'institution', split.institution, i, d)} onRemove={() => remove(tp.id, v)} />
                            ))}
                          </>
                        )}
                        {!admin && <Typography variant="subtitle2">{t('tv.mine')}</Typography>}
                        {!admin && split.teacher.length === 0 && <Typography color="text.secondary">{t('tv.noVideos')}</Typography>}
                        {admin && split.teacher.length > 0 && <Typography variant="subtitle2" sx={{ mt: 1 }}>{t('tv.teachers')}</Typography>}
                        {split.teacher.map((v, i) => (
                          <VideoRow key={v.id} v={v} canEdit={!admin ? true : false} first={i === 0} last={i === split.teacher.length - 1} busy={pending} onMove={(d) => reorder(tp.id, 'teacher', split.teacher, i, d)} onRemove={() => remove(tp.id, v)} onShare={admin ? undefined : () => share(tp.id, v)} />
                        ))}
                        <Button startIcon={<Add />} onClick={() => setAdding(tp.id)} sx={{ mt: 1 }}>
                          {t('tv.addVideo')}
                        </Button>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Card>
          ))}
        </Stack>
      )}
      <AddDialog
        key={adding ?? 'none'}
        open={!!adding}
        admin={admin}
        classes={classes}
        defaultLanguage="en"
        onClose={() => setAdding(null)}
        onAdd={async (input) => {
          const topicId = adding!;
          const r = await addVideo(course.id, topicId, { ...input, scope: admin ? 'institution' : 'teacher' });
          if (!r.ok) return r.error;
          show(topicId, [...(videos[topicId] ?? []), r.data]);
          setToast(t('tv.added', { title: r.data.title }));
          return null;
        }}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
