'use client';
import { useState, useTransition, type FocusEvent } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { saveRazorpay, testRazorpay } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { razorpayProblem, type RazorpayAccount } from '@/lib/payments';

import { Alert, Button, Card, Chip, CircularProgress, IconButton, Snackbar, Tooltip } from '@/components/kx';
import { Banknote as PaymentsOutlined, Copy as ContentCopyOutlined } from 'lucide-react';
const TEST_RESULTS = ['AUTHENTICATION_FAILED', 'GATEWAY_ERROR', 'NETWORK_ERROR', 'PAYMENTS_NOT_CONFIGURED'];

/**
 * Settings → Online payments: the institution's own Razorpay account. Fees go straight to it.
 * The secrets are write-only: the fields start empty and the API never sends them back.
 */
export function RazorpayForm({ initial, webhookUrl }: { initial: RazorpayAccount; webhookUrl: string }) {
  const { t, fmt } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [keyId, setKeyId] = useState(initial.keyId ?? '');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  const input = { keyId, keySecret, webhookSecret };
  const problem = razorpayProblem(input, saved);
  const show = (k: NonNullable<typeof problem>[]) => (touched && problem && k.includes(problem) ? t(`payments.problem.${problem}`) : undefined);
  const changed = keyId.trim() !== (saved.keyId ?? '') || !!keySecret.trim() || !!webhookSecret.trim();
  const secretHelp = saved.configured ? (saved.keySecretLast4 ? t('payments.secretSaved', { last4: saved.keySecretLast4 }) : t('payments.secretSavedNoHint')) : t('payments.secretNew');

  const save = () => {
    setTouched(true);
    if (problem) return;
    setError(null);
    setResult(null);
    start(async () => {
      const res = await saveRazorpay(input, saved);
      if (!res.ok) return setError(res.error);
      setSaved(res.data);
      setKeyId(res.data.keyId ?? '');
      setKeySecret('');
      setWebhookSecret('');
      setTouched(false);
      setToast(t('payments.saved'));
    });
  };

  const test = () => {
    setResult(null);
    startTest(async () => {
      const res = await testRazorpay();
      if (!res.ok) return setResult({ ok: false, text: res.error });
      const r = res.data;
      setResult(r.ok ? { ok: true, text: t('payments.test.ok') } : { ok: false, text: t(`payments.test.${TEST_RESULTS.includes(r.error) ? r.error : 'GATEWAY_ERROR'}` as MessageKey) });
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setToast(t('payments.copied'));
    } catch {
      // Clipboard blocked (http, permissions): the URL is selectable in the field.
    }
  };

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <PaymentsOutlined className="size-5" /> {t('payments.title')}
        </span>
      </SectionTitle>
      <Card className="px-5 py-4" data-testid="razorpay" data-configured={saved.configured ? 'true' : 'false'} aria-busy={pending || testing}>
        <p className="text-[13px] leading-[19px] text-muted-foreground max-w-[820px]">
          {t('payments.help')}
        </p>
        <p className="text-[13px] leading-[19px] text-muted-foreground max-w-[820px] mt-2">
          {t('payments.steps')}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3" data-testid="razorpay-status">
          {saved.configured ? (
            <>
              <Chip size="small" color="success" label={t('payments.status.configured')} />
              {saved.mode && <Chip size="small" variant="outlined" color={saved.mode === 'live' ? 'primary' : 'warning'} label={t(saved.mode === 'live' ? 'payments.mode.live' : 'payments.mode.test')} data-testid="razorpay-mode" />}
              {saved.updatedAt && (
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {t('payments.updated', { when: fmt.dateTime(saved.updatedAt) })}
                </span>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-[19px] text-red-ink">
              {t('payments.status.notConfigured')}
            </p>
          )}
        </div>
        {saved.provider !== 'razorpay' && (
          <Alert className="mt-4" severity="info" data-testid="razorpay-server-mode">
            {t(saved.provider === 'demo' ? 'payments.server.demo' : 'payments.server.none')}
          </Alert>
        )}
        {error && (
          <Alert className="mt-4" severity="error">
            {error}
          </Alert>
        )}
        <form className="mt-4 grid gap-4 grid-cols-[1fr] md:grid-cols-[1.2fr_1fr_1fr] items-start"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormField label={t('payments.keyId')} required>
            <TextInput
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              required
              error={!!show(['keyId'])}
              helperText={show(['keyId']) ?? t('payments.keyIdHelp', { live: 'rzp_live_', test: 'rzp_test_' })}
              slotProps={{ htmlInput: { spellCheck: false, 'data-testid': 'razorpay-key-id' } }}
            />
          </FormField>
          <FormField label={t('payments.keySecret')} required={!saved.configured}>
            <TextInput
              type="password"
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              required={!saved.configured}
              error={!!show(['secretsRequired', 'keySecretRequired', 'secretShort'])}
              helperText={show(['secretsRequired', 'keySecretRequired', 'secretShort']) ?? secretHelp}
              slotProps={{ htmlInput: { autoComplete: 'new-password', 'data-testid': 'razorpay-key-secret' } }}
            />
          </FormField>
          <FormField label={t('payments.webhookSecret')} required={!saved.configured}>
            <TextInput
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              required={!saved.configured}
              helperText={saved.configured ? t('payments.secretSavedNoHint') : t('payments.secretNew')}
              slotProps={{ htmlInput: { autoComplete: 'new-password', 'data-testid': 'razorpay-webhook-secret' } }}
            />
          </FormField>
          <div className="col-span-full">
          <FormField label={t('payments.webhookUrl')}>
            <TextInput
              value={webhookUrl}
              fullWidth
              slotProps={{
                htmlInput: { readOnly: true, 'data-testid': 'razorpay-webhook-url', onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select() },
                input: {
                  endAdornment: (
                    <Tooltip title={t('payments.copy')}>
                      <IconButton aria-label={t('payments.copy')} onClick={copy}>
                        <ContentCopyOutlined className="size-5" />
                      </IconButton>
                    </Tooltip>
                  ),
                },
              }}
            />
          </FormField>
          </div>
          {result && (
            <Alert className="col-span-full" severity={result.ok ? 'success' : 'error'} data-testid="razorpay-test-result">
              {result.text}
            </Alert>
          )}
          <div className="col-span-full flex gap-3 justify-end flex-wrap mt-2">
            <Button onClick={test} disabled={!saved.configured || testing || pending} data-testid="razorpay-test" startIcon={testing ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('payments.test')}
            </Button>
            <Button type="submit" variant="contained" disabled={pending || !changed} data-testid="razorpay-save" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('payments.save')}
            </Button>
          </div>
        </form>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
