'use client';

import { Plus, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { addClaim, computeSettlement, decideDeclaration, placeOnMatrix, runIncrements, saveBankFile, saveMyDeclaration, saveSettlement, submitMyDeclaration, uploadProof, verifyDeclaration } from '@/app/(dashboard)/payroll/pass-actions';
import { Alert, Button } from '@/components/kx';
import { Card, CheckboxField, DataTable, Dialog, EmptyState, FormActions, FormField, FormGrid, FormRow, FormRowActions, SelectInput, StatGrid, StatTile, StatusPill, TextInput, useToast, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { downloadUrl } from '@/lib/hr';
import { CLAIM_CATEGORIES, DECLARATION_SECTIONS, declaredTotal, toPaise, type BankFileSettings, type Claim, type Declaration, type DeclarationInput, type DeclarationSection, type IncrementPreview, type MatrixLevel, type MatrixStaff, type Settlement } from '@/lib/hr-pass';
import { formatRupees } from '@/lib/money';
import type { ActionResult } from '@/lib/types';

/** Runs a server action with a toast either way and refreshes the page on success. */
function useAct() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, done?: (v: T) => void, success: MessageKey = 'hk.done') =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t(success));
        done?.(r.data);
        router.refresh();
      }
    });
  return { busy, run };
}

const DECL_TONE: Record<string, Tone> = { draft: 'neutral', submitted: 'warning', approved: 'info', proofs_submitted: 'warning', verified: 'success', rejected: 'danger' };
const CLAIM_TONE: Record<string, Tone> = { submitted: 'warning', approved: 'info', paid: 'success', rejected: 'danger', cancelled: 'neutral' };
const PROOF_TONE: Record<string, Tone> = { none: 'neutral', submitted: 'warning', accepted: 'success', rejected: 'danger' };
const rupeesText = (p: number) => (p / 100).toFixed(0);

// ----- my tax declaration and claims ------------------------------------------------------------------

interface DraftItem {
  section: DeclarationSection;
  label: string;
  amount: string;
}

