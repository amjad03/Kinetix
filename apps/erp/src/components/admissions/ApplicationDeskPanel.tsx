'use client';

import { ArrowRightLeft, Ban, Crown, FileInput, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { decideAdmissionRequest, raiseAdmissionRequest, receiveOriginals, refundQuoteOn, returnOriginal, setAdmissionKind } from '@/app/(dashboard)/admissions/desk-actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, FormRow, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AdmissionRequest, ApplicationDesk, CustodyItem, RefundQuote } from '@/lib/admissions-desk';

type Kind = AdmissionRequest['kind'];
const REQ_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

/**
 * Beside the application review: how the applicant is admitted (nationality, lateral or transfer entry), requests for
 * the principal (management quota, cancellation with its refund, change of programme), originals held in custody, and
 * the scholarships the applicant may qualify for.
 */
export function ApplicationDeskPanel({ applicationId, status, desk, kind, termCount }: { applicationId: string; status: string; desk: ApplicationDesk; kind: { admissionType: string; entryTermOverride: number | null; nationality: string }; termCount: number }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [raising, setRaising] = useState<Kind | null>(null);
  const [rejecting, setRejecting] = useState<AdmissionRequest | null>(null);
  const [returning, setReturning] = useState<CustodyItem | null>(null);
  const [pending, start] = useTransition();
  const enrolled = status === 'enrolled';
  const seatHeld = ['offered', 'accepted', 'enrolled'].includes(status);
  const closed = ['withdrawn', 'rejected', 'declined'].includes(status);
  const open = (k: Kind) => desk.requests.some((r) => r.kind === k && r.status === 'pending');

  const saveKind = (patch: { admissionType?: string; entryTermOverride?: number | null; nationality?: string }) =>
    start(async () => {
      const res = await setAdmissionKind(applicationId, patch);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('adk.kind.saved'));
      router.refresh();
    });
  const approve = (r: AdmissionRequest) =>
    start(async () => {
      const res = await decideAdmissionRequest(r.id, 'approve');
      if (!res.ok) return toast.error(res.error);
      toast.success(t('adk.req.approved'));
      router.refresh();
    });

  const requestLine = (r: AdmissionRequest) => {
    const d = r.data as { refundPaise?: number; paidPaise?: number; toCycleName?: string };
    if (r.kind === 'cancellation' && d.paidPaise !== undefined) return t('adk.req.refundLine', { refund: fmt.rupees(d.refundPaise ?? 0), paid: fmt.rupees(d.paidPaise) });
    if (r.kind === 'programme_change' && d.toCycleName) return t('adk.req.moveLine', { cycle: d.toCycleName });
    if (r.kind === 'management_quota') return t('adk.req.declared');
    return '';
  };

  return (
    <div className="grid gap-6" data-testid="application-desk">
      <Card title={t('adk.kind.title')} subtitle={t('adk.kind.help')}>
        <FormRow>
          <FormField label={t('adk.col.nationality')}>
            <SelectInput value={kind.nationality} disabled={pending || closed} onChange={(e) => saveKind({ nationality: e.target.value })} options={['indian', 'nri', 'foreign'].map((v) => ({ value: v, label: t(`adk.nationality.${v}` as MessageKey) }))} className="min-w-[180px]" />
          </FormField>
          <FormField label={t('adk.col.admissionType')}>
            <SelectInput value={kind.admissionType} disabled={pending || enrolled || closed} onChange={(e) => saveKind({ admissionType: e.target.value })} options={['regular', 'lateral', 'transfer'].map((v) => ({ value: v, label: t(`si.o.admissionType.${v}` as MessageKey) }))} className="min-w-[180px]" />
          </FormField>
          {kind.admissionType !== 'regular' && (
            <FormField label={t('adk.kind.joinsTerm')}>
              <SelectInput value={kind.entryTermOverride ? String(kind.entryTermOverride) : ''} disabled={pending || enrolled || closed} onChange={(e) => saveKind({ entryTermOverride: e.target.value ? Number(e.target.value) : null })} options={Array.from({ length: termCount }, (_, i) => ({ value: String(i + 1), label: t('adk.kind.term', { n: i + 1 }) }))} empty={t('adk.kind.cycleTerm')} className="min-w-[160px]" />
            </FormField>
          )}
        </FormRow>
      </Card>

      <Card title={t('adk.req.title')} subtitle={t('adk.req.help')}>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-9" disabled={pending || closed || enrolled || open('management_quota')} onClick={() => setRaising('management_quota')}>
              <Crown />
              {t('adk.req.kind.management_quota')}
            </Button>
            <Button size="sm" variant="outline" className="h-9" disabled={pending || !seatHeld || open('programme_change') || desk.changeTargets.length === 0} onClick={() => setRaising('programme_change')}>
              <ArrowRightLeft />
              {t('adk.req.kind.programme_change')}
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-red-ink" disabled={pending || !seatHeld || open('cancellation')} onClick={() => setRaising('cancellation')}>
              <Ban />
              {t('adk.req.cancel')}
            </Button>
          </div>
          {desk.requests.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('adk.req.noneHere')}</p>
          ) : (
            <ul className="divide-y rounded-[12px] border">
              {desk.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px] font-[550]">{t(`adk.req.kind.${r.kind}` as MessageKey)}</b>
                    <small className="block text-xs text-muted-foreground">{[fmt.date(r.createdAt.slice(0, 10), 'short'), r.reason, requestLine(r), r.decisionNote].filter(Boolean).join(' · ')}</small>
                  </span>
                  <StatusPill tone={REQ_TONE[r.status]}>{t(`adk.req.status.${r.status}` as MessageKey)}</StatusPill>
                  {desk.canDecide && r.status === 'pending' && (
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => setRejecting(r)}>
                        {t('si.reject')}
                      </Button>
                      <Button size="sm" className="h-9" disabled={pending} onClick={() => approve(r)} data-testid={`approve-${r.kind}`}>
                        {t('si.approve')}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Custody applicationId={applicationId} items={desk.custody} onReturn={setReturning} />

      <Card title={t('adk.sch.title')} subtitle={t('adk.sch.help')}>
        {desk.scholarships.schemes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t('adk.sch.none')}</p>
        ) : (
          <ul className="grid gap-2">
            {desk.scholarships.schemes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.kind === 'percent' ? t('adk.sch.percentOff', { n: s.value }) : t('adk.sch.amountOff', { amount: fmt.rupees(s.value) })}</span>
                <StatusPill tone={s.verdict === 'likely' ? 'success' : s.verdict === 'not_eligible' ? 'danger' : 'neutral'}>{t(`adk.sch.verdict.${s.verdict}` as MessageKey)}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {raising && <RaiseDialog applicationId={applicationId} kind={raising} desk={desk} onClose={() => setRaising(null)} />}
      {rejecting && (
        <ReasonDialog
          title={t('adk.req.rejectTitle', { kind: t(`adk.req.kind.${rejecting.kind}` as MessageKey) })}
          label={t('si.rejectWhy')}
          required
          confirm={t('si.reject')}
          onSubmit={async (note) => {
            const res = await decideAdmissionRequest(rejecting.id, 'reject', note);
            if (res.ok) router.refresh();
            return res;
          }}
          onClose={() => setRejecting(null)}
        />
      )}
      {returning && <ReturnDialog item={returning} onClose={() => setReturning(null)} />}
    </div>
  );
}

function RaiseDialog({ applicationId, kind, desk, onClose }: { applicationId: string; kind: Kind; desk: ApplicationDesk; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [declaration, setDeclaration] = useState(false);
  const [toCycleId, setToCycleId] = useState(desk.changeTargets.find((c) => c.seatsLeft > 0)?.id ?? '');
  const [on, setOn] = useState(desk.refund.on);
  const [quote, setQuote] = useState<RefundQuote>(desk.refund);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (kind !== 'cancellation' || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return;
    let live = true;
    void refundQuoteOn(applicationId, on).then((res) => live && res.ok && setQuote(res.data));
    return () => {
      live = false;
    };
  }, [applicationId, kind, on]);
  const ready = reason.trim().length >= 3 && (kind !== 'management_quota' || declaration) && (kind !== 'programme_change' || !!toCycleId);
  const send = () =>
    start(async () => {
      setError(null);
      const res = await raiseAdmissionRequest(applicationId, { kind, reason, ...(kind === 'management_quota' && { declaration }), ...(kind === 'programme_change' && { toCycleId }), ...(kind === 'cancellation' && { cancelOn: on }) });
      if (!res.ok) return setError(res.error);
      toast.success(t('adk.req.sent'));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={t(`adk.req.kind.${kind}` as MessageKey)}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} disabled={pending || !ready} data-testid="send-request">
            {t('adk.req.send')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-[13px] text-muted-foreground">{t(`adk.req.explain.${kind}` as MessageKey)}</p>
        {error && <Alert severity="error">{error}</Alert>}
        {kind === 'programme_change' && (
          <FormField label={t('adk.req.toProgramme')}>
            <SelectInput value={toCycleId} onChange={(e) => setToCycleId(e.target.value)} options={desk.changeTargets.map((c) => ({ value: c.id, label: t('adk.req.target', { name: c.name, left: c.seatsLeft }) }))} fullWidth />
          </FormField>
        )}
        {kind === 'cancellation' && (
          <>
            <FormField label={t('adk.req.cancelOn')}>
              <TextInput type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </FormField>
            <Alert severity="info">
              {t('adk.req.quote', { paid: fmt.rupees(quote.paidPaise), percent: quote.percent, charge: fmt.rupees(quote.deductionPaise), refund: fmt.rupees(quote.refundPaise), days: quote.daysFromLastDate, last: fmt.date(quote.lastDate, 'short') })}
            </Alert>
          </>
        )}
        <FormField label={t('si.col.reason')} required>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
        </FormField>
        {kind === 'management_quota' && <CheckboxField label={t('adk.req.declaration')} checked={declaration} onChange={setDeclaration} />}
      </div>
    </Dialog>
  );
}

function Custody({ applicationId, items, onReturn }: { applicationId: string; items: CustodyItem[]; onReturn: (c: CustodyItem) => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [doc, setDoc] = useState('');
  const [ref, setRef] = useState('');
  const [pending, start] = useTransition();
  const receive = () =>
    start(async () => {
      const res = await receiveOriginals(applicationId, [{ document: doc, referenceNo: ref }]);
      if (!res.ok) return toast.error(res.error);
      setDoc('');
      setRef('');
      toast.success(t('adk.custody.received'));
      router.refresh();
    });
  return (
    <Card title={t('adk.custody.title')} subtitle={t('adk.custody.help')}>
      <div className="grid gap-4">
        {items.length > 0 && (
          <ul className="divide-y rounded-[12px] border">
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-[550]">{c.document}</b>
                  <small className="block text-xs text-muted-foreground">
                    {[c.referenceNo, t('adk.custody.receivedOn', { date: fmt.date(c.receivedOn, 'short') }), c.returnedOn ? t('adk.custody.returnedLine', { date: fmt.date(c.returnedOn, 'short'), to: c.returnedTo ?? '', ack: c.acknowledgement ?? '' }) : null].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <StatusPill tone={c.status === 'held' ? 'warning' : 'success'}>{t(`adk.custody.${c.status}` as MessageKey)}</StatusPill>
                {c.status === 'held' && (
                  <Button size="sm" variant="outline" className="h-9" onClick={() => onReturn(c)}>
                    <Undo2 />
                    {t('adk.custody.return')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <FormRow>
          <FormField label={t('adk.col.document')}>
            <TextInput value={doc} onChange={(e) => setDoc(e.target.value)} placeholder={t('adk.custody.docExample')} className="min-w-[220px]" slotProps={{ htmlInput: { maxLength: 160 } }} />
          </FormField>
          <FormField label={t('adk.col.reference')}>
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} className="min-w-[160px]" slotProps={{ htmlInput: { maxLength: 80 } }} />
          </FormField>
          <Button className="h-10" onClick={receive} disabled={pending || doc.trim().length < 2} data-testid="receive-original">
            <FileInput />
            {t('adk.custody.receive')}
          </Button>
        </FormRow>
      </div>
    </Card>
  );
}

function ReturnDialog({ item, onClose }: { item: CustodyItem; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [to, setTo] = useState('');
  const [ack, setAck] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await returnOriginal(item.id, { returnedTo: to, acknowledgement: ack });
      if (!res.ok) return setError(res.error);
      toast.success(t('adk.custody.returned.done'));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={t('adk.custody.returnTitle', { doc: item.document })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} disabled={pending || to.trim().length < 2 || ack.trim().length < 2}>
            {t('adk.custody.return')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        <FormField label={t('adk.custody.returnedTo')}>
          <TextInput value={to} onChange={(e) => setTo(e.target.value)} fullWidth />
        </FormField>
        <FormField label={t('adk.custody.signedBy')} helper={t('adk.custody.signedHelp')}>
          <TextInput value={ack} onChange={(e) => setAck(e.target.value)} fullWidth />
        </FormField>
      </div>
    </Dialog>
  );
}
