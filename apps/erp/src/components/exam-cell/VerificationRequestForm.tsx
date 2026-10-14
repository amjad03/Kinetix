'use client';

import { useState, useTransition } from 'react';
import { askVerification } from '@/app/verify/request/actions';
import { Alert, Button } from '@/components/kx';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** The employer's form: who is asking, and the document's serial number and the candidate's name as printed. */
export function VerificationRequestForm({ slug }: { slug: string }) {
  const { t, fmt } = useI18n();
  const [v, setV] = useState({ requesterName: '', organisation: '', email: '', serialNo: '', candidateName: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; feePaise: number } | null>(null);
  const [busy, start] = useTransition();
  const field = (key: keyof typeof v, label: string, type = 'text') => (
    <FormField label={label} required>
      <TextInput type={type} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} fullWidth required slotProps={{ htmlInput: { 'data-testid': `vr-${key}` } }} />
    </FormField>
  );
  if (done)
    return (
      <Alert severity="success" className="mt-6" data-testid="vr-done">
        {t('xc.vr.done', { ref: done.id.slice(0, 8).toUpperCase(), fee: fmt.rupees(done.feePaise) })}
      </Alert>
    );
  return (
    <form
      className="mt-6 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await askVerification(slug, v);
          if (res.ok) setDone(res.data);
          else setError(res.error);
        });
      }}
    >
      {field('requesterName', t('xc.vr.name'))}
      {field('organisation', t('xc.vr.organisation'))}
      {field('email', t('xc.vr.email'), 'email')}
      {field('serialNo', t('xc.vr.serial'))}
      {field('candidateName', t('xc.vr.candidate'))}
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" disabled={busy || !slug} data-testid="vr-submit">
        {t('xc.vr.submit')}
      </Button>
    </form>
  );
}
