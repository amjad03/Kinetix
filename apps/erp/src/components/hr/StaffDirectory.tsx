'use client';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import { useEffect, useState, useTransition } from 'react';
import { addDesignation, getProfile, saveBank, saveProfile, type ProfileInput } from '@/app/(dashboard)/hr/actions';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { paiseToInput, rupeesToPaise } from '@/lib/money';
import type { Designation, EmploymentType, StaffProfile, StaffStatus, StaffSummary } from '@/lib/hr-types';
import { useNotice } from './Common';

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Switch } from '@/components/kx';
import { Pencil as EditOutlined, Plus as Add } from 'lucide-react';
const TYPES: EmploymentType[] = ['permanent', 'contract', 'probation', 'visiting'];
const STATUSES: StaffStatus[] = ['active', 'on_notice', 'exited'];

export function StaffDirectory({ staff, designations, departments }: { staff: StaffSummary[]; designations: Designation[]; departments: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<StaffSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const { run, view } = useNotice();
  return (
    <>
      {view}
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('hr.staff.designationsLine', { n: designations.length })}
        </p>
        <Button variant="outlined" startIcon={<Add />} onClick={() => setAdding(true)}>
          {t('hr.staff.newDesignation')}
        </Button>
      </div>
      <DataTable
        testId="staff-table"
        label={t('nav.hr')}
        rows={staff}
        rowId={(s) => s.userId}
        exportName="staff"
        columns={[
          { id: 'c0', header: t('hr.staff.name'), rowHeader: true, sort: (s) => s.fullName, cell: (s) => (<><p className="text-[13px] leading-[19px] font-medium">
                            {s.fullName}
                          </p>
                          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                            {s.email ?? s.phone ?? ''}
                          </span></>) },
          { id: 'c1', header: t('hr.staff.code'), sort: (s) => s.employeeCode ?? '', cell: (s) => s.employeeCode ?? <StatusPill tone="warning">{t('hr.staff.noRecord')}</StatusPill> },
          { id: 'c2', header: t('hr.f.department'), sort: (s) => s.department?.name ?? '–', cell: (s) => s.department?.name ?? '–' },
          { id: 'c3', header: t('hr.f.designation'), sort: (s) => s.designation?.name ?? '–', cell: (s) => s.designation?.name ?? '–' },
          { id: 'c4', header: t('hr.f.status'), sort: (s) => s.status ? t(`hr.status.${s.status}` as MessageKey) : '', cell: (s) => s.status ? t(`hr.status.${s.status}` as MessageKey) : '–' },
          { id: 'c5', header: '', align: 'right', csv: false, cell: (s) => (<><IconButton aria-label={t('hr.staff.edit')} onClick={() => setEditing(s)}>
                            <EditOutlined />
                          </IconButton></>) },
        ]}
      />
      {staff.length === 0 && <EmptyState icon={<EditOutlined />} title={t('hr.staff.empty')} />}
      {editing && <ProfileDialog person={editing} designations={designations} departments={departments} onClose={() => setEditing(null)} />}
      {adding && <DesignationDialog onClose={() => setAdding(false)} run={run} />}
    </>
  );
}

