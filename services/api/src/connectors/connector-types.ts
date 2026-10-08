import { z } from 'zod';

/**
 * The connector registry (PRD section 67): every kind of outside system an institution can connect.
 * Only the generic outbound webhook is built; the others are registry entries with their settings
 * form, saved encrypted, and report "not available in this build" when tested.
 */

export type FieldKind = 'text' | 'url' | 'secret' | 'select' | 'events';
export interface ConnectorField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: string[];
  help?: string;
}
export interface ConnectorType {
  type: string;
  label: string;
  description: string;
  /** False for registry entries whose integration is not part of this build. */
  available: boolean;
  fields: ConnectorField[];
}

const text = (key: string, label: string, required = true, help?: string): ConnectorField => ({ key, label, kind: 'text', required, help });
const url = (key: string, label: string, required = true): ConnectorField => ({ key, label, kind: 'url', required });
const secret = (key: string, label: string, required = true): ConnectorField => ({ key, label, kind: 'secret', required });
const select = (key: string, label: string, options: string[]): ConnectorField => ({ key, label, kind: 'select', required: true, options });

export const CONNECTOR_TYPES: ConnectorType[] = [
  {
    type: 'webhook_out',
    label: 'Outbound webhook',
    description: 'Sends KINETIX events (fee paid, results published, student enrolled ...) to your own HTTPS endpoint, signed with HMAC-SHA256.',
    available: true,
    fields: [url('url', 'Endpoint URL'), secret('secret', 'Signing secret (at least 16 characters)'), { key: 'events', label: 'Events (leave empty for all)', kind: 'events', required: false }],
  },
  { type: 'sms_provider', label: 'SMS provider', description: 'Send text messages through your own SMS account.', available: false, fields: [select('provider', 'Provider', ['msg91', 'twilio', 'textlocal', 'other']), secret('apiKey', 'API key'), text('senderId', 'Sender id', false)] },
  { type: 'payment', label: 'Payment gateway', description: 'Collect fees through a payment gateway account.', available: false, fields: [select('provider', 'Provider', ['razorpay', 'cashfree', 'payu', 'other']), text('keyId', 'Key id'), secret('keySecret', 'Key secret'), secret('webhookSecret', 'Webhook secret', false)] },
  { type: 'gps', label: 'GPS / vehicle tracking', description: 'Read bus locations from a tracking provider.', available: false, fields: [text('provider', 'Provider'), url('endpointUrl', 'API URL'), secret('apiKey', 'API key')] },
  { type: 'library_koha', label: 'Library (Koha)', description: 'Sync the catalogue and loans with a Koha library system.', available: false, fields: [url('baseUrl', 'Koha URL'), text('clientId', 'Client id'), secret('clientSecret', 'Client secret')] },
  { type: 'lms_video', label: 'Video classes (Zoom / Teams)', description: 'Create meetings for online classes.', available: false, fields: [select('provider', 'Provider', ['zoom', 'teams']), text('accountId', 'Account / tenant id'), text('clientId', 'Client id'), secret('clientSecret', 'Client secret')] },
  { type: 'bi_export', label: 'BI export (Power BI and others)', description: 'Push report data to a business-intelligence tool.', available: false, fields: [select('tool', 'Tool', ['powerbi', 'metabase', 'other']), url('endpointUrl', 'Endpoint URL'), secret('apiToken', 'API token')] },
];

export const connectorType = (type: string): ConnectorType | undefined => CONNECTOR_TYPES.find((t) => t.type === type);

/** The input check for a type's settings: right keys only, required ones present, secrets long enough. */
export function configSchema(t: ConnectorType): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of t.fields) {
    let s: z.ZodType;
    if (f.kind === 'events') s = z.array(z.string().trim().min(1).max(120)).max(100);
    else if (f.kind === 'select') s = z.enum(f.options as [string, ...string[]]);
    else if (f.kind === 'url') s = z.url().max(500);
    else s = z.string().trim().min(1).max(500);
    if (t.type === 'webhook_out' && f.key === 'secret') s = z.string().min(16).max(200);
    shape[f.key] = f.required ? s : s.optional();
  }
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, unknown>>;
}
