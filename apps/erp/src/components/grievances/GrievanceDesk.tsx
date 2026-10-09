'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addTicketEvidence, addWitness, contactParents, incidentContacts, incidentWitnesses, removeTicketEvidence, ticketEvidence } from '@/app/(dashboard)/grievances/actions';
import { sendResolution } from '@/app/(dashboard)/workflows/bound-actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { FileFormDialog, SectionHead, useLoad } from '@/components/pathways-b/common';
import { SendForApproval } from '@/components/pathways-b/SendForApproval';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { slaState, type GrievanceTicket } from '@/lib/campus-life';
import { BOUND_FLOWS, CONTACT_METHODS, downloadPath, sizeLabel, WITNESS_ROLES, type GrievanceEvidence, type IncidentRow, type ParentContact, type Witness } from '@/lib/pathways-b';

type Toast = (m: string) => void;
const RESOLVED = ['resolved', 'closed'];

/** The grievance queue with evidence and "send the resolution for approval" per ticket, and the discipline incidents with witnesses and the parent contact log. */
export function GrievanceDesk({ tickets, incidents, flows, nowIso }: { tickets: GrievanceTicket[]; incidents: IncidentRow[] | null; flows: Record<string, boolean> | null; nowIso: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [ticket, setTicket] = useState<GrievanceTicket | null>(null);
  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const now = new Date(nowIso);

  return (
    <>
      <Tabbed
        label={t('nav.grievances')}
        initial="tickets"
        tabs={[
          {
            id: 'tickets',
            label: t('pwb.gv.tabTickets', { n: tickets.length }),
            node: (
              <Grid
                testId="tickets-table"
                empty={t('gv.empty')}
                rows={tickets}
                cols={[
                  { label: t('gv.col.no'), cell: (x) => x.ticketNo, sort: (x) => x.ticketNo },
                  {
                    label: t('gv.col.subject'),
                    cell: (x) => (
                      <span>
                        {x.subject} {x.anonymous && <Pill label={t('gv.anonymous')} />} {x.committee && <Pill label={t('gv.confidential')} warn />}
                      </span>
                    ),
                    sort: (x) => x.subject,
                  },
                  { label: t('gv.col.category'), cell: (x) => t(`gv.cat.${x.category}` as MessageKey), sort: (x) => x.category },
                  { label: t('gv.col.severity'), cell: (x) => <Pill label={t(`gv.sev.${x.severity}` as MessageKey)} warn={x.severity === 'critical' || x.severity === 'high'} />, sort: (x) => x.severity },
                  { label: t('gv.col.status'), cell: (x) => t(`gv.status.${x.status}` as MessageKey), sort: (x) => x.status },
                  { label: t('gv.col.due'), cell: (x) => <Pill label={fmt.dateTime(x.slaDueAt)} warn={slaState(x, now) === 'overdue'} />, sort: (x) => x.slaDueAt },
                  { label: t('gv.col.level'), cell: (x) => String(x.escalationLevel), num: true, sort: (x) => x.escalationLevel },
                  { label: '', cell: (x) => <Button size="small" onClick={() => setTicket(x)} data-testid={`pwb-ticket-${x.ticketNo}`}>{t('ops.details')}</Button> },
                ]}
              />
            ),
          },
          ...(incidents
            ? [
                {
                  id: 'discipline',
                  label: t('pwb.gv.tabDiscipline', { n: incidents.length }),
                  node: (
                    <Grid
                      testId="pwb-incidents"
                      empty={t('pwb.dis.empty')}
                      rows={incidents}
                      cols={[
                        { label: t('ops.f.student'), cell: (i) => `${i.fullName} (${i.rollNo})`, sort: (i) => i.fullName },
                        { label: t('ops.f.date'), cell: (i) => fmt.date(i.incidentOn, 'short'), sort: (i) => i.incidentOn },
                        { label: t('pwb.dis.kind'), cell: (i) => i.kind, sort: (i) => i.kind },
                        { label: t('gv.col.severity'), cell: (i) => <Pill label={t(`pwb.dis.sev.${i.severity}` as MessageKey)} warn={i.severity !== 'minor'} />, sort: (i) => i.severity },
                        { label: t('gv.col.status'), cell: (i) => t(`pwb.dis.status.${i.status}` as MessageKey), sort: (i) => i.status },
                        { label: '', cell: (i) => <Button size="small" onClick={() => setIncident(i)} data-testid={`pwb-incident-${i.id}`}>{t('ops.details')}</Button> },
                      ]}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      {ticket && <TicketDialog ticket={ticket} flows={flows} onClose={() => setTicket(null)} toast={toast} />}
      {incident && <IncidentDialog incident={incident} onClose={() => setIncident(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

/** Evidence on one ticket, and the resolution sent for approval. */
function TicketDialog({ ticket, flows, onClose, toast }: { ticket: GrievanceTicket; flows: Record<string, boolean> | null; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const evidence = useLoad<GrievanceEvidence[]>(() => ticketEvidence(ticket.id));
  const [adding, setAdding] = useState(false);
  const refresh = (m: string) => {
    toast(m);
    evidence.reload();
  };
  return (
    <InfoDialog title={`${ticket.ticketNo} · ${ticket.subject}`} onClose={onClose}>
      <SectionHead title={t('pwb.gv.evidence')}>
        <Button variant="outlined" size="small" onClick={() => setAdding(true)} data-testid="pwb-add-ticket-evidence">{t('pwb.gv.addEvidence')}</Button>
      </SectionHead>
      {evidence.error && <Typography color="error">{evidence.error}</Typography>}
      <Grid
        testId="pwb-ticket-evidence"
        empty={t('pwb.gv.noEvidence')}
        rows={evidence.data ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (e) => e.title, sort: (e) => e.title },
          { label: t('pwb.size'), cell: (e) => sizeLabel(e.sizeBytes), sort: (e) => e.sizeBytes },
          { label: t('ops.f.date'), cell: (e) => fmt.date(e.createdAt.slice(0, 10), 'short'), sort: (e) => e.createdAt },
          {
            label: '',
            cell: (e) => (
              <>
                <Button size="small" href={downloadPath('grievance-evidence', e.id)}>{t('pwb.download')}</Button>
                {e.mine && <ActionButton tone="error" label={t('pwb.delete')} run={() => removeTicketEvidence(e.id)} onDone={refresh} />}
              </>
            ),
          },
        ]}
      />
      {!ticket.committee && !RESOLVED.includes(ticket.status) && (
        <>
          <SectionHead title={t('pwb.gv.resolution')} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('pwb.gv.resolutionHelp')}</Typography>
          <SendForApproval flow={BOUND_FLOWS[4]} flows={flows} sourceId={ticket.id} fields={[{ name: 'resolution', label: t('pwb.gv.resolutionText'), kind: 'multiline', required: true }]} onSend={(v) => sendResolution(ticket.id, v)} />
        </>
      )}
      {adding && (
        <FileFormDialog
          title={t('pwb.gv.addEvidence')}
          required
          onSubmit={(v, file) => addTicketEvidence(ticket.id, v, file)}
          onClose={(m) => {
            setAdding(false);
            if (m) refresh(m);
          }}
          fields={[{ name: 'title', label: t('ops.f.title') }]}
        />
      )}
    </InfoDialog>
  );
}

/** Witnesses and the log of reaching the parents, for one discipline incident. */
function IncidentDialog({ incident, onClose, toast }: { incident: IncidentRow; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const witnesses = useLoad<Witness[]>(() => incidentWitnesses(incident.id));
  const contacts = useLoad<ParentContact[]>(() => incidentContacts(incident.id));
  const [dlg, setDlg] = useState<'witness' | 'contact' | null>(null);
  const close = (m?: string) => {
    setDlg(null);
    if (m) {
      toast(m);
      witnesses.reload();
      contacts.reload();
    }
  };
  return (
    <InfoDialog title={`${incident.fullName} · ${incident.kind}`} onClose={onClose}>
      <Typography variant="body2" sx={{ mb: 1 }}>{incident.description}</Typography>
      <SectionHead title={t('pwb.dis.witnesses')}>
        <Button variant="outlined" size="small" onClick={() => setDlg('witness')} data-testid="pwb-add-witness">{t('pwb.dis.addWitness')}</Button>
      </SectionHead>
      <Grid
        testId="pwb-witnesses"
        empty={t('pwb.dis.noWitnesses')}
        rows={witnesses.data ?? []}
        cols={[
          { label: t('ops.f.name'), cell: (w) => w.name, sort: (w) => w.name },
          { label: t('pwb.dis.witnessRole'), cell: (w) => t(`pwb.dis.role.${w.role}` as MessageKey), sort: (w) => w.role },
          { label: t('pwb.dis.statement'), cell: (w) => w.statement || '-' },
        ]}
      />
      <SectionHead title={t('pwb.dis.contacts')}>
        <Button variant="outlined" size="small" onClick={() => setDlg('contact')} data-testid="pwb-add-contact">{t('pwb.dis.addContact')}</Button>
      </SectionHead>
      <Grid
        testId="pwb-contacts"
        empty={t('pwb.dis.noContacts')}
        rows={contacts.data ?? []}
        cols={[
          { label: t('ops.f.date'), cell: (c) => fmt.date(c.createdAt.slice(0, 10), 'short'), sort: (c) => c.createdAt },
          { label: t('pwb.dis.method'), cell: (c) => t(`pwb.dis.method.${c.method}` as MessageKey), sort: (c) => c.method },
          { label: t('pwb.dis.guardian'), cell: (c) => c.guardian ?? '-' },
          { label: t('pwb.dis.summary'), cell: (c) => c.summary },
          { label: t('pwb.dis.meeting'), cell: (c) => (c.meetingOn ? fmt.date(c.meetingOn, 'short') : '-') },
          { label: t('pwb.dis.ack'), cell: (c) => (c.acknowledgedAt ? <Pill label={fmt.date(c.acknowledgedAt.slice(0, 10), 'short')} /> : <Pill warn label={t('pwb.dis.notAck')} />) },
        ]}
      />
      {dlg === 'witness' && (
        <FormDialog
          title={t('pwb.dis.addWitness')}
          onSubmit={(v) => addWitness(incident.id, v)}
          onClose={close}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'role', label: t('pwb.dis.witnessRole'), kind: 'select', init: 'student', options: WITNESS_ROLES.map((r) => ({ value: r, label: t(`pwb.dis.role.${r}` as MessageKey) })) },
            { name: 'studentId', label: t('ops.f.studentId'), kind: 'uuid' },
            { name: 'statement', label: t('pwb.dis.statement'), kind: 'multiline' },
          ]}
        />
      )}
      {dlg === 'contact' && (
        <FormDialog
          title={t('pwb.dis.addContact')}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.dis.contactHelp')}</Typography>}
          onSubmit={(v) => contactParents(incident.id, v)}
          onClose={close}
          fields={[
            { name: 'method', label: t('pwb.dis.method'), kind: 'select', init: 'message', options: CONTACT_METHODS.map((m) => ({ value: m, label: t(`pwb.dis.method.${m}` as MessageKey) })) },
            { name: 'summary', label: t('pwb.dis.summary'), kind: 'multiline', required: true },
            { name: 'meetingOn', label: t('pwb.dis.meeting'), kind: 'date' },
          ]}
        />
      )}
    </InfoDialog>
  );
}
