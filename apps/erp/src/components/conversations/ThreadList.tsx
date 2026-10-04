'use client';

import ChevronRight from '@mui/icons-material/ChevronRight';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/States';
import { filterThreads } from '@/lib/conversations';
import { relativeTime } from '@/lib/dates';
import type { ConversationSummary } from '@/lib/types';

/** Every parent–teacher thread, without message text; opening one is audited. */
export function ThreadList({ threads, timeZone }: { threads: ConversationSummary[]; timeZone: string }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => filterThreads(threads, q), [threads, q]);
  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Student, class, teacher or parent"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 420 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search conversations' },
          }}
        />
        <Typography variant="body2" color="text.secondary" data-testid="thread-count">
          {rows.length} conversation{rows.length === 1 ? '' : 's'}
        </Typography>
      </Box>
      {rows.length === 0 ? (
        <EmptyState dense icon={<ForumOutlined />} title="No conversations match" testId="no-thread-match">
          Try a student, teacher or parent&apos;s name.
        </EmptyState>
      ) : (
        <Box sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflow: 'hidden' }} data-testid="threads">
          {rows.map((c, i) => (
            <ButtonBase
              key={c.id}
              component={Link}
              href={`/conversations/${c.id}`}
              // No prefetch: opening a thread is what gets audited, so only a click should load it.
              prefetch={false}
              data-testid="thread-row"
              sx={{
                display: 'flex',
                width: '100%',
                textAlign: 'left',
                alignItems: 'center',
                gap: 2,
                px: 2,
                py: 1.5,
                borderTop: i ? 1 : 0,
                borderColor: 'm3.outlineVariant',
                textDecoration: 'none',
                color: 'inherit',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {c.family.fullName} ↔ {c.staff.fullName}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  About {c.student.fullName} · {c.className}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {c.lastMessageAt ? relativeTime(c.lastMessageAt, new Date(), timeZone) : 'No messages'}
              </Typography>
              <ChevronRight sx={{ color: 'text.secondary' }} />
            </ButtonBase>
          ))}
        </Box>
      )}
    </>
  );
}
