'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Bar, FormDialog, Grid, InfoDialog, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import type { MessageKey } from '@/i18n/messages';
import { useI18n } from '@/i18n/client';
import { buildBody, fillPath, getPath, initText, type DeskAction, type DeskColumn, type DeskField, type DeskSpec } from '@/lib/g1-desk';
import { deskSend } from '@/lib/g1-actions';

export interface Opt {
  value: string;
  label: string;
}
export type Row = Record<string, unknown>;
export interface TabData {
  id: string;
  rows: Row[];
  error?: string;
  /** Filters the tab waits for. */
  missing?: string[];
}
export type Lookups = Partial<Record<NonNullable<DeskField['optionsFrom']>, Opt[]>>;

interface Props {
  spec: DeskSpec;
  data: TabData[];
  filterOptions: Record<string, Opt[]>;
  filterValues: Record<string, string>;
  lookups: Lookups;
  initialTab: string;
  /** The page path actions refresh ("/scheduling"). */
  page: string;
  /** Extra content under a tab, by tab id. */
  extra?: Record<string, ReactNode>;
}

type Dialog = { action: DeskAction; row: Row | null } | null;

/** A desk made of tabs; each tab is a list with its actions. What each tab loads and which forms it offers is described in lib/g1-specs.ts. */
export function ConfigDesk({ spec, data, filterOptions, filterValues, lookups, initialTab, page, extra }: Props) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dialog>(null);
  const [result, setResult] = useState<unknown>(undefined);

  const word = (prefix: string | undefined, v: unknown) => {
    if (!prefix) return String(v);
    const s = t(`${prefix}${String(v)}` as MessageKey);
    return s === `${prefix}${String(v)}` ? String(v) : s;
  };
  const show = (c: DeskColumn, row: Row): ReactNode => {
    const v = getPath(row, c.key);
    if (v === null || v === undefined || v === '') return '-';
    switch (c.type) {
      case 'date':
        return fmt.date(String(v).slice(0, 10), 'short');
      case 'datetime':
        return fmt.dateTime(String(v));
      case 'time':
        return String(v).slice(0, 5);
      case 'bool':
        return v ? t('ops.yes') : t('ops.no');
      case 'pct':
        return `${v}%`;
      case 'paise':
        return fmt.rupees(Number(v));
      case 'list':
        return Array.isArray(v) ? v.map((x) => word(c.words, x)).join(', ') : word(c.words, v);
      case 'count':
        return Array.isArray(v) ? v.length : Number(v);
      case 'chip':
        return word(c.words, v);
      default:
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  };

  const toFields = (a: DeskAction, row: Row | null): Field[] =>
    a.fields.map((f) => ({
      name: f.name,
      label: t(f.label),
      kind: f.kind === 'multiline' ? 'multiline' : f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'uuid' ? 'uuid' : f.options || f.optionsFrom ? 'select' : 'text',
      required: f.required,
      init: f.initFrom ? initText(getPath(row, f.initFrom)) : f.init,
      options: f.options ? f.options.map((o) => ({ value: o.value, label: t(o.label) })) : f.optionsFrom ? (lookups[f.optionsFrom] ?? []) : undefined,
    }));

  const run = (a: DeskAction, row: Row | null) => async (values: Record<string, string>) => {
    const built = buildBody(a.fields, values, a.fixed);
    if ('bad' in built) return { ok: false as const, error: t('ops.err.field', { field: t(built.bad.label) }) };
    for (const [k, rk] of Object.entries(a.rowBody ?? {})) {
      const v = getPath(row, rk.replace(/^\[|\]$/g, ''));
      built.body[k] = rk.startsWith('[') ? [v] : v;
    }
    for (const [k, fk] of Object.entries(a.filterBody ?? {})) if (filterValues[fk]) built.body[k] = filterValues[fk];
    const res = await deskSend(page, fillPath(a.path, row, filterValues, values), a.method, built.body);
    if (res.ok && a.showResult) setResult(res.data);
    return res;
  };

  const open = (a: DeskAction, row: Row | null) => setDlg({ action: a, row });

  const setFilter = (param: string, value: string) => {
    const p = new URLSearchParams(window.location.search);
    if (value) p.set(param, value);
    else p.delete(param);
    router.replace(`${pathname}?${p.toString()}`);
  };

  const tabs = spec.tabs.map((tab) => {
    const d = data.find((x) => x.id === tab.id);
    const tabActions = tab.actions.filter((a) => a.scope === 'tab');
    const rowActions = tab.actions.filter((a) => a.scope === 'row');
    const cols: Col<Row>[] = tab.columns.map((c) => ({ label: t(c.label), cell: (r) => show(c, r), sort: (r) => { const v = getPath(r, c.key); return typeof v === 'number' || typeof v === 'string' ? v : null; } }));
    if (rowActions.length) {
      cols.push({
        label: '',
        cell: (r) => (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            {rowActions
              .filter((a) => !a.when || a.when.in.includes(String(getPath(r, a.when.key) ?? '')))
              .map((a) => (
                <Button key={a.id} size="small" color={a.danger ? 'error' : 'primary'} onClick={() => open(a, r)}>
                  {t(a.label)}
                </Button>
              ))}
          </Stack>
        ),
      });
    }
    const node = (
      <>
        {tab.hint && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(tab.hint)}
          </Typography>
        )}
        {tabActions.length > 0 && (
          <Bar>
            {tabActions.map((a, i) => (
              <Button key={a.id} variant={i === 0 ? 'contained' : 'outlined'} color={a.danger ? 'error' : 'primary'} disabled={!!d?.missing?.length && a.path.includes('{')} onClick={() => open(a, null)}>
                {t(a.label)}
              </Button>
            ))}
          </Bar>
        )}
        {d?.error !== undefined ? (
          <Typography color="error">{d.error}</Typography>
        ) : d?.missing?.length ? (
          <Typography color="text.secondary">{t('g1.pickFirst')}</Typography>
        ) : (
          <Grid testId={`g1-${spec.id}-${tab.id}`} empty={t(tab.empty)} rows={d?.rows ?? []} cols={cols} />
        )}
        {extra?.[tab.id]}
      </>
    );
    return { id: tab.id, label: t(tab.label), node };
  });

  return (
    <>
      {spec.filters.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          {spec.filters.map((f) => (
            <TextField key={f.param} select size="small" label={t(f.label)} value={filterValues[f.param] ?? ''} onChange={(e) => setFilter(f.param, e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">{t('g1.any')}</MenuItem>
              {(f.from === 'static' ? (f.options ?? []).map((o) => ({ value: o.value, label: t(o.label) })) : (filterOptions[f.param] ?? [])).map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          ))}
        </Stack>
      )}
      <Tabbed label={t(spec.title)} initial={initialTab} tabs={tabs} />
      {dlg && (
        <FormDialog
          title={t(dlg.action.label)}
          fields={toFields(dlg.action, dlg.row)}
          intro={dlg.action.confirm ? <Typography>{t(dlg.action.confirm)}</Typography> : undefined}
          onSubmit={run(dlg.action, dlg.row)}
          onClose={(m) => {
            setDlg(null);
            if (m) toast(t('ops.saved'));
          }}
        />
      )}
      {result !== undefined && (
        <InfoDialog title={t('g1.result')} onClose={() => setResult(undefined)}>
          <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 420, overflow: 'auto', fontSize: '0.8125rem' }}>
            {JSON.stringify(result, null, 2)}
          </Box>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
