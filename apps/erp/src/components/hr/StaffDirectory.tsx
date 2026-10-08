'use client';

import Add from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { StatusPill } from '@/components/ui';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, useTransition } from 'react';
import { addDesignation, getProfile, saveBank, saveProfile, type ProfileInput } from '@/app/(dashboard)/hr/actions';
import { TableFrame } from '@/components/DataTable';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { paiseToInput, rupeesToPaise } from '@/lib/money';
import type { Designation, EmploymentType, StaffProfile, StaffStatus, StaffSummary } from '@/lib/hr-types';
import { useNotice } from './Common';

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          {t('hr.staff.designationsLine', { n: designations.length })}
        </Typography>
        <Button variant="outlined" startIcon={<Add />} onClick={() => setAdding(true)}>
          {t('hr.staff.newDesignation')}
        </Button>
      </Box>
      <TableFrame testId="staff-table">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('hr.staff.name')}</TableCell>
              <TableCell>{t('hr.staff.code')}</TableCell>
              <TableCell>{t('hr.f.department')}</TableCell>
              <TableCell>{t('hr.f.designation')}</TableCell>
              <TableCell>{t('hr.f.status')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.userId} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {s.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.email ?? s.phone ?? ''}
                  </Typography>
                </TableCell>
                <TableCell>{s.employeeCode ?? <StatusPill tone="warning">{t('hr.staff.noRecord')}</StatusPill>}</TableCell>
                <TableCell>{s.department?.name ?? '–'}</TableCell>
                <TableCell>{s.designation?.name ?? '–'}</TableCell>
                <TableCell>{s.status ? t(`hr.status.${s.status}` as MessageKey) : '–'}</TableCell>
                <TableCell align="right">
                  <IconButton aria-label={t('hr.staff.edit')} onClick={() => setEditing(s)}>
                    <EditOutlined />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
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
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('hr.staff.designationName')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label={t('hr.staff.grade')} value={grade} onChange={(e) => setGrade(e.target.value)} />
        </Stack>
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
    <TextField label={t(label)} type={type} value={d?.[k] ?? ''} onChange={(e) => set(k, e.target.value)} slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined} size="small" />
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
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress aria-label={t('hr.loading')} />
          </Box>
        ) : (
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              {text('employeeCode', 'hr.f.employeeCode')}
              <TextField select size="small" label={t('hr.f.department')} value={d.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value || null)}>
                <MenuItem value="">–</MenuItem>
                {departments.map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {x.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label={t('hr.f.designation')} value={d.designationId ?? ''} onChange={(e) => set('designationId', e.target.value || null)}>
                <MenuItem value="">–</MenuItem>
                {designations.map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {x.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label={t('hr.f.employmentType')} value={d.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
                {TYPES.map((x) => (
                  <MenuItem key={x} value={x}>
                    {t(`hr.type.${x}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label={t('hr.f.status')} value={d.status} onChange={(e) => set('status', e.target.value as StaffStatus)}>
                {STATUSES.map((x) => (
                  <MenuItem key={x} value={x}>
                    {t(`hr.status.${x}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label={t('hr.f.gender')} value={d.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as Draft['gender'])}>
                <MenuItem value="">–</MenuItem>
                {(['female', 'male', 'other'] as const).map((x) => (
                  <MenuItem key={x} value={x}>
                    {t(`hr.gender.${x}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextField>
              {text('dateOfJoining', 'hr.f.joining', 'date')}
              {text('dateOfLeaving', 'hr.f.leaving', 'date')}
              {text('dateOfBirth', 'hr.f.dob', 'date')}
              {text('pan', 'hr.f.pan')}
              {text('uan', 'hr.f.uan')}
              {text('esiNumber', 'hr.f.esiNumber')}
              <TextField select size="small" label={t('hr.f.taxRegime')} value={d.taxRegime} onChange={(e) => set('taxRegime', e.target.value as Draft['taxRegime'])}>
                <MenuItem value="new">{t('hr.regime.new')}</MenuItem>
                <MenuItem value="old">{t('hr.regime.old')}</MenuItem>
              </TextField>
              <TextField size="small" label={t('hr.f.tax80c')} value={d.tax80c} onChange={(e) => set('tax80c', e.target.value)} />
              <TextField size="small" label={t('hr.f.taxOther')} value={d.taxOther} onChange={(e) => set('taxOther', e.target.value)} />
            </Box>
            <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch checked={d.pfEnabled} onChange={(e) => set('pfEnabled', e.target.checked)} />} label={t('hr.f.pf')} />
              <FormControlLabel control={<Switch checked={d.esiEnabled} onChange={(e) => set('esiEnabled', e.target.checked)} />} label={t('hr.f.esi')} />
              <FormControlLabel control={<Switch checked={d.ptEnabled} onChange={(e) => set('ptEnabled', e.target.checked)} />} label={t('hr.f.pt')} />
            </Stack>
            <Box>
              <Button variant="contained" onClick={save} disabled={pending || !d.employeeCode?.trim()}>
                {t('hr.save')}
              </Button>
            </Box>

            <Box sx={{ borderTop: 1, borderColor: 'm3.outlineVariant', pt: 2 }}>
              <Typography variant="h6" component="h3" sx={{ fontSize: '1rem', mb: 1 }}>
                {t('hr.bank.title')}
              </Typography>
              {profile.version === 0 && d.version === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('hr.bank.needRecord')}
                </Typography>
              ) : (
                <>
                  {profile.bank && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {t('hr.bank.onFile', { last4: profile.bank.accountLast4 })}
                    </Typography>
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <TextField size="small" label={t('hr.bank.holder')} value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} />
                    <TextField size="small" label={t('hr.bank.name')} value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
                    <TextField size="small" label={t('hr.bank.ifsc')} value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} />
                    <TextField size="small" label={t('hr.bank.account')} value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} autoComplete="off" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                  </Box>
                  <Button sx={{ mt: 1.5 }} variant="outlined" onClick={saveBankDetails} disabled={pending || !bank.accountNumber || !bank.ifsc || !bank.bankName || !bank.accountHolder}>
                    {t('hr.bank.save')}
                  </Button>
                </>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
