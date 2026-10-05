'use client';

import ChevronRight from '@mui/icons-material/ChevronRight';
import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { PlatformLibraryCurriculum, PlatformTopicHit, VideoLanguage } from '@/lib/types';

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
    <Box
      component="form"
      role="search"
      onSubmit={(e) => (e.preventDefault(), go(text, missingOnly))}
      sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}
    >
      <TextField
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('pv.search')}
        slotProps={{ htmlInput: { 'aria-label': t('pv.search'), 'data-testid': 'video-search' }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
        sx={{ flex: '1 1 320px', maxWidth: 480 }}
      />
      <FormControlLabel control={<Switch checked={missingOnly} onChange={(e) => go(text, e.target.checked)} data-testid="missing-only" />} label={t('pv.missingOnly')} />
      {pending && <LinearProgress sx={{ flexBasis: '100%', height: 2 }} />}
    </Box>
  );
}

/** Courses as cards with how many of their topics have videos. */
export function CourseCoverageList({ courses }: { courses: PlatformLibraryCurriculum['courses'] }) {
  const { t } = useI18n();
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }} data-testid="video-courses">
      {courses.map((c) => {
        const pct = c.topics ? Math.round((c.topicsWithVideos / c.topics) * 100) : 0;
        return (
          <Card key={c.id} data-testid="video-course">
            <CardActionArea component={Link} href={`/platform/concept-videos/${c.id}`} sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t('pv.term', { n: c.term })} · {t(LANG_LABEL[c.language])}
              </Typography>
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 500, lineHeight: 1.35 }}>
                {c.title}
              </Typography>
              <Box sx={{ mt: 'auto', pt: 1 }}>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, mb: 0.75 }} aria-label={t('pv.coverage', { with: c.topicsWithVideos, topics: c.topics })} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('pv.coverage', { with: c.topicsWithVideos, topics: c.topics })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t.plural('pv.videos', c.videos)}
                  </Typography>
                </Box>
              </Box>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}

/** Search results: topics with their chapter and course, and whether they have videos. */
export function TopicHits({ hits }: { hits: PlatformTopicHit[] }) {
  return (
    <Card component="ul" sx={{ listStyle: 'none', m: 0, p: 0, py: 1 }} data-testid="topic-hits">
      {hits.map((h) => (
        <li key={h.id}>
          <ButtonBase
            component={Link}
            href={`/platform/concept-videos/${h.course.id}#topic-${h.id}`}
            sx={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1">{h.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {h.course.title} · {h.chapter.title}
              </Typography>
            </Box>
            <VideoCountChip n={h.videos} />
            <ChevronRight sx={{ color: 'text.secondary' }} />
          </ButtonBase>
        </li>
      ))}
    </Card>
  );
}

export function VideoCountChip({ n }: { n: number }) {
  const { t } = useI18n();
  return n === 0 ? (
    <Chip size="small" label={t('pv.noVideos')} sx={{ bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer', height: 24 }} data-testid="no-videos" />
  ) : (
    <Chip size="small" label={t.plural('pv.videos', n)} sx={{ bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', height: 24 }} />
  );
}
