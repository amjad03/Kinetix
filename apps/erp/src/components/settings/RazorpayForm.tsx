'use client';

import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, useTransition, type FocusEvent } from 'react';
import { saveRazorpay, testRazorpay } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { razorpayProblem, type RazorpayAccount } from '@/lib/payments';

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
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <PaymentsOutlined fontSize="small" /> {t('payments.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="razorpay" data-configured={saved.configured ? 'true' : 'false'} aria-busy={pending || testing} sx={{ px: 2.5, py: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820 }}>
          {t('payments.help')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820, mt: 1 }}>
          {t('payments.steps')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }} data-testid="razorpay-status">
          {saved.configured ? (
            <>
              <Chip size="small" color="success" label={t('payments.status.configured')} />
              {saved.mode && <Chip size="small" variant="outlined" color={saved.mode === 'live' ? 'primary' : 'warning'} label={t(saved.mode === 'live' ? 'payments.mode.live' : 'payments.mode.test')} data-testid="razorpay-mode" />}
              {saved.updatedAt && (
                <Typography variant="caption" color="text.secondary">
                  {t('payments.updated', { when: fmt.dateTime(saved.updatedAt) })}
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" sx={{ color: 'error.main' }}>
              {t('payments.status.notConfigured')}
            </Typography>
          )}
        </Box>
        {saved.provider !== 'razorpay' && (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="razorpay-server-mode">
            {t(saved.provider === 'demo' ? 'payments.server.demo' : 'payments.server.none')}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          sx={{ mt: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 1fr' }, alignItems: 'start' }}
        >
          <TextField
            label={t('payments.keyId')}
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            required
            error={!!show(['keyId'])}
            helperText={show(['keyId']) ?? t('payments.keyIdHelp', { live: 'rzp_live_', test: 'rzp_test_' })}
            slotProps={{ htmlInput: { spellCheck: false, 'data-testid': 'razorpay-key-id' } }}
          />
          <TextField
            label={t('payments.keySecret')}
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            required={!saved.configured}
            error={!!show(['secretsRequired', 'keySecretRequired', 'secretShort'])}
            helperText={show(['secretsRequired', 'keySecretRequired', 'secretShort']) ?? secretHelp}
            slotProps={{ htmlInput: { autoComplete: 'new-password', 'data-testid': 'razorpay-key-secret' } }}
          />
          <TextField
            label={t('payments.webhookSecret')}
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            required={!saved.configured}
            helperText={saved.configured ? t('payments.secretSavedNoHint') : t('payments.secretNew')}
            slotProps={{ htmlInput: { autoComplete: 'new-password', 'data-testid': 'razorpay-webhook-secret' } }}
          />
          <TextField
            label={t('payments.webhookUrl')}
            value={webhookUrl}
            sx={{ gridColumn: '1 / -1' }}
            slotProps={{
              htmlInput: { readOnly: true, 'data-testid': 'razorpay-webhook-url', onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select() },
              input: {
                endAdornment: (
                  <Tooltip title={t('payments.copy')}>
                    <IconButton aria-label={t('payments.copy')} onClick={copy} edge="end">
                      <ContentCopyOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              },
            }}
          />
          {result && (
            <Alert severity={result.ok ? 'success' : 'error'} sx={{ gridColumn: '1 / -1' }} data-testid="razorpay-test-result">
              {result.text}
            </Alert>
          )}
          <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={test} disabled={!saved.configured || testing || pending} data-testid="razorpay-test" startIcon={testing ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('payments.test')}
            </Button>
            <Button type="submit" variant="contained" disabled={pending || !changed} data-testid="razorpay-save" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('payments.save')}
            </Button>
          </Box>
        </Box>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
