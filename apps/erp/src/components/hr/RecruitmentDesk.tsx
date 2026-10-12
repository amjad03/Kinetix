'use client';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import { useState, useTransition } from 'react';
import { addApplicant, moveApplicant, saveOpening } from '@/app/(dashboard)/hr/actions';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STAGES, TERMINAL_STAGES } from '@/lib/hr';
import type { ApplicantStage, JobApplicant, JobOpening } from '@/lib/hr-types';
import { useNotice } from './Common';
import { OfferDialog } from './OfferDialog';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@/components/kx';
import { Briefcase as WorkOutlineOutlined, Plus as Add, UserPlus as PersonAddOutlined } from 'lucide-react';
export function RecruitmentDesk({ openings, applicants, selected, departments }: { openings: JobOpening[]; applicants: JobApplicant[]; selected: string | null; departments: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<JobOpening | 'new' | null>(null);
  const [adding, setAdding] = useState(false);
  const [offerFor, setOfferFor] = useState<JobApplicant | null>(null);
  const current = openings.find((o) => o.id === selected) ?? null;

  return (
    <>
      {view}
      <div className="flex justify-end mb-4">
        <Button variant="contained" startIcon={<Add />} onClick={() => setEditing('new')}>
          {t('hr.rec.newOpening')}
        </Button>
      </div>
      {openings.length === 0 ? (
        <EmptyState icon={<WorkOutlineOutlined />} title={t('hr.rec.noOpenings')} />
      ) : (
        <DataTable
          testId="openings"
          label={t('hr.rec.title')}
          rows={openings}
          rowId={(o) => String(o.id)}
          exportName="job-openings"
          highlight={(o) => o.id === selected}
          columns={[
            { id: 'c0', header: t('hr.rec.title'), rowHeader: true, sort: (o) => o.title, cell: (o) => (<>{o.title}
                              {o.department && (
                                <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                                  {o.department.name}
                                </div>
                              )}</>) },
            { id: 'c1', header: t('hr.rec.positions'), align: 'right', sort: (o) => o.positions, cell: (o) => o.positions },
            { id: 'c2', header: t('hr.f.status'), sort: (o) => t(`hr.rec.status.${o.status}` as MessageKey), cell: (o) => t(`hr.rec.status.${o.status}` as MessageKey) },
            { id: 'c3', header: t('hr.rec.pipeline'), csv: false, cell: (o) => (<>{STAGES.filter((s) => o.pipeline[s]).map((s) => (
                                <span className="mr-1" key={s}><StatusPill>{`${t(`hr.rec.stage.${s}` as MessageKey)} ${o.pipeline[s]}`}</StatusPill></span>
                              ))}</>) },
            { id: 'c4', header: '', align: 'right', csv: false, cell: (o) => (<><Button size="small" onClick={() => setEditing(o)}>
                                {t('hr.edit')}
                              </Button>
                              <Button size="small" href={`/hr/recruitment?opening=${o.id}`}>
                                {t('hr.rec.applicants')}
                              </Button></>) },
          ]}
        />
      )}

      {current && (
        <div className="mt-8">
          <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
            <h2 className="font-medium tracking-[0.1px] text-[1.125rem]">
              {t('hr.rec.applicantsFor', { title: current.title })}
            </h2>
            <Button variant="outlined" startIcon={<PersonAddOutlined />} onClick={() => setAdding(true)} disabled={current.status === 'closed'}>
              {t('hr.rec.addApplicant')}
            </Button>
          </div>
          {applicants.length === 0 ? (
            <EmptyState dense icon={<PersonAddOutlined />} title={t('hr.rec.noApplicants')} />
          ) : (
            <DataTable
              testId="applicants"
              label={t('hr.rec.applicants')}
              rows={applicants}
              rowId={(a) => String(a.id)}
              exportName="applicants"
              columns={[
                { id: 'c0', header: t('hr.rec.fullName'), rowHeader: true, sort: (a) => a.fullName, cell: (a) => (<>{a.fullName}
                                      {a.notes && (
                                        <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                                          {a.notes}
                                        </div>
                                      )}</>) },
                { id: 'c1', header: t('hr.rec.contact'), sort: (a) => [a.email, a.phone].filter(Boolean).join(' · ') || '–', cell: (a) => [a.email, a.phone].filter(Boolean).join(' · ') || '–' },
                { id: 'c2', header: t('hr.rec.stage'), sort: (a) => a.stage, cell: (a) => (<><TextField
                                        select
                                        size="small"
                                        fullWidth
                                        value={a.stage}
                                        disabled={pending || TERMINAL_STAGES.includes(a.stage)}
                                        aria-label={`${t('hr.rec.stage')} ${a.fullName}`}
                                        onChange={(e) => start(async () => void (await run(() => moveApplicant(a.id, e.target.value as ApplicantStage), t('hr.saved'))))}
                                      >
                                        {STAGES.map((s) => (
                                          <MenuItem key={s} value={s}>
                                            {t(`hr.rec.stage.${s}` as MessageKey)}
                                          </MenuItem>
                                        ))}
                                      </TextField></>) },
                { id: 'c3', header: '', align: 'right', csv: false, cell: (a) => (['rejected', 'withdrawn'].includes(a.stage) ? null : <Button size="small" onClick={() => setOfferFor(a)}>{t('hl.offer.issue')}</Button>) },
              ]}
            />
          )}
        </div>
      )}
      {editing && <OpeningDialog opening={editing === 'new' ? null : editing} departments={departments} onClose={() => setEditing(null)} run={run} />}
      {offerFor && <OfferDialog applicant={offerFor} onClose={() => setOfferFor(null)} />}
      {adding && current && <ApplicantDialog openingId={current.id} onClose={() => setAdding(false)} run={run} />}
    </>
  );
}

function OpeningDialog({ opening, departments, onClose, run }: { opening: JobOpening | null; departments: { id: string; name: string }[]; onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: opening?.title ?? '', positions: String(opening?.positions ?? 1), description: opening?.description ?? '', status: opening?.status ?? ('open' as JobOpening['status']), closesOn: opening?.closesOn ?? '', departmentId: opening?.department?.id ?? '' });
  const [pending, start] = useTransition();
  const n = Number(f.positions);
  const valid = f.title.trim() && Number.isInteger(n) && n >= 1 && n <= 500;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{opening ? t('hr.rec.editOpening') : t('hr.rec.newOpening')}</DialogTitle>
      <DialogContent>
        <div className="flex flex-col gap-4 pt-2">
          <FormField label={t('hr.rec.title')}>
            <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          </FormField>
          <FormField label={t('hr.f.department')}>
            <TextInput select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
              <MenuItem value="">–</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('hr.rec.positions')}>
            <TextInput value={f.positions} onChange={(e) => setF({ ...f, positions: e.target.value })} />
          </FormField>
          <FormField label={t('hr.f.status')}>
            <TextInput select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as JobOpening['status'] })}>
              {(['open', 'on_hold', 'closed'] as const).map((s) => (
                <MenuItem key={s} value={s}>
                  {t(`hr.rec.status.${s}` as MessageKey)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('hr.rec.closes')}>
            <TextInput type="date" value={f.closesOn} onChange={(e) => setF({ ...f, closesOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </FormField>
          <FormField label={t('hr.rec.description')}>
            <TextInput value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} multiline minRows={3} />
          </FormField>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !valid}
          onClick={() =>
            start(async () => {
              const r = await run(() => saveOpening(opening?.id ?? null, { ...f, positions: n }), t('hr.saved'));
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

function ApplicantDialog({ openingId, onClose, run }: { openingId: string; onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', notes: '' });
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('hr.rec.addApplicant')}</DialogTitle>
      <DialogContent>
        <div className="flex flex-col gap-4 pt-2">
          <FormField label={t('hr.rec.fullName')}>
            <TextInput value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus />
          </FormField>
          <FormField label={t('hr.rec.email')}>
            <TextInput type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField label={t('hr.rec.phone')}>
            <TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </FormField>
          <FormField label={t('hr.rec.notes')}>
            <TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} multiline minRows={2} />
          </FormField>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !f.fullName.trim()}
          onClick={() =>
            start(async () => {
              const r = await run(() => addApplicant(openingId, f), t('hr.saved'));
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
