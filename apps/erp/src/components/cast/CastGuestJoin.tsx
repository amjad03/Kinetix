'use client';
import { useActionState } from 'react';
import { castJoin, type CastJoinState } from '@/app/cast/actions';
import { useI18n } from '@/i18n/client';

import { Alert, Button, CircularProgress, TextField } from '@/components/kx';

/** Any laptop or phone joins with the code on the board (or its QR, which fills the code in). */
export function CastGuestJoin({ code }: { code: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<CastJoinState, FormData>(castJoin, {});
  return (
    <form className="flex flex-col gap-4 max-w-[420px]" action={action} data-testid="cast-guest-join">
      <h2 className="text-base leading-6 font-medium">{t('cast.guest.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('cast.guest.lead')}</p>
      {state.error && <Alert severity="error">{state.error}</Alert>}
      <TextField
        name="code"
        label={t('cast.guest.code')}
        defaultValue={state.fields?.code ?? code}
        autoComplete="off"
        required
        slotProps={{ htmlInput: { autoCapitalize: 'characters', spellCheck: false, maxLength: 12, style: { letterSpacing: '0.2em', textTransform: 'uppercase' } } }}
      />
      <TextField name="name" label={t('cast.guest.name')} defaultValue={state.fields?.name} autoComplete="name" required autoFocus={!!code} />
      <Button type="submit" variant="contained" disabled={pending} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
        {t('cast.guest.join')}
      </Button>
    </form>
  );
}
