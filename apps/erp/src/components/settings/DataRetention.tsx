'use client';

import Add from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState, useTransition } from 'react';
import { removeRetentionRule, runRetention, saveRetentionRule } from '@/app/(dashboard)/settings/privacy-actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { KEEP_DAYS_MAX, KEEP_DAYS_MIN, type RetentionOutcome, type RetentionRule, type RetentionRules } from '@/lib/pathways-b';

type Dlg = RetentionRule | 'new' | 'run' | { result: RetentionOutcome[]; dryRun: boolean } | null;

/** Settings: how long vault documents, read notifications and career assistant chats are kept, with a preview before running. */
export function DataRetention({ data }: { data: RetentionRules }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [pending, start] = useTransition();
  const ran = useRef<RetentionOutcome[] | null>(null);
  // Kinds the ERP words itself; a kind added to the API later shows the API's own label.
  const name = (key: string) => (['vault_documents', 'notifications', 'career_assistant'].includes(key) ? t(`pwb.ret.target.${key}` as MessageKey) : (data.targets.find((x) => x.key === key)?.label ?? key));
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const run = (dryRun: boolean) =>
    start(async () => {
      const res = await runRetention(dryRun);
      if (res.ok) setDlg({ result: res.data, dryRun });
      else {
        setDlg(null);
        toast(res.error);
      }
    });
  const rule = dlg && typeof dlg === 'object' && 'keepDays' in dlg ? dlg : null;

  return (
    <>
      <SectionTitle>{t('pwb.ret.title')}</SectionTitle>
      <Card data-testid="pwb-retention">
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pwb.ret.help', { min: KEEP_DAYS_MIN, max: KEEP_DAYS_MAX })}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('new')} data-testid="pwb-new-rule">{t('pwb.ret.add')}</Button>
            <Button variant="outlined" disabled={pending || data.rules.length === 0} onClick={() => run(true)} data-testid="pwb-preview">{t('pwb.ret.preview')}</Button>
            <Button variant="outlined" color="error" disabled={pending || data.rules.length === 0} onClick={() => setDlg('run')} data-testid="pwb-run-now">{t('pwb.ret.runNow')}</Button>
          </Stack>
          <Grid
            testId="pwb-rules"
            empty={t('pwb.ret.empty')}
            rows={data.rules}
            cols={[
              { label: t('pwb.ret.kind'), cell: (r) => name(r.target), sort: (r) => r.target },
              { label: t('pwb.ret.category'), cell: (r) => r.category || t('pwb.ret.anyCategory'), sort: (r) => r.category },
              { label: t('pwb.ret.keep'), cell: (r) => t('pwb.ret.days', { n: fmt.number(r.keepDays) }), num: true, sort: (r) => r.keepDays },
              { label: t('pwb.ret.action'), cell: (r) => t(`pwb.ret.action.${r.action}` as MessageKey), sort: (r) => r.action },
              { label: t('ops.f.status'), cell: (r) => <Pill label={r.active ? t('pwb.ret.on') : t('pwb.ret.off')} warn={!r.active} /> },
              { label: t('pwb.ret.last'), cell: (r) => (r.lastRunAt ? t('pwb.ret.lastRun', { date: fmt.dateTime(r.lastRunAt), n: fmt.number(r.lastAffected ?? 0) }) : '-'), sort: (r) => r.lastRunAt },
              {
                label: '',
                cell: (r) => (
                  <>
                    <Button size="small" onClick={() => setDlg(r)}>{t('ops.edit')}</Button>
                    <ActionButton tone="error" label={t('pwb.delete')} run={() => removeRetentionRule(r.id)} onDone={toast} />
                  </>
                ),
              },
            ]}
          />
        </Box>
      </Card>

      {(dlg === 'new' || rule) && (
        <FormDialog
          title={rule ? t('pwb.ret.edit') : t('pwb.ret.add')}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.ret.ruleHelp')}</Typography>}
          onSubmit={(v) => {
            const allowed = data.targets.find((x) => x.key === v.target)?.actions ?? [];
            if (!allowed.includes(v.action)) return Promise.resolve({ ok: false as const, error: t('pwb.ret.err.action', { kind: name(v.target) }) });
            return saveRetentionRule(v);
          }}
          onClose={done}
          fields={[
            { name: 'target', label: t('pwb.ret.kind'), kind: 'select', required: true, init: rule?.target ?? data.targets[0]?.key, options: data.targets.map((x) => ({ value: x.key, label: name(x.key) })) },
            { name: 'category', label: t('pwb.ret.category'), init: rule?.category ?? '' },
            { name: 'keepDays', label: t('pwb.ret.keep'), kind: 'number', required: true, init: rule ? String(rule.keepDays) : '365' },
            { name: 'action', label: t('pwb.ret.action'), kind: 'select', required: true, init: rule?.action ?? 'archive', options: [{ value: 'archive', label: t('pwb.ret.action.archive') }, { value: 'delete', label: t('pwb.ret.action.delete') }] },
            { name: 'active', label: t('pwb.ret.on'), kind: 'select', init: rule && !rule.active ? 'no' : 'yes', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
          ]}
        />
      )}
      {dlg === 'run' && (
        <FormDialog
          title={t('pwb.ret.runNow')}
          submitLabel={t('pwb.ret.runNow')}
          intro={<Typography variant="body2">{t('pwb.ret.runWarn')}</Typography>}
          fields={[]}
          onSubmit={async () => {
            const res = await runRetention(false);
            if (res.ok) ran.current = res.data;
            return res;
          }}
          // On success the result dialog opens in its place.
          onClose={(m) => setDlg(m && ran.current ? { result: ran.current, dryRun: false } : null)}
        />
      )}
      {dlg && typeof dlg === 'object' && 'result' in dlg && (
        <InfoDialog title={dlg.dryRun ? t('pwb.ret.previewTitle') : t('pwb.ret.ranTitle')} onClose={() => setDlg(null)}>
          <Typography variant="body2" sx={{ mb: 2 }}>{dlg.dryRun ? t('pwb.ret.previewHelp') : t('pwb.ret.ranHelp')}</Typography>
          <Grid
            testId="pwb-run-result"
            empty={t('pwb.ret.noRules')}
            rows={dlg.result}
            cols={[
              { label: t('pwb.ret.kind'), cell: (o) => name(o.target) },
              { label: t('pwb.ret.category'), cell: (o) => o.category || t('pwb.ret.anyCategory') },
              { label: t('pwb.ret.action'), cell: (o) => t(`pwb.ret.action.${o.action}` as MessageKey) },
              { label: t('pwb.ret.affected'), cell: (o) => fmt.number(o.affected), num: true, sort: (o) => o.affected },
            ]}
          />
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
