'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { PlatformLibraryCurriculum, PlatformTopicHit, VideoLanguage } from '@/lib/types';

import { ButtonBase, Card, CardActionArea, FormControlLabel, InputAdornment, LinearProgress, Switch, TextField } from '@/components/kx';
import { ChevronRight, Search } from 'lucide-react';
export const LANG_LABEL: Record<VideoLanguage, MessageKey> = { en: 'pv.lang.en', hi: 'pv.lang.hi', kn: 'pv.lang.kn' };

/** Search box and "Only topics without videos", kept in the URL (?q=&missing=1). */
export function VideoSearch({ q, missingOnly }: { q: string; missingOnly: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const [pending, start] = useTransition();
  const go = (query: string, missing: boolean) => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (missing) p.set('missing', '1');
    start(() => router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false }));
  };
  return (
    <form className="flex items-center gap-4 flex-wrap mb-2"
      role="search"
      onSubmit={(e) => (e.preventDefault(), go(text, missingOnly))}
    >
      <TextField className="flex-[1_1_320px] max-w-[480px]"
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('pv.search')}
        slotProps={{ htmlInput: { 'aria-label': t('pv.search'), 'data-testid': 'video-search' }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
      />
      <FormControlLabel control={<Switch checked={missingOnly} onChange={(e) => go(text, e.target.checked)} data-testid="missing-only" />} label={t('pv.missingOnly')} />
      {pending && <LinearProgress className="basis-full h-[2px]" />}
    </form>
  );
}

/** Courses as cards with how many of their topics have videos. */
export function CourseCoverageList({ courses }: { courses: PlatformLibraryCurriculum['courses'] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]" data-testid="video-courses">
      {courses.map((c) => {
        const pct = c.topics ? Math.round((c.topicsWithVideos / c.topics) * 100) : 0;
        return (
          <Card key={c.id} data-testid="video-course">
            <CardActionArea className="p-5 h-full flex flex-col items-stretch gap-2" component={Link} href={`/platform/concept-videos/${c.id}`}>
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                {t('pv.term', { n: c.term })} · {t(LANG_LABEL[c.language])}
              </span>
              <h3 className="text-base tracking-[0.1px] font-medium leading-[1.35]">
                {c.title}
              </h3>
              <div className="mt-auto pt-2">
                <LinearProgress className="h-[6px] rounded-[30px] mb-1.5" variant="determinate" value={pct} aria-label={t('pv.coverage', { with: c.topicsWithVideos, topics: c.topics })} />
                <div className="flex justify-between gap-2">
                  <p className="text-[13px] leading-[19px] text-muted-foreground">
                    {t('pv.coverage', { with: c.topicsWithVideos, topics: c.topics })}
                  </p>
                  <p className="text-[13px] leading-[19px] text-muted-foreground">
                    {t.plural('pv.videos', c.videos)}
                  </p>
                </div>
              </div>
            </CardActionArea>
          </Card>
        );
      })}
    </div>
  );
}

/** Search results: topics with their chapter and course, and whether they have videos. */
export function TopicHits({ hits }: { hits: PlatformTopicHit[] }) {
  return (
    <Card className="list-none m-0 p-0 py-2" component="ul" data-testid="topic-hits">
      {hits.map((h) => (
        <li key={h.id}>
          <ButtonBase className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-accent"
            component={Link}
            href={`/platform/concept-videos/${h.course.id}#topic-${h.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-[21px]">{h.title}</p>
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {h.course.title} · {h.chapter.title}
              </p>
            </div>
            <VideoCountChip n={h.videos} />
            <ChevronRight className="text-muted-foreground" />
          </ButtonBase>
        </li>
      ))}
    </Card>
  );
}

export function VideoCountChip({ n }: { n: number }) {
  const { t } = useI18n();
  return n === 0 ? (
    <StatusPill tone="danger" testId="no-videos">{t('pv.noVideos')}</StatusPill>
  ) : (
    <StatusPill tone="neutral">{t.plural('pv.videos', n)}</StatusPill>
  );
}
