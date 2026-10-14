'use client';

import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { incidentTimeline } from '@/app/(dashboard)/governance/actions';
import { InfoDialog } from '@/components/ops/kit';
import { KitList, type ColSpec, type ParamAction } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Incident } from '@/lib/governance';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const sevTone = (v: string) => (v === 'sev1' || v === 'sev2' ? 'danger' : 'neutral');
const statusTone = (v: string) => (v === 'closed' || v === 'resolved' ? 'success' : v === 'open' ? 'warning' : 'info');

const COLUMNS: ColSpec[] = [
  { key: 'title', header: 'rk.f.incidents.title', kind: 'strong' },
  { key: 'severity', header: 'rk.f.incidents.severity', kind: 'choice', tone: sevTone },
  { key: 'category', header: 'rk.f.incidents.category', kind: 'choice', hideBelow: 'sm' },
  { key: 'status', header: 'rk.f.incidents.status', kind: 'choice', tone: statusTone },
  { key: 'detectedAt', header: 'rk.f.incidents.detectedAt', kind: 'datetime', hideBelow: 'sm' },
  { key: 'ownerId', from: 'ownerIdName', header: 'rk.f.incidents.ownerId', hideBelow: 'md' },
  { key: 'regulatorDeadline', header: 'rk.f.incidents.regulatorDeadline', kind: 'datetime', sortKey: false, hideBelow: 'md' },
  { key: 'regulatorNotifiedAt', header: 'rk.f.incidents.regulatorNotifiedAt', kind: 'datetime', sortKey: false, hideBelow: 'lg' },
  { key: 'reportedByName', header: 'rk.f.incidents.reportedByName', sortKey: false, defaultHidden: true },
  { key: 'rootCause', header: 'rk.f.incidents.rootCause', kind: 'wrap', sortKey: false, defaultHidden: true },
];

const open = (r: Row) => r.status !== 'closed';
const note = (required: boolean): ParamAction['fields'] => [{ name: 'note', label: 'rk.in.incidents.note', type: 'textarea', required }];
const ACTIONS: ParamAction[] = [
  { key: 'note', fields: note(true), when: open },
  { key: 'investigating', fields: note(false), when: (r) => r.status === 'open' || r.status === 'mitigated' },
  { key: 'mitigated', fields: note(false), when: (r) => r.status === 'investigating' || r.status === 'resolved' },
  { key: 'resolved', fields: note(false), when: (r) => r.status === 'mitigated' || r.status === 'investigating' },
  { key: 'closed', fields: note(true), when: (r) => r.status === 'resolved' },
  { key: 'reopen', fields: note(true), when: (r) => r.status === 'closed' || r.status === 'resolved' },
];

/**
 * The incident register as a record kit list: report (Add), owner, severity and category in bulk, root cause and
 * corrective actions in the record, status moves and timeline notes as actions, and the 72-hour clock for a breach of
 * personal data. Each row opens its timeline.
 */
export function IncidentsDesk({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t } = useI18n();
  const [timeline, setTimeline] = useState<Row | null>(null);
  return (
    <>
      <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground">{t('inc.hint')}</p>
      <KitList
        meta={meta}
        page={page}
        state={state}
        label="nav.govIncidents"
        columns={COLUMNS}
        paramActions={ACTIONS}
        rowActions={(r) => [{ id: 'timeline', label: t('inc.act.timeline'), onSelect: () => setTimeline(r) }]}
        empty={{ icon: <ShieldAlert />, title: 'inc.empty', body: 'inc.hint' }}
        testId="inc-table"
      />
      {timeline && <Timeline incident={timeline} onClose={() => setTimeline(null)} />}
    </>
  );
}

/** An incident's timeline: who wrote what and when, with the status each update moved it to. */
function Timeline({ incident, onClose }: { incident: Row; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<NonNullable<Incident['timeline']> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void incidentTimeline(String(incident.id)).then((r) => (r.ok ? setRows(r.data.timeline ?? []) : setError(r.error)));
  }, [incident.id]);
  return (
    <InfoDialog title={String(incident.title)} onClose={onClose}>
      {error && <p className="text-sm leading-[21px] text-red-ink">{error}</p>}
      {typeof incident.rootCause === 'string' && incident.rootCause && (
        <p className="mb-2 text-[13px] leading-[19px]">
          <strong>{t('inc.f.rootCause')}:</strong> {incident.rootCause}
        </p>
      )}
      <div data-testid="inc-timeline">
        {rows?.map((u) => (
          <p className="mb-1 text-[13px] leading-[19px]" key={u.id}>
            {fmt.dateTime(u.createdAt)} · {u.author}: {u.body}
            {u.statusAfter ? ` (${t(`inc.st.${u.statusAfter}` as MessageKey)})` : ''}
          </p>
        ))}
      </div>
    </InfoDialog>
  );
}