/** A staff member's own investment declaration (old or new regime, rent for HRA, each investment) and its proofs. */
export function MyDeclaration({ fy, declaration }: { fy: number; declaration: Declaration | null }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const d = declaration;
  const editable = !d || d.status === 'draft' || d.status === 'rejected';
  const [regime, setRegime] = useState<'old' | 'new'>(d?.regime ?? 'new');
  const [rent, setRent] = useState(d ? rupeesText(d.rentMonthlyPaise) : '0');
  const [months, setMonths] = useState(String(d?.rentMonths ?? 0));
  const [metro, setMetro] = useState(d?.metro ?? false);
  const [landlord, setLandlord] = useState(d?.landlordName ?? '');
  const [landlordPan, setLandlordPan] = useState(d?.landlordPan ?? '');
  const [items, setItems] = useState<DraftItem[]>(d?.items.map((i) => ({ section: i.section, label: i.label, amount: rupeesText(i.declaredPaise) })) ?? [{ section: '80C', label: '', amount: '' }]);
  const sections = DECLARATION_SECTIONS.map((s) => ({ value: s, label: t(`hp.sec.${s}` as MessageKey) }));

  const body = (): DeclarationInput | null => {
    const parsed = items.filter((i) => i.amount.trim() !== '').map((i) => ({ section: i.section, label: i.label.trim(), declaredPaise: toPaise(i.amount) ?? -1 }));
    const rentPaise = toPaise(rent);
    if (parsed.some((i) => i.declaredPaise <= 0) || rentPaise === null) return null;
    return { fy, regime, rentMonthlyPaise: rentPaise, rentMonths: Math.min(12, Math.max(0, Number(months) || 0)), metro, landlordName: landlord.trim(), landlordPan: landlordPan.trim() || null, items: parsed, expectedVersion: d?.version };
  };
  const save = () => {
    const b = body();
    if (!b) return run(async () => ({ ok: false as const, error: t('hp.err.amount') }));
    run(() => saveMyDeclaration(b));
  };

  return (
    <Card title={t('hp.my.declTitle', { fy: d?.fyLabel ?? `${fy}-${String(fy + 1).slice(2)}` })} subtitle={t('hp.my.declHelp')} action={d && <StatusPill tone={DECL_TONE[d.status]}>{t(`hp.decl.status.${d.status}` as MessageKey)}</StatusPill>} testId="my-declaration">
      {d?.decisionNote && <Alert severity={d.status === 'rejected' ? 'warning' : 'info'} className="mb-4">{d.decisionNote}</Alert>}
      {d && (
        <StatGrid min={180}>
          <StatTile label={t('hp.est.old')} value={formatRupees(d.estimate.oldPaise)} caption={t('hp.est.caption')} />
          <StatTile label={t('hp.est.new')} value={formatRupees(d.estimate.newPaise)} caption={t('hp.est.caption')} />
          <StatTile label={t('hp.fig.c80')} value={formatRupees((d.accepted ?? d.declared).section80cPaise)} />
          <StatTile label={t('hp.fig.hra')} value={formatRupees((d.accepted ?? d.declared).hraExemptPaise)} />
        </StatGrid>
      )}
      <div className="mt-5 flex flex-col gap-4">
        <FormGrid cols={3}>
          <FormField label={t('hp.f.regime')} helper={t('hp.f.regimeHelp')}>
            <SelectInput disabled={!editable} value={regime} onChange={(e) => setRegime(e.target.value as 'old' | 'new')} options={[{ value: 'new', label: t('hp.regime.new') }, { value: 'old', label: t('hp.regime.old') }]} />
          </FormField>
          <FormField label={t('hp.f.rent')}>
            <TextInput disabled={!editable} inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} />
          </FormField>
          <FormField label={t('hp.f.rentMonths')}>
            <TextInput disabled={!editable} type="number" value={months} onChange={(e) => setMonths(e.target.value)} />
          </FormField>
          <FormField label={t('hp.f.landlord')}>
            <TextInput disabled={!editable} value={landlord} onChange={(e) => setLandlord(e.target.value)} />
          </FormField>
          <FormField label={t('hp.f.landlordPan')} helper={t('hp.f.landlordPanHelp')}>
            <TextInput disabled={!editable} value={landlordPan} onChange={(e) => setLandlordPan(e.target.value.toUpperCase())} />
          </FormField>
          <div className="flex items-end">
            <CheckboxField disabled={!editable} label={t('hp.f.metro')} checked={metro} onChange={setMetro} />
          </div>
        </FormGrid>

        <div className="flex flex-col gap-3">
          {items.map((it, k) => {
            const saved = d?.items[k];
            return (
              <FormRow key={k}>
                <FormField label={t('hp.f.section')}>
                  <SelectInput disabled={!editable} value={it.section} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, section: e.target.value as DeclarationSection } : x)))} options={sections} />
                </FormField>
                <FormField label={t('hp.f.what')}>
                  <TextInput disabled={!editable} value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} />
                </FormField>
                <FormField label={t('hp.f.amount')}>
                  <TextInput disabled={!editable} inputMode="decimal" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, amount: e.target.value } : x)))} />
                </FormField>
                <FormRowActions>
                  {editable && (
                    <Button variant="outlined" aria-label={t('hp.remove')} onClick={() => setItems(items.filter((_, j) => j !== k))}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                  {saved && saved.proofStatus !== 'none' && <StatusPill tone={PROOF_TONE[saved.proofStatus]}>{t(`hp.proof.${saved.proofStatus}` as MessageKey)}</StatusPill>}
                  {saved && d?.status === 'approved' && <ProofUpload itemId={saved.id} />}
                </FormRowActions>
              </FormRow>
            );
          })}
        </div>
        <p className="m-0 text-sm text-muted-foreground">{t('hp.total', { amount: formatRupees(declaredTotal(items.map((i) => ({ declaredPaise: toPaise(i.amount) ?? 0 })))) })}</p>
        <FormActions>
          {editable && (
            <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setItems([...items, { section: '80C', label: '', amount: '' }])}>
              {t('hp.addItem')}
            </Button>
          )}
          {editable && <Button variant="outlined" disabled={busy} onClick={save}>{t('hp.saveDraft')}</Button>}
          {editable && d && <Button variant="contained" disabled={busy} onClick={() => run(() => submitMyDeclaration(fy, false))}>{t('hp.submit')}</Button>}
          {d?.status === 'approved' && <Button variant="contained" disabled={busy} onClick={() => run(() => submitMyDeclaration(fy, true))}>{t('hp.submitProofs')}</Button>}
        </FormActions>
      </div>
    </Card>
  );
}

