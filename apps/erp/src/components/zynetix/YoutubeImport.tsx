'use client';
import { Download, Eye } from 'lucide-react';
import { useState, useTransition } from 'react';
import { importChannel, previewChannel, type Scope } from '@/app/(dashboard)/zynetix/actions';
import { Button, Checkbox } from '@/components/kx';
import { Card, CheckboxField, FormRow, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { VideoLanguage } from '@/lib/types';
import { importItems, initialMapping, looksLikeYoutubeSource, type MappingChoice, type YoutubePreview } from '@/lib/zynetix';

/**
 * Paste a YouTube channel (link, @handle or UC… id) or a playlist link, pick the courses whose
 * topics to match, see each video with its suggested topic, change the mapping and import the ticked ones.
 */
export function YoutubeImport({ scope, courses, initialCourseIds = [] }: { scope: Scope; courses: { id: string; label: string; group?: string }[]; initialCourseIds?: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string[]>(initialCourseIds.slice(0, 20));
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<YoutubePreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, MappingChoice>>({});
  const [language, setLanguage] = useState<VideoLanguage>('en');
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [busy, start] = useTransition();

  const look = () => {
    if (!looksLikeYoutubeSource(url)) return toast.error(t('zx.yt.badLink'));
    if (picked.length === 0) return toast.error(t('zx.yt.needCourse'));
    start(async () => {
      setResult(null);
      const res = await previewChannel(scope, url, picked);
      if (!res.ok) return toast.error(res.error);
      setPreview(res.data!);
      setMapping(initialMapping(res.data!));
    });
  };
  const items = preview ? importItems(preview, mapping) : [];
  const confirm = () =>
    start(async () => {
      const res = await importChannel(scope, { language, playlistId: preview?.source.kind === 'playlist' ? preview.source.id : undefined, items });
      if (!res.ok) return toast.error(res.error);
      setResult(res.data!);
      toast.success(t('zx.yt.done', { added: res.data!.added, skipped: res.data!.skipped }));
    });
  const setAll = (include: boolean) => setMapping((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, include: include && !!v.topicId }])));
  const shownCourses = courses.filter((c) => !filter.trim() || `${c.label} ${c.group ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 80);

  return (
    <div className="grid gap-4">
      <Card title={t('zx.yt.source')} subtitle={t('zx.yt.sourceHelp')}>
        <FormRow>
          <div className="min-w-[260px] flex-1">
            <TextInput label={t('zx.yt.link')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/@channel" slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'zx-yt-url' } }} />
          </div>
          <Button variant="contained" startIcon={<Eye />} disabled={busy} onClick={look} data-testid="zx-yt-preview">
            {t('zx.yt.preview')}
          </Button>
        </FormRow>
        <div className="mt-4">
          <p className="mb-1 text-[13px] font-semibold">{t('zx.yt.courses', { n: picked.length })}</p>
          <TextInput label={t('zx.yt.filterCourses')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border p-2" data-testid="zx-yt-courses">
            {shownCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('zx.yt.noCourses')}</p>
            ) : (
              shownCourses.map((c) => (
                <CheckboxField
                  key={c.id}
                  label={c.group ? `${c.label} · ${c.group}` : c.label}
                  checked={picked.includes(c.id)}
                  onChange={(on) => setPicked((p) => (on ? [...p, c.id].slice(-20) : p.filter((x) => x !== c.id)))}
                />
              ))
            )}
          </div>
        </div>
      </Card>

      {preview && (
        <Card
          testId="zx-yt-result"
          title={preview.source.title ?? preview.source.id}
          subtitle={t(preview.via === 'feed' ? 'zx.yt.viaFeed' : 'zx.yt.viaApi', { n: preview.videos.length })}
          action={<StatusPill tone="info">{t(preview.source.kind === 'playlist' ? 'zx.yt.playlist' : 'zx.yt.channel')}</StatusPill>}
        >
          {preview.videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('zx.yt.noVideos')}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Button size="small" variant="outlined" onClick={() => setAll(true)}>
                  {t('zx.yt.tickAll')}
                </Button>
                <Button size="small" onClick={() => setAll(false)}>
                  {t('zx.yt.untickAll')}
                </Button>
              </div>
              <ul className="m-0 grid list-none gap-2 p-0">
                {preview.videos.map((v) => {
                  const m = mapping[v.youtubeVideoId] ?? { topicId: '', include: false };
                  const already = !!m.topicId && v.alreadyOn.includes(m.topicId);
                  return (
                    <li key={v.youtubeVideoId} className="flex flex-wrap items-center gap-3 rounded-lg border p-2" data-testid="zx-yt-video">
                      <Checkbox
                        checked={m.include}
                        disabled={!m.topicId}
                        onChange={(_, on) => setMapping((x) => ({ ...x, [v.youtubeVideoId]: { ...m, include: on } }))}
                        inputProps={{ 'aria-label': t('zx.yt.include', { title: v.title }) }}
                      />
                      <div className="min-w-[200px] flex-1">
                        <p className="text-sm font-medium">{v.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.suggestedTopicId ? t('zx.yt.score', { n: v.score }) : t('zx.yt.noMatch')}
                          {already ? ` · ${t('zx.yt.already')}` : ''}
                        </p>
                      </div>
                      <div className="w-full sm:w-[320px]">
                        <SelectInput
                          label={t('zx.yt.topic')}
                          value={m.topicId}
                          empty={t('zx.yt.skip')}
                          onChange={(e) => setMapping((x) => ({ ...x, [v.youtubeVideoId]: { topicId: e.target.value, include: !!e.target.value } }))}
                          options={preview.topics.map((tp) => ({ value: tp.id, label: `${tp.title} · ${tp.chapter}` }))}
                          slotProps={{ htmlInput: { 'data-testid': 'zx-yt-topic' } }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <FormRow className="mt-4">
                <SelectInput label={t('zx.mat.language')} value={language} onChange={(e) => setLanguage(e.target.value as VideoLanguage)} options={(['en', 'hi', 'kn'] as const).map((l) => ({ value: l, label: t(`zx.lang.${l}`) }))} />
                <Button variant="contained" startIcon={<Download />} disabled={busy || items.length === 0} onClick={confirm} data-testid="zx-yt-import">
                  {t('zx.yt.import', { n: items.length })}
                </Button>
              </FormRow>
              {result && (
                <p className="mt-3 text-sm" role="status" data-testid="zx-yt-done">
                  {t('zx.yt.done', { added: result.added, skipped: result.skipped })}
                </p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