function DesignationDialog({ onClose, run }: { onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('hr.staff.newDesignation')}</DialogTitle>
      <DialogContent>
        <div className="flex flex-col gap-4 pt-2">
          <FormField label={t('hr.staff.designationName')}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </FormField>
          <FormField label={t('hr.staff.grade')}>
            <TextInput value={grade} onChange={(e) => setGrade(e.target.value)} />
          </FormField>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              const r = await run(() => addDesignation(name, grade), t('hr.saved'));
              if (r.ok) onClose();
            })
          }
        >
          {t('hr.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Draft = Omit<ProfileInput, 'tax80cPaise' | 'taxOtherDeductionsPaise'> & { tax80c: string; taxOther: string };

function ProfileDialog({ person, designations, departments, onClose }: { person: StaffSummary; designations: Designation[]; departments: { id: string; name: string }[]; onClose: () => void }) {
  const { t } = useI18n();
  const { run, view, setError } = useNotice();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [bank, setBank] = useState({ accountHolder: '', bankName: '', ifsc: '', accountNumber: '' });
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getProfile(person.userId).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      const p = r.data;
      setProfile(p);
      setBank({ accountHolder: p.bank?.accountHolder ?? p.fullName, bankName: p.bank?.bankName ?? '', ifsc: p.bank?.ifsc ?? '', accountNumber: '' });
      setD({
        employeeCode: p.employeeCode ?? '',
        departmentId: p.department?.id ?? null,
        designationId: p.designation?.id ?? null,
        employmentType: p.employmentType ?? 'permanent',
        status: p.status ?? 'active',
        dateOfJoining: p.dateOfJoining,
        dateOfLeaving: p.dateOfLeaving,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        pan: p.pan,
        uan: p.uan,
        esiNumber: p.esiNumber,
        taxRegime: p.taxRegime,
        tax80c: paiseToInput(p.tax80cPaise),
        taxOther: paiseToInput(p.taxOtherDeductionsPaise),
        pfEnabled: p.pfEnabled,
        esiEnabled: p.esiEnabled,
        ptEnabled: p.ptEnabled,
        version: p.version,
      });
    });
    return () => {
      live = false;
    };
  }, [person.userId, setError]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const text = (k: 'employeeCode' | 'dateOfJoining' | 'dateOfLeaving' | 'dateOfBirth' | 'pan' | 'uan' | 'esiNumber', label: MessageKey, type = 'text') => (
    <FormField label={t(label)}>
      <TextInput type={type} value={d?.[k] ?? ''} onChange={(e) => set(k, e.target.value)} slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined} />
    </FormField>
  );

  const save = () =>
    start(async () => {
      if (!d || !profile) return;
      const a = rupeesToPaise(d.tax80c || '0');
      const o = rupeesToPaise(d.taxOther || '0');
      if (a === null || o === null) return setError(t('hr.err.amount'));
      const { tax80c: _a, taxOther: _o, ...rest } = d;
      const r = await run(() => saveProfile(person.userId, { ...rest, tax80cPaise: a, taxOtherDeductionsPaise: o }), t('hr.saved'));
      if (r.ok) setD({ ...d, version: r.data.version });
    });

  const saveBankDetails = () =>
    start(async () => {
      const r = await run(() => saveBank(person.userId, bank), t('hr.saved'));
      if (r.ok) setBank({ ...bank, accountNumber: '' });
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{person.fullName}</DialogTitle>
      <DialogContent>
        {view}
        {!d || !profile ? (
          <div className="grid place-items-center py-12">
            <CircularProgress aria-label={t('hr.loading')} />
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-2">
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr_1fr] gap-4">
              {text('employeeCode', 'hr.f.employeeCode')}
              <FormField label={t('hr.f.department')}>
                <TextInput select value={d.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value || null)}>
                  <MenuItem value="">–</MenuItem>
                  {departments.map((x) => (
                    <MenuItem key={x.id} value={x.id}>
                      {x.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('hr.f.designation')}>
                <TextInput select value={d.designationId ?? ''} onChange={(e) => set('designationId', e.target.value || null)}>
                  <MenuItem value="">–</MenuItem>
                  {designations.map((x) => (
                    <MenuItem key={x.id} value={x.id}>
                      {x.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('hr.f.employmentType')}>
                <TextInput select value={d.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
                  {TYPES.map((x) => (
                    <MenuItem key={x} value={x}>
                      {t(`hr.type.${x}` as MessageKey)}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('hr.f.status')}>
                <TextInput select value={d.status} onChange={(e) => set('status', e.target.value as StaffStatus)}>
                  {STATUSES.map((x) => (
                    <MenuItem key={x} value={x}>
                      {t(`hr.status.${x}` as MessageKey)}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('hr.f.gender')}>
                <TextInput select value={d.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as Draft['gender'])}>
                  <MenuItem value="">–</MenuItem>
                  {(['female', 'male', 'other'] as const).map((x) => (
                    <MenuItem key={x} value={x}>
                      {t(`hr.gender.${x}` as MessageKey)}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              {text('dateOfJoining', 'hr.f.joining', 'date')}
              {text('dateOfLeaving', 'hr.f.leaving', 'date')}
              {text('dateOfBirth', 'hr.f.dob', 'date')}
              {text('pan', 'hr.f.pan')}
              {text('uan', 'hr.f.uan')}
              {text('esiNumber', 'hr.f.esiNumber')}
              <FormField label={t('hr.f.taxRegime')}>
                <TextInput select value={d.taxRegime} onChange={(e) => set('taxRegime', e.target.value as Draft['taxRegime'])}>
                  <MenuItem value="new">{t('hr.regime.new')}</MenuItem>
                  <MenuItem value="old">{t('hr.regime.old')}</MenuItem>
                </TextInput>
              </FormField>
              <FormField label={t('hr.f.tax80c')}>
                <TextInput value={d.tax80c} onChange={(e) => set('tax80c', e.target.value)} />
              </FormField>
              <FormField label={t('hr.f.taxOther')}>
                <TextInput value={d.taxOther} onChange={(e) => set('taxOther', e.target.value)} />
              </FormField>
            </div>
            <div className="flex flex-row flex-wrap">
              <FormControlLabel control={<Switch checked={d.pfEnabled} onChange={(e) => set('pfEnabled', e.target.checked)} />} label={t('hr.f.pf')} />
              <FormControlLabel control={<Switch checked={d.esiEnabled} onChange={(e) => set('esiEnabled', e.target.checked)} />} label={t('hr.f.esi')} />
              <FormControlLabel control={<Switch checked={d.ptEnabled} onChange={(e) => set('ptEnabled', e.target.checked)} />} label={t('hr.f.pt')} />
            </div>
            <div>
              <Button variant="contained" onClick={save} disabled={pending || !d.employeeCode?.trim()}>
                {t('hr.save')}
              </Button>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium tracking-[0.1px] text-[1rem] mb-2">
                {t('hr.bank.title')}
              </h3>
              {profile.version === 0 && d.version === 0 ? (
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {t('hr.bank.needRecord')}
                </p>
              ) : (
                <>
                  {profile.bank && (
                    <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">
                      {t('hr.bank.onFile', { last4: profile.bank.accountLast4 })}
                    </p>
                  )}
                  <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
                    <FormField label={t('hr.bank.holder')}>
                      <TextInput value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} />
                    </FormField>
                    <FormField label={t('hr.bank.name')}>
                      <TextInput value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
                    </FormField>
                    <FormField label={t('hr.bank.ifsc')}>
                      <TextInput value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} />
                    </FormField>
                    <FormField label={t('hr.bank.account')}>
                      <TextInput value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} autoComplete="off" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                    </FormField>
                  </div>
                  <Button className="mt-3" variant="outlined" onClick={saveBankDetails} disabled={pending || !bank.accountNumber || !bank.ifsc || !bank.bankName || !bank.accountHolder}>
                    {t('hr.bank.save')}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
