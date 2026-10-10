'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { removeProvider, saveProvider, toggleProvider } from '@/app/(dashboard)/sso/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface Provider { id: string; kind: string; name: string; enabled: boolean; allowedDomains: string[]; redirectAllowlist: string[] }

/** The institution's OpenID Connect providers: add, switch on or off, remove. */
export function SsoDesk({ providers, callback }: { providers: Provider[]; callback: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [adding, setAdding] = useState(false);
  const fields: Field[] = [
    { name: 'kind', label: t('gb.sso.kind'), kind: 'select', required: true, init: 'google', options: ['google', 'microsoft', 'generic'].map((k) => ({ value: k, label: t(`gb.sso.kind.${k}` as MessageKey) })) },
    { name: 'name', label: t('gb.sso.name'), required: true },
    { name: 'clientId', label: t('gb.sso.clientId'), required: true },
    { name: 'clientSecret', label: t('gb.sso.clientSecret'), required: true },
    { name: 'directoryId', label: t('gb.sso.directory') },
    { name: 'issuer', label: t('gb.sso.issuer') },
    { name: 'domains', label: t('gb.sso.domains'), kind: 'multiline', required: true },
    { name: 'redirects', label: t('gb.sso.redirects'), kind: 'multiline', required: true, init: 'kinetix://sso' },
  ];
  return (
    <>
      <p>{t('gb.sso.link')}</p>
      <Bar>
        <Button variant="contained" onClick={() => setAdding(true)}>{t('gb.sso.add')}</Button>
      </Bar>
      <Grid
        testId="sso-providers"
        empty={t('gb.sso.empty')}
        rows={providers}
        cols={[
          { label: t('gb.col.name'), cell: (p) => p.name, sort: (p) => p.name },
          { label: t('gb.col.provider'), cell: (p) => t(`gb.sso.kind.${p.kind}` as MessageKey) },
          { label: t('gb.col.domains'), cell: (p) => p.allowedDomains.join(', ') },
          { label: t('gb.col.status'), cell: (p) => <Pill label={p.enabled ? t('gb.tally.on') : t('gb.tally.off')} warn={!p.enabled} /> },
          {
            label: '',
            cell: (p) => (
              <>
                <ActionButton label={p.enabled ? t('gb.sso.disable') : t('gb.sso.enable')} run={() => toggleProvider(p.id, !p.enabled)} onDone={toast} />
                <ActionButton label={t('gb.sso.remove')} tone="error" run={() => removeProvider(p.id)} onDone={toast} />
              </>
            ),
          },
        ]}
      />
      {adding && (
        <FormDialog
          title={t('gb.sso.add')}
          intro={t('gb.sso.redirectHelp', { callback, appAddress: 'kinetix://sso' })}
          fields={fields}
          onSubmit={saveProvider}
          onClose={(m) => {
            setAdding(false);
            if (m) toast(m);
          }}
        />
      )}
      {toastNode}
    </>
  );
}
