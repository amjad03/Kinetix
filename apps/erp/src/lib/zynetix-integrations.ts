// Zynetix → Integrations: Google Drive and Classroom, OneDrive and Moodle for the boards. Each is one
// connector of the registry (services/api/src/connectors/connector-types.ts); secrets are write-only.

import type { MessageKey } from '@/i18n/messages';
import type { ConnectorRow } from '@/lib/govern';

export const CLOUD_INTEGRATIONS = ['cloud_google', 'cloud_microsoft', 'lms_moodle'] as const;
export type CloudIntegration = (typeof CLOUD_INTEGRATIONS)[number];

/** The form of each: the plain fields, then the secret (never shown back). */
export const INTEGRATION_FIELDS: Record<CloudIntegration, { plain: string[]; secret: string; urls: string[] }> = {
  cloud_google: { plain: ['clientId'], secret: 'clientSecret', urls: [] },
  cloud_microsoft: { plain: ['clientId', 'directory'], secret: 'clientSecret', urls: [] },
  lms_moodle: { plain: ['baseUrl'], secret: 'token', urls: ['baseUrl'] },
};

/** Fields that may be left empty. */
const OPTIONAL = new Set(['directory']);

export type IntegrationState = 'not_configured' | 'off' | 'ready' | 'failing';

export interface IntegrationView {
  type: CloudIntegration;
  state: IntegrationState;
  connector: ConnectorRow | null;
}

/** One card per integration: not set up, switched off, ready, or set up but its last test failed. */
export function integrationViews(rows: ConnectorRow[]): IntegrationView[] {
  return CLOUD_INTEGRATIONS.map((type) => {
    const c = rows.find((r) => r.type === type) ?? null;
    const state: IntegrationState = !c ? 'not_configured' : !c.enabled ? 'off' : c.lastTestStatus === 'failed' ? 'failing' : 'ready';
    return { type, state, connector: c };
  });
}

export const stateKey = (s: IntegrationState): MessageKey => `zxi.state.${s}` as MessageKey;

/** What is wrong with the form, or null. A saved secret may be left empty (it is kept). */
export function integrationProblem(type: CloudIntegration, values: Record<string, string>, secretSaved: boolean): MessageKey | null {
  const f = INTEGRATION_FIELDS[type];
  for (const k of f.plain) if (!OPTIONAL.has(k) && !values[k]?.trim()) return 'zxi.err.required';
  for (const k of f.urls) {
    const v = values[k]?.trim() ?? '';
    if (!/^https?:\/\/[^\s/]+/i.test(v)) return 'zxi.err.url';
  }
  if (!secretSaved && !values[f.secret]?.trim()) return 'zxi.err.secret';
  return null;
}

/** The connector config to send: trimmed values. Empty optional fields and an empty secret are left out (the API keeps what is saved). */
export function integrationConfig(type: CloudIntegration, values: Record<string, string>): Record<string, string> {
  const f = INTEGRATION_FIELDS[type];
  const out: Record<string, string> = {};
  for (const k of [...f.plain, f.secret]) {
    const v = values[k]?.trim() ?? '';
    if (v) out[k] = k === 'baseUrl' ? v.replace(/\/+$/, '') : v;
  }
  return out;
}

/** Whether the board needs the redirect URI registered (Google and Microsoft sign-in). */
export const needsRedirect = (type: CloudIntegration) => type !== 'lms_moodle';
