'use client';
import Link from 'next/link';
import { FormField, StatusPill, TextInput, type Column } from '@/components/ui';
import { RecordsTable } from '@/components/records/RecordsTable';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useEffect, useState, useTransition } from 'react';
import { addDesignation, getProfile, saveBank, saveProfile, type ProfileInput } from '@/app/(dashboard)/hr/actions';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { paiseToInput, rupeesToPaise } from '@/lib/money';
import type { Designation, EmploymentType, StaffProfile, StaffStatus, StaffSummary } from '@/lib/hr-types';
import { useNotice } from './Common';

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch } from '@/components/kx';
import { Pencil as EditOutlined, Plus as Add } from 'lucide-react';
const TYPES: EmploymentType[] = ['permanent', 'contract', 'probation', 'visiting'];
const STATUSES: StaffStatus[] = ['active', 'on_notice', 'exited'];

/** A staff member as the record kit lists them (GET /v1/records/staff). */
export type StaffRow = Row & {
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: string | null;
  employeeCode: string | null;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  employmentType: EmploymentType | null;
  staffStatus: StaffStatus | null;
  accountStatus: string;
  dateOfJoining: string | null;
};

const summaryOf = (r: StaffRow): StaffSummary => ({
  userId: r.id,
  fullName: r.fullName,
  email: r.email,
  phone: r.phone,
  roles: (r.roles ?? '').split(', ').filter(Boolean),
  employeeCode: r.employeeCode,
  department: r.departmentId ? { id: r.departmentId, name: r.departmentName ?? '' } : null,
  designation: r.designationId ? { id: r.designationId, name: r.designationName ?? '' } : null,
  employmentType: r.employmentType,
  status: r.staffStatus,
  dateOfJoining: r.dateOfJoining,
});

/**
 * HR → Staff: the record kit list of staff (search, filters, bulk move to a department, bulk edit of designation,
 * language or account, import, export, history, recycle bin, saved views) plus the HR record and designations.
 */
export function StaffDirectory({ meta, page, state, designations, departments }: { meta: RecordMeta; page: RecordsPage<StaffRow>; state: ListState; designations: Designation[]; departments: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState<StaffSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const { run, view } = useNotice();
  const s = (x: Row) => x as StaffRow;
  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: t('hr.staff.name'),
      rowHeader: true,
      sortKey: 'name',
      cell: (x) => (
        <>
          <p className="text-[13px] leading-[19px] font-medium">
            <Link className="text-primary underline-offset-4 hover:underline" href={`/hr/staff/${x.id}`} onClick={(e) => e.stopPropagation()}>
              {s(x).fullName}
            </Link>
          </p>
          <span className="text-xs leading-4 font-normal tracking-[0.3px] text-muted-foreground">{s(x).email ?? s(x).phone ?? ''}</span>
        </>
      ),
    },
    { id: 'code', header: t('hr.staff.code'), sortKey: 'code', cell: (x) => s(x).employeeCode ?? <StatusPill tone="warning">{t('hr.staff.noRecord')}</StatusPill> },
    { id: 'department', header: t('hr.f.department'), sortKey: 'department', hideBelow: 'md', cell: (x) => s(x).departmentName ?? '–' },
    { id: 'designation', header: t('hr.f.designation'), sortKey: 'designation', hideBelow: 'lg', cell: (x) => s(x).designationName ?? '–' },
    { id: 'status', header: t('hr.f.status'), cell: (x) => (s(x).staffStatus ? t(`hr.status.${s(x).staffStatus}` as MessageKey) : '–') },
    { id: 'roles', header: t('rk.col.roles'), defaultHidden: true, cell: (x) => (s(x).roles ?? '').split(', ').filter(Boolean).map((r) => t(`role.${r}` as MessageKey)).join(', ') },
    { id: 'account', header: t('rk.col.account'), sortKey: 'account', defaultHidden: true, cell: (x) => <StatusPill tone={s(x).accountStatus === 'active' ? 'success' : 'neutral'}>{t(`rk.o.staff.accountStatus.${s(x).accountStatus === 'active' ? 'active' : 'disabled'}` as MessageKey)}</StatusPill> },
    { id: 'joined', header: t('rk.col.joined'), sortKey: 'joined', defaultHidden: true, cell: (x) => (s(x).dateOfJoining ? fmt.date(s(x).dateOfJoining!) : '–') },
  ];
  return (
    <>
      {view}
      <p className="mb-3 text-[13px] leading-[19px] text-muted-foreground">{t('hr.staff.designationsLine', { n: designations.length })}</p>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('nav.hr')}
        columns={columns}
        rowHref={(x) => `/hr/staff/${x.id}`}
        testId="staff-table"
        toolbar={
          <Button variant="outlined" startIcon={<Add />} onClick={() => setAdding(true)}>
            {t('hr.staff.newDesignation')}
          </Button>
        }
        extraRowActions={(x) => [{ id: 'hr-record', label: t('rk.hrRecord'), icon: <EditOutlined />, onSelect: () => setEditing(summaryOf(x as StaffRow)) }]}
        empty={<EmptyState icon={<EditOutlined />} title={t('hr.staff.empty')} />}
      />
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
