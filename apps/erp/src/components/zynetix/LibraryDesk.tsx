'use client';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, ExternalLink, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { addMaterial, deleteMaterial, editMaterial, getMaterials, getResources, reorderMaterials, reviewMaterial, setAudience, type Scope } from '@/app/(dashboard)/zynetix/actions';
import { Button, ButtonBase, Collapse, IconButton, InputAdornment, TextField, Tooltip } from '@/components/kx';
import { Card, CountBadge, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { bookRange, moveItem, toggleAudience, AUDIENCES, type MaterialInput, type TopicMaterial, type TopicResources } from '@/lib/zynetix';
import { cn } from '@/lib/utils';
import { AUDIENCE_LABEL, KIND_LABEL, MaterialDialog } from './MaterialDialog';

export interface TreeTopic {
  id: string;
  title: string;
  videos?: number;
  materials?: number;
  animations?: number;
}
export interface TreeChapter {
  id: string;
  title: string;
  topics: TreeTopic[];
}

/**
 * A subject's (or a global course's) chapters and topics: per topic its videos and the materials
 * (PDFs, book chapters and pages, syllabus, links, animations, 3D models, sims) with who sees them
 * (board, teacher, student, parent). Add, edit, reorder, remove and approve.
 */
export function LibraryDesk({ scope, chapters, videosHref, animations }: { scope: Scope; chapters: TreeChapter[]; videosHref: string | null; animations: { id: string; title: string }[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const needle = q.trim().toLowerCase();
  const shown = chapters
    .map((c) => ({ ...c, topics: needle && !c.title.toLowerCase().includes(needle) ? c.topics.filter((tp) => tp.title.toLowerCase().includes(needle)) : c.topics }))
    .filter((c) => c.topics.length > 0);
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <TextField
        className="mb-4 w-full max-w-[420px]"
        size="small"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('zx.lib.search')}
        slotProps={{ htmlInput: { 'aria-label': t('zx.lib.search') }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
      />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('zx.lib.noTopics')}</p>
      ) : (
        <div className="flex flex-col gap-4" data-testid="zx-library">
          {shown.map((ch) => (
            <Card key={ch.id} title={ch.title} padded={false} testId="zx-chapter">
              <ul className="m-0 list-none p-0 pb-2">
                {ch.topics.map((tp) => {
                  const expanded = open.has(tp.id);
                  return (
                    <li key={tp.id} id={`topic-${tp.id}`} data-testid="zx-topic">
                      <ButtonBase className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-accent" onClick={() => toggle(tp.id)} aria-expanded={expanded} data-testid="zx-topic-toggle">
                        <span className="min-w-0 flex-1 text-sm">{tp.title}</span>
                        {tp.videos !== undefined && <CountBadge count={tp.videos} tone="info" label={t('zx.lib.videos')} showZero />}
                        {tp.materials !== undefined && <CountBadge count={tp.materials} tone="neutral" label={t('zx.lib.materials')} showZero />}
                        {expanded ? <ChevronUp className="text-muted-foreground" /> : <ChevronDown className="text-muted-foreground" />}
                      </ButtonBase>
                      <Collapse in={expanded} unmountOnExit>
                        {expanded && <TopicPanel scope={scope} topicId={tp.id} videosHref={videosHref ? `${videosHref}#topic-${tp.id}` : null} animations={animations} />}
                      </Collapse>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function TopicPanel({ scope, topicId, videosHref, animations }: { scope: Scope; topicId: string; videosHref: string | null; animations: { id: string; title: string }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [materials, setMaterials] = useState<TopicMaterial[] | null>(null);
  const [videos, setVideos] = useState<TopicResources['videos'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TopicMaterial | 'new' | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let live = true;
    void Promise.all([getMaterials(scope, topicId), scope === 'institution' ? getResources(topicId) : Promise.resolve(null)]).then(([m, r]) => {
      if (!live) return;
      if (!m.ok) setError(m.error);
      else setMaterials(m.data!);
      if (r?.ok) setVideos(r.data!.videos);
    });
    return () => {
      live = false;
    };
  }, [scope, topicId]);

  const own = (m: TopicMaterial) => m.source === scope;
  const ownList = (materials ?? []).filter(own);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? t('error.generic'));
      else if (done) toast.success(done);
    });

  const save = (input: MaterialInput) =>
    start(async () => {
      const res = editing && editing !== 'new' ? await editMaterial(scope, editing.id, input) : await addMaterial(scope, topicId, input);
      if (!res.ok) return toast.error(res.error);
      setMaterials((l) => (editing && editing !== 'new' ? (l ?? []).map((x) => (x.id === res.data!.id ? res.data! : x)) : [...(l ?? []), res.data!]));
      setEditing(null);
      toast.success(t('zx.mat.saved'));
    });

  const move = (m: TopicMaterial, d: -1 | 1) => {
    const i = ownList.findIndex((x) => x.id === m.id);
    const next = moveItem(ownList, i, d);
    const prev = materials;
    setMaterials([...(materials ?? []).filter((x) => !own(x)), ...next]);
    run(async () => {
      const res = await reorderMaterials(scope, topicId, next.map((x) => x.id));
      if (!res.ok) setMaterials(prev);
      return res;
    });
  };

  const remove = (m: TopicMaterial) => {
    if (!window.confirm(t('zx.mat.confirmRemove', { title: m.title }))) return;
    run(async () => {
      const res = await deleteMaterial(scope, m.id);
      if (res.ok) setMaterials((l) => (l ?? []).filter((x) => x.id !== m.id));
      return res;
    }, t('zx.mat.removed'));
  };

  const audience = (m: TopicMaterial, a: (typeof AUDIENCES)[number]) => {
    const next = toggleAudience(m.audience, a);
    if (next.length === m.audience.length && next.every((x) => m.audience.includes(x))) return;
    run(async () => {
      const res = await setAudience(scope, m.id, next);
      if (res.ok) setMaterials((l) => (l ?? []).map((x) => (x.id === m.id ? res.data! : x)));
      return res;
    });
  };

  const review = (m: TopicMaterial, approve: boolean) => {
    const reason = approve ? undefined : (window.prompt(t('zx.mat.rejectWhy')) ?? '');
    if (!approve && !reason?.trim()) return;
    run(async () => {
      const res = await reviewMaterial(m.id, approve, reason);
      if (res.ok) setMaterials((l) => (l ?? []).map((x) => (x.id === m.id ? { ...x, status: approve ? 'approved' : 'rejected', reviewReason: reason ?? null } : x)));
      return res;
    }, t(approve ? 'zx.mat.approved' : 'zx.mat.rejected'));
  };

  if (error) return <p className="px-5 pb-3 text-sm text-red-ink">{error}</p>;
  if (!materials) return <p className="px-5 pb-3 text-sm text-muted-foreground">{t('zx.loading')}</p>;

  return (
    <div className="grid gap-4 border-t bg-muted/30 px-5 py-4" data-testid="zx-topic-panel">
      {scope === 'institution' && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold">{t('zx.lib.videos')}</h3>
            {videosHref && (
              <Link className="text-sm text-primary hover:underline" href={videosHref}>
                {t('zx.lib.manageVideos')}
              </Link>
            )}
          </div>
          {!videos || videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('zx.lib.noVideos')}</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0">
              {videos.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-sm" data-testid="zx-video">
                  <StatusPill tone="neutral">{t(`zx.src.${v.source}`)}</StatusPill>
                  <a className="min-w-0 flex-1 truncate hover:underline" href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`} target="_blank" rel="noreferrer">
                    {v.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold">{t('zx.lib.materials')}</h3>
          <Button size="small" variant="outlined" startIcon={<Plus />} onClick={() => setEditing('new')} data-testid="zx-add-material">
            {t('zx.mat.add')}
          </Button>
        </div>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('zx.lib.noMaterials')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {[...materials.filter((m) => !own(m)), ...ownList].map((m) => {
              const mine = own(m);
              const i = ownList.findIndex((x) => x.id === m.id);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5" data-testid="zx-material">
                  <StatusPill tone="info">{t(KIND_LABEL[m.kind])}</StatusPill>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-medium" data-testid="zx-material-title-text">
                      {m.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[m.kind === 'book' ? [m.author, bookRange(m)].filter(Boolean).join(' · ') : '', m.url ?? m.ref ?? ''].filter(Boolean).join(' · ')}
                    </p>
                    {m.status === 'rejected' && m.reviewReason && <p className="text-xs text-red-ink">{t('zx.mat.reason', { reason: m.reviewReason })}</p>}
                  </div>
                  {!mine && <StatusPill tone="neutral">{t('zx.src.platform')}</StatusPill>}
                  {m.status !== 'approved' && <StatusPill tone={m.status === 'pending' ? 'warning' : 'danger'} testId="zx-material-status">{t(`zx.status.${m.status}`)}</StatusPill>}
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('zx.mat.audience')}>
                    {AUDIENCES.map((a) => {
                      const on = m.audience.includes(a);
                      return (
                        <button
                          key={a}
                          type="button"
                          disabled={!mine || busy}
                          aria-pressed={on}
                          onClick={() => audience(m, a)}
                          data-testid={`zx-aud-${a}`}
                          className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground', !mine && 'cursor-default opacity-70')}
                        >
                          {t(AUDIENCE_LABEL[a])}
                        </button>
                      );
                    })}
                  </div>
                  {m.url && (
                    <Tooltip title={t('zx.open')}>
                      <IconButton size="small" component="a" href={m.url} target="_blank" rel="noreferrer" aria-label={t('zx.open')}>
                        <ExternalLink />
                      </IconButton>
                    </Tooltip>
                  )}
                  {mine && (
                    <>
                      {scope === 'institution' && m.status === 'pending' && (
                        <>
                          <IconButton size="small" aria-label={t('zx.mat.approve')} disabled={busy} onClick={() => review(m, true)} data-testid="zx-material-approve">
                            <Check />
                          </IconButton>
                          <IconButton size="small" aria-label={t('zx.mat.reject')} disabled={busy} onClick={() => review(m, false)}>
                            <X />
                          </IconButton>
                        </>
                      )}
                      <IconButton size="small" aria-label={t('zx.moveUp')} disabled={busy || i <= 0} onClick={() => move(m, -1)} data-testid="zx-material-up">
                        <ArrowUp />
                      </IconButton>
                      <IconButton size="small" aria-label={t('zx.moveDown')} disabled={busy || i >= ownList.length - 1} onClick={() => move(m, 1)}>
                        <ArrowDown />
                      </IconButton>
                      <IconButton size="small" aria-label={t('common.edit')} disabled={busy} onClick={() => setEditing(m)} data-testid="zx-material-edit">
                        <Pencil />
                      </IconButton>
                      <IconButton size="small" color="error" aria-label={t('zx.mat.remove')} disabled={busy} onClick={() => remove(m)} data-testid="zx-material-remove">
                        <Trash2 />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {editing && <MaterialDialog initial={editing === 'new' ? null : editing} animations={animations} busy={busy} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
