'use client';

import { KeyRound } from 'lucide-react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const COLUMNS: ColSpec[] = [
  { key: 'name', header: 'rk.f.sso-providers.name', kind: 'strong' },
  { key: 'kind', header: 'rk.f.sso-providers.kind', kind: 'choice' },
  { key: 'allowedDomains', header: 'rk.f.sso-providers.allowedDomains', kind: 'list', sortKey: false },
  { key: 'clientId', header: 'rk.f.sso-providers.clientId', sortKey: false, hideBelow: 'md' },
  { key: 'enabled', header: 'rk.f.sso-providers.enabled', kind: 'bool', sortKey: false },
  { key: 'redirectAllowlist', header: 'rk.f.sso-providers.redirectAllowlist', kind: 'list', sortKey: false, defaultHidden: true },
  { key: 'issuer', header: 'rk.f.sso-providers.issuer', sortKey: false, defaultHidden: true },
];

/**
 * The institution's OpenID Connect providers as a record kit list: add with the client secret (stored encrypted),
 * edit, switch on or off in bulk, delete to the recycle bin and restore, with history.
 */
export function SsoDesk({ list, callback }: { list: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }; callback: string }) {
  const { t } = useI18n();
  return (
    <>
      <p className="mb-2 text-sm">{t('gb.sso.link')}</p>
      <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground" data-testid="sso-callback">
        {t('gb.sso.redirectHelp', { callback, appAddress: 'zynetix://sso' })}
      </p>
      <KitList {...list} label="nav.sso" columns={COLUMNS} empty={{ icon: <KeyRound />, title: 'gb.sso.empty', body: 'gb.sso.link' }} testId="sso-providers" />
    </>
  );
}
