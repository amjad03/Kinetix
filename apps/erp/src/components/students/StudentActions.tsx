'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { changeStudentSection, changeStudentStatus, linkGuardian, unlinkGuardian } from '@/app/(dashboard)/students/actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STUDENT_REASON_REQUIRED, type StudentProfile } from '@/lib/admissions';

type Dialog = { kind: 'status'; status: string } | { kind: 'section'; sectionId: string } | null;

/** Status buttons (only the moves the rules allow), class change, and the student's guardians. */
export function StudentActions({ student: s, canChange, canGuardians, classes }: { student: StudentProfile; canChange: boolean; canGuardians: boolean; classes: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [g, setG] = useState({ fullName: '', phone: '', email: '', relation: 'mother', isPrimary: false });
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <Stack spacing={3} sx={{ mt: 3 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {canChange && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <SectionTitle flush>{t('stu.changeStatus')}</SectionTitle>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {s.allowedStatuses.map((to) => (
              <Button key={to} size="small" variant="outlined" color={to === 'dropped' || to === 'transferred' ? 'error' : 'primary'} disabled={pending} onClick={() => (STUDENT_REASON_REQUIRED.includes(to) ? setDialog({ kind: 'status', status: to }) : run(() => changeStudentStatus(s.id, to)))}>
                {t(`stu.moveTo.${to}` as MessageKey)}
              </Button>
            ))}
            {s.allowedStatuses.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('stu.final')}
              </Typography>
            )}
          </Stack>
          {classes.length > 0 && !['transferred', 'alumni', 'dropped'].includes(s.status) && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
              <FormField label={t('stu.moveClass')}>
                <TextInput select value={target} onChange={(e) => setTarget(e.target.value)} sx={{ minWidth: 220 }}>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <Button variant="outlined" size="small" disabled={!target || pending} onClick={() => setDialog({ kind: 'section', sectionId: target })}>
                {t('stu.moveClassGo')}
              </Button>
            </Stack>
          )}
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('stu.guardians')}</SectionTitle>
        <Stack spacing={1.5}>
          {s.guardians.map((x) => (
            <Box key={x.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {x.fullName} <Typography component="span" variant="body2" color="text.secondary">({x.relation})</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {x.phone ?? '–'}
                  {x.email ? ` · ${x.email}` : ''}
                </Typography>
              </Box>
              {x.isPrimary && <Chip size="small" color="primary" label={t('stu.primary')} />}
              {x.isEmergencyContact && <Chip size="small" variant="outlined" label={t('stu.emergency')} />}
              {canGuardians && s.guardians.length > 1 && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => unlinkGuardian(s.id, x.id))}>
                  {t('stu.unlink')}
                </Button>
              )}
            </Box>
          ))}
          {s.guardians.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('stu.noGuardians')}
            </Typography>
          )}
        </Stack>
        {canGuardians && (
          <Box
            component="form"
            sx={{ mt: 2.5 }}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              run(() => linkGuardian(s.id, g), () => setG({ fullName: '', phone: '', email: '', relation: 'mother', isPrimary: false }));
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('stu.addGuardian')}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <FormField label={t('adm.field.name')} required>
                <TextInput value={g.fullName} onChange={(e) => setG({ ...g, fullName: e.target.value })} required />
              </FormField>
              <FormField label={t('adm.field.phone')} required>
                <TextInput value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
              </FormField>
              <FormField label={t('adm.field.email')}>
                <TextInput value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} type="email" />
              </FormField>
              <FormField label={t('stu.relation')} required>
                <TextInput value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })} required />
              </FormField>
            </Box>
            <FormControlLabel control={<Checkbox size="small" checked={g.isPrimary} onChange={(e) => setG({ ...g, isPrimary: e.target.checked })} />} label={t('stu.makePrimary')} />
            <Box>
              <Button type="submit" variant="contained" size="small" disabled={pending || !g.fullName.trim() || !g.phone.trim()}>
                {t('stu.linkGuardian')}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      {dialog?.kind === 'status' && (
        <ReasonDialog
          title={t(`stu.moveTo.${dialog.status}` as MessageKey)}
          help={t('stu.reasonHelp')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => changeStudentStatus(s.id, dialog.status, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'section' && (
        <ReasonDialog
          title={t('stu.moveClass')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => changeStudentSection(s.id, dialog.sectionId, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) {
              setTarget('');
              router.refresh();
            }
          }}
        />
      )}
    </Stack>
  );
}
