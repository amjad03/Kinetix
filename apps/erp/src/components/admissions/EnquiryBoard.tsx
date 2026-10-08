'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { assignEnquiry, createEnquiry, loadEnquiry, logActivity, moveEnquiry } from '@/app/(dashboard)/admissions/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ACTIVITY_KINDS, ENQUIRY_SOURCES, ENQUIRY_STAGES, ENQUIRY_STAGE_MOVES, type Counsellor, type Enquiry, type EnquiryDetail, type EnquiryStage } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { ReasonDialog } from './ReasonDialog';

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
  const stages = ENQUIRY_STAGES.filter((s) => s !== 'converted' || enquiries.some((e) => e.stage === 'converted'));
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAdding(true)}>
          {t('adm.enquiry.new')}
        </Button>
      </Box>
      <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(250px, 1fr)', gap: 2, overflowX: 'auto', pb: 1 }} data-testid="enquiry-board">
        {stages.map((stage) => {
          const items = enquiries.filter((e) => e.stage === stage);
          return (
            <Box key={stage} component="section" aria-label={t(`adm.stage.${stage}` as MessageKey)} sx={{ bgcolor: 'kx.frame', borderRadius: 2, p: 1.5, minHeight: 160 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                {t(`adm.stage.${stage}` as MessageKey)} · {items.length}
              </Typography>
              <Stack spacing={1}>
                {items.map((e) => (
                  <Card key={e.id} variant="outlined">
                    <CardActionArea onClick={() => setOpenId(e.id)} sx={{ p: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {e.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {e.programName ?? t('adm.enquiry.anyProgram')} · {t(`adm.source.${e.source}` as MessageKey)}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
                        {e.nextFollowUpOn && e.nextFollowUpOn <= today && stage !== 'lost' && stage !== 'converted' && <Chip size="small" color="warning" label={t('adm.enquiry.followUpDue')} />}
                        <Chip size="small" variant="outlined" label={e.counsellorName ?? t('adm.enquiry.unassigned')} />
                      </Stack>
                      {e.nextFollowUpOn && (
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                          {t('adm.enquiry.next', { date: formatDate(e.nextFollowUpOn, 'dayMonth', locale) })}
                        </Typography>
                      )}
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
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
          <Stack spacing={2} sx={{ pt: 0.5 }}>
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
          </Stack>
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

function EnquiryDesk({ id, counsellors, today, onClose }: { id: string; counsellors: Counsellor[]; today: string; onClose: () => void }) {
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
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!e ? (
          <CircularProgress size={24} />
        ) : (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="body2">
                {e.phone}
                {e.email ? ` · ${e.email}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {e.programName ?? t('adm.enquiry.anyProgram')} · {t(`adm.source.${e.source}` as MessageKey)} · {formatDate(e.createdAt.slice(0, 10), 'short', locale)}
              </Typography>
              {e.message && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {`“${e.message}”`}
                </Typography>
              )}
              {e.lostReason && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {e.lostReason}
                </Alert>
              )}
            </Box>
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
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('adm.enquiry.moveTo')} ({t(`adm.stage.${e.stage}` as MessageKey)})
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {moves.map((s) => (
                  <Button key={s} size="small" variant="outlined" disabled={pending} onClick={() => (s === 'lost' ? setLost(true) : run(() => moveEnquiry(id, s)))}>
                    {t(`adm.stage.${s}` as MessageKey)}
                  </Button>
                ))}
                {moves.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t('adm.enquiry.final')}
                  </Typography>
                )}
              </Stack>
            </Box>
            {e.stage !== 'converted' && e.stage !== 'lost' && (
              <Box
                component="form"
                onSubmit={(ev: FormEvent) => {
                  ev.preventDefault();
                  run(async () => {
                    const r = await logActivity(id, note);
                    if (r.ok) setNote({ ...note, note: '', nextFollowUpOn: '' });
                    return r;
                  });
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('adm.enquiry.logContact')}
                </Typography>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1}>
                    <FormField label={t('adm.field.kind')}>
                      <TextInput select value={note.kind} onChange={(ev) => setNote({ ...note, kind: ev.target.value })} sx={{ minWidth: 130 }}>
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
                  </Stack>
                  <FormField label={t('adm.field.note')}>
                    <TextInput value={note.note} onChange={(ev) => setNote({ ...note, note: ev.target.value })} multiline minRows={2} />
                  </FormField>
                  <Box>
                    <Button type="submit" variant="contained" size="small" disabled={pending || !note.note.trim()}>
                      {t('adm.enquiry.log')}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('adm.enquiry.history')}
              </Typography>
              {e.activities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('adm.enquiry.noHistory')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {e.activities.map((a) => (
                    <Box key={a.id}>
                      <Typography variant="body2">
                        <strong>{t(`adm.kind.${a.kind}` as MessageKey)}</strong> · {a.note}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.actorName ?? t('adm.system')} · {formatDate(a.createdAt.slice(0, 10), 'short', locale)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
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
