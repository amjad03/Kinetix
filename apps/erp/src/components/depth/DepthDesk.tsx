'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runDepth } from '@/app/(dashboard)/depth-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { fillPath, formBody, type Col, type Field, type FormSpec, type Panel, type RowAction } from '@/lib/depth';

const initialValues = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? '']));
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Draws the panels a depth page describes: figures, downloads, forms, and a table whose rows can carry actions. */
export function DepthDesk({ panels }: { panels: Panel[] }) {
  return (
    <Stack spacing={3} data-testid="depth-desk">
      {panels.map((p) => (
        <PanelView key={p.id} panel={p} />
      ))}
    </Stack>
  );
}

function PanelView({ panel }: { panel: Panel }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (method: 'POST' | 'PUT' | 'DELETE', path: string, body: Record<string, unknown>, done?: (data: Record<string, unknown>) => void) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const res = await runDepth(method, path, body);
      if (res.ok) {
        done?.(res.data);
        router.refresh();
      } else setError(res.error);
    });

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-testid={`panel-${panel.id}`}>
      <SectionTitle flush>{panel.title}</SectionTitle>
      {panel.hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {panel.hint}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          {notice}
        </Alert>
      )}
      {panel.stats && (
        <Stack direction="row" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          {panel.stats.map((s) => (
            <Chip key={s.label} label={`${s.label}: ${s.value}`} size="small" variant="outlined" />
          ))}
        </Stack>
      )}
      {panel.downloads && panel.downloads.length > 0 && (
        <Stack direction="row" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          {panel.downloads.map((d) => (
            <Button key={d.href} component="a" href={d.href} size="small" variant="outlined">
              {d.label}
            </Button>
          ))}
        </Stack>
      )}
      {panel.forms?.map((f) => <FormView key={f.id} spec={f} pending={pending} onSend={send} setNotice={setNotice} />)}
      {panel.rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {panel.empty}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto', mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {panel.columns.map((c) => (
                  <TableCell key={c.key}>{c.label}</TableCell>
                ))}
                {panel.actions && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {panel.rows.map((row, i) => (
                <TableRow key={String(row.id ?? i)}>
                  {panel.columns.map((c) => (
                    <TableCell key={c.key}>
                      <Cell col={c} value={row[c.key]} row={row} />
                    </TableCell>
                  ))}
                  {panel.actions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {panel.actions.filter((a) => visible(a, row)).map((a) => <ActionButton key={a.label} action={a} row={row} pending={pending} onSend={send} setNotice={setNotice} />)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

const visible = (a: RowAction, row: Record<string, unknown>) => !a.show || a.show.is.includes(row[a.show.key] as string | boolean | null);

type Send = (method: 'POST' | 'PUT' | 'DELETE', path: string, body: Record<string, unknown>, done?: (data: Record<string, unknown>) => void) => void;

function Cell({ col, value, row }: { col: Col; value: unknown; row: Record<string, unknown> }) {
  const { t, fmt } = useI18n();
  if (value === null || value === undefined || value === '') return <>-</>;
  switch (col.kind) {
    case 'link':
      return col.href ? (
        <a href={fillPath(col.href, row)} download>
          {col.words?.link ?? col.label}
        </a>
      ) : (
        <>-</>
      );
    case 'date':
      return <>{ISO_DAY.test(String(value)) ? fmt.date(String(value), 'dayMonth') : String(value)}</>;
    case 'datetime':
      return <>{fmt.dateTime(String(value))}</>;
    case 'paise':
      return <>{fmt.rupees(Number(value))}</>;
    case 'num':
      return <>{fmt.number(Number(value))}</>;
    case 'pct':
      return <>{fmt.number(Number(value), { maximumFractionDigits: 1 })}%</>;
    case 'yes':
      return <>{value ? t('dx.yes') : t('dx.no')}</>;
    case 'list':
      return <>{Array.isArray(value) ? value.join(', ') : String(value)}</>;
    case 'pill': {
      const v = String(value);
      return <StatusPill tone={col.tones?.[v] ?? 'neutral'}>{col.words?.[v] ?? v}</StatusPill>;
    }
    default:
      return <>{String(value)}</>;
  }
}

function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const common = { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), required: f.required };
  const input = (() => {
    switch (f.type) {
      case 'select':
        return (
          <TextInput select {...common}>
            <MenuItem value="">{t('dx.choose')}</MenuItem>
            {(f.options ?? []).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextInput>
        );
      case 'bool':
        return (
          <TextInput select {...common}>
            <MenuItem value="true">{t('dx.yes')}</MenuItem>
            <MenuItem value="false">{t('dx.no')}</MenuItem>
          </TextInput>
        );
      case 'textarea':
      case 'lines':
        return <TextInput multiline minRows={f.type === 'lines' ? 3 : 2} {...common} />;
      case 'date':
        return <TextInput type="date" {...common} />;
      case 'datetime':
        return <TextInput type="datetime-local" {...common} />;
      case 'number':
      case 'paise':
        return <TextInput type="number" slotProps={{ htmlInput: { step: 'any', min: 0 } }} {...common} />;
      default:
        return <TextInput {...common} />;
    }
  })();
  return (
    <FormField label={f.label} required={f.required} helper={f.hint}>
      {input}
    </FormField>
  );
}

function FormView({ spec, pending, onSend, setNotice }: { spec: FormSpec; pending: boolean; onSend: Send; setNotice: (s: string | null) => void }) {
  const { t, fmt } = useI18n();
  const [values, setValues] = useState(() => initialValues(spec.fields));
  const [bad, setBad] = useState<string | null>(null);
  const [shown, setShown] = useState<{ label: string; value: string }[] | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBad(null);
    setShown(null);
    const built = formBody(spec.fields, values, spec.extra, spec.pathFields);
    if ('error' in built) {
      const f = spec.fields.find((x) => x.name === built.error);
      setBad(t('dx.badValue', { field: f?.label ?? built.error }));
      return;
    }
    onSend(spec.method ?? 'POST', fillPath(spec.path, values), built.body, (data) => {
      if (spec.result) setShown(spec.result.filter((r) => data[r.key] !== undefined && data[r.key] !== null).map((r) => ({ label: r.label, value: typeof data[r.key] === 'number' ? fmt.number(data[r.key] as number, { maximumFractionDigits: 2 }) : String(data[r.key]) })));
      else setNotice(t('dx.saved'));
      if (!spec.result || data.preview !== true) setValues(initialValues(spec.fields));
    });
  };
  return (
    <Box component="form" onSubmit={submit} sx={{ mb: 2 }} data-testid={`form-${spec.id}`}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {spec.title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {spec.fields.map((f) => (
          <Box key={f.name} sx={{ gridColumn: f.type === 'lines' || f.type === 'textarea' ? { sm: '1 / -1' } : undefined }}>
            <FieldInput f={f} value={values[f.name] ?? ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />
          </Box>
        ))}
        <Box sx={{ alignSelf: 'end' }}>
          <Button type="submit" variant="contained" disabled={pending}>
            {spec.submit}
          </Button>
        </Box>
      </Box>
      {bad && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {bad}
        </Alert>
      )}
      {shown && (
        <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }} data-testid={`result-${spec.id}`}>
          {shown.map((s) => (
            <Chip key={s.label} label={`${s.label}: ${s.value}`} size="small" color="info" variant="outlined" />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ActionButton({ action, row, pending, onSend, setNotice }: { action: RowAction; row: Record<string, unknown>; pending: boolean; onSend: Send; setNotice: (s: string | null) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => initialValues(action.fields ?? []));
  const [bad, setBad] = useState<string | null>(null);
  const method = action.method ?? 'POST';
  const rowValues = Object.fromEntries(Object.entries(action.rowBody ?? {}).map(([k, v]) => [k, row[v]]));
  const send = (body: Record<string, unknown>) => onSend(method, fillPath(action.path, row), body, () => {
    setOpen(false);
    setNotice(t('dx.saved'));
  });
  const click = () => {
    if (action.fields?.length) return setOpen(true);
    if (action.confirm && !window.confirm(action.confirm)) return;
    send({ ...(action.body ?? {}), ...rowValues });
  };
  const submit = () => {
    const built = formBody(action.fields ?? [], values, { ...(action.body ?? {}), ...rowValues });
    if ('error' in built) return setBad(t('dx.badValue', { field: action.fields?.find((f) => f.name === built.error)?.label ?? built.error }));
    setBad(null);
    send(built.body);
  };
  return (
    <>
      <Button size="small" color="inherit" disabled={pending} onClick={click}>
        {action.label}
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>{action.label}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              {action.fields!.map((f) => (
                <FieldInput key={f.name} f={f} value={values[f.name] ?? ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />
              ))}
              {bad && <Alert severity="warning">{bad}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>{t('dx.cancel')}</Button>
            <Button variant="contained" onClick={submit} disabled={pending}>
              {action.label}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
