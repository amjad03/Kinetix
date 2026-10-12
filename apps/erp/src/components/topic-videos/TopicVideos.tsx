'use client';
import { useState, useTransition } from 'react';
import { addVideo, getMine, removeVideo, reorderVideos, shareVideo } from '@/app/(dashboard)/topic-videos/actions';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { move, thumbnail, watchUrl, youtubeId } from '@/lib/concept-videos';
import { canRequestShare, countsByTopic, sourceLabel, splitByScope, statusLabel } from '@/lib/topic-videos';
import type { CourseOutline, ManagedVideo, TopicVideoCount, VideoLanguage } from '@/lib/types';
import { LANG_LABEL } from '@/components/platform/VideoLibrary';

import { Button, ButtonBase, Card, Checkbox, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Snackbar, TextField, Tooltip } from '@/components/kx';
import { ArrowDown as ArrowDownward, ArrowUp as ArrowUpward, ChevronDown as ExpandMore, ChevronUp as ExpandLess, ExternalLink as OpenInNew, Plus as Add, Search, Share as IosShare, Trash2 as DeleteOutlined } from 'lucide-react';
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];

function VideoRow({ v, canEdit, first, last, onMove, onRemove, onShare, busy }: { v: ManagedVideo; canEdit: boolean; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; onShare?: () => void; busy: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-3 items-center py-2 flex-wrap" data-testid="topic-video">
      <img className="w-[104px] aspect-[16/9] object-cover rounded-[8px] bg-accent" src={thumbnail(v.youtubeVideoId)} alt={t('tv.thumbAlt', { title: v.title })} loading="lazy" referrerPolicy="no-referrer" />
      <div className="flex-[1_1_220px] min-w-0">
        <p className="text-sm leading-[21px] font-medium">{v.title}</p>
        <div className="flex gap-1.5 flex-wrap items-center mt-1">
          <StatusPill tone="neutral">{t(sourceLabel(v.source))}</StatusPill>
          <StatusPill tone="info">{t(LANG_LABEL[v.language])}</StatusPill>
          {v.source === 'teacher' && <StatusPill tone={v.shareStatus === 'rejected' ? 'danger' : v.shareStatus === 'approved' ? 'success' : 'warning'}>{t(statusLabel(v.shareStatus))}</StatusPill>}
        </div>
        <p className="text-[13px] leading-[19px] text-muted-foreground mt-1">
          {v.source === 'teacher' ? [t('tv.addedBy', { name: v.createdByName ?? '' }), v.sections.length ? t('tv.forClasses', { classes: v.sections.map((s) => s.displayName).join(', ') }) : ''].filter(Boolean).join(' · ') : ''}
          {v.shareStatus === 'rejected' && v.reviewReason ? ` ${t('tv.reasonShown', { reason: v.reviewReason })}` : ''}
        </p>
      </div>
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
    </div>
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
        <div className="flex flex-col gap-4 pt-2">
          <FormField label={t('tv.link')}>
            <TextInput autoFocus value={url} onChange={(e) => setUrl(e.target.value)} helperText={url && !id ? t('tv.notALink') : t('tv.linkHelp')} error={!!url && !id} fullWidth />
          </FormField>
          {id && <img className="w-[160px] aspect-[16/9] rounded-[8px]" src={thumbnail(id)} alt="" referrerPolicy="no-referrer" />}
          <FormField label={t('tv.titleOptional')}>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 200 } }} />
          </FormField>
          <FormField label={t('tv.language')}>
            <TextInput select value={language} onChange={(e) => setLanguage(e.target.value as VideoLanguage)}>
              {LANGS.map((l) => (
                <MenuItem key={l} value={l}>
                  {t(LANG_LABEL[l])}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          {!admin && (
            <div>
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('tv.classes')}</h6>
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {classes.length ? t('tv.classesHelp') : t('tv.noClasses')}
              </p>
              {classes.map((c) => (
                <FormControlLabel key={c.id} control={<Checkbox checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />} label={c.displayName} />
              ))}
            </div>
          )}
          {error && (
            <p className="text-sm leading-[21px] text-red-ink" role="alert">
              {error}
            </p>
          )}
        </div>
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
      <TextField className="mb-4 w-full sm:w-[360px]" size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('tv.search')} slotProps={{ htmlInput: { 'aria-label': t('tv.search') }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
      {error && (
        <p className="text-sm leading-[21px] text-red-ink mb-2" role="alert">
          {error}
        </p>
      )}
      {chapters.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground py-8 text-center">
          {t('tv.noResults')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {chapters.map((ch) => (
            <Card key={ch.id}>
              <h2 className="text-base leading-6 tracking-[0.1px] font-medium px-5 pt-4 pb-2">
                {ch.title}
              </h2>
              {ch.topics.map((tp) => {
                const c = live[tp.id];
                const list = videos[tp.id];
                const split = splitByScope(list ?? []);
                return (
                  <div className="border-t border-border" key={tp.id} data-testid="topic-row">
                    <ButtonBase className="w-full px-5 py-3 justify-start gap-3 text-left" onClick={() => toggle(tp.id)} aria-expanded={open === tp.id}>
                      <p className="text-sm leading-[21px] flex-1">{tp.title}</p>
                      {!!c?.institution && <StatusPill tone="neutral">{t('tv.institutionCount', { count: c.institution })}</StatusPill>}
                      {admin && !!c?.teacher && <StatusPill tone="info">{t('tv.teacherCount', { count: c.teacher })}</StatusPill>}
                      {admin && !!c?.pending && <StatusPill tone="warning">{t('tv.pendingBadge', { count: c.pending })}</StatusPill>}
                      {open === tp.id ? <ExpandLess /> : <ExpandMore />}
                    </ButtonBase>
                    <Collapse in={open === tp.id} unmountOnExit>
                      <div className="px-5 pb-4">
                        {admin && (
                          <>
                            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('tv.yours')}</h6>
                            {split.institution.map((v, i) => (
                              <VideoRow key={v.id} v={v} canEdit first={i === 0} last={i === split.institution.length - 1} busy={pending} onMove={(d) => reorder(tp.id, 'institution', split.institution, i, d)} onRemove={() => remove(tp.id, v)} />
                            ))}
                          </>
                        )}
                        {!admin && <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('tv.mine')}</h6>}
                        {!admin && split.teacher.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('tv.noVideos')}</p>}
                        {admin && split.teacher.length > 0 && <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mt-2">{t('tv.teachers')}</h6>}
                        {split.teacher.map((v, i) => (
                          <VideoRow key={v.id} v={v} canEdit={!admin ? true : false} first={i === 0} last={i === split.teacher.length - 1} busy={pending} onMove={(d) => reorder(tp.id, 'teacher', split.teacher, i, d)} onRemove={() => remove(tp.id, v)} onShare={admin ? undefined : () => share(tp.id, v)} />
                        ))}
                        <Button className="mt-2" startIcon={<Add />} onClick={() => setAdding(tp.id)}>
                          {t('tv.addVideo')}
                        </Button>
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </Card>
          ))}
        </div>
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