function ProofUpload({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const form = new FormData();
          form.set('file', f);
          run(() => uploadProof(itemId, form));
        }}
      />
      <Button variant="outlined" disabled={busy} startIcon={<Upload size={16} />} onClick={() => ref.current?.click()}>
        {t('hp.attachProof')}
      </Button>
    </>
  );
}

/** A staff member's own reimbursement claims and the form for a new one, with the bill. */
export function MyClaims({ claims, today }: { claims: Claim[]; today: string }) {
  const { t, d } = useFmtLite();
  const { busy, run } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: 'travel', spentOn: today, amount: '', description: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    const amountPaise = toPaise(f.amount);
    if (!amountPaise) return run(async () => ({ ok: false as const, error: t('hp.err.amount') }));
    const form = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) form.set('file', file);
    run(() => addClaim({ category: f.category, spentOn: f.spentOn, amountPaise, description: f.description.trim() }, form), () => setOpen(false));
  };
  return (
    <Card title={t('hp.my.claimsTitle')} subtitle={t('hp.my.claimsHelp')} action={<Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('hp.newClaim')}</Button>} testId="my-claims">
      {claims.length === 0 ? (
        <EmptyState title={t('hp.empty.myClaims')} description={t('hp.empty.myClaimsBody')} />
      ) : (
        <DataTable
          label={t('hp.my.claimsTitle')}
          rows={claims}
          rowId={(c) => c.id}
          exportName="my-claims"
          columns={[
            { id: 'no', header: t('hp.col.claim'), rowHeader: true, cell: (c) => c.claimNo },
            { id: 'cat', header: t('hp.col.category'), cell: (c) => t(`hp.cat.${c.category}` as MessageKey) },
            { id: 'on', header: t('hp.col.billDate'), cell: (c) => d(c.spentOn) },
            { id: 'amt', header: t('hp.col.claimed'), align: 'right', cell: (c) => formatRupees(c.amountPaise) },
            { id: 'ok', header: t('hp.col.approved'), align: 'right', cell: (c) => (c.approvedPaise === null ? '–' : formatRupees(c.approvedPaise)) },
            { id: 'pm', header: t('hp.col.payMonth'), cell: (c) => c.payMonth ?? '–' },
            { id: 'st', header: t('hk.col.status'), cell: (c) => <StatusPill tone={CLAIM_TONE[c.status]}>{t(`hp.claim.status.${c.status}` as MessageKey)}</StatusPill> },
            { id: 'bill', header: t('hp.col.bill'), align: 'right', csv: false, cell: (c) => (c.hasBill ? <a className="text-primary underline-offset-4 hover:underline" href={downloadUrl.claimBill(c.id)}>{t('hp.view')}</a> : '–') },
          ]}
        />
      )}
      {open && (
        <Dialog
          title={t('hp.newClaim')}
          onClose={() => setOpen(false)}
          busy={busy}
          actions={
            <>
              <Button variant="outlined" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="contained" disabled={busy || f.description.trim().length < 3} onClick={submit}>{t('hp.submit')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <FormField label={t('hp.col.category')} helper={t('hp.taxFreeHelp')}>
              <SelectInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CLAIM_CATEGORIES.map((c) => ({ value: c, label: t(`hp.cat.${c}` as MessageKey) }))} />
            </FormField>
            <FormGrid>
              <FormField label={t('hp.col.billDate')}>
                <TextInput type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
              </FormField>
              <FormField label={t('hp.f.amount')}>
                <TextInput inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
              </FormField>
            </FormGrid>
            <FormField label={t('hp.f.forWhat')}>
              <TextInput multiline minRows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </FormField>
            <FormField label={t('hp.col.bill')} helper={t('hp.billHelp')}>
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
            </FormField>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

/** `d` for dates without the whole formatting hook. */
function useFmtLite() {
  const { t, locale } = useI18n();
  const d = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso)) : '–');
  return { t, d };
}

