'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { createGradeScale, saveScheme } from '@/app/(dashboard)/exams/actions';
import { useI18n } from '@/i18n/client';
import { schemeProblem, weightTotal, type GradeScale, type PassRules, type Scheme, type SchemeComponent, type SchemePresets } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

import { Alert, Button, Card, MenuItem } from '@/components/kx';
const KINDS = ['internal', 'external', 'practical', 'project', 'viva'] as const;
const pct = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function SchemeEditor({ structure, years, scales, presets, scheme, subjectId, yearId, canEdit }: { structure: Structure; years: { id: string; label: string }[]; scales: GradeScale[]; presets: SchemePresets; scheme: Scheme | null; subjectId: string; yearId: string; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [name, setName] = useState(scheme?.name ?? '');
  const [credits, setCredits] = useState(String(scheme?.credits ?? 4));
  const [gradeScaleId, setGradeScaleId] = useState(scheme?.gradeScaleId ?? scales.find((x) => x.isDefault)?.id ?? scales[0]?.id ?? '');
  const [comps, setComps] = useState<SchemeComponent[]>(scheme?.components ?? []);
  const [pass, setPass] = useState({ internal: String(scheme?.passRules.minInternalPercent ?? ''), external: String(scheme?.passRules.minExternalPercent ?? ''), total: String(scheme?.passRules.minTotalPercent ?? 40) });
  const [scaleName, setScaleName] = useState('');
  const [scalePreset, setScalePreset] = useState(Object.keys(presets.gradeScales)[0] ?? '');
  const total = weightTotal(comps);
  const problem = schemeProblem({ name, credits: Number(credits), components: comps });
  const go = (sid: string, y: string) => router.push(`/exams/schemes?subjectId=${sid}&academicYearId=${y}`);
  const rules: PassRules = { minInternalPercent: pct(pass.internal), minExternalPercent: pct(pass.external), minTotalPercent: Number(pass.total) };
  const upd = (i: number, patch: Partial<SchemeComponent>) => setComps(comps.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <>
      <div className="flex gap-4 flex-wrap mb-4">
        <FormField label={t('exm.f.subject')}>
          <TextInput className="min-w-[280px]" select value={subjectId} onChange={(e) => go(e.target.value, yearId)}>
            {structure.subjects.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} {s.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('exm.f.year')}>
          <TextInput className="min-w-[140px]" select value={yearId} onChange={(e) => go(subjectId, e.target.value)}>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      </div>
      <Card className="p-5 mb-6">
        <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-2">
          {scheme ? t('exm.scheme.edit') : t('exm.scheme.new')}
        </h2>
        {canEdit && (
          <div className="flex gap-2 flex-wrap mb-4 items-center">
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('exm.scheme.preset')}
            </p>
            {Object.entries(presets.schemes).map(([k, p]) => (
              <Button
                key={k}
                size="small"
                variant="outlined"
                onClick={() => {
                  setName(p.name);
                  setCredits(String(p.credits));
                  setComps(p.components.map((c) => ({ ...c })));
                  setPass({ internal: String(p.pass.minInternalPercent ?? ''), external: String(p.pass.minExternalPercent ?? ''), total: String(p.pass.minTotalPercent) });
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] mb-4">
          <FormField label={t('exm.f.name')}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.credits')}>
            <TextInput type="number" value={credits} onChange={(e) => setCredits(e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.scale')}>
            <TextInput select value={gradeScaleId} onChange={(e) => setGradeScaleId(e.target.value)} disabled={!canEdit}>
              {scales.map((x) => (
                <MenuItem key={x.id} value={x.id}>
                  {x.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
        </div>
        {comps.map((c, i) => (
          <div className="flex gap-2 mb-2 flex-wrap" key={i}>
            <FormField label={t('exm.f.code')}>
              <TextInput className="w-[100px]" value={c.code} onChange={(e) => upd(i, { code: e.target.value })} disabled={!canEdit} />
            </FormField>
            <FormField label={t('exm.f.name')}>
              <TextInput className="flex-1 min-w-[180px]" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} disabled={!canEdit} />
            </FormField>
            <FormField label={t('exm.f.kindOfComponent')}>
              <TextInput className="w-[140px]" select value={c.kind} onChange={(e) => upd(i, { kind: e.target.value as SchemeComponent['kind'] })} disabled={!canEdit}>
                {KINDS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {t(`exm.ck.${k}`)}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.weight')}>
              <TextInput className="w-[100px]" type="number" value={c.weight} onChange={(e) => upd(i, { weight: Number(e.target.value) })} disabled={!canEdit} />
            </FormField>
            {canEdit && (
              <Button size="small" color="error" onClick={() => setComps(comps.filter((_, j) => j !== i))}>
                {t('exm.remove')}
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button size="small" onClick={() => setComps([...comps, { code: '', name: '', kind: 'internal', weight: 0 }])}>
            {t('exm.scheme.addComponent')}
          </Button>
        )}
        <Alert className="my-3" severity={total === 100 ? 'success' : 'warning'}>
          {t('exm.scheme.total', { n: total })}
        </Alert>
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] mb-4">
          <FormField label={t('exm.f.minInternal')}>
            <TextInput type="number" value={pass.internal} onChange={(e) => setPass({ ...pass, internal: e.target.value })} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.minExternal')}>
            <TextInput type="number" value={pass.external} onChange={(e) => setPass({ ...pass, external: e.target.value })} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.minTotal')}>
            <TextInput type="number" value={pass.total} onChange={(e) => setPass({ ...pass, total: e.target.value })} disabled={!canEdit} />
          </FormField>
        </div>
        {canEdit ? (
          <Button
            variant="contained"
            disabled={pending || problem !== null || !gradeScaleId}
            onClick={() => run(() => saveScheme({ subjectId, academicYearId: yearId, name, credits: Number(credits), gradeScaleId, passRules: rules, components: comps }), t('exm.scheme.saved'))}
          >
            {t('exm.scheme.save')}
          </Button>
        ) : (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('exm.scheme.readOnly')}
          </p>
        )}
        {feedback}
      </Card>
      {canEdit && (
        <Card className="p-5">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-2">
            {t('exm.scale.title')}
          </h2>
          <FormRow className="gap-2">
            <FormField label={t('exm.f.name')}>
              <TextInput value={scaleName} onChange={(e) => setScaleName(e.target.value)} />
            </FormField>
            <FormField label={t('exm.scale.from')}>
              <TextInput className="min-w-[260px]" select value={scalePreset} onChange={(e) => setScalePreset(e.target.value)}>
                {Object.entries(presets.gradeScales).map(([k, g]) => (
                  <MenuItem key={k} value={k}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <Button variant="outlined" disabled={pending} onClick={() => run(() => createGradeScale({ name: scaleName, preset: scalePreset }), t('exm.scale.created'), () => setScaleName(''))}>
              {t('exm.scale.add')}
            </Button>
          </FormRow>
        </Card>
      )}
    </>
  );
}
