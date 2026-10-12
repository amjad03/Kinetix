'use client';
import NextLink from 'next/link';
import { useState, useTransition } from 'react';
import { DataTable, FieldRow, FormField, TextInput } from '@/components/ui';
import { saveRetentionGraceDays } from '@/app/(dashboard)/settings/retention-actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { expiringFirst, parseGraceDays, totalExpiring, type RetentionOverview } from '@/lib/retention';

import { Alert, Button, Card, CircularProgress, Divider, InputAdornment, Link, Snackbar } from '@/components/kx';
import { Video as VideocamOutlined } from 'lucide-react';
/** "Keep class recordings until N days after the semester ends", and per class what goes in the next 30 days. */
export function RecordingRetention({ overview }: { overview: RetentionOverview }) {
  const { t, fmt } = useI18n();
  const [saved, setSaved] = useState(overview.graceDays);
  const [value, setValue] = useState(String(overview.graceDays));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const days = parseGraceDays(value);
  const soon = expiringFirst(overview.classes).filter((c) => c.expiringSoon > 0);

  const save = () => {
    if (days === null) return;
    setError(null);
    start(async () => {
      const res = await saveRetentionGraceDays(days);
      if (!res.ok) return setError(res.error);
      setSaved(res.data.recordingRetentionGraceDays);
      setValue(String(res.data.recordingRetentionGraceDays));
      setToast(t('retention.saved', { n: res.data.recordingRetentionGraceDays }));
    });
  };

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <VideocamOutlined className="size-5" /> {t('retention.title')}
        </span>
      </SectionTitle>
      <Card data-testid="retention" data-grace={saved} aria-busy={pending}>
        <div className="px-5 py-4">
          {error && (
            <Alert className="mb-4" severity="error" role="alert">
              {error}
            </Alert>
          )}
          <p className="text-base font-medium tracking-[0.1px] leading-[24px]" data-testid="retention-summary">
            {t('retention.grace', { n: saved })}
          </p>
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-1 max-w-[760px]">
            {t('retention.graceHelp')}
          </p>
          <div className="mt-4">
          <FieldRow>
            <FormField label={t('retention.graceLabel')}>
              <TextInput className="w-[260px]"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                error={days === null}
                helperText={days === null ? t('retention.graceProblem') : ' '}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'retention-days' }, input: { endAdornment: <InputAdornment position="end">0–90</InputAdornment> } }}
              />
            </FormField>
            <Button variant="contained" onClick={save} disabled={pending || days === null || days === saved} data-testid="retention-save">
              {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : t('retention.save')}
            </Button>
          </FieldRow>
          </div>
        </div>
        <Divider />
        <div className="px-5 py-4" data-testid="retention-overview" data-expiring={totalExpiring(overview.classes)}>
          <h3 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
            {t('retention.overview')}
          </h3>
          {soon.length === 0 ? (
            <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid="retention-nothing">
              {t('retention.nothingSoon')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                label={t('retention.overview')}
                rows={soon}
                rowId={(c) => String(c.sectionId)}
                columns={[
                  { id: 'c0', header: t('retention.class'), rowHeader: true, sort: (c) => c.sectionName, cell: (c) => c.sectionName },
                  { id: 'c1', header: t('retention.expiring'), align: 'right', sort: (c) => c.expiringSoon, cell: (c) => fmt.number(c.expiringSoon) },
                  { id: 'c2', header: t('retention.next'), sort: (c) => c.nextExpiresOn ?? '', cell: (c) => c.nextExpiresOn ? fmt.date(c.nextExpiresOn, 'short') : t('retention.none') },
                  { id: 'c3', header: t('retention.kept'), align: 'right', sort: (c) => c.kept, cell: (c) => fmt.number(c.kept) },
                  { id: 'c4', header: t('retention.total'), align: 'right', sort: (c) => c.total, cell: (c) => fmt.number(c.total) },
                ]}
              />
            </div>
          )}
          {overview.noTerm.count > 0 && (
            <Alert className="mt-4" severity="info" data-testid="retention-no-term">
              {t.plural('retention.noTerm', overview.noTerm.count)}{' '}
              <Link component={NextLink} href="/calendar">
                {t('retention.noTermHint')}
              </Link>
              <ul className="m-0 mt-2 pl-5">
                {overview.noTerm.recordings.slice(0, 10).map((r) => (
                  <li key={r.id} data-testid="retention-no-term-item">
                    {r.title} · {r.sectionName ?? t('retention.noClass')} · {r.teacherName} · {fmt.date(r.startedAt.slice(0, 10), 'short')}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