// ----- declaration review ---------------------------------------------------------------------------------

/** HR or accounts: a declaration's items and proofs, approve or send back, and verify each proof for an amount. */
export function DeclarationReview({ d }: { d: Declaration }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const [note, setNote] = useState('');
  const [decisions, setDecisions] = useState<Record<string, { accepted: boolean; amount: string }>>(Object.fromEntries(d.items.map((i) => [i.id, { accepted: i.proofStatus !== 'none', amount: rupeesText(i.acceptedPaise ?? i.declaredPaise) }])));
  const figures = d.accepted ?? d.declared;
  const verify = () =>
    run(() =>
      verifyDeclaration(
        d.id,
        d.version,
        d.items.map((i) => ({ id: i.id, accepted: decisions[i.id].accepted, acceptedPaise: decisions[i.id].accepted ? (toPaise(decisions[i.id].amount) ?? 0) : undefined })),
        note,
      ),
    );
  return (
    <div className="flex flex-col gap-6">
      <StatGrid min={180}>
        <StatTile label={t('hp.fig.c80')} value={formatRupees(figures.section80cPaise)} caption={t('hp.fig.c80Caption')} />
        <StatTile label={t('hp.fig.other')} value={formatRupees(figures.otherDeductionsPaise)} />
        <StatTile label={t('hp.fig.hra')} value={formatRupees(figures.hraExemptPaise)} />
        <StatTile label={t('hp.est.old')} value={formatRupees(d.estimate.oldPaise)} caption={t('hp.est.new') + ': ' + formatRupees(d.estimate.newPaise)} />
      </StatGrid>
      <Card title={t('hp.items')} subtitle={d.regime === 'new' ? t('hp.newRegimeNote') : undefined}>
        <DataTable
          label={t('hp.items')}
          rows={d.items}
          rowId={(i) => i.id}
          exportName={`declaration-${d.employeeCode ?? d.userId}`}
          columns={[
            { id: 's', header: t('hp.f.section'), rowHeader: true, cell: (i) => t(`hp.sec.${i.section}` as MessageKey) },
            { id: 'l', header: t('hp.f.what'), cell: (i) => i.label || '–' },
            { id: 'a', header: t('hp.col.declared'), align: 'right', cell: (i) => formatRupees(i.declaredPaise) },
            { id: 'p', header: t('hp.col.proof'), cell: (i) => (i.proofName ? <a className="text-primary underline-offset-4 hover:underline" href={downloadUrl.taxProof(i.id)}>{i.proofName}</a> : <StatusPill tone={PROOF_TONE[i.proofStatus]}>{t(`hp.proof.${i.proofStatus}` as MessageKey)}</StatusPill>) },
            {
              id: 'ok',
              header: t('hp.col.accept'),
              csv: false,
              cell: (i) =>
                d.status === 'proofs_submitted' ? (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" aria-label={t('hp.col.accept')} checked={decisions[i.id].accepted} onChange={(e) => setDecisions({ ...decisions, [i.id]: { ...decisions[i.id], accepted: e.target.checked } })} />
                    <TextInput className="w-28" inputMode="decimal" disabled={!decisions[i.id].accepted} value={decisions[i.id].amount} onChange={(e) => setDecisions({ ...decisions, [i.id]: { ...decisions[i.id], amount: e.target.value } })} />
                  </div>
                ) : i.acceptedPaise !== null ? (
                  formatRupees(i.acceptedPaise)
                ) : (
                  '–'
                ),
            },
          ]}
        />
      </Card>
      <Card title={t('hp.rent')}>
        <p className="m-0 text-sm">{d.rentMonthlyPaise > 0 ? t('hp.rentLine', { rent: formatRupees(d.rentMonthlyPaise), months: d.rentMonths, landlord: d.landlordName || '–', pan: d.landlordPan ?? '–' }) : t('hp.noRent')}</p>
      </Card>
      {(d.status === 'submitted' || d.status === 'proofs_submitted') && (
        <Card title={t('hp.decide')}>
          <FormField label={t('hp.note')}>
            <TextInput multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FormActions>
            <Button variant="outlined" color="error" disabled={busy || note.trim().length < 3} onClick={() => run(() => decideDeclaration(d.id, 'reject', d.version, note))}>{t('hp.sendBack')}</Button>
            {d.status === 'submitted' && <Button variant="contained" disabled={busy} onClick={() => run(() => decideDeclaration(d.id, 'approve', d.version, note))}>{t('hp.approve')}</Button>}
            {d.status === 'proofs_submitted' && <Button variant="contained" disabled={busy} onClick={verify}>{t('hp.verify')}</Button>}
          </FormActions>
        </Card>
      )}
    </div>
  );
}

