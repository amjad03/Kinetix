'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { createTerm, deleteTerm, updateTerm } from '@/app/(dashboard)/calendar/actions';
import { SectionTitle } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import { currentTerm, termProblem, type Term, type TermInput } from '@/lib/terms';
import type { ProgramOption } from './CalendarView';

import { Alert, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, FormHelperText, IconButton, InputLabel, ListItemText, MenuItem, Radio, RadioGroup, Select, Snackbar, Tooltip } from '@/components/kx';
import { CalendarRange as DateRangeOutlined, Pencil as EditOutlined, Plus as Add, Trash2 as DeleteOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
type Open = { kind: 'add' } | { kind: 'edit'; term: Term } | { kind: 'delete'; term: Term } | null;

/** The academic terms (semesters) under the calendar: recordings are kept until their term ends. */
export function TermsSection({ terms, today, canEdit, programs }: { terms: Term[]; today: string; canEdit: boolean; programs: ProgramOption[] }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);
  const current = currentTerm(terms, today);
  const close = (message?: string) => {
    setOpen(null);
    if (message) setToast(message);
  };

  return (
    <section aria-labelledby="terms-title" data-testid="terms">
      <SectionTitle
        id="terms-title"
        action={
          canEdit && (
            <Button variant="outlined" startIcon={<Add />} onClick={() => setOpen({ kind: 'add' })} data-testid="term-add">
              {t('term.add')}
            </Button>
          )
        }
      >
        {t('term.title')}
      </SectionTitle>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-3 max-w-[760px]">
        {t('term.help')}
      </p>
      {terms.length === 0 ? (
        <EmptyState dense icon={<DateRangeOutlined />} title={t('term.empty')} testId="terms-empty">
          {t('term.emptyBody')}
        </EmptyState>
      ) : (
        <ul className="list-none m-0 p-0 border border-border rounded-[12px] overflow-hidden">
          {terms.map((term, i) => (
            <li className={cn('flex items-center gap-4 px-4 py-3 border-border', i === 0 ? 'border-t-0' : 'border-t', term.endsOn < today ? 'opacity-[0.7]' : 'opacity-[1]')}
              key={term.id}
              data-testid="term-row"
            >
              <div className="w-[40px] h-[40px] rounded-full grid place-items-center bg-secondary text-secondary-foreground shrink-0">
                <DateRangeOutlined />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium tracking-[0.1px] leading-[24px] flex items-center gap-2">
                  {term.name}
                  {current?.id === term.id && term.startsOn <= today && <Chip size="small" color="primary" label={t('term.current')} data-testid="term-current" />}
                </div>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {t('term.dates', { from: fmt.date(term.startsOn, 'short'), to: fmt.date(term.endsOn, 'short') })}
                  {' · '}
                  {term.programs?.length ? t('term.forPrograms', { programs: term.programs.join(', ') }) : t('term.forAll')}
                  {' · '}
                  {t('term.year', { year: term.academicYear })}
                </p>
              </div>
              {canEdit && (
                <>
                  <Tooltip title={t('common.edit')}>
                    <IconButton onClick={() => setOpen({ kind: 'edit', term })} aria-label={t('term.edit', { name: term.name })}>
                      <EditOutlined />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <IconButton onClick={() => setOpen({ kind: 'delete', term })} aria-label={t('term.delete', { name: term.name })}>
                      <DeleteOutlined />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {(open?.kind === 'add' || open?.kind === 'edit') && <TermDialog term={open.kind === 'edit' ? open.term : undefined} terms={terms} programs={programs} onClose={close} />}
      {open?.kind === 'delete' && <DeleteTermDialog term={open.term} onClose={close} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </section>
  );
}

function TermDialog({ term, terms, programs, onClose }: { term?: Term; terms: Term[]; programs: ProgramOption[]; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(term?.name ?? '');
  const [startsOn, setStartsOn] = useState(term?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(term?.endsOn ?? '');
  const [scope, setScope] = useState<'all' | 'some'>(term?.programIds?.length ? 'some' : 'all');
  const [programIds, setProgramIds] = useState<string[]>(term?.programIds ?? []);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const input: TermInput = { name, startsOn, endsOn, programIds: scope === 'all' ? null : programIds };
  const problem = termProblem(input, terms, term?.id);
  const show = (p: NonNullable<typeof problem>[]) => (touched && problem && p.includes(problem) ? t(`term.problem.${problem}`) : undefined);
  const names = new Map(programs.map((p) => [p.id, p.name]));

  const submit = () => {
    setTouched(true);
    if (problem) return;
    setError(null);
    start(async () => {
      const res = term ? await updateTerm(term.id, input) : await createTerm(input);
      if (res.ok) onClose(term ? t('term.saved', { name: name.trim() }) : t('term.added', { name: name.trim() }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={() => !pending && onClose()} maxWidth="sm" fullWidth aria-labelledby="term-dialog-title">
      <DialogTitle id="term-dialog-title">{term ? t('term.dialog.edit') : t('term.dialog.add')}</DialogTitle>
      <DialogContent>
        <div className="flex flex-col gap-5 pt-2">
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <FormField label={t('term.dialog.name')} required>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              error={!!show(['name', 'nameLong'])}
              helperText={show(['name', 'nameLong']) ?? t('term.dialog.nameHelp')}
              slotProps={{ htmlInput: { maxLength: 150, 'data-testid': 'term-name' } }}
            />
          </FormField>
          <div className="grid gap-4 grid-cols-[1fr] sm:grid-cols-[1fr_1fr]">
            <FormField label={t('term.dialog.startsOn')} required>
              <TextInput
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                required
                error={!!show(['startsOn'])}
                helperText={show(['startsOn']) ?? ' '}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'term-starts' } }}
              />
            </FormField>
            <FormField label={t('term.dialog.endsOn')} required>
              <TextInput
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                required
                error={!!show(['endsOn', 'range', 'overlap'])}
                helperText={show(['endsOn', 'range', 'overlap']) ?? ' '}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsOn || undefined, 'data-testid': 'term-ends' } }}
              />
            </FormField>
          </div>
          <FormControl>
            <p className="text-[13px] leading-[19px] text-muted-foreground" id="term-who">
              {t('term.dialog.who')}
            </p>
            <RadioGroup row aria-labelledby="term-who" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'some')}>
              <FormControlLabel value="all" control={<Radio />} label={t('term.dialog.all')} />
              <FormControlLabel value="some" control={<Radio />} label={t('term.dialog.some')} disabled={programs.length === 0} data-testid="term-some" />
            </RadioGroup>
          </FormControl>
          {scope === 'some' && (
            <FormControl error={!!show(['programs'])}>
              <InputLabel id="term-programs">{t('term.dialog.programs')}</InputLabel>
              <Select
                labelId="term-programs"
                label={t('term.dialog.programs')}
                multiple
                value={programIds}
                onChange={(e) => setProgramIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                renderValue={(ids) => ids.map((id) => names.get(id) ?? id).join(', ')}
                data-testid="term-programs"
              >
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Checkbox className="py-0" checked={programIds.includes(p.id)} size="small" />
                    <ListItemText primary={p.name} />
                  </MenuItem>
                ))}
              </Select>
              {show(['programs']) && <FormHelperText>{show(['programs'])}</FormHelperText>}
            </FormControl>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={pending} data-testid="term-submit">
          {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : term ? t('term.dialog.edit.submit') : t('term.dialog.add.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteTermDialog({ term, onClose }: { term: Term; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={() => !pending && onClose()} maxWidth="xs" fullWidth aria-labelledby="term-delete-title">
      <DialogTitle id="term-delete-title">{t('term.deleteTitle', { name: term.name })}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert className="mb-4" severity="error" role="alert">
            {error}
          </Alert>
        )}
        <DialogContentText>{t('term.deleteBody')}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={pending}
          data-testid="term-delete-confirm"
          onClick={() =>
            start(async () => {
              const res = await deleteTerm(term.id);
              if (res.ok) onClose(t('term.deleted', { name: term.name }));
              else setError(res.error);
            })
          }
        >
          {t('term.deleteConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
