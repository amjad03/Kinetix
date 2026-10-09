'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { closeOutIncident, incidentTimeline, reportIncident, updateIncident } from '@/app/(dashboard)/governance/actions';
import { Bar, FormDialog, Grid, InfoDialog, useToast } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, INCIDENT_STATUSES, type Incident } from '@/lib/governance';

/** The incident register: report, update the timeline, record root cause and corrective actions, and watch the 72-hour breach clock. */
export function IncidentsDesk({ incidents }: { incidents: Incident[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'report' | { update: Incident } | { closeOut: Incident } | { timeline: Incident } | null>(null);
  const statusOpts = INCIDENT_STATUSES.map((s) => ({ value: s, label: t(`inc.st.${s}` as MessageKey) }));
  const done = (m?: string) => {
    setDialog(null);
    if (m) toast(t('ops.saved'));
  };
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('inc.hint')}
      </Typography>
      <Bar>
        <Button variant="contained" onClick={() => setDialog('report')} data-testid="inc-report">
          {t('inc.report')}
        </Button>
      </Bar>
      <Grid
        testId="inc-table"
        empty={t('inc.empty')}
        rows={incidents}
        exportName="incidents"
        cols={[
          { label: t('inc.col.title'), cell: (r) => r.title, sort: (r) => r.title },
          { label: t('inc.col.severity'), cell: (r) => <StatusPill tone={r.severity === 'sev1' || r.severity === 'sev2' ? 'danger' : 'neutral'}>{t(`inc.sev.${r.severity}` as MessageKey)}</StatusPill>, sort: (r) => r.severity },
          { label: t('inc.col.category'), cell: (r) => t(`inc.cat.${r.category}` as MessageKey), sort: (r) => r.category },
          { label: t('inc.col.status'), cell: (r) => t(`inc.st.${r.status}` as MessageKey), sort: (r) => r.status },
          { label: t('inc.col.detected'), cell: (r) => fmt.dateTime(r.detectedAt), sort: (r) => r.detectedAt },
          {
            label: t('inc.col.regulator'),
            cell: (r) =>
              !r.personalDataInvolved ? (
                '—'
              ) : r.regulatorNotifiedAt ? (
                <StatusPill tone="success">{t('inc.notified')}</StatusPill>
              ) : (
                <StatusPill tone={r.regulatorOverdue ? 'danger' : 'warning'}>{t(r.regulatorOverdue ? 'inc.overdue' : 'inc.due', { when: fmt.dateTime(r.regulatorDeadline!) })}</StatusPill>
              ),
          },
          {
            label: '',
            cell: (r) => (
              <Stack direction="row">
                <Button size="small" onClick={() => setDialog({ timeline: r })}>
                  {t('inc.act.timeline')}
                </Button>
                {r.status !== 'closed' && (
                  <>
                    <Button size="small" onClick={() => setDialog({ update: r })}>
                      {t('inc.act.update')}
                    </Button>
                    <Button size="small" onClick={() => setDialog({ closeOut: r })}>
                      {t('inc.act.closeOut')}
                    </Button>
                  </>
                )}
              </Stack>
            ),
          },
        ]}
      />
      {dialog === 'report' && (
        <FormDialog
          title={t('inc.report')}
          onSubmit={reportIncident}
          onClose={done}
          fields={[
            { name: 'title', label: t('inc.f.title'), required: true },
            { name: 'severity', label: t('inc.f.severity'), kind: 'select', init: 'sev3', options: INCIDENT_SEVERITIES.map((s) => ({ value: s, label: t(`inc.sev.${s}` as MessageKey) })) },
            { name: 'category', label: t('inc.f.category'), kind: 'select', init: 'other', options: INCIDENT_CATEGORIES.map((s) => ({ value: s, label: t(`inc.cat.${s}` as MessageKey) })) },
            { name: 'description', label: t('inc.f.description'), kind: 'multiline' },
            { name: 'impact', label: t('inc.f.impact'), kind: 'multiline' },
            { name: 'personalData', label: t('inc.f.personalData'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('inc.no') }, { value: 'yes', label: t('inc.yes') }] },
          ]}
        />
      )}
      {typeof dialog === 'object' && dialog && 'update' in dialog && (
        <FormDialog
          title={t('inc.act.update')}
          onSubmit={(v) => updateIncident(dialog.update.id, v)}
          onClose={done}
          fields={[
            { name: 'body', label: t('inc.f.note'), kind: 'multiline', required: true },
            { name: 'status', label: t('inc.f.status'), kind: 'select', init: '', options: [{ value: '', label: t('inc.keepStatus') }, ...statusOpts] },
          ]}
        />
      )}
      {typeof dialog === 'object' && dialog && 'closeOut' in dialog && (
        <FormDialog
          title={t('inc.act.closeOut')}
          intro={t('inc.closeHint')}
          onSubmit={(v) => closeOutIncident(dialog.closeOut.id, v)}
          onClose={done}
          fields={[
            { name: 'rootCause', label: t('inc.f.rootCause'), kind: 'multiline', init: dialog.closeOut.rootCause ?? '' },
            { name: 'correctiveActions', label: t('inc.f.corrective'), kind: 'multiline', init: dialog.closeOut.correctiveActions ?? '' },
            ...(dialog.closeOut.personalDataInvolved && !dialog.closeOut.regulatorNotifiedAt ? [{ name: 'regulatorNotified', label: t('inc.f.regulator'), kind: 'select' as const, init: 'no', options: [{ value: 'no', label: t('inc.no') }, { value: 'yes', label: t('inc.yes') }] }] : []),
          ]}
        />
      )}
      {typeof dialog === 'object' && dialog && 'timeline' in dialog && <Timeline incident={dialog.timeline} onClose={() => setDialog(null)} />}
      {toastNode}
    </>
  );
}

function Timeline({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<NonNullable<Incident['timeline']> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void incidentTimeline(incident.id).then((r) => (r.ok ? setRows(r.data.timeline ?? []) : setError(r.error)));
  }, [incident.id]);
  return (
    <InfoDialog title={`${incident.title}`} onClose={onClose}>
      {error && <Typography color="error">{error}</Typography>}
      {incident.rootCause && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>{t('inc.f.rootCause')}:</strong> {incident.rootCause}
        </Typography>
      )}
      {rows?.map((u) => (
        <Typography key={u.id} variant="body2" sx={{ mb: 0.5 }}>
          {fmt.dateTime(u.createdAt)} · {u.author}: {u.body}
          {u.statusAfter ? ` (${t(`inc.st.${u.statusAfter}` as MessageKey)})` : ''}
        </Typography>
      ))}
    </InfoDialog>
  );
}