// ----- pay matrix ---------------------------------------------------------------------------------------------

/** The 7th CPC matrix: staff on it, placement and promotion, and the annual increment run. */
export function PayMatrixDesk({ levels, staff, staffOptions, canApprove, today }: { levels: MatrixLevel[]; staff: MatrixStaff[]; staffOptions: { id: string; fullName: string; employeeCode: string }[]; canApprove: boolean; today: string }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const july = `${Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) + 1 : today.slice(0, 4)}-07-01`;
  const [on, setOn] = useState(july);
  const [preview, setPreview] = useState<IncrementPreview | null>(null);
  const [placing, setPlacing] = useState<{ userId: string; kind: 'placement' | 'promotion' } | null>(null);
  const [levelView, setLevelView] = useState(levels[0]?.id ?? '');
  const shown = levels.find((l) => l.id === levelView);
  const payroll = staff.reduce((n, s) => n + (s.basicPaise ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <StatGrid min={180}>
        <StatTile label={t('hp.mx.levels')} value={levels.length} />
        <StatTile label={t('hp.mx.onMatrix')} value={staff.length} />
        <StatTile label={t('hp.mx.basicTotal')} value={formatRupees(payroll)} caption={t('hp.mx.basicCaption')} />
        <StatTile label={t('hp.mx.atTop')} value={staff.filter((s) => s.cell !== null && s.cell >= s.cellCount).length} caption={t('hp.mx.atTopCaption')} />
      </StatGrid>

      <Card title={t('hp.mx.staff')} action={canApprove && <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setPlacing({ userId: '', kind: 'placement' })}>{t('hp.mx.place')}</Button>}>
        {staff.length === 0 ? (
          <EmptyState title={t('hp.empty.matrix')} description={t('hp.empty.matrixBody')} />
        ) : (
          <DataTable
            label={t('hp.mx.staff')}
            rows={staff}
            rowId={(s) => s.userId}
            rowHref={(s) => `/hr/staff/${s.userId}`}
            exportName="pay-matrix-staff"
            columns={[
              { id: 'n', header: t('hk.col.staff'), rowHeader: true, sort: (s) => s.fullName, cell: (s) => `${s.fullName} · ${s.employeeCode}` },
              { id: 'l', header: t('hp.mx.level'), sort: (s) => s.level, cell: (s) => s.levelName },
              { id: 'c', header: t('hp.mx.cell'), align: 'right', sort: (s) => s.cell ?? 0, cell: (s) => `${s.cell ?? '–'} / ${s.cellCount}` },
              { id: 'b', header: t('hp.mx.basic'), align: 'right', sort: (s) => s.basicPaise ?? 0, cell: (s) => (s.basicPaise === null ? '–' : formatRupees(s.basicPaise)) },
              { id: 'x', header: t('hp.mx.next'), align: 'right', cell: (s) => (s.nextBasicPaise === null ? t('hp.mx.top') : formatRupees(s.nextBasicPaise)) },
              { id: 'h', header: t('hp.mx.hraClass'), cell: (s) => s.hraClass },
              { id: 'actions', header: '', align: 'right', csv: false, cell: (s) => (canApprove ? <Button variant="outlined" onClick={() => setPlacing({ userId: s.userId, kind: 'promotion' })}>{t('hp.mx.promote')}</Button> : null) },
            ]}
          />
        )}
      </Card>

      {canApprove && (
        <Card title={t('hp.mx.increment')} subtitle={t('hp.mx.incrementHelp')}>
          <FormRow>
            <FormField label={t('hp.mx.on')}>
              <TextInput type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </FormField>
            <FormRowActions>
              <Button variant="outlined" disabled={busy} onClick={() => run(() => runIncrements(on, false), setPreview, 'hp.mx.previewed')}>{t('hp.mx.preview')}</Button>
              <Button variant="contained" disabled={busy || !preview || preview.on !== on || preview.due === 0} onClick={() => run(() => runIncrements(on, true), setPreview, 'hp.mx.applied')}>{t('hp.mx.apply')}</Button>
            </FormRowActions>
          </FormRow>
          {preview && (
            <div className="mt-4">
              <p className="m-0 mb-3 text-sm">{t(preview.applied ? 'hp.mx.appliedCount' : 'hp.mx.dueCount', { n: preview.due })}</p>
              <DataTable
                label={t('hp.mx.increment')}
                rows={preview.staff}
                rowId={(s) => s.userId}
                exportName={`increments-${preview.on}`}
                columns={[
                  { id: 'n', header: t('hk.col.staff'), rowHeader: true, cell: (s) => s.fullName },
                  { id: 'l', header: t('hp.mx.level'), cell: (s) => s.level },
                  { id: 'f', header: t('hp.mx.from'), align: 'right', cell: (s) => (s.fromBasicPaise === null ? '–' : `${formatRupees(s.fromBasicPaise)} (${s.fromCell})`) },
                  { id: 't', header: t('hp.mx.to'), align: 'right', cell: (s) => (s.toBasicPaise === null ? '–' : `${formatRupees(s.toBasicPaise)} (${s.toCell})`) },
                  { id: 'd', header: t('hk.col.status'), cell: (s) => <StatusPill tone={s.due ? 'success' : 'neutral'}>{s.due ? t('hp.mx.due') : s.reason}</StatusPill> },
                ]}
              />
            </div>
          )}
        </Card>
      )}

      <Card title={t('hp.mx.cells')} action={<SelectInput aria-label={t('hp.mx.level')} value={levelView} onChange={(e) => setLevelView(e.target.value)} options={levels.map((l) => ({ value: l.id, label: `${l.level} · ${l.name}` }))} />}>
        {shown && (
          <div className="flex flex-wrap gap-2" data-testid="matrix-cells">
            {shown.cells.map((c, k) => (
              <span key={k} className="rounded-md border border-border px-2 py-1 text-sm tabular-nums">
                <span className="text-muted-foreground">{k + 1}.</span> {formatRupees(c)}
              </span>
            ))}
          </div>
        )}
      </Card>

      {placing && <PlaceDialog levels={levels} staffOptions={staffOptions} initial={placing} onClose={() => setPlacing(null)} />}
    </div>
  );
}

