'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { assignEnquiry, createEnquiry, loadEnquiry, logActivity, moveEnquiry } from '@/app/(dashboard)/admissions/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ACTIVITY_KINDS, ENQUIRY_SOURCES, ENQUIRY_STAGES, ENQUIRY_STAGE_MOVES, type Counsellor, type Enquiry, type EnquiryDetail, type EnquiryStage } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { ReasonDialog } from './ReasonDialog';

import { Alert, Button, Card, CardActionArea, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem } from '@/components/kx';
import { Plus as Add } from 'lucide-react';
interface Props {
  enquiries: Enquiry[];
  counsellors: Counsellor[];
  programs: { id: string; name: string }[];
  today: string;
}

/** The enquiry pipeline: one column per stage, a card per family. Opening a card is the counsellor's desk. */
export function EnquiryBoard({ enquiries, counsellors, programs, today }: Props) {
  const { t, locale } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [byScore, setByScore] = useState(false);
  const stages = ENQUIRY_STAGES.filter((s) => s !== 'converted' || enquiries.some((e) => e.stage === 'converted'));
  return (
    <>
      <div className="flex justify-end gap-2 mb-4">
        <Button variant={byScore ? 'contained' : 'outlined'} color="inherit" onClick={() => setByScore(!byScore)} data-testid="sort-by-score">
          {byScore ? t('ag.lead.sortScore') : t('ag.lead.sortNewest')}
        </Button>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAdding(true)}>
          {t('adm.enquiry.new')}
        </Button>
      </div>
      <div className="grid grid-flow-col auto-cols-[minmax(250px,1fr)] gap-4 overflow-x-auto pb-2" data-testid="enquiry-board">
        {stages.map((stage) => {
          const items = enquiries.filter((e) => e.stage === stage).sort((a, b) => (byScore ? b.leadScore - a.leadScore : 0));
          return (
            <section className="bg-background border border-border rounded-[20px] p-3 min-h-[160px]" key={stage} aria-label={t(`adm.stage.${stage}` as MessageKey)}>
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-3">
                {t(`adm.stage.${stage}` as MessageKey)} · {items.length}
              </h6>
              <div className="flex flex-col gap-2">
                {items.map((e) => (
                  <Card key={e.id} variant="outlined">
                    <CardActionArea className="p-3" onClick={() => setOpenId(e.id)}>
                      <p className="text-[13px] leading-[19px] font-semibold">
                        {e.name}
                      </p>
                      <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {e.programName ?? t('adm.enquiry.anyProgram')} · {t(`adm.source.${e.source}` as MessageKey)}
                      </div>
                      <div className="flex flex-row gap-1 mt-1.5 flex-wrap gap-y-1">
                        <Chip size="small" color={e.leadScore >= 50 ? 'success' : e.leadScore >= 25 ? 'info' : 'default'} label={t('ag.lead.score', { n: e.leadScore })} title={t('ag.lead.scoreHelp')} data-testid="lead-score" />
                        {e.nextFollowUpOn && e.nextFollowUpOn <= today && stage !== 'lost' && stage !== 'converted' && <Chip size="small" color="warning" label={t('adm.enquiry.followUpDue')} />}
                        <Chip size="small" variant="outlined" label={e.counsellorName ?? t('adm.enquiry.unassigned')} />
                      </div>
                      {e.nextFollowUpOn && (
                        <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-1">
                          {t('adm.enquiry.next', { date: formatDate(e.nextFollowUpOn, 'dayMonth', locale) })}
                        </div>
                      )}
                    </CardActionArea>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {adding && <NewEnquiry programs={programs} onClose={() => setAdding(false)} />}
      {openId && <EnquiryDesk id={openId} counsellors={counsellors} today={today} onClose={() => setOpenId(null)} />}
    </>
  );
}

function NewEnquiry({ programs, onClose }: { programs: Props['programs']; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', programId: '', source: 'walk_in', message: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await createEnquiry(f);
            if (res.ok) {
              router.refresh();
              onClose();
            } else setError(res.error);
          });
        }}
      >
        <DialogTitle>{t('adm.enquiry.new')}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-4 pt-1">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('adm.field.name')} required>
              <TextInput value={f.name} onChange={set('name')} required autoFocus />
            </FormField>
            <FormField label={t('adm.field.phone')} required>
              <TextInput value={f.phone} onChange={set('phone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
            </FormField>
            <FormField label={t('adm.field.email')}>
              <TextInput value={f.email} onChange={set('email')} type="email" />
            </FormField>
            <FormField label={t('adm.field.program')}>
              <TextInput select value={f.programId} onChange={set('programId')}>
                <MenuItem value="">{t('adm.enquiry.anyProgram')}</MenuItem>
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('adm.field.source')}>
              <TextInput select value={f.source} onChange={set('source')}>
                {ENQUIRY_SOURCES.filter((s) => s !== 'web').map((s) => (
                  <MenuItem key={s} value={s}>
                    {t(`adm.source.${s}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('adm.field.message')}>
              <TextInput value={f.message} onChange={set('message')} multiline minRows={2} />
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !f.name.trim() || !f.phone.trim()}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** One enquiry: who, what they asked, counsellor, stage moves and the follow-up trail. */
export function EnquiryDesk({ id, counsellors, today, onClose }: { id: string; counsellors: Counsellor[]; today: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [e, setE] = useState<EnquiryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [note, setNote] = useState({ kind: 'call', note: '', nextFollowUpOn: '' });
  const [pending, start] = useTransition();
  const fetchIt = async () => {
    const res = await loadEnquiry(id);
    if (res.ok) setE(res.data);
    else setError(res.error);
  };
  useEffect(() => {
    void (async () => {
      const res = await loadEnquiry(id);
      if (res.ok) setE(res.data);
      else setError(res.error);
    })();
  }, [id]);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        await fetchIt();
        router.refresh();
      } else setError(res.error ?? null);
    });
  const moves = e ? ENQUIRY_STAGE_MOVES[e.stage as EnquiryStage] : [];
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{e ? e.name : t('common.loading')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert className="mb-4" severity="error">
            {error}
          </Alert>
        )}
        {!e ? (
          <CircularProgress size={24} />
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[13px] leading-[19px]">
                {e.phone}
                {e.email ? ` · ${e.email}` : ''}
              </p>
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {e.programName ?? t('adm.enquiry.anyProgram')} · {t(`adm.source.${e.source}` as MessageKey)} · {formatDate(e.createdAt.slice(0, 10), 'short', locale)}
              </p>
              {e.message && (
                <p className="text-[13px] leading-[19px] mt-2">
                  {`“${e.message}”`}
                </p>
              )}
              {e.lostReason && (
                <Alert className="mt-2" severity="info">
                  {e.lostReason}
                </Alert>
              )}
            </div>
            <FormField label={t('adm.enquiry.counsellor')}>
              <TextInput select value={e.counsellorId ?? ''} disabled={pending} onChange={(ev) => run(() => assignEnquiry(id, ev.target.value || null))}>
                <MenuItem value="">{t('adm.enquiry.unassigned')}</MenuItem>
                {counsellors.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.fullName}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <div>
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
                {t('adm.enquiry.moveTo')} ({t(`adm.stage.${e.stage}` as MessageKey)})
              </h6>
              <div className="flex flex-row gap-2 flex-wrap gap-y-2">
                {moves.map((s) => (
                  <Button key={s} size="small" variant="outlined" disabled={pending} onClick={() => (s === 'lost' ? setLost(true) : run(() => moveEnquiry(id, s)))}>
                    {t(`adm.stage.${s}` as MessageKey)}
                  </Button>
                ))}
                {moves.length === 0 && (
                  <p className="text-[13px] leading-[19px] text-muted-foreground">
                    {t('adm.enquiry.final')}
                  </p>
                )}
              </div>
            </div>
            {e.stage !== 'converted' && e.stage !== 'lost' && (
              <form
                onSubmit={(ev: FormEvent) => {
                  ev.preventDefault();
                  run(async () => {
                    const r = await logActivity(id, note);
                    if (r.ok) setNote({ ...note, note: '', nextFollowUpOn: '' });
                    return r;
                  });
                }}
              >
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
                  {t('adm.enquiry.logContact')}
                </h6>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-row gap-2">
                    <FormField label={t('adm.field.kind')}>
                      <TextInput className="min-w-[130px]" select value={note.kind} onChange={(ev) => setNote({ ...note, kind: ev.target.value })}>
                        {ACTIVITY_KINDS.map((k) => (
                          <MenuItem key={k} value={k}>
                            {t(`adm.kind.${k}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextInput>
                    </FormField>
                    <FormField label={t('adm.enquiry.nextFollowUp')}>
                      <TextInput
                        type="date"
                        value={note.nextFollowUpOn}
                        onChange={(ev) => setNote({ ...note, nextFollowUpOn: ev.target.value })}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                      />
                    </FormField>
                  </div>
                  <FormField label={t('adm.field.note')}>
                    <TextInput value={note.note} onChange={(ev) => setNote({ ...note, note: ev.target.value })} multiline minRows={2} />
                  </FormField>
                  <div>
                    <Button type="submit" variant="contained" size="small" disabled={pending || !note.note.trim()}>
                      {t('adm.enquiry.log')}
                    </Button>
                  </div>
                </div>
              </form>
            )}
            <div>
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
                {t('adm.enquiry.history')}
              </h6>
              {e.activities.length === 0 ? (
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {t('adm.enquiry.noHistory')}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {e.activities.map((a) => (
                    <div key={a.id}>
                      <p className="text-[13px] leading-[19px]">
                        <strong>{t(`adm.kind.${a.kind}` as MessageKey)}</strong> · {a.note}
                      </p>
                      <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {a.actorName ?? t('adm.system')} · {formatDate(a.createdAt.slice(0, 10), 'short', locale)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
      {lost && (
        <ReasonDialog
          title={t('adm.enquiry.markLost')}
          label={t('adm.enquiry.lostReason')}
          required
          confirm={t('adm.enquiry.markLost')}
          onSubmit={(reason) => moveEnquiry(id, 'lost', reason)}
          onClose={(done) => {
            setLost(false);
            if (done) {
              void fetchIt();
              router.refresh();
            }
          }}
        />
      )}
    </Dialog>
  );
}
