'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { issueOffer, loadOffers, setOfferStatus } from '@/app/(dashboard)/hr/talent-actions';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { JobApplicant } from '@/lib/hr-types';

type OfferRow = { id: string; offerNo: string; status: string; joiningOn: string; annualCtcPaise: number };

/** Issue an offer letter to a recruitment applicant, download it, and record the candidate's answer. */
export function OfferDialog({ applicant, onClose }: { applicant: JobApplicant; onClose: () => void }) {
  const { t } = useI18n();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [f, setF] = useState({ ctc: '', joiningOn: '', validUntil: '', terms: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reload = useCallback(async () => {
    const res = await loadOffers(applicant.id);
    if (res.ok) setOffers(res.data);
  }, [applicant.id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const live = offers.find((o) => o.status === 'issued');
  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t('hl.offer.issue')}: {applicant.fullName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Typography color="error">{error}</Typography>}
          {offers.map((o) => (
            <Stack key={o.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 600 }}>{o.offerNo}</Typography>
              <StatusPill>{t(`hl.offer.status.${o.status}` as MessageKey)}</StatusPill>
              <Link href={`/api/download?kind=offer-letter&id=${o.id}`} underline="hover">
                {t('hl.offer.pdf')}
              </Link>
              {o.status === 'issued' &&
                (['accepted', 'declined', 'withdrawn'] as const).map((st) => (
                  <Button
                    key={st}
                    size="small"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await setOfferStatus(o.id, st);
                        if (res.ok) await reload();
                        else setError(res.error);
                      })
                    }
                  >
                    {t(st === 'accepted' ? 'hl.offer.accept' : st === 'declined' ? 'hl.offer.decline' : 'hl.offer.withdraw')}
                  </Button>
                ))}
            </Stack>
          ))}
          {!live && (
            <>
              <FormField label={t('hl.offer.ctc')}>
                <TextInput type="number" value={f.ctc} onChange={(e) => setF({ ...f, ctc: e.target.value })} />
              </FormField>
              <FormField label={t('hl.offer.joining')}>
                <TextInput type="date" value={f.joiningOn} onChange={(e) => setF({ ...f, joiningOn: e.target.value })} />
              </FormField>
              <FormField label={t('hl.offer.validUntil')}>
                <TextInput type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
              </FormField>
              <FormField label={t('hl.offer.terms')}>
                <TextInput multiline minRows={3} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
              </FormField>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.close')}</Button>
        {!live && (
          <Button
            variant="contained"
            disabled={pending || !(Number(f.ctc) > 0) || !f.joiningOn || !f.validUntil}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await issueOffer(applicant.id, { ctcRupees: Number(f.ctc), joiningOn: f.joiningOn, validUntil: f.validUntil, terms: f.terms });
                if (res.ok) await reload();
                else setError(res.error);
              })
            }
          >
            {t('hl.offer.send')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
