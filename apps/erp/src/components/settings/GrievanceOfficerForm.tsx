'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { saveGrievanceOfficer } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { grievanceProblem, type GrievanceOfficer } from '@/lib/settings';

import { Alert, Button, Card, CircularProgress, Snackbar } from '@/components/kx';
import { Headset as SupportAgentOutlined } from 'lucide-react';
/** The DPDP grievance officer: name (required), email and phone; families see it in the apps. */
export function GrievanceOfficerForm({ initial }: { initial: GrievanceOfficer | null }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const problem = grievanceProblem({ name, email, phone });
  const show = (k: NonNullable<typeof problem>[]) => (touched && problem && k.includes(problem) ? t(`grievance.problem.${problem}`) : undefined);
  const changed = name !== (saved?.name ?? '') || email !== (saved?.email ?? '') || phone !== (saved?.phone ?? '');

  const run = (input: { name: string; email: string; phone: string } | null) => {
    setError(null);
    start(async () => {
      const res = await saveGrievanceOfficer(input);
      if (!res.ok) return setError(res.error);
      const g = res.data.grievanceOfficer ?? null;
      setSaved(g);
      setName(g?.name ?? '');
      setEmail(g?.email ?? '');
      setPhone(g?.phone ?? '');
      setTouched(false);
      setToast(input ? t('grievance.saved') : t('grievance.removed'));
    });
  };

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <SupportAgentOutlined className="size-5" /> {t('grievance.title')}
        </span>
      </SectionTitle>
      <Card className="px-5 py-4" data-testid="grievance-officer" data-saved={saved ? 'true' : 'false'} aria-busy={pending}>
        <p className="text-[13px] leading-[19px] text-muted-foreground max-w-[760px]">
          {t('grievance.help')}
        </p>
        {!saved && (
          <p className="text-[13px] leading-[19px] mt-2 text-red-ink" data-testid="grievance-not-set">
            {t('grievance.notSet')}
          </p>
        )}
        {error && (
          <Alert className="mt-4" severity="error">
            {error}
          </Alert>
        )}
        <form className="mt-4 grid gap-4 grid-cols-[1fr] md:grid-cols-[2fr_2fr_1.5fr] items-start"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!problem) run({ name, email, phone });
          }}
        >
          <FormField label={t('grievance.name')} required>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              error={!!show(['name', 'nameLong'])}
              helperText={show(['name', 'nameLong']) ?? ' '}
              slotProps={{ htmlInput: { maxLength: 130, 'data-testid': 'grievance-name' } }}
            />
          </FormField>
          <FormField label={t('grievance.email')}>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!show(['email'])}
              helperText={show(['email']) ?? t('grievance.optional')}
              slotProps={{ htmlInput: { 'data-testid': 'grievance-email' } }}
            />
          </FormField>
          <FormField label={t('grievance.phone')}>
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={!!show(['phone'])}
              helperText={show(['phone']) ?? t('grievance.optional')}
              slotProps={{ htmlInput: { inputMode: 'tel', 'data-testid': 'grievance-phone' } }}
            />
          </FormField>
          <div className="col-span-full flex gap-2 justify-end">
            {saved && (
              <Button color="error" onClick={() => run(null)} disabled={pending} data-testid="grievance-remove">
                {t('grievance.remove')}
              </Button>
            )}
            <Button type="submit" variant="contained" disabled={pending || !changed} data-testid="grievance-save" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('grievance.save')}
            </Button>
          </div>
        </form>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
