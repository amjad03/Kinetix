'use client';
import { useState, useTransition } from 'react';
import { Cloud, GraduationCap } from 'lucide-react';
import { removeIntegration, saveIntegration, setIntegrationEnabled, testIntegration } from '@/app/(dashboard)/zynetix/integrations/actions';
import { Alert, Button, Card, Chip, Snackbar } from '@/components/kx';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { INTEGRATION_FIELDS, integrationProblem, needsRedirect, stateKey, type IntegrationView } from '@/lib/zynetix-integrations';

const STATE_COLOR = { not_configured: 'warning', off: 'default', ready: 'success', failing: 'error' } as const;

/** One integration: its state (clearly "Not configured" until set up), the form (secrets write-only), test, on/off, remove. */
export function IntegrationCard({ view, redirectUri }: { view: IntegrationView; redirectUri: string | null }) {
  const { t } = useI18n();
  const c = view.connector;
  const f = INTEGRATION_FIELDS[view.type];
  const secretSaved = !!c?.secretsSet.includes(f.secret);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(f.plain.map((k) => [k, typeof c?.config[k] === 'string' ? (c.config[k] as string) : ''])));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = integrationProblem(view.type, values, secretSaved);
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));

  const run = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done?: (d: T) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      done?.(r.data);
    });

  const save = () => {
    setTouched(true);
    if (problem) return;
    setResult(null);
    run(
      () => saveIntegration(view.type, values, c?.id),
      () => {
        set(f.secret, '');
        setTouched(false);
        setToast(t('zxi.saved'));
      },
    );
  };

  return (
    <Card className="px-5 py-4 max-w-[860px]" data-testid={`zxi-${view.type}`} data-state={view.state} aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 inline-flex items-center gap-2 text-base font-semibold">
          {view.type === 'lms_moodle' ? <GraduationCap className="size-5" /> : <Cloud className="size-5" />} {t(`zxi.type.${view.type}` as MessageKey)}
        </h2>
        <Chip size="small" color={STATE_COLOR[view.state]} label={t(stateKey(view.state))} data-testid={`zxi-state-${view.type}`} />
      </div>
      <p className="mt-2 text-[13px] leading-[19px] text-muted-foreground">{t(`zxi.help.${view.type}` as MessageKey)}</p>
      {view.state === 'not_configured' && (
        <Alert className="mt-3" severity="info">
          {t('zxi.notConfigured')}
        </Alert>
      )}
      {needsRedirect(view.type) && redirectUri && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{t('zxi.redirect')}:</span>
          <code className="rounded bg-muted px-2 py-1 break-all" data-testid={`zxi-redirect-${view.type}`}>
            {redirectUri}
          </code>
          <Button size="small" variant="text" onClick={() => void navigator.clipboard?.writeText(redirectUri).then(() => setToast(t('zxi.copied')))}>
            {t('zxi.copy')}
          </Button>
        </div>
      )}
      {error && (
        <Alert className="mt-3" severity="error">
          {error}
        </Alert>
      )}
      <form
        className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2"
        noValidate
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {f.plain.map((k) => (
          <FormField key={k} label={t(`zxi.field.${k}` as MessageKey)} required={k !== 'directory'}>
            <TextInput value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} slotProps={{ htmlInput: { spellCheck: false, 'data-testid': `zxi-${view.type}-${k}` } }} />
          </FormField>
        ))}
        <FormField label={t(`zxi.field.${f.secret}` as MessageKey)} required={!secretSaved}>
          <TextInput
            type="password"
            value={values[f.secret] ?? ''}
            onChange={(e) => set(f.secret, e.target.value)}
            helperText={secretSaved ? t('zxi.secretSaved') : undefined}
            slotProps={{ htmlInput: { autoComplete: 'new-password', spellCheck: false, 'data-testid': `zxi-${view.type}-${f.secret}` } }}
          />
        </FormField>
        {touched && problem && (
          <Alert className="md:col-span-2" severity="warning">
            {t(problem)}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" variant="contained" disabled={pending} data-testid={`zxi-save-${view.type}`}>
            {t('zxi.save')}
          </Button>
          {c && (
            <>
              <Button variant="outlined" disabled={pending} onClick={() => run(() => testIntegration(c.id), (r) => setResult({ ok: r.status === 'ok', text: r.message }))}>
                {pending ? t('zxi.testing') : t('zxi.test')}
              </Button>
              <Button variant="outlined" disabled={pending} onClick={() => run(() => setIntegrationEnabled(c.id, !c.enabled))}>
                {c.enabled ? t('zxi.turnOff') : t('zxi.turnOn')}
              </Button>
              <Button variant="text" color="error" disabled={pending} onClick={() => run(() => removeIntegration(c.id), () => setToast(t('zxi.removed')))}>
                {t('zxi.remove')}
              </Button>
            </>
          )}
        </div>
      </form>
      {(result || c?.lastTestMessage) && (
        <Alert className="mt-4" severity={(result?.ok ?? c?.lastTestStatus === 'ok') ? 'success' : 'error'}>
          {result?.text ?? c?.lastTestMessage}
        </Alert>
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ''} />
    </Card>
  );
}
