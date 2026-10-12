'use client';
import { setParentVisibility } from '@/app/(dashboard)/settings/privacy-actions';
import { ActionButton, Grid, Pill, useToast } from '@/components/ops/kit';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ParentVisibilityRow } from '@/lib/pathways-b';

import { Card } from '@/components/kx';
const KNOWN = ['attendance', 'diary', 'report_card', 'behaviour', 'activities', 'health'];

/** Settings: which sections of a child's record parents can see in the Parent App. */
export function ParentVisibility({ rows }: { rows: ParentVisibilityRow[] }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const name = (r: ParentVisibilityRow) => (KNOWN.includes(r.section) ? t(`pwb.pv.${r.section}` as MessageKey) : r.label);
  return (
    <>
      <SectionTitle>{t('pwb.pv.title')}</SectionTitle>
      <Card data-testid="pwb-parent-visibility">
        <div className="px-5 py-4">
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-4">{t('pwb.pv.help')}</p>
          <Grid
            testId="pwb-pv-rows"
            empty={t('pwb.pv.empty')}
            rows={rows}
            cols={[
              { label: t('pwb.pv.section'), cell: (r) => name(r), sort: (r) => r.section },
              { label: t('pwb.pv.parents'), cell: (r) => <Pill label={r.visible ? t('pwb.pv.shown') : t('pwb.pv.hidden')} warn={!r.visible} />, sort: (r) => (r.visible ? 1 : 0) },
              { label: '', cell: (r) => <ActionButton label={r.visible ? t('pwb.pv.hide') : t('pwb.pv.show')} run={() => setParentVisibility(r.section, !r.visible)} onDone={toast} /> },
            ]}
          />
        </div>
      </Card>
      {toastNode}
    </>
  );
}
