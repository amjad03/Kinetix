'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { tagPoll } from '@/app/(dashboard)/obe/classroom/actions';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/dates';
import type { ClassroomActivity } from '@/lib/staff-changes';

/** Board polls and class checks of one subject, each tagged with the course outcomes it measures. */
export function ClassroomTagger({ activities, cos }: { activities: ClassroomActivity[]; cos: { id: string; code: string; statement: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string[]>>(() => Object.fromEntries(activities.map((a) => [a.id, a.cos.map((c) => c.coId)])));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (poll: string, co: string) => setPicked((p) => ({ ...p, [poll]: p[poll]?.includes(co) ? p[poll].filter((x) => x !== co) : [...(p[poll] ?? []), co] }));
  const save = (poll: string) =>
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await tagPoll(poll, picked[poll] ?? []);
      if (res.ok) {
        setSaved(poll);
        router.refresh();
      } else setError(res.error);
    });

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t('as.cls.hint')}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {activities.length === 0 ? (
        <Typography color="text.secondary">{t('as.cls.none')}</Typography>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="classroom-list">
            <TableHead>
              <TableRow>
                <TableCell>{t('as.cls.question')}</TableCell>
                <TableCell>{t('as.cls.class')}</TableCell>
                <TableCell align="right">{t('as.cls.responses')}</TableCell>
                <TableCell>{t('as.cls.cos')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {activities.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.question || '-'}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {formatDate(a.openedAt.slice(0, 10), 'dayMonth', locale)}
                    </Typography>
                    {!a.hasAnswer && <StatusPill tone="warning">{t('as.cls.noAnswer')}</StatusPill>}
                  </TableCell>
                  <TableCell>{a.section}</TableCell>
                  <TableCell align="right">{a.responses}</TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
                      {cos.map((c) => (
                        <FormControlLabel key={c.id} label={c.code} title={c.statement} control={<Checkbox size="small" checked={picked[a.id]?.includes(c.id) ?? false} onChange={() => toggle(a.id, c.id)} />} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" disabled={pending} onClick={() => save(a.id)}>
                      {saved === a.id ? t('as.cls.saved') : t('as.cls.save')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
