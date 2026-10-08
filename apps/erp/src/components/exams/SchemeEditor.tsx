'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { createGradeScale, saveScheme } from '@/app/(dashboard)/exams/actions';
import { useI18n } from '@/i18n/client';
import { schemeProblem, weightTotal, type GradeScale, type PassRules, type Scheme, type SchemeComponent, type SchemePresets } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

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
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <FormField label={t('exm.f.subject')}>
          <TextInput select value={subjectId} onChange={(e) => go(e.target.value, yearId)} sx={{ minWidth: 280 }}>
            {structure.subjects.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} {s.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('exm.f.year')}>
          <TextInput select value={yearId} onChange={(e) => go(subjectId, e.target.value)} sx={{ minWidth: 140 }}>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      </Box>
      <Card sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {scheme ? t('exm.scheme.edit') : t('exm.scheme.new')}
        </Typography>
        {canEdit && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('exm.scheme.preset')}
            </Typography>
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
          </Box>
        )}
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', mb: 2 }}>
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
        </Box>
        {comps.map((c, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <FormField label={t('exm.f.code')}>
              <TextInput value={c.code} onChange={(e) => upd(i, { code: e.target.value })} sx={{ width: 100 }} disabled={!canEdit} />
            </FormField>
            <FormField label={t('exm.f.name')}>
              <TextInput value={c.name} onChange={(e) => upd(i, { name: e.target.value })} sx={{ flex: 1, minWidth: 180 }} disabled={!canEdit} />
            </FormField>
            <FormField label={t('exm.f.kindOfComponent')}>
              <TextInput select value={c.kind} onChange={(e) => upd(i, { kind: e.target.value as SchemeComponent['kind'] })} sx={{ width: 140 }} disabled={!canEdit}>
                {KINDS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {t(`exm.ck.${k}`)}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.weight')}>
              <TextInput type="number" value={c.weight} onChange={(e) => upd(i, { weight: Number(e.target.value) })} sx={{ width: 100 }} disabled={!canEdit} />
            </FormField>
            {canEdit && (
              <Button size="small" color="error" onClick={() => setComps(comps.filter((_, j) => j !== i))}>
                {t('exm.remove')}
              </Button>
            )}
          </Box>
        ))}
        {canEdit && (
          <Button size="small" onClick={() => setComps([...comps, { code: '', name: '', kind: 'internal', weight: 0 }])}>
            {t('exm.scheme.addComponent')}
          </Button>
        )}
        <Alert severity={total === 100 ? 'success' : 'warning'} sx={{ my: 1.5 }}>
          {t('exm.scheme.total', { n: total })}
        </Alert>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', mb: 2 }}>
          <FormField label={t('exm.f.minInternal')}>
            <TextInput type="number" value={pass.internal} onChange={(e) => setPass({ ...pass, internal: e.target.value })} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.minExternal')}>
            <TextInput type="number" value={pass.external} onChange={(e) => setPass({ ...pass, external: e.target.value })} disabled={!canEdit} />
          </FormField>
          <FormField label={t('exm.f.minTotal')}>
            <TextInput type="number" value={pass.total} onChange={(e) => setPass({ ...pass, total: e.target.value })} disabled={!canEdit} />
          </FormField>
        </Box>
        {canEdit ? (
          <Button
            variant="contained"
            disabled={pending || problem !== null || !gradeScaleId}
            onClick={() => run(() => saveScheme({ subjectId, academicYearId: yearId, name, credits: Number(credits), gradeScaleId, passRules: rules, components: comps }), t('exm.scheme.saved'))}
          >
            {t('exm.scheme.save')}
          </Button>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('exm.scheme.readOnly')}
          </Typography>
        )}
        {feedback}
      </Card>
      {canEdit && (
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {t('exm.scale.title')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormField label={t('exm.f.name')}>
              <TextInput value={scaleName} onChange={(e) => setScaleName(e.target.value)} />
            </FormField>
            <FormField label={t('exm.scale.from')}>
              <TextInput select value={scalePreset} onChange={(e) => setScalePreset(e.target.value)} sx={{ minWidth: 260 }}>
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
          </Box>
        </Card>
      )}
    </>
  );
}