function PlaceDialog({ levels, staffOptions, initial, onClose }: { levels: MatrixLevel[]; staffOptions: { id: string; fullName: string; employeeCode: string }[]; initial: { userId: string; kind: 'placement' | 'promotion' }; onClose: () => void }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const [f, setF] = useState({ userId: initial.userId, levelId: levels[0]?.id ?? '', cell: '1', effectiveFrom: '', hraClass: 'Y', orderNo: '', note: '' });
  const level = levels.find((l) => l.id === f.levelId);
  const promotion = initial.kind === 'promotion';
  return (
    <Dialog
      title={t(promotion ? 'hp.mx.promoteTitle' : 'hp.mx.placeTitle')}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outlined" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="contained" disabled={busy || !f.userId || !f.levelId || !f.effectiveFrom} onClick={() => run(() => placeOnMatrix(f.userId, { levelId: f.levelId, cell: promotion ? undefined : Number(f.cell), effectiveFrom: f.effectiveFrom, kind: initial.kind, hraClass: f.hraClass, orderNo: f.orderNo, note: f.note }), onClose)}>
            {t(promotion ? 'hp.mx.promote' : 'hp.mx.place')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!initial.userId && (
          <FormField label={t('hk.col.staff')}>
            <SelectInput value={f.userId} empty="" onChange={(e) => setF({ ...f, userId: e.target.value })} options={staffOptions.map((s) => ({ value: s.id, label: `${s.fullName} (${s.employeeCode})` }))} />
          </FormField>
        )}
        <FormField label={t('hp.mx.level')}>
          <SelectInput value={f.levelId} onChange={(e) => setF({ ...f, levelId: e.target.value })} options={levels.map((l) => ({ value: l.id, label: `${l.level} · ${l.name}` }))} />
        </FormField>
        <FormGrid>
          {!promotion && (
            <FormField label={t('hp.mx.cell')} helper={level ? formatRupees(level.cells[Number(f.cell) - 1] ?? 0) : undefined}>
              <SelectInput value={f.cell} onChange={(e) => setF({ ...f, cell: e.target.value })} options={(level?.cells ?? []).map((c, k) => ({ value: String(k + 1), label: `${k + 1} · ${formatRupees(c)}` }))} />
            </FormField>
          )}
          <FormField label={t('hp.mx.from')} helper={t('hp.mx.firstOfMonth')}>
            <TextInput type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
          </FormField>
          <FormField label={t('hp.mx.hraClass')}>
            <SelectInput value={f.hraClass} onChange={(e) => setF({ ...f, hraClass: e.target.value })} options={['X', 'Y', 'Z'].map((c) => ({ value: c, label: t(`hp.mx.class.${c}` as MessageKey) }))} />
          </FormField>
          <FormField label={t('hp.mx.orderNo')}>
            <TextInput value={f.orderNo} onChange={(e) => setF({ ...f, orderNo: e.target.value })} />
          </FormField>
        </FormGrid>
        {promotion && <Alert severity="info">{t('hp.mx.fixRule')}</Alert>}
        <FormField label={t('hp.note')}>
          <TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </FormField>
      </div>
    </Dialog>
  );
}

