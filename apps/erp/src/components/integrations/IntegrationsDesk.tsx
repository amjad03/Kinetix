'use client';

import { BookOpenCheck, Cpu, FileCheck2, KeyRound, PlugZap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { addDevice, buildNadBatch, createToken, pushAllDocuments } from '@/app/(dashboard)/integrations/actions';
import { Button } from '@/components/kx';
import { ActionButton, FormDialog, useToast, type Field } from '@/components/ops/kit';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { IntegrationView } from '@/lib/integration-views';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const docTone = (v: string) => (v === 'issued' ? 'success' : v === 'failed' ? 'danger' : 'warning');
const COLUMNS: Record<IntegrationView, ColSpec[]> = {
  'digilocker-documents': [
    { key: 'title', header: 'rk.f.digilocker-documents.title', kind: 'strong' },
    { key: 'studentName', header: 'rk.f.digilocker-documents.studentName', sortKey: 'student' },
    { key: 'docType', header: 'rk.f.digilocker-documents.docType', kind: 'choice' },
    { key: 'status', header: 'rk.f.digilocker-documents.status', kind: 'choice', tone: docTone },
    { key: 'issuedAt', header: 'rk.f.digilocker-documents.issuedAt', kind: 'datetime', sortKey: false, hideBelow: 'md' },
    { key: 'uri', header: 'rk.f.digilocker-documents.uri', kind: 'list', sortKey: false, hideBelow: 'lg' },
    { key: 'error', header: 'rk.f.digilocker-documents.error', kind: 'wrap', sortKey: false, hideBelow: 'md' },
    { key: 'docRef', header: 'rk.f.digilocker-documents.docRef', sortKey: false, defaultHidden: true },
  ],
  'access-devices': [
    { key: 'name', header: 'rk.f.access-devices.name', kind: 'strong' },
    { key: 'serial', header: 'rk.f.access-devices.serial' },
    { key: 'kind', header: 'rk.f.access-devices.kind', kind: 'choice', hideBelow: 'sm' },
    { key: 'purpose', header: 'rk.f.access-devices.purpose', kind: 'choice' },
    { key: 'location', header: 'rk.f.access-devices.location', hideBelow: 'md' },
    { key: 'active', header: 'rk.f.access-devices.active', kind: 'bool' },
    { key: 'lastSeenAt', header: 'rk.f.access-devices.lastSeenAt', kind: 'datetime', hideBelow: 'md' },
    { key: 'vendor', header: 'rk.f.access-devices.vendor', kind: 'choice', defaultHidden: true },
  ],
  'lti-tools': [
    { key: 'name', header: 'rk.f.lti-tools.name', kind: 'strong' },
    { key: 'clientId', header: 'rk.f.lti-tools.clientId' },
    { key: 'launchUrl', header: 'rk.f.lti-tools.launchUrl', kind: 'list', sortKey: false, hideBelow: 'md' },
    { key: 'deploymentId', header: 'rk.f.lti-tools.deploymentId', hideBelow: 'lg' },
    { key: 'active', header: 'rk.f.lti-tools.active', kind: 'bool' },
    { key: 'loginUrl', header: 'rk.f.lti-tools.loginUrl', kind: 'list', sortKey: false, defaultHidden: true },
  ],
  'scorm-packages': [
    { key: 'title', header: 'rk.f.scorm-packages.title', kind: 'strong' },
    { key: 'courseId', from: 'course', header: 'rk.f.scorm-packages.courseId' },
    { key: 'version', header: 'rk.f.scorm-packages.version', hideBelow: 'sm' },
    { key: 'fileCount', header: 'rk.f.scorm-packages.fileCount', kind: 'number', sortKey: false, hideBelow: 'md' },
    { key: 'attempts', header: 'rk.f.scorm-packages.attempts', kind: 'number', sortKey: false },
  ],
  'api-tokens': [
    { key: 'name', header: 'rk.f.api-tokens.name', kind: 'strong' },
    { key: 'scopes', header: 'rk.f.api-tokens.scopes', kind: 'list', sortKey: false },
    { key: 'state', header: 'rk.f.api-tokens.state', kind: 'choice', sortKey: false, tone: (v) => (v === 'active' ? 'success' : 'neutral') },
    { key: 'lastUsedAt', header: 'rk.f.api-tokens.lastUsedAt', kind: 'datetime', hideBelow: 'sm' },
    { key: 'createdByName', header: 'rk.f.api-tokens.createdByName', sortKey: false, hideBelow: 'md' },
  ],
};
const ICON: Record<IntegrationView, ReactNode> = { 'digilocker-documents': <FileCheck2 />, 'access-devices': <Cpu />, 'lti-tools': <PlugZap />, 'scorm-packages': <BookOpenCheck />, 'api-tokens': <KeyRound /> };

/**
 * One integration list at a time (the page's tabs choose it), each a record kit list. Registering a device and creating
 * a token stay their own forms, because the device key and the token are shown only once; DigiLocker documents are
 * pushed one by one from the list or all at once here.
 */
export function IntegrationsDesk({ view, list }: { view: IntegrationView; list: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'device' | 'token' | null>(null);
  const done = (m?: string) => {
    setDialog(null);
    toast(m || t('itg.done'));
    router.refresh();
  };
  const deviceFields: Field[] = [
    { name: 'name', label: t('itg.f.name'), required: true },
    { name: 'serial', label: t('itg.f.serial'), required: true },
    { name: 'kind', label: t('itg.f.kind'), kind: 'select', init: 'biometric', options: [{ value: 'biometric', label: t('itg.kind.biometric') }, { value: 'rfid_reader', label: t('itg.kind.rfid') }] },
    { name: 'purpose', label: t('itg.f.purpose'), kind: 'select', init: 'attendance', options: ['attendance', 'library', 'board_signin'].map((p) => ({ value: p, label: t(`itg.purpose.${p}` as MessageKey) })) },
  ];
  const tokenFields: Field[] = [
    { name: 'name', label: t('itg.f.name'), required: true },
    { name: 'scopes', label: t('itg.f.scopes'), kind: 'multiline', required: true, init: 'odata:students' },
  ];
  const toolbar =
    view === 'access-devices' ? (
      <Button variant="contained" onClick={() => setDialog('device')} data-testid="itg-new-device">
        {t('itg.btn.newDevice')}
      </Button>
    ) : view === 'api-tokens' ? (
      <Button variant="contained" onClick={() => setDialog('token')} data-testid="itg-new-token">
        {t('itg.btn.newToken')}
      </Button>
    ) : view === 'digilocker-documents' ? (
      <>
        <ActionButton label={t('itg.btn.pushAll')} run={pushAllDocuments} onDone={(m) => done(m)} />
        <ActionButton label={t('itg.btn.nadBatch')} run={buildNadBatch} onDone={(m) => done(m)} />
      </>
    ) : undefined;
  return (
    <>
      <KitList {...list} label={`rk.entity.${view}` as MessageKey} columns={COLUMNS[view]} toolbar={toolbar} extraParams={{ view }} empty={{ icon: ICON[view], title: 'itg.empty', body: `kr.empty.${view}` as MessageKey }} testId={`itg-${view}`} />
      {dialog === 'device' && (
        <FormDialog
          title={t('itg.btn.newDevice')}
          fields={deviceFields}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const r = await addDevice(v);
            if (r.ok) done(t('itg.keyOnce', { key: r.data.deviceKey }));
            return r;
          }}
        />
      )}
      {dialog === 'token' && (
        <FormDialog
          title={t('itg.btn.newToken')}
          fields={tokenFields}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const r = await createToken(v);
            if (r.ok) done(t('itg.keyOnce', { key: r.data.token }));
            return r;
          }}
        />
      )}
      {toastNode}
    </>
  );
}
