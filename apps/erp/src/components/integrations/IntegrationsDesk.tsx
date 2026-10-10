'use client';

import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { addDevice, buildNadBatch, createToken, pushAllDocuments, pushDocument, revokeToken } from '@/app/(dashboard)/integrations/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface DocRow { id: string; studentName: string; docType: string; status: string; uri: string | null; error: string | null }
export interface DeviceRow { id: string; name: string; serial: string; purpose: string; lastSeenAt: string | null; active: boolean }
export interface LtiTool { id: string; name: string; clientId: string }
export interface ScormRow { id: string; title: string; version: string }
export interface FeedToken { id: string; name: string; scopes: string[]; revokedAt: string | null }

/** Tabs for the integrations an administrator watches: documents, devices, learning standards and feeds. */
export function IntegrationsDesk({ docs, devices, tools, scorm, tokens }: { docs: DocRow[]; devices: DeviceRow[]; tools: LtiTool[]; scorm: ScormRow[]; tokens: FeedToken[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'device' | 'token' | null>(null);
  const done = (m?: string) => {
    setDialog(null);
    toast(m || t('itg.done'));
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
  return (
    <>
      <Tabbed
        label={t('nav.integrations')}
        initial="docs"
        tabs={[
          {
            id: 'docs',
            label: t('itg.tab.docs'),
            node: (
              <Stack spacing={2}>
                <Bar>
                  <ActionButton label={t('itg.btn.pushAll')} run={pushAllDocuments} onDone={done} />
                  <ActionButton label={t('itg.btn.nadBatch')} run={buildNadBatch} onDone={() => done()} />
                </Bar>
                <Grid
                  rows={docs}
                  empty={t('itg.empty')}
                  cols={[
                    { label: t('itg.col.student'), cell: (r) => r.studentName },
                    { label: t('itg.col.type'), cell: (r) => r.docType },
                    { label: t('itg.col.status'), cell: (r) => <Pill label={r.status} warn={r.status === 'failed'} />, sort: (r) => r.status },
                    { label: t('itg.col.uri'), cell: (r) => r.uri ?? '' },
                    { label: t('itg.col.error'), cell: (r) => r.error ?? '' },
                    { label: t('itg.col.action'), cell: (r) => (r.status === 'issued' ? null : <ActionButton label={t('itg.btn.push')} run={() => pushDocument(r.id)} onDone={done} />) },
                  ]}
                />
              </Stack>
            ),
          },
          {
            id: 'devices',
            label: t('itg.tab.devices'),
            node: (
              <Stack spacing={2}>
                <Bar>
                  <button type="button" onClick={() => setDialog('device')}>{t('itg.btn.newDevice')}</button>
                </Bar>
                <Grid
                  rows={devices}
                  empty={t('itg.empty')}
                  cols={[
                    { label: t('itg.col.name'), cell: (r) => r.name },
                    { label: t('itg.f.serial'), cell: (r) => r.serial },
                    { label: t('itg.col.purpose'), cell: (r) => t(`itg.purpose.${r.purpose}` as MessageKey) },
                    { label: t('itg.col.seen'), cell: (r) => (r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : '') },
                  ]}
                />
              </Stack>
            ),
          },
          {
            id: 'standards',
            label: t('itg.tab.standards'),
            node: (
              <Stack spacing={3}>
                <Grid rows={tools} empty={t('itg.empty')} cols={[{ label: t('itg.col.name'), cell: (r) => r.name }, { label: 'ID', cell: (r) => r.clientId }]} />
                <Grid rows={scorm} empty={t('itg.empty')} cols={[{ label: t('itg.col.name'), cell: (r) => r.title }, { label: t('itg.col.version'), cell: (r) => r.version }]} />
              </Stack>
            ),
          },
          {
            id: 'feeds',
            label: t('itg.tab.feeds'),
            node: (
              <Stack spacing={2}>
                <Bar>
                  <button type="button" onClick={() => setDialog('token')}>{t('itg.btn.newToken')}</button>
                </Bar>
                <Grid
                  rows={tokens}
                  empty={t('itg.empty')}
                  cols={[
                    { label: t('itg.col.name'), cell: (r) => r.name },
                    { label: t('itg.col.scopes'), cell: (r) => r.scopes.join(', ') },
                    { label: t('itg.col.action'), cell: (r) => (r.revokedAt ? null : <ActionButton label={t('itg.btn.revoke')} tone="error" run={() => revokeToken(r.id)} onDone={done} />) },
                  ]}
                />
              </Stack>
            ),
          },
        ]}
      />
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