// ----- bank file settings --------------------------------------------------------------------------------------

/** The bank's upload format for the salary file and the institution's debit account (stored encrypted). */
export function BankFileCard({ settings, canEdit }: { settings: BankFileSettings; canEdit: boolean }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const [f, setF] = useState({ format: settings.format, debitAccount: '', corporateId: settings.corporateId });
  return (
    <Card title={t('hp.bank.title')} subtitle={t('hp.bank.help')} testId="bank-file">
      <FormRow>
        <FormField label={t('hp.bank.format')}>
          <SelectInput disabled={!canEdit} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as BankFileSettings['format'] })} options={(['generic', 'sbi', 'canara', 'hdfc'] as const).map((b) => ({ value: b, label: t(`hp.bank.${b}`) }))} />
        </FormField>
        <FormField label={t('hp.bank.debit')} helper={settings.debitAccountLast4 ? t('hp.bank.saved', { last4: settings.debitAccountLast4 }) : t('hp.bank.none')}>
          <TextInput disabled={!canEdit} inputMode="numeric" value={f.debitAccount} onChange={(e) => setF({ ...f, debitAccount: e.target.value.replace(/\D/g, '') })} />
        </FormField>
        <FormField label={t('hp.bank.corporateId')}>
          <TextInput disabled={!canEdit} value={f.corporateId} onChange={(e) => setF({ ...f, corporateId: e.target.value })} />
        </FormField>
        {canEdit && (
          <FormRowActions>
            <Button variant="contained" disabled={busy} onClick={() => run(() => saveBankFile(f))}>{t('hp.save')}</Button>
          </FormRowActions>
        )}
      </FormRow>
    </Card>
  );
}

// ----- full and final settlement -------------------------------------------------------------------------------

