'use client';

import { useState, useTransition } from 'react';
import { saveOfficeSettings } from '@/app/(dashboard)/exams/office/actions';
import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates';
import { CheckboxField, FormRow, SelectInput, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { OfficeSettings as Settings } from '@/lib/exam-office';

const rupees = (paise: number) => String(Math.round(paise) / 100);
const paise = (v: string) => Math.max(0, Math.round(Number(v || 0) * 100));

/** Exam office settings: numbering series, default grade scale, grace and moderation limits, revaluation and exam fees. */
export function OfficeSettings({ initial, scales, canEdit }: { initial: Settings; scales: { id: string; name: string }[]; canEdit: boolean }) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const num = (key: MessageKey, value: number, on: (n: number) => void, w = 'w-[180px]') => <TextInput className={w} type="number" label={t(key)} value={String(value)} disabled={!canEdit} onChange={(e) => on(Number(e.target.value) || 0)} />;
  const money = (key: MessageKey, value: number, on: (n: number) => void) => <TextInput className="w-[180px]" type="number" label={t(key)} value={rupees(value)} disabled={!canEdit} onChange={(e) => on(paise(e.target.value))} />;

  const save = () =>
    start(async () => {
      const res = await saveOfficeSettings(s);
      if (!res.ok) return toast?.error(res.error);
      setDirty(false);
      toast?.success(t('xo.set.saved'));
    });

  return (
    <ModuleSettingsPage
      title={t('xo.set.title')}
      subtitle={t('xo.set.subtitle')}
      onSave={canEdit ? save : undefined}
      saving={saving}
      dirty={dirty}
      sections={[
        {
          id: 'numbering',
          kind: 'numbering',
          title: t('xo.set.numbering'),
          description: t('xo.set.numberingDesc'),
          content: (
            <div className="grid gap-8">
              <NumberingSeriesField label={t('xo.set.hallTicket')} value={s.hallTicketSeries} onChange={(v) => set('hallTicketSeries', { ...v, suffix: v.suffix ?? '' })} />
              <NumberingSeriesField label={t('xo.set.certificate')} value={s.certificateSeries} onChange={(v) => set('certificateSeries', { ...v, suffix: v.suffix ?? '' })} />
              <NumberingSeriesField label={t('xo.set.qp')} value={s.qpSeries} onChange={(v) => set('qpSeries', { ...v, suffix: v.suffix ?? '' })} />
            </div>
          ),
        },
        {
          id: 'grading',
          kind: 'defaults',
          title: t('xo.set.grading'),
          description: t('xo.set.gradingDesc'),
          content: scales.length ? (
            <FormRow>
              <SelectInput className="min-w-[280px]" label={t('xo.set.defaultScale')} value={s.defaultGradeScaleId ?? ''} disabled={!canEdit} onChange={(e) => set('defaultGradeScaleId', e.target.value || null)} options={scales.map((x) => ({ value: x.id, label: x.name }))} />
            </FormRow>
          ) : (
            <p className="text-sm text-muted-foreground">{t('xo.set.noScales')}</p>
          ),
        },
        {
          id: 'grace',
          kind: 'rules',
          title: t('xo.set.grace'),
          description: t('xo.set.graceDesc'),
          content: (
            <FormRow>
              {num('xo.set.maxPerSubject', s.grace.maxPerSubject, (n) => set('grace', { ...s.grace, maxPerSubject: n }))}
              {num('xo.set.maxTotal', s.grace.maxTotal, (n) => set('grace', { ...s.grace, maxTotal: n }))}
              <CheckboxField label={t('xo.set.onlyToPass')} checked={s.grace.onlyToPass} disabled={!canEdit} onChange={(v) => set('grace', { ...s.grace, onlyToPass: v })} />
            </FormRow>
          ),
        },
        {
          id: 'moderation',
          kind: 'rules',
          title: t('xo.set.moderation'),
          content: (
            <FormRow>
              {num('xo.set.maxAdd', s.moderation.maxAddMarks, (n) => set('moderation', { ...s.moderation, maxAddMarks: n }))}
              {num('xo.set.maxScale', s.moderation.maxScalePercent, (n) => set('moderation', { ...s.moderation, maxScalePercent: n }))}
              {num('xo.set.dvGap', s.moderation.doubleValuationGapPercent, (n) => set('moderation', { ...s.moderation, doubleValuationGapPercent: n }), 'w-[300px]')}
              {num('xo.set.qpRelease', s.qpReleaseMinutes, (n) => set('qpReleaseMinutes', n), 'w-[340px]')}
            </FormRow>
          ),
        },
        {
          id: 'revaluation',
          kind: 'rules',
          title: t('xo.set.revaluation'),
          description: t('xo.set.revaluationDesc'),
          content: (
            <FormRow>
              {num('xo.set.windowDays', s.revaluation.windowDays, (n) => set('revaluation', { ...s.revaluation, windowDays: n }))}
              {money('xo.set.revalFee', s.revaluation.revaluationFeePaise, (n) => set('revaluation', { ...s.revaluation, revaluationFeePaise: n }))}
              {money('xo.set.retotalFee', s.revaluation.retotallingFeePaise, (n) => set('revaluation', { ...s.revaluation, retotallingFeePaise: n }))}
              {money('xo.set.photocopyFee', s.revaluation.photocopyFeePaise, (n) => set('revaluation', { ...s.revaluation, photocopyFeePaise: n }))}
            </FormRow>
          ),
        },
        {
          id: 'fees',
          kind: 'defaults',
          title: t('xo.set.fees'),
          description: t('xo.set.feesDesc'),
          content: (
            <FormRow>
              {money('xo.set.perPaper', s.examFees.perPaperPaise, (n) => set('examFees', { ...s.examFees, perPaperPaise: n }))}
              {money('xo.set.suppPerPaper', s.examFees.supplementaryPerPaperPaise, (n) => set('examFees', { ...s.examFees, supplementaryPerPaperPaise: n }))}
              {money('xo.set.minimum', s.examFees.minimumPaise, (n) => set('examFees', { ...s.examFees, minimumPaise: n }))}
              {money('xo.set.late', s.examFees.lateFeePaise, (n) => set('examFees', { ...s.examFees, lateFeePaise: n }))}
            </FormRow>
          ),
        },
      ]}
    />
  );
}
