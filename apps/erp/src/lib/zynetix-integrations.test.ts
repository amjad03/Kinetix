import { describe, expect, it } from 'vitest';
import type { ConnectorRow } from '@/lib/govern';
import { integrationConfig, integrationProblem, integrationViews, needsRedirect } from './zynetix-integrations';

const row = (type: string, over: Partial<ConnectorRow> = {}): ConnectorRow => ({
  id: `id-${type}`,
  type,
  typeLabel: type,
  name: type,
  enabled: true,
  available: true,
  config: {},
  secretsSet: [],
  lastTestAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  ...over,
});

describe('Zynetix integrations', () => {
  it('shows every integration, clearly not configured until set up', () => {
    expect(integrationViews([]).map((v) => [v.type, v.state])).toEqual([
      ['cloud_google', 'not_configured'],
      ['cloud_microsoft', 'not_configured'],
      ['lms_moodle', 'not_configured'],
    ]);
    const views = integrationViews([row('cloud_google'), row('cloud_microsoft', { enabled: false }), row('lms_moodle', { lastTestStatus: 'failed' }), row('webhook_out')]);
    expect(views.map((v) => v.state)).toEqual(['ready', 'off', 'failing']);
  });

  it('checks the form: required fields, a web address for Moodle, and a secret the first time', () => {
    expect(integrationProblem('cloud_google', { clientId: '', clientSecret: 's' }, false)).toBe('zxi.err.required');
    expect(integrationProblem('cloud_google', { clientId: 'id' }, false)).toBe('zxi.err.secret');
    expect(integrationProblem('cloud_google', { clientId: 'id' }, true)).toBeNull();
    expect(integrationProblem('cloud_microsoft', { clientId: 'id', clientSecret: 's', directory: '' }, false)).toBeNull();
    expect(integrationProblem('lms_moodle', { baseUrl: 'moodle.college.in', token: 't' }, false)).toBe('zxi.err.url');
    expect(integrationProblem('lms_moodle', { baseUrl: 'https://moodle.college.in', token: 't' }, false)).toBeNull();
  });

  it('sends trimmed values and leaves out an empty secret (kept) and empty optional fields', () => {
    expect(integrationConfig('lms_moodle', { baseUrl: ' https://moodle.college.in/ ', token: ' tok ' })).toEqual({ baseUrl: 'https://moodle.college.in', token: 'tok' });
    expect(integrationConfig('cloud_microsoft', { clientId: ' id ', directory: '', clientSecret: '' })).toEqual({ clientId: 'id' });
    expect(needsRedirect('cloud_google')).toBe(true);
    expect(needsRedirect('lms_moodle')).toBe(false);
  });
});