/** The worked full-and-final settlement: each line and how it was worked out, extra lines, and saving it. */
export function SettlementCard({ separationId, saved, editable }: { separationId: string; saved: Settlement['lines'] | null; editable: boolean }) {
  const { t } = useI18n();
  const { busy, run } = useAct();
  const toast = useToast();
  const [waive, setWaive] = useState(false);
  const [worked, setWorked] = useState<Settlement | null>(null);
  const [extra, setExtra] = useState<{ label: string; kind: 'earning' | 'recovery'; amount: string }[]>([]);
  const [note, setNote] = useState('');
  const [loading, startLoad] = useTransition();
  useEffect(() => {
    if (!editable) return;
    startLoad(async () => {
      const r = await computeSettlement(separationId, waive);
      if (r.ok) setWorked(r.data);
      else toast.error(r.error);
    });
  }, [separationId, waive, editable, toast]);
  const extras = useMemo(() => extra.filter((x) => x.label.trim() && toPaise(x.amount)).map((x) => ({ code: 'EXTRA', label: x.label.trim(), kind: x.kind, amountPaise: toPaise(x.amount)!, basis: t('hp.ff.addedByHr') })), [extra, t]);
  const lines = editable ? [...(worked?.lines ?? []), ...extras] : (saved ?? []);
  const net = lines.reduce((n, l) => n + (l.kind === 'earning' ? l.amountPaise : -l.amountPaise), 0);

  return (
    <Card title={t('hp.ff.title')} subtitle={t('hp.ff.help')} testId="settlement">
      {lines.length === 0 && !loading ? (
        <EmptyState title={t('hp.ff.nothing')} />
      ) : (
        <DataTable
          label={t('hp.ff.title')}
          rows={lines.map((l, k) => ({ ...l, k }))}
          rowId={(l) => String(l.k)}
          exportName={`settlement-${separationId.slice(0, 8)}`}
          columns={[
            { id: 'l', header: t('hp.ff.line'), rowHeader: true, cell: (l) => <span className="whitespace-nowrap">{l.label}</span> },
            { id: 'b', header: t('hp.ff.basis'), cell: (l) => <span className="text-muted-foreground">{l.basis}</span> },
            { id: 'a', header: t('hp.f.amount'), align: 'right', cell: (l) => (l.kind === 'earning' ? formatRupees(l.amountPaise) : <span className="text-destructive">− {formatRupees(l.amountPaise)}</span>), csv: (l) => String((l.kind === 'earning' ? l.amountPaise : -l.amountPaise) / 100) },
          ]}
        />
      )}
      <p className="m-0 mt-4 text-base font-medium" data-testid="settlement-net">{t(net >= 0 ? 'hp.ff.payable' : 'hp.ff.owed', { amount: formatRupees(Math.abs(net)) })}</p>
      {editable && (
        <div className="mt-4 flex flex-col gap-4">
          <CheckboxField label={t('hp.ff.waive')} checked={waive} onChange={setWaive} />
          {extra.map((x, k) => (
            <FormRow key={k}>
              <FormField label={t('hp.ff.line')}>
                <TextInput value={x.label} onChange={(e) => setExtra(extra.map((y, j) => (j === k ? { ...y, label: e.target.value } : y)))} />
              </FormField>
              <FormField label={t('hp.ff.kind')}>
                <SelectInput value={x.kind} onChange={(e) => setExtra(extra.map((y, j) => (j === k ? { ...y, kind: e.target.value as 'earning' } : y)))} options={[{ value: 'earning', label: t('hp.ff.earning') }, { value: 'recovery', label: t('hp.ff.recovery') }]} />
              </FormField>
              <FormField label={t('hp.f.amount')}>
                <TextInput inputMode="decimal" value={x.amount} onChange={(e) => setExtra(extra.map((y, j) => (j === k ? { ...y, amount: e.target.value } : y)))} />
              </FormField>
              <FormRowActions>
                <Button variant="outlined" aria-label={t('hp.remove')} onClick={() => setExtra(extra.filter((_, j) => j !== k))}>
                  <Trash2 size={16} />
                </Button>
              </FormRowActions>
            </FormRow>
          ))}
          <FormField label={t('hl.exit.settlementNote')}>
            <TextInput multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FormActions>
            <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setExtra([...extra, { label: '', kind: 'earning', amount: '' }])}>{t('hp.ff.addLine')}</Button>
            <Button variant="contained" disabled={busy || loading || note.trim().length < 5} onClick={() => run(() => saveSettlement(separationId, { note: note.trim(), waiveNotice: waive, extra: extras.map(({ label, kind, amountPaise }) => ({ label, kind, amountPaise })) }))}>
              {t('hl.exit.settle')}
            </Button>
          </FormActions>
        </div>
      )}
    </Card>
  );
}
