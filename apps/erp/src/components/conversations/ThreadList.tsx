'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/States';
import { filterThreads } from '@/lib/conversations';
import { useI18n } from '@/i18n/client';
import type { ConversationSummary } from '@/lib/types';

import { ButtonBase, InputAdornment, TextField } from '@/components/kx';
import { ChevronRight, MessagesSquare as ForumOutlined, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
/** Every parent–teacher thread, without message text; opening one is audited. */
export function ThreadList({ threads, timeZone }: { threads: ConversationSummary[]; timeZone: string }) {
  const { t, fmt } = useI18n();
  const [q, setQ] = useState('');
  const rows = useMemo(() => filterThreads(threads, q), [threads, q]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <TextField className="flex-[1_1_260px] max-w-[420px]"
          size="small"
          placeholder={t('conv.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search className="size-5" /></InputAdornment> },
            htmlInput: { 'aria-label': t('conv.searchLabel') },
          }}
        />
        <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid="thread-count">
          {t.plural('conv.count', rows.length)}
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState dense icon={<ForumOutlined />} title={t('conv.noMatch')} testId="no-thread-match">
          {t('conv.noMatchBody')}
        </EmptyState>
      ) : (
        <div className="border border-border rounded-[16px] bg-card shadow-[var(--kx-elev-card)] overflow-hidden" data-testid="threads">
          {rows.map((c, i) => (
            <ButtonBase className={cn('flex w-full text-left items-center gap-4 px-4 py-3 border-border no-underline text-inherit hover:bg-accent', i ? 'border-t' : 'border-t-0')}
              key={c.id}
              component={Link}
              href={`/conversations/${c.id}`}
              // No prefetch: opening a thread is what gets audited, so only a click should load it.
              prefetch={false}
              data-testid="thread-row"
            >
              <div className="flex-1 min-w-0">
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px] truncate">
                  {c.family.fullName} ↔ {c.staff.fullName}
                </h6>
                <p className="text-[13px] leading-[19px] text-muted-foreground truncate">
                  {t('conv.about', { student: c.student.fullName, className: c.className })}
                </p>
              </div>
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                {c.lastMessageAt ? fmt.relative(c.lastMessageAt, new Date(), timeZone) : t('conv.noMessages')}
              </span>
              <ChevronRight className="text-muted-foreground" />
            </ButtonBase>
          ))}
        </div>
      )}
    </>
  );
}
