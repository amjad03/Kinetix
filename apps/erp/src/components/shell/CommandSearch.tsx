'use client';

import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import ChatBubbleOutlined from '@mui/icons-material/ChatBubbleOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import KeyboardReturn from '@mui/icons-material/KeyboardReturn';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { groupHits, isQuestion, safeHitUrl, type AskAnswer } from '@/lib/search';
import type { SearchHit } from '@/lib/insights';
import { matchesQuery } from '@/lib/table';
import type { NavGroup } from '@/lib/nav';
import { NAV_ICONS } from './icons';

interface Hit {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: SvgIconComponent;
  /** The heading it sits under. */
  group: string;
}

const TYPE_ICONS: Record<SearchHit['type'], SvgIconComponent> = { students: GroupsOutlined, staff: BadgeOutlined, courses: MenuBookOutlined, topics: PlayCircleOutlined, documents: DescriptionOutlined, events: EventOutlined, fees: ReceiptLongOutlined, messages: ChatBubbleOutlined, knowledge: HubOutlined, reports: AssessmentOutlined };

/**
 * Global search: a field in the top bar that opens a command palette (also Ctrl/⌘ K). It finds any
 * page the person may open, and, from two letters on, asks the search API (GET /v1/search through
 * /api/search) for students, staff, courses, topics, documents and reports. The API scopes those by
 * role, so the palette shows only what the person may see, in groups. Arrow keys move, Enter opens,
 * Escape closes. The list is a listbox with aria-activedescendant.
 */
export function CommandSearch({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const term = q.trim();
  const asking = open && isQuestion(term);

  useEffect(() => {
    if (!asking) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/ask?q=${encodeURIComponent(term.replace(/^ask\s+/i, ''))}`, { signal: ctl.signal });
        if (res.status === 401) return router.refresh();
        setAnswer((await res.json()) as AskAnswer);
      } catch {
        /* aborted or offline */
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [asking, term, router]);

  useEffect(() => {
    if (!open || term.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (res.status === 401) return router.refresh();
        const body = (await res.json()) as { hits?: SearchHit[] };
        setFound(body.hits ?? []);
      } catch {
        /* aborted or offline: pages still work */
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
      setLoading(false);
    };
  }, [open, term, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const pageGroup = t('shell.searchPages');
    const pages = groups.flatMap((g) => g.items.map((i) => ({ key: i.href, href: i.href, label: t(i.label), hint: t(g.label), icon: NAV_ICONS[i.icon], group: pageGroup })));
    const matched = term ? pages.filter((p) => matchesQuery(`${p.label} ${p.hint}`, term)) : pages.slice(0, 8);
    const records: Hit[] = groupHits(term.length >= 2 && open ? found : []).flatMap((g) =>
      g.hits.flatMap((h) => {
        const href = safeHitUrl(h.url);
        return href ? [{ key: `${h.type}:${h.id}`, href, label: h.title, hint: h.subtitle, icon: TYPE_ICONS[h.type], group: t(`search.type.${h.type}`) }] : [];
      }),
    );
    return [...records, ...matched];
  }, [groups, term, t, found, open]);

  const close = () => {
    setOpen(false);
    setQ('');
    setActive(0);
    setAnswer(null);
  };
  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    router.push(h.href);
  };

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={t('shell.search')}
        aria-keyshortcuts="Control+K Meta+K"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', maxWidth: 440, height: 40, px: 1.5, borderRadius: '10px', bgcolor: 'm3.surfaceContainerLow', border: 1, borderColor: 'm3.outlineVariant', color: 'text.secondary', justifyContent: 'flex-start', '&:hover': { borderColor: 'm3.outline' } }}
      >
        <SearchOutlined fontSize="small" />
        <Typography component="span" noWrap sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem' }}>
          {t('search.placeholder')}
        </Typography>
        <Box component="kbd" sx={{ display: { xs: 'none', md: 'inline-block' }, fontFamily: 'inherit', fontSize: '0.6875rem', px: 0.75, py: 0.25, borderRadius: '6px', border: 1, borderColor: 'm3.outlineVariant', bgcolor: 'kx.pane' }}>
          Ctrl K
        </Box>
      </ButtonBase>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-label={t('shell.search')} slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: 10 }, p: 0, overflow: 'hidden' } } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
          <SearchOutlined sx={{ color: 'text.secondary' }} />
          <InputBase
            autoFocus
            fullWidth
            value={q}
            placeholder={t('search.placeholder')}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              else if (e.key === 'Enter') go(hits[active]);
              else return;
              e.preventDefault();
            }}
            inputProps={{ role: 'combobox', 'aria-expanded': true, 'aria-controls': `${id}-list`, 'aria-activedescendant': hits[active] ? `${id}-${active}` : undefined, 'aria-label': t('shell.search'), autoComplete: 'off' }}
            sx={{ height: 56, fontSize: '1rem' }}
          />
        </Box>
        {asking && answer && answer.rows !== undefined && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'm3.outlineVariant', maxHeight: 220, overflowY: 'auto' }} role="status" data-testid="ask-answer">
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
              {t('ask.title')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {answer.interpretation}
            </Typography>
            {answer.note && <Typography variant="body2" color="text.secondary">{answer.note}</Typography>}
            {!answer.note && answer.rows.length === 0 && <Typography variant="body2" color="text.secondary">{t('ask.none')}</Typography>}
            {answer.rows.slice(0, 6).map((r, i) => (
              <Typography key={i} variant="body2" color="text.secondary" noWrap>
                {answer.columns.map((c) => String(r[c] ?? '')).filter(Boolean).join(' · ')}
              </Typography>
            ))}
            {answer.rows.length > 6 && <Typography variant="caption" color="text.secondary">{t('ask.more', { n: answer.rows.length - 6 })}</Typography>}
            {answer.url && safeHitUrl(answer.url) && (
              <Typography component="a" href={safeHitUrl(answer.url)!} variant="body2" sx={{ display: 'block', mt: 0.5 }}>
                {t('ask.open')}
              </Typography>
            )}
          </Box>
        )}
        <Box component="ul" role="listbox" id={`${id}-list`} aria-label={t('shell.searchResults')} sx={{ listStyle: 'none', m: 0, p: 1, maxHeight: 360, overflowY: 'auto' }}>
          {hits.length === 0 && (
            <Typography role="status" variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {loading ? t('common.loading') : t('shell.searchNone')}
            </Typography>
          )}
          {hits.map((h, i) => (
            <Fragment key={h.key}>
              {(i === 0 || hits[i - 1].group !== h.group) && (
                <Typography component="li" role="presentation" variant="overline" sx={{ display: 'block', px: 1.5, pt: i === 0 ? 0.5 : 1.5, color: 'text.secondary', lineHeight: 2 }}>
                  {h.group}
                </Typography>
              )}
              <Box
              component="li"
              role="option"
              id={`${id}-${i}`}
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(h)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: '10px', cursor: 'pointer', bgcolor: i === active ? 'm3.primaryContainer' : 'transparent', color: i === active ? 'm3.onPrimaryContainer' : 'text.primary' }}
            >
              <h.icon fontSize="small" />
              <Typography component="span" sx={{ flex: 1, fontSize: '0.9375rem' }}>
                {h.label}
              </Typography>
              <Typography component="span" variant="caption" sx={{ color: 'inherit', opacity: 0.8 }}>
                {h.hint}
              </Typography>
              {i === active && <KeyboardReturn fontSize="small" aria-hidden />}
              </Box>
            </Fragment>
          ))}
        </Box>
      </Dialog>
    </>
  );
}
