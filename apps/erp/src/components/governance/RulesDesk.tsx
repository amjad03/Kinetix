'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { approveRule, createRule, moveRule } from '@/app/(dashboard)/governance/actions';
import { ActionButton, Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { RULE_DOMAINS, type BusinessRule } from '@/lib/governance';

const TONE = { draft: 'neutral', in_review: 'warning', approved: 'success', retired: 'neutral' } as const;

/** Business rules by domain: every version, who wrote and approved it, and when it is in force. */
export function RulesDesk({ rules, today, me }: { rules: BusinessRule[]; today: string; me: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const inForce = (r: BusinessRule) => r.status === 'approved' && r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('gr.hint')}
      </Typography>
      <Bar>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="gr-new">
          {t('gr.new')}
        </Button>
      </Bar>
      <Grid
        testId="gr-table"
        empty={t('gr.empty')}
        rows={rules}
        exportName="business-rules"
        cols={[
          { label: t('gr.col.domain'), cell: (r) => t(`gr.dom.${r.domain}` as MessageKey), sort: (r) => r.domain },
          { label: t('gr.col.key'), cell: (r) => `${r.key} v${r.version}`, sort: (r) => `${r.key}-${String(r.version).padStart(3, '0')}` },
          { label: t('gr.col.title'), cell: (r) => r.title },
          { label: t('gr.col.params'), cell: (r) => <code>{JSON.stringify(r.params)}</code> },
          { label: t('gr.col.effective'), cell: (r) => `${r.effectiveFrom}${r.effectiveTo ? ` – ${r.effectiveTo}` : ' →'}`, sort: (r) => r.effectiveFrom },
          {
            label: t('gr.col.status'),
            cell: (r) => (
              <>
                <StatusPill tone={TONE[r.status]}>{t(`gr.st.${r.status}` as MessageKey)}</StatusPill> {inForce(r) && <StatusPill tone="success">{t('gr.inForce')}</StatusPill>}
              </>
            ),
            sort: (r) => r.status,
          },
          {
            label: '',
            cell: (r) => (
              <>
                {r.status === 'draft' && <ActionButton label={t('gr.act.review')} run={() => moveRule(r.id, 'in_review')} onDone={toast} />}
                {r.status === 'in_review' && r.authorId !== me && <ActionButton label={t('gr.act.approve')} run={() => approveRule(r.id)} onDone={toast} />}
                {r.status === 'in_review' && <ActionButton label={t('gr.act.back')} run={() => moveRule(r.id, 'draft')} onDone={toast} />}
                {r.status === 'approved' && <ActionButton label={t('gr.act.retire')} tone="error" run={() => moveRule(r.id, 'retired')} onDone={toast} />}
              </>
            ),
          },
        ]}
      />
      {open && (
        <FormDialog
          title={t('gr.new')}
          intro={t('gr.newHint')}
          onSubmit={createRule}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(t('gr.created'));
          }}
          fields={[
            { name: 'domain', label: t('gr.f.domain'), kind: 'select', init: 'grading', options: RULE_DOMAINS.map((d) => ({ value: d, label: t(`gr.dom.${d}` as MessageKey) })) },
            { name: 'key', label: t('gr.f.key'), required: true },
            { name: 'title', label: t('gr.f.title'), required: true },
            { name: 'description', label: t('gr.f.description'), kind: 'multiline' },
            { name: 'params', label: t('gr.f.params'), kind: 'multiline', init: '{}' },
            { name: 'effectiveFrom', label: t('gr.f.from'), kind: 'date', required: true, init: today },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
