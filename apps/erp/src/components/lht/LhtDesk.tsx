'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { runLht } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, FormGrid, SelectInput, SwitchField, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export interface DeskField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'bool' | 'codes' | 'multi';
  required?: boolean;
  options?: { value: string; label: string }[];
  initial?: string;
  hint?: string;
}

export interface DeskTask {
  id: string;
  title: string;
  hint?: string;
  /** The API path; `{name}` is filled from the form field of that name (which then stays out of the body). */
  path: string;
  submit: string;
  fields: DeskField[];
  /** What to show of the answer: its per-code results, or these fields. */
  result?: { key: string; label: string; kind?: 'rupees' | 'yes'; words?: Record<string, string> }[];
}

/** Splits scanned or typed codes on new lines, commas and spaces. */
export const splitCodes = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

/**
 * The desk: a card per task (issue and return books, run the mess bills, send a hand-over code ...), each a small
 * form sent to the API; the answer is shown under the form (per scanned code where the task takes several).
 */
export function LhtDesk({ tasks }: { tasks: DeskTask[] }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2" data-testid="lht-desk">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

type Answer = Record<string, unknown>;

function TaskCard({ task }: { task: DeskTask }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [busy, start] = useTransition();
  const initial = () => Object.fromEntries(task.fields.map((f) => [f.name, f.initial ?? '']));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));

  const send = () => {
    const body: Record<string, unknown> = {};
    let path = task.path;
    for (const f of task.fields) {
      const raw = (values[f.name] ?? '').trim();
      if (f.required && !raw && f.type !== 'bool') return setError(t('lht.fill', { field: f.label }));
      if (path.includes(`{${f.name}}`)) {
        path = path.replace(`{${f.name}}`, encodeURIComponent(raw));
        continue;
      }
      if (f.type === 'bool') body[f.name] = raw === 'true';
      else if (!raw) continue;
      else if (f.type === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return setError(t('lht.fill', { field: f.label }));
        body[f.name] = n;
      } else if (f.type === 'codes') body[f.name] = splitCodes(raw);
      else if (f.type === 'multi') body[f.name] = raw.split(',').filter(Boolean);
      else body[f.name] = raw;
    }
    setError('');
    start(async () => {
      const res = await runLht(path, body);
      if (!res.ok) {
        setAnswer(null);
        return setError(res.error);
      }
      setAnswer(res.data);
      toast.success(t('lht.sent'));
      // Codes are scanned afresh for the next borrower; the rest of the form stays.
      setValues((x) => ({ ...x, ...Object.fromEntries(task.fields.filter((f) => f.type === 'codes').map((f) => [f.name, ''])) }));
    });
  };

  const results = Array.isArray(answer?.results) ? (answer.results as { code: string; ok: boolean; message?: string; dueOn?: string; finePaise?: number; inTransit?: boolean }[]) : null;

  return (
    <Card title={task.title} testId={`lht-task-${task.id}`}>
      {task.hint && <p className="mt-0 mb-4 text-sm text-muted-foreground">{task.hint}</p>}
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <FormGrid cols={task.fields.length > 2 ? 2 : 1}>
          {task.fields.map((f) => {
            const common = { label: `${f.label}${f.required ? ' *' : ''}`, value: values[f.name] ?? '', onChange: (e: { target: { value: string } }) => set(f.name, e.target.value), fullWidth: true, helperText: f.hint, name: f.name };
            if (f.type === 'bool') return <SwitchField key={f.name} label={f.label} checked={values[f.name] === 'true'} onChange={(c) => set(f.name, c ? 'true' : 'false')} />;
            if (f.type === 'select') return <SelectInput key={f.name} {...common} options={f.options ?? []} empty={f.required ? undefined : t('lht.none')} />;
            if (f.type === 'multi')
              return (
                <fieldset key={f.name} className="m-0 grid gap-1 border-0 p-0 sm:col-span-2">
                  <legend className="mb-1 text-[13px] text-muted-foreground">{common.label}</legend>
                  {(f.options ?? []).length === 0 && <span className="text-sm text-muted-foreground">{t('lht.noChoices')}</span>}
                  {(f.options ?? []).map((o) => {
                    const chosen = (values[f.name] ?? '').split(',').filter(Boolean);
                    return <CheckboxField key={o.value} label={o.label} checked={chosen.includes(o.value)} onChange={(c: boolean) => set(f.name, (c ? [...chosen, o.value] : chosen.filter((x) => x !== o.value)).join(','))} />;
                  })}
                </fieldset>
              );
            if (f.type === 'date' || f.type === 'month') return <TextInput key={f.name} {...common} type={f.type} slotProps={{ inputLabel: { shrink: true } }} />;
            if (f.type === 'number') return <TextInput key={f.name} {...common} type="number" inputMode="decimal" />;
            return <TextInput key={f.name} {...common} multiline={f.type === 'textarea' || f.type === 'codes'} minRows={f.type === 'codes' ? 3 : f.type === 'textarea' ? 2 : undefined} className={f.type === 'codes' || f.type === 'textarea' ? 'sm:col-span-2' : undefined} />;
          })}
        </FormGrid>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="h-9" data-testid={`lht-task-${task.id}-go`}>
            {task.submit}
          </Button>
        </div>
      </form>
      {results && (
        <ul className="m-0 mt-4 grid list-none gap-2 border-t pt-4 pl-0" data-testid={`lht-task-${task.id}-results`}>
          {results.length === 0 && <li className="text-sm text-muted-foreground">{t('lht.nothing')}</li>}
          {results.map((r) => (
            <li key={r.code} className="flex items-start gap-2 text-sm">
              {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-ink" aria-label={t('lht.ok')} /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label={t('lht.failed')} />}
              <span className="min-w-0 break-words">
                <span className="font-medium">{r.code}</span>
                {r.ok
                  ? [r.dueOn && ` · ${t('lht.dueOn', { date: fmt.date(r.dueOn, 'day') })}`, r.finePaise ? ` · ${t('lht.fine', { amount: fmt.rupees(r.finePaise) })}` : '', r.inTransit ? ` · ${t('lht.inTransit')}` : ''].filter(Boolean).join('')
                  : ` · ${r.message ?? t('error.generic')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {answer && !results && task.result && (
        <dl className="m-0 mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-4 text-sm" data-testid={`lht-task-${task.id}-answer`}>
          {task.result.map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="m-0 text-right font-medium">{r.words && typeof answer[r.key] === 'string' ? (r.words[answer[r.key] as string] ?? String(answer[r.key])) : show(answer[r.key], r.kind)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );

  function show(v: unknown, kind?: 'rupees' | 'yes') {
    if (v === null || v === undefined || v === '') return '—';
    if (kind === 'rupees' && typeof v === 'number') return fmt.rupees(v);
    if (kind === 'yes' || typeof v === 'boolean') return v ? t('lht.yes') : t('lht.no');
    if (typeof v === 'number') return fmt.number(v);
    if (Array.isArray(v)) return fmt.number(v.length);
    if (typeof v === 'object') return fmt.number(Object.keys(v).length);
    return String(v);
  }
}
