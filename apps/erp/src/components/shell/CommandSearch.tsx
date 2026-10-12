'use client';

import {
  BadgeCheck, BarChart3, BookOpen, CalendarDays, FileText, MessageSquare, Network, PlayCircle, Receipt, Search, Users, type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTabs } from '@/components/tabs/TabsProvider';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/shadcn/command';
import { useI18n } from '@/i18n/client';
import type { SearchHit } from '@/lib/insights';
import type { NavGroup } from '@/lib/nav';
import { groupHits, isQuestion, safeHitUrl, type AskAnswer } from '@/lib/search';
import { matchesQuery } from '@/lib/table';
import { NAV_ICONS } from './nav-icons';

interface Hit {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: string;
}

const TYPE_ICONS: Record<SearchHit['type'], LucideIcon> = {
  students: Users, staff: BadgeCheck, courses: BookOpen, topics: PlayCircle, documents: FileText, events: CalendarDays, fees: Receipt, messages: MessageSquare, knowledge: Network, reports: BarChart3,
};

/**
 * Global search (⌘K / Ctrl K): any page the person may open and, from two letters on, records from
 * GET /v1/search (through /api/search), scoped by role on the API. A question ("ask …") gets an answer.
 */
export function CommandSearch({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newTab, setNewTab] = useState(false);
  const tabs = useTabs();
  const [q, setQ] = useState('');
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
    // Ctrl+T in the tab bar: pick a page to open in a new tab.
    const onPalette = () => {
      setNewTab(true);
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('kx:palette', onPalette);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('kx:palette', onPalette);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const pageGroup = t('shell.searchPages');
    const pages = groups.flatMap((g) => g.items.map((i) => ({ key: i.href, href: i.href, label: t(i.label), hint: t(g.label), icon: NAV_ICONS[i.icon], group: pageGroup })));
    const matched = term ? pages.filter((p) => matchesQuery(`${p.label} ${p.hint}`, term)) : pages.slice(0, 8);
    const records: Hit[] = groupHits(term.length >= 2 && open ? found : []).flatMap((g) =>
      g.hits.flatMap((h) => {
        const href = safeHitUrl(h.url);
        return href ? [{ key: `${h.type}:${h.id}`, href, label: h.title, hint: h.subtitle, icon: TYPE_ICONS[h.type] ?? FileText, group: t(`search.type.${h.type}`) }] : [];
      }),
    );
    return [...records, ...matched];
  }, [groups, term, t, found, open]);

  const sections = useMemo(() => {
    const out: { group: string; hits: Hit[] }[] = [];
    for (const h of hits) {
      const last = out[out.length - 1];
      if (last && last.group === h.group) last.hits.push(h);
      else out.push({ group: h.group, hits: [h] });
    }
    return out;
  }, [hits]);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setNewTab(false);
      setQ('');
      setAnswer(null);
    }
  };
  const go = (href: string) => {
    const inTab = newTab && tabs;
    onOpenChange(false);
    if (inTab) tabs.open(href);
    else router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('shell.search')}
        aria-keyshortcuts="Control+K Meta+K"
        className="ml-auto flex h-9 w-9 items-center justify-center gap-2 rounded-md border bg-card px-2.5 text-muted-foreground transition-colors hover:border-border-strong sm:w-[min(340px,32vw)] sm:justify-start"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left text-[13px] sm:block">{t('search.placeholder')}</span>
        <kbd className="hidden rounded-md border border-b-2 bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold md:inline-block">⌘K</kbd>
      </button>
      <CommandDialog shouldFilter={false} open={open} onOpenChange={onOpenChange} title={t('shell.search')} description={t('search.placeholder')} className="top-[12vh] translate-y-0 sm:max-w-xl">
        <CommandInput value={q} onValueChange={setQ} placeholder={t('search.placeholder')} aria-label={t('shell.search')} />
        {asking && answer && answer.rows !== undefined && (
          <div role="status" data-testid="ask-answer" className="max-h-56 overflow-y-auto border-b px-4 py-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ask.title')}</p>
            <p className="font-semibold">{answer.interpretation}</p>
            {answer.note && <p className="text-muted-foreground">{answer.note}</p>}
            {!answer.note && answer.rows.length === 0 && <p className="text-muted-foreground">{t('ask.none')}</p>}
            {answer.rows.slice(0, 6).map((r, i) => (
              <p key={i} className="truncate text-muted-foreground">
                {answer.columns.map((c) => String(r[c] ?? '')).filter(Boolean).join(' · ')}
              </p>
            ))}
            {answer.rows.length > 6 && <p className="text-xs text-muted-foreground">{t('ask.more', { n: answer.rows.length - 6 })}</p>}
            {answer.url && safeHitUrl(answer.url) && (
              <a href={safeHitUrl(answer.url)!} className="mt-1 block text-teal-ink underline-offset-2 hover:underline">
                {t('ask.open')}
              </a>
            )}
          </div>
        )}
        <CommandList aria-label={t('shell.searchResults')} className="max-h-[360px]">
          <CommandEmpty>{loading ? t('common.loading') : t('shell.searchNone')}</CommandEmpty>
          {sections.map((s) => (
            <CommandGroup key={s.group} heading={s.group}>
              {s.hits.map((h) => (
                <CommandItem key={h.key} value={h.key} onSelect={() => go(h.href)} className="gap-3">
                  <h.icon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{h.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
