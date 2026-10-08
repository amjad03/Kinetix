'use client';

import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { SearchHit } from '@/lib/insights';

/** The top-bar search over students, staff, courses, topics, documents and reports (GET /v1/search, scoped by role). */
export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.status === 401) return router.refresh();
        const body = (await res.json()) as { hits: SearchHit[] };
        setHits(body.hits);
      } catch {
        /* aborted or offline: keep the old list */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [input, router]);

  return (
    <Autocomplete<SearchHit, false, true, false>
      size="small"
      options={input.trim().length < 2 ? [] : hits}
      loading={loading}
      value={null as unknown as SearchHit}
      inputValue={input}
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      filterOptions={(x) => x}
      groupBy={(h) => t(`search.type.${h.type}`)}
      getOptionLabel={(h) => (typeof h === 'string' ? h : h.title)}
      isOptionEqualToValue={(a, b) => a.id === b.id && a.type === b.type}
      noOptionsText={input.trim().length < 2 ? t('search.placeholder') : t('search.empty')}
      onChange={(_, h) => {
        if (h) {
          setInput('');
          router.push(h.url);
        }
      }}
      sx={{ width: { xs: 140, sm: 280, md: 380 }, display: { xs: 'none', sm: 'block' } }}
      renderOption={(props, h) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest}>
            <span>
              <Typography variant="body2">{h.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {h.subtitle}
              </Typography>
            </span>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={t('search.placeholder')}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, 'aria-label': t('search.label'), 'data-testid': 'global-search' },
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}
