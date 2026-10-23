'use client';
import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { removeAiConnection, saveAiConnection, testAiConnection } from '@/app/(dashboard)/zynetix/actions';
import { Alert, Button, Card, Chip, Snackbar } from '@/components/kx';
import { FormField, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { aiKeyProblem, aiSourceKey, CLAUDE_MODELS, type AiConnection, type ClaudeModel } from '@/lib/zynetix';

const asModel = (m: string | null, fallback: ClaudeModel): ClaudeModel => (CLAUDE_MODELS as readonly string[]).includes(m ?? '') ? (m as ClaudeModel) : fallback;

/**
 * Zynetix → AI settings: the institution's own Claude (Anthropic) key, used for every AI answer
 * on its boards and apps instead of the server's configuration. The key is write-only.
 */
export function AiSettingsCard({ initial }: { initial: AiConnection }) {
  const { t, fmt } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<ClaudeModel>(asModel(initial.model, 'claude-sonnet-5-5'));
  const [fallbackModel, setFallbackModel] = useState<ClaudeModel | ''>(initial.fallbackModel === null ? '' : asModel(initial.fallbackModel, 'claude-haiku-5-5'));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const problem = aiKeyProblem(apiKey, saved.keySet);
  const options = CLAUDE_MODELS.map((m) => ({ value: m, label: t(`zx.aic.model.${m}`) }));

  const done = (c: AiConnection, message: string) => {
    setSaved(c);
    setApiKey('');
    setTouched(false);
    setToast(message);
  };

  const save = () => {
    setTouched(true);
    if (problem) return;
    setError(null);
    setResult(null);
    start(async () => {
      const res = await saveAiConnection({ apiKey: apiKey.trim() || undefined, model, fallbackModel: fallbackModel || null });
      if (!res.ok) return setError(res.error);
      done(res.data, t('zx.aic.saved'));
    });
  };

  const remove = () => {
    setError(null);
    setResult(null);
    start(async () => {
      const res = await removeAiConnection();
      if (!res.ok) return setError(res.error);
      done(res.data, t('zx.aic.removed'));
    });
  };

  const test = () => {
    setResult(null);
    startTest(async () => {
      const res = await testAiConnection();
      if (!res.ok) return setResult({ ok: false, text: res.error });
      const r = res.data;
      setResult(r.ok ? { ok: true, text: t('zx.aic.testOk', { model: r.model, ms: fmt.number(r.latencyMs) }) } : { ok: false, text: r.error });
    });
  };

  return (
    <Card className="px-5 py-4 max-w-[860px]" data-testid="zx-ai-settings" data-source={saved.source} aria-busy={pending || testing}>
      <h2 className="m-0 inline-flex items-center gap-2 text-base font-semibold">
        <Sparkles className="size-5" /> {t('zx.aic.title')}
      </h2>
      <p className="mt-2 text-[13px] leading-[19px] text-muted-foreground">{t('zx.aic.help')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="zx-ai-status">
        <Chip size="small" color={saved.source === 'none' ? 'warning' : 'success'} label={t(aiSourceKey(saved))} />
        {saved.keySet && saved.keyHint && <span className="text-xs text-muted-foreground">{t('zx.aic.keyHint', { last4: saved.keyHint })}</span>}
        {saved.keySet && saved.updatedAt && <span className="text-xs text-muted-foreground">{t('zx.aic.updated', { when: fmt.dateTime(saved.updatedAt) })}</span>}
      </div>
      {saved.canStoreKeys === false && (
        <Alert className="mt-4" severity="warning" data-testid="zx-ai-no-secrets-key">
          {t('zx.aic.noSecretsKey')}
        </Alert>
      )}
      {error && (
        <Alert className="mt-4" severity="error">
          {error}
        </Alert>
      )}
      <form
        className="mt-4 grid grid-cols-[1fr] items-start gap-4 md:grid-cols-[1.4fr_1fr_1fr]"
        noValidate
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FormField label={t('zx.aic.key')} required={!saved.keySet}>
          <TextInput
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            error={touched && !!problem}
            helperText={touched && problem ? t(problem) : saved.keySet ? t('zx.aic.keySaved') : t('zx.aic.keyNew')}
            slotProps={{ htmlInput: { autoComplete: 'new-password', spellCheck: false, 'data-testid': 'zx-ai-key' } }}
          />
        </FormField>
        <SelectInput label={t('zx.aic.modelLabel')} value={model} onChange={(e) => setModel(e.target.value as ClaudeModel)} options={options} />
        <SelectInput label={t('zx.aic.fallbackLabel')} value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value as ClaudeModel | '')} options={options} empty={t('zx.aic.noFallback')} />
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button type="submit" variant="contained" disabled={pending} data-testid="zx-ai-save">
            {t('zx.aic.save')}
          </Button>
          <Button variant="outlined" onClick={test} disabled={testing || pending || saved.source === 'none'} data-testid="zx-ai-test">
            {testing ? t('zx.aic.testing') : t('zx.aic.test')}
          </Button>
          {saved.keySet && (
            <Button variant="text" color="error" onClick={remove} disabled={pending} data-testid="zx-ai-remove">
              {t('zx.aic.remove')}
            </Button>
          )}
        </div>
      </form>
      {result && (
        <Alert className="mt-4" severity={result.ok ? 'success' : 'error'} data-testid="zx-ai-test-result">
          {result.text}
        </Alert>
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ''} />
    </Card>
  );
}
