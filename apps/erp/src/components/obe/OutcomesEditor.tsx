'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addOutcome, removeOutcome, saveConfig } from '@/app/(dashboard)/obe/actions';
import { useRun } from '@/components/exams/useRun';
import { useI18n } from '@/i18n/client';
import type { AttainmentConfig, OutcomeKind, ProgramOutcome } from '@/lib/obe';

const KINDS: OutcomeKind[] = ['mission', 'vision', 'peo', 'po', 'pso'];

export function OutcomesEditor({ programs, programId, outcomes, config, canEdit }: { programs: { id: string; name: string }[]; programId: string; outcomes: ProgramOutcome[]; config: AttainmentConfig; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [f, setF] = useState({ kind: 'po' as OutcomeKind, code: '', statement: '' });
  const [c, setC] = useState({ ...config, evidence: Object.entries(config.evidenceWeights).map(([k, v]) => `${k}=${v}`).join(', '), levels: config.levels.map((l) => `${l.level}:${l.minStudentsPercent}`).join(', ') });
  const save = () => {
    const evidenceWeights = Object.fromEntries(c.evidence.split(',').map((p) => p.trim()).filter(Boolean).map((p) => [p.split('=')[0].trim(), Number(p.split('=')[1])]));
    const levels = c.levels.split(',').map((p) => p.trim()).filter(Boolean).map((p) => ({ level: Number(p.split(':')[0]), minStudentsPercent: Number(p.split(':')[1]) }));
    run(() => saveConfig(programId, { studentThresholdPercent: Number(c.studentThresholdPercent), levels, evidenceWeights, directWeight: Number(c.directWeight), indirectWeight: Number(c.indirectWeight), maxLevel: Number(c.maxLevel), targetLevel: Number(c.targetLevel), decimals: Number(c.decimals) }), t('obe.configSaved'));
  };
  const num = (k: 'studentThresholdPercent' | 'directWeight' | 'indirectWeight' | 'maxLevel' | 'targetLevel') => (
    <TextField size="small" type="number" label={t(`obe.cfg.${k}`)} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value as unknown as number })} disabled={!canEdit} />
  );
  return (
    <>
      <TextField select size="small" label={t('exm.f.program')} value={programId} onChange={(e) => router.push(`/obe/setup?programId=${e.target.value}`)} sx={{ minWidth: 220, mb: 2 }}>
        {programs.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      {feedback}
      {KINDS.map((k) => (
        <Box key={k} sx={{ mb: 2 }}>
          <Typography variant="subtitle1" component="h2">
            {t(`obe.kind.${k}`)}
          </Typography>
          {outcomes.filter((o) => o.kind === k).map((o) => (
            <Box key={o.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
              <Typography sx={{ fontWeight: 600, minWidth: 56 }}>{o.code}</Typography>
              <Typography sx={{ flex: 1 }}>{o.statement}</Typography>
              {canEdit && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => removeOutcome(o.id), t('obe.removed'))}>
                  {t('exm.remove')}
                </Button>
              )}
            </Box>
          ))}
        </Box>
      ))}
      {canEdit && (
        <Card sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField select size="small" label={t('obe.f.kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OutcomeKind })} sx={{ minWidth: 150 }}>
              {KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {t(`obe.kind.${k}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={t('exm.f.code')} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} sx={{ width: 100 }} />
            <TextField size="small" label={t('obe.f.statement')} value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} sx={{ flex: 1, minWidth: 260 }} />
            <Button variant="outlined" disabled={pending} onClick={() => run(() => addOutcome(programId, f), t('obe.added'), () => setF({ ...f, code: '', statement: '' }))}>
              {t('obe.add')}
            </Button>
          </Box>
        </Card>
      )}
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {t('obe.cfg.title')}
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {num('studentThresholdPercent')}
        {num('directWeight')}
        {num('indirectWeight')}
        {num('maxLevel')}
        {num('targetLevel')}
        <TextField size="small" label={t('obe.cfg.levels')} helperText={t('obe.cfg.levelsHelp')} value={c.levels} onChange={(e) => setC({ ...c, levels: e.target.value })} disabled={!canEdit} />
        <TextField size="small" label={t('obe.cfg.evidence')} helperText={t('obe.cfg.evidenceHelp')} value={c.evidence} onChange={(e) => setC({ ...c, evidence: e.target.value })} disabled={!canEdit} />
      </Box>
      {canEdit && (
        <Button sx={{ mt: 1.5 }} variant="contained" disabled={pending} onClick={save}>
          {t('obe.cfg.save')}
        </Button>
      )}
    </>
  );
}
