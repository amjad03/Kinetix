'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addBlock, addPlan, addRoom, allot, chargeHostelFees, chargeMessFees, issuePass, passStep, setComplaintStatus, setMenu, signInVisitor, signOutVisitor, subscribeMess, vacate } from '@/app/(dashboard)/hostel/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { weekdayName } from '@/lib/dates';
import { MEALS } from '@/lib/ops';
import { st } from '@/lib/ops-labels';
import type { HBed, HBlock, HComplaint, HMenu, HPassRow, HPlan, HVisitorRow } from '@/lib/ops';

type Dialog = 'block' | 'room' | 'allot' | 'fees' | 'pass' | 'visitor' | 'plan' | 'subscribe' | 'messFees' | { menu: { day: number; meal: string; items: string } } | { resolve: HComplaint };

export function HostelDesk({ blocks, beds, passes, visitors, plans, menu, complaints, initialTab }: { blocks: HBlock[]; beds: HBed[]; passes: HPassRow[]; visitors: HVisitorRow[]; plans: HPlan[]; menu: HMenu[]; complaints: HComplaint[]; initialTab: string }) {
  const { t, fmt, locale } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const studentId: Field = { name: 'studentId', label: t('ops.f.studentId'), kind: 'uuid', required: true };
  const feeFields: Field[] = [{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'dueOn', label: t('ops.f.dueOn'), kind: 'date', required: true }];
  const freeBeds = beds.filter((b) => !b.allotmentId);
  const cell = (day: number, meal: string) => menu.find((m) => m.dayOfWeek === day && m.meal === meal)?.items ?? '';
  const add = (label: string, k: Dialog, disabled?: boolean) => (
    <Button variant="outlined" onClick={() => setDlg(k)} disabled={disabled}>{label}</Button>
  );

  return (
    <>
      <Tabbed
        label={t('nav.hostel')}
        initial={initialTab}
        tabs={[
          {
            id: 'rooms',
            label: t('ho.tab.rooms', { n: beds.length }),
            node: (
              <>
                <Bar>
                  {add(t('ho.addBlock'), 'block')}
                  {add(t('ho.addRoom'), 'room', blocks.length === 0)}
                  {add(t('ho.allot'), 'allot', freeBeds.length === 0)}
                  {add(t('ho.chargeFees'), 'fees')}
                </Bar>
                <Grid
                  testId="ho-blocks"
                  empty={t('ho.noBlocks')}
                  rows={blocks}
                  cols={[
                    { label: t('ho.block'), cell: (b) => b.name },
                    { label: t('ho.for'), cell: (b) => st(t, b.gender) },
                    { label: t('ho.rooms'), cell: (b) => b.rooms, num: true },
                    { label: t('ho.beds'), cell: (b) => b.beds, num: true },
                    { label: t('ho.occupied'), cell: (b) => b.occupied, num: true },
                  ]}
                />
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('ho.beds')}</Typography>
                <Grid
                  testId="ho-bed-list"
                  empty={t('ho.noBeds')}
                  rows={beds}
                  cols={[
                    { label: t('ho.block'), cell: (b) => b.block },
                    { label: t('ho.room'), cell: (b) => `${b.room} · ${b.label}` },
                    { label: t('ho.fee'), cell: (b) => fmt.rupees(b.monthlyFeePaise), num: true },
                    { label: t('ops.f.student'), cell: (b) => b.studentName ?? <Pill label={t('ho.freeBed')} /> },
                    { label: '', cell: (b) => (b.allotmentId ? <ActionButton tone="error" label={t('ho.vacate')} run={() => vacate(b.allotmentId!)} onDone={toast} /> : null) },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'passes',
            label: t('ho.tab.passes', { n: passes.filter((p) => p.pass.status === 'issued' || p.pass.status === 'out').length }),
            node: (
              <>
                <Bar>{add(t('ho.issuePass'), 'pass')}</Bar>
                <Grid
                  testId="ho-passes"
                  empty={t('ho.noPasses')}
                  rows={passes}
                  tint={(p) => p.overdue}
                  cols={[
                    { label: t('ops.f.student'), cell: (p) => p.studentName },
                    { label: t('ho.reason'), cell: (p) => p.pass.reason },
                    { label: t('ho.destination'), cell: (p) => p.pass.destination || t('ops.none') },
                    { label: t('ho.expectedBack'), cell: (p) => fmt.dateTime(p.pass.expectedBackAt) },
                    { label: t('ops.f.status'), cell: (p) => <Pill warn={p.overdue} label={p.overdue ? t('ho.overdueChip') : st(t, p.pass.status)} /> },
                    {
                      label: '',
                      cell: (p) => (
                        <>
                          {p.pass.status === 'issued' && <ActionButton label={t('ho.markOut')} run={() => passStep(p.pass.id, 'out')} onDone={toast} />}
                          {p.pass.status === 'out' && <ActionButton label={t('ho.markIn')} run={() => passStep(p.pass.id, 'in')} onDone={toast} />}
                          {p.pass.status === 'issued' && <ActionButton tone="error" label={t('ops.cancelIt')} run={() => passStep(p.pass.id, 'cancel')} onDone={toast} />}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'visitors',
            label: t('ho.tab.visitors', { n: visitors.filter((v) => !v.visitor.outAt).length }),
            node: (
              <>
                <Bar>{add(t('ho.signInVisitor'), 'visitor')}</Bar>
                <Grid
                  testId="ho-visitors"
                  empty={t('ho.noVisitors')}
                  rows={visitors}
                  cols={[
                    { label: t('ho.visitor'), cell: (v) => `${v.visitor.visitorName}${v.visitor.relation ? ` (${v.visitor.relation})` : ''}` },
                    { label: t('ho.visiting'), cell: (v) => v.studentName },
                    { label: t('ho.in'), cell: (v) => fmt.dateTime(v.visitor.inAt) },
                    { label: t('ho.out'), cell: (v) => (v.visitor.outAt ? fmt.dateTime(v.visitor.outAt) : <Pill label={t('ho.inside')} />) },
                    { label: '', cell: (v) => (v.visitor.outAt ? null : <ActionButton label={t('ho.signOut')} run={() => signOutVisitor(v.visitor.id)} onDone={toast} />) },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'mess',
            label: t('ho.tab.mess'),
            node: (
              <>
                <Bar>
                  {add(t('ho.addPlan'), 'plan')}
                  {add(t('ho.subscribe'), 'subscribe', plans.length === 0)}
                  {add(t('ho.chargeMess'), 'messFees')}
                </Bar>
                <Grid
                  testId="ho-plans"
                  empty={t('ho.noPlans')}
                  rows={plans}
                  cols={[
                    { label: t('ops.f.name'), cell: (p) => p.name },
                    { label: t('ho.meals'), cell: (p) => p.meals.map((m) => st(t, m)).join(', ') },
                    { label: t('ho.fee'), cell: (p) => fmt.rupees(p.monthlyFeePaise), num: true },
                    { label: t('ho.subscribers'), cell: (p) => p.subscribers, num: true },
                  ]}
                />
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('ho.weekMenu')}</Typography>
                <Grid
                  testId="ho-menu"
                  empty={t('ho.noMenu')}
                  rows={[0, 1, 2, 3, 4, 5, 6]}
                  cols={[
                    { label: t('ho.day'), cell: (d) => weekdayName(d + 1, locale) },
                    ...MEALS.map((m) => ({
                      label: st(t, m),
                      cell: (d: number) => (
                        <Button size="small" color="inherit" onClick={() => setDlg({ menu: { day: d, meal: m, items: cell(d, m) } })} sx={{ textTransform: 'none', textAlign: 'left' }}>
                          {cell(d, m) || t('ho.setMenu')}
                        </Button>
                      ),
                    })),
                  ]}
                />
              </>
            ),
          },
          {
            id: 'complaints',
            label: t('ho.tab.complaints', { n: complaints.filter((c) => c.status !== 'resolved').length }),
            node: (
              <Grid
                testId="ho-complaints-list"
                empty={t('ho.noComplaints')}
                rows={complaints}
                cols={[
                  { label: t('ho.category'), cell: (c) => st(t, c.category) },
                  { label: t('ho.description'), cell: (c) => c.description },
                  { label: t('ops.f.status'), cell: (c) => <Pill label={st(t, c.status)} /> },
                  { label: t('ho.raised'), cell: (c) => fmt.dateTime(c.createdAt) },
                  {
                    label: '',
                    cell: (c) =>
                      c.status === 'resolved' ? (
                        c.resolution
                      ) : (
                        <>
                          {c.status === 'open' && <ActionButton label={t('ho.start')} run={() => setComplaintStatus(c.id, 'in_progress')} onDone={toast} />}
                          <Button size="small" onClick={() => setDlg({ resolve: c })}>{t('ho.resolve')}</Button>
                        </>
                      ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      {dlg === 'block' && <FormDialog title={t('ho.addBlock')} onSubmit={addBlock} onClose={done} fields={[{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'gender', label: t('ho.for'), kind: 'select', init: 'mixed', options: ['boys', 'girls', 'mixed'].map((g) => ({ value: g, label: st(t, g) })) }]} />}
      {dlg === 'room' && (
        <FormDialog
          title={t('ho.addRoom')}
          onSubmit={addRoom}
          onClose={done}
          fields={[
            { name: 'blockId', label: t('ho.block'), kind: 'select', required: true, init: blocks[0]?.id, options: blocks.map((b) => ({ value: b.id, label: b.name })) },
            { name: 'number', label: t('ho.room'), required: true },
            { name: 'floor', label: t('ho.floor'), kind: 'number', init: '0' },
            { name: 'beds', label: t('ho.beds'), kind: 'number', required: true },
            { name: 'fee', label: t('ho.fee'), kind: 'rupees' },
          ]}
        />
      )}
      {dlg === 'allot' && (
        <FormDialog
          title={t('ho.allot')}
          onSubmit={allot}
          onClose={done}
          fields={[studentId, { name: 'bedId', label: t('ho.bed'), kind: 'select', required: true, options: freeBeds.map((b) => ({ value: b.bedId, label: `${b.block} · ${b.room} · ${b.label}` })) }, { name: 'startsOn', label: t('ops.f.startsOn'), kind: 'date' }]}
        />
      )}
      {dlg === 'fees' && <FormDialog title={t('ho.chargeFees')} onSubmit={chargeHostelFees} onClose={done} fields={feeFields} />}
      {dlg === 'messFees' && <FormDialog title={t('ho.chargeMess')} onSubmit={chargeMessFees} onClose={done} fields={feeFields} />}
      {dlg === 'pass' && (
        <FormDialog
          title={t('ho.issuePass')}
          onSubmit={issuePass}
          onClose={done}
          fields={[studentId, { name: 'reason', label: t('ho.reason'), required: true }, { name: 'destination', label: t('ho.destination') }, { name: 'expectedBackAt', label: t('ho.expectedBack'), kind: 'datetime', required: true }]}
        />
      )}
      {dlg === 'visitor' && (
        <FormDialog
          title={t('ho.signInVisitor')}
          onSubmit={signInVisitor}
          onClose={done}
          fields={[studentId, { name: 'visitorName', label: t('ho.visitor'), required: true }, { name: 'relation', label: t('ho.relation') }, { name: 'phone', label: t('ops.f.phone') }, { name: 'idProof', label: t('ho.idProof') }]}
        />
      )}
      {dlg === 'plan' && (
        <FormDialog
          title={t('ho.addPlan')}
          onSubmit={(v) => addPlan({ ...v, meals: MEALS.filter((m) => v[`m_${m}`] === 'yes').join(',') })}
          onClose={done}
          fields={[{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'fee', label: t('ho.fee'), kind: 'rupees', required: true }, ...MEALS.map((m): Field => ({ name: `m_${m}`, label: st(t, m), kind: 'select', init: 'yes', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] }))]}
        />
      )}
      {dlg === 'subscribe' && (
        <FormDialog
          title={t('ho.subscribe')}
          onSubmit={subscribeMess}
          onClose={done}
          fields={[studentId, { name: 'planId', label: t('ho.plan'), kind: 'select', required: true, options: plans.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })) }, { name: 'startsOn', label: t('ops.f.startsOn'), kind: 'date' }]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'menu' in dlg && (
        <FormDialog title={`${weekdayName(dlg.menu.day + 1, locale)} · ${st(t, dlg.menu.meal)}`} onSubmit={(v) => setMenu(dlg.menu.day, dlg.menu.meal, v)} onClose={done} fields={[{ name: 'items', label: t('ho.menuItems'), kind: 'multiline', required: true, init: dlg.menu.items }]} />
      )}
      {dlg && typeof dlg === 'object' && 'resolve' in dlg && (
        <FormDialog title={t('ho.resolve')} onSubmit={(v) => setComplaintStatus(dlg.resolve.id, 'resolved', v)} onClose={done} fields={[{ name: 'resolution', label: t('ho.resolution'), kind: 'multiline', required: true }]} />
      )}
      {toastNode}
    </>
  );
}
