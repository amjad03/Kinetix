'use client';

import { Copy, PlugZap, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { removeGateway, saveGateway, testGateway } from '@/app/(dashboard)/fees/gateways/actions';
import { Button } from '@/components/shadcn/button';
import { Card, Dialog, FormGrid, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { GATEWAY_FIELDS, GATEWAYS, gatewayBody, gatewayProblem, type Gateway, type GatewayAccount } from '@/lib/gateways';

const TEST_ERRORS = ['AUTHENTICATION_FAILED', 'GATEWAY_ERROR', 'NETWORK_ERROR', 'PAYMENTS_NOT_CONFIGURED'];

/**
 * Online payments: one gateway for the institution (the default) and, where a fee account (the trust, the hostel)
 * banks apart, its own. Each is Razorpay, PayU, Cashfree, Easebuzz or CCAvenue, in test (sandbox) or live mode.
 * Secrets are typed in and never shown again; the webhook URL to paste in the gateway's dashboard is shown with a copy
 * button.
 */
export function GatewayAccounts({ accounts, feeAccounts, apiUrl, serverMode }: { accounts: GatewayAccount[]; feeAccounts: { id: string; code: string; name: string }[]; apiUrl: string; serverMode: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState<string>('default');
  const saved = useMemo(() => accounts.find((a) => (a.feeAccountId ?? 'default') === scope), [accounts, scope]);
  const [provider, setProvider] = useState<Gateway>(saved?.provider ?? 'razorpay');
  const [mode, setMode] = useState<'test' | 'live'>(saved?.mode ?? 'test');
  const [keyId, setKeyId] = useState(saved?.keyId ?? '');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [accessCode, setAccessCode] = useState(saved?.accessCode ?? '');
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<GatewayAccount | null>(null);
  const [pending, start] = useTransition();
  const f = GATEWAY_FIELDS[provider];

  const pick = (s: string) => {
    const a = accounts.find((x) => (x.feeAccountId ?? 'default') === s);
    setScope(s);
    setProvider(a?.provider ?? 'razorpay');
    setMode(a?.mode ?? 'test');
    setKeyId(a?.keyId ?? '');
    setAccessCode(a?.accessCode ?? '');
    setKeySecret('');
    setWebhookSecret('');
    setTouched(false);
  };
  const input = { provider, feeAccountId: scope === 'default' ? null : scope, mode, keyId, keySecret, webhookSecret, accessCode };
  const problem = gatewayProblem(input, saved);
  const err = (p: string[]) => (touched && problem && p.includes(problem) ? t(`ff.gw.problem.${problem}` as MessageKey) : undefined);

  const save = () => {
    setTouched(true);
    if (problem) return;
    start(async () => {
      const res = await saveGateway(gatewayBody(input));
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ff.gw.saved'));
      setKeySecret('');
      setWebhookSecret('');
      router.refresh();
    });
  };
  const test = (a: GatewayAccount) =>
    start(async () => {
      const res = await testGateway(a.feeAccountId);
      if (!res.ok) return toast.error(res.error);
      if (res.data.ok) toast.success(t('ff.gw.testOk', { mode: t(`fd.st.${res.data.mode}` as MessageKey) }));
      else toast.error(t(`ff.gw.test.${TEST_ERRORS.includes(res.data.error) ? res.data.error : 'GATEWAY_ERROR'}` as MessageKey));
    });
  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url);
    toast.success(t('ff.gw.copied'));
  };
  const scopeOptions = [{ value: 'default', label: t('ff.gw.default') }, ...feeAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))];

  return (
    <div className="grid gap-6">
      {serverMode !== 'gateways' && serverMode !== 'razorpay' && serverMode !== 'payu' ? <p className="m-0 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{t(serverMode === 'demo' ? 'ff.gw.demoServer' : 'ff.gw.offServer')}</p> : null}
      <Card title={t('ff.gw.saved.title')} subtitle={t('ff.gw.saved.sub')}>
        {accounts.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground" data-testid="gateways-empty">
            {t('ff.gw.none')}
          </p>
        ) : (
          <ul className="grid gap-3" data-testid="gateway-list">
            {accounts.map((a) => {
              const url = `${apiUrl.replace(/\/+$/, '')}${a.webhookPath}`;
              return (
                <li key={a.id} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="m-0 flex flex-wrap items-center gap-2 font-medium">
                      {a.feeAccount ?? t('ff.gw.default')} · {t(`fd.st.${a.provider}` as MessageKey)}
                      <StatusPill tone={a.mode === 'live' ? 'success' : 'warning'}>{t(`fd.st.${a.mode}` as MessageKey)}</StatusPill>
                    </p>
                    <p className="m-0 mt-1 break-all text-sm text-muted-foreground">
                      {t('ff.gw.keyShown', { key: a.keyId, last4: a.keySecretLast4 || '····' })} · {t('ff.gw.changed', { when: fmt.date(a.updatedAt.slice(0, 10)) })}
                    </p>
                    <p className="m-0 mt-1 flex min-w-0 items-center gap-1 text-sm">
                      <span className="shrink-0 text-muted-foreground">{t('ff.gw.webhook')}</span>
                      <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 text-[12px]">{url}</code>
                      <Button type="button" size="icon" variant="ghost" aria-label={t('ff.gw.copy')} onClick={() => copy(url)}>
                        <Copy className="size-4" />
                      </Button>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={pending} onClick={() => test(a)}>
                      <PlugZap className="size-4" /> {t('ff.gw.test')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => pick(a.feeAccountId ?? 'default')}>
                      {t('ff.gw.edit')}
                    </Button>
                    <Button type="button" variant="ghost" aria-label={t('fd.remove')} onClick={() => setRemoving(a)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={saved ? t('ff.gw.change') : t('ff.gw.add')} subtitle={t('ff.gw.form.sub')}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormGrid>
            <SelectInput label={t('ff.gw.for')} value={scope} onChange={(e) => pick(e.target.value)} options={scopeOptions} />
            <SelectInput label={t('ff.gw.provider')} value={provider} onChange={(e) => setProvider(e.target.value as Gateway)} options={GATEWAYS.map((g) => ({ value: g, label: t(`fd.st.${g}` as MessageKey) }))} />
            {f.mode ? <SelectInput label={t('ff.gw.mode')} value={mode} onChange={(e) => setMode(e.target.value as 'test' | 'live')} options={[{ value: 'test', label: t('fd.st.test') }, { value: 'live', label: t('fd.st.live') }]} /> : null}
            <TextInput label={t(f.keyId as MessageKey)} value={keyId} onChange={(e) => setKeyId(e.target.value)} error={!!err(['keyId'])} helperText={err(['keyId'])} autoComplete="off" />
            <TextInput label={t(f.secret as MessageKey)} type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} error={!!err(['secretRequired', 'secretShort'])} helperText={err(['secretRequired', 'secretShort']) ?? (saved ? t('ff.gw.secretKept', { last4: saved.keySecretLast4 }) : t('ff.gw.secretNew'))} autoComplete="new-password" />
            {f.webhook ? <TextInput label={t('ff.gw.webhookSecret')} type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} error={!!err(['webhookRequired'])} helperText={err(['webhookRequired'])} autoComplete="new-password" /> : null}
            {f.access ? <TextInput label={t(f.access === 'code' ? 'ff.gw.accessCode' : 'ff.gw.merchantEmail')} value={accessCode} onChange={(e) => setAccessCode(e.target.value)} error={!!err(['accessRequired'])} helperText={err(['accessRequired'])} autoComplete="off" /> : null}
          </FormGrid>
          <p className="m-0 text-sm text-muted-foreground">{t(`ff.gw.help.${provider}` as MessageKey)}</p>
          <div>
            <Button type="submit" disabled={pending}>
              {t('ff.gw.save')}
            </Button>
          </div>
        </form>
      </Card>
      {removing ? (
        <Dialog
          title={t('ff.gw.removeTitle')}
          busy={pending}
          onClose={() => setRemoving(null)}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                {t('fd.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await removeGateway(removing.feeAccountId);
                    setRemoving(null);
                    if (!res.ok) return toast.error(res.error);
                    toast.success(t('ff.gw.removed'));
                    router.refresh();
                  })
                }
              >
                {t('fd.remove')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">{t('ff.gw.removeBody', { account: removing.feeAccount ?? t('ff.gw.default') })}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
