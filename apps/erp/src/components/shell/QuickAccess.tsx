'use client';

import { Keyboard, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/shadcn/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { NavGroup } from '@/lib/nav';
import { quickActionsFor } from '@/lib/quick-actions';
import { ACTION_ICONS } from './CommandSearch';

const typingIn = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const SHORTCUTS: { keys: string[]; label: MessageKey }[] = [
  { keys: ['⌘', 'K'], label: 'ez.sc.search' },
  { keys: ['N'], label: 'ez.sc.create' },
  { keys: ['Ctrl', 'T'], label: 'ez.sc.newTab' },
  { keys: ['Ctrl', 'W'], label: 'ez.sc.closeTab' },
  { keys: ['Ctrl', 'Tab'], label: 'ez.sc.cycle' },
  { keys: ['Enter'], label: 'ez.sc.row' },
  { keys: ['⌘', 'Click'], label: 'ez.sc.click' },
  { keys: ['?'], label: 'ez.sc.help' },
];

/** The top bar's + menu (quick create) and the keyboard shortcut help (?), both reachable from the keyboard. */
export function QuickAccess({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const [help, setHelp] = useState(false);
  const [create, setCreate] = useState(false);
  const actions = quickActionsFor(groups);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || document.querySelector('[role="dialog"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
      } else if (e.key.toLowerCase() === 'n' && actions.length) {
        e.preventDefault();
        setCreate(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actions.length]);

  return (
    <>
      {actions.length > 0 && (
        <DropdownMenu open={create} onOpenChange={setCreate}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="size-9 p-0 sm:w-auto sm:px-3" aria-label={t('ez.create')} aria-keyshortcuts="N" data-testid="quick-create">
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t('ez.create')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ez.actions')}</DropdownMenuLabel>
            {actions.map((a) => {
              const Icon = ACTION_ICONS[a.icon];
              return (
                <DropdownMenuItem key={a.id} asChild>
                  <Link href={a.href}>
                    <Icon className="size-4 text-muted-foreground" />
                    {t(a.label)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setHelp(true)}>
              <Keyboard className="size-4 text-muted-foreground" />
              <span className="flex-1">{t('ez.shortcuts')}</span>
              <kbd className="rounded border bg-background px-1.5 font-mono text-[11px]">?</kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="sm:max-w-md" data-testid="shortcuts-dialog">
          <DialogHeader>
            <DialogTitle>{t('ez.shortcuts')}</DialogTitle>
            <DialogDescription className="sr-only">{t('ez.sc.help')}</DialogDescription>
          </DialogHeader>
          <ul className="grid divide-y text-sm">
            {SHORTCUTS.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-2">
                <span>{t(s.label)}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="min-w-6 rounded-md border border-b-2 bg-background px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold">
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
