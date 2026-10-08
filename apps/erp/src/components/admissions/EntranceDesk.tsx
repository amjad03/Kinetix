'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
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
import {
  addEntranceHall,
  allocateEntranceSeats,
  createEntranceTest,
  loadQuotas,
  loadSeating,
  saveEntranceScores,
  saveQuotas,
  type QuotaView,
  type SeatRow,
} from '@/app/(dashboard)/admissions/deep-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/dates';

export interface EntranceTestRow {
  id: string;
  cycleId: string;
  name: string;
  testDate: string;
  startsAt: string;
  maxScore: number;
  passScore: number | null;
  venue: string | null;
  halls: { id: string; name: string; capacity: number; seated: number }[];
  capacity: number;
  seated: number;
  scored: number;
}

/** Entrance tests (halls, seats, hall tickets, scores) and the seat quotas of each cycle. */
export function EntranceDesk({ tests, cycles }: { tests: EntranceTestRow[]; cycles: { id: string; name: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ cycleId: cycles[0]?.id ?? '', name: '', testDate: '', startsAt: '10:00', maxScore: '100', passScore: '', venue: '', hallName: 'Hall A', hallCapacity: '60' });
  const [open, setOpen] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [edits, setEdits] = useState<Record<string, { score: string; absent: boolean }>>({});
  const [newHall, setNewHall] = useState({ name: '', capacity: '40' });
  const [quotaCycle, setQuotaCycle] = useState(cycles[0]?.id ?? '');
  const [quota, setQuota] = useState<QuotaView | null>(null);
  const [rows, setRows] = useState<{ category: string; reservedSeats: string }[]>([]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, message?: string, after?: () => void) =>
    start(async () => {
      setError(null);
      setNote(null);
      const res = await fn();
      if (res.ok) {
        if (message) setNote(message);
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });

  const show = (id: string) =>
    start(async () => {
      if (open === id) return setOpen(null);
      const res = await loadSeating(id);
      if (!res.ok) return setError(res.error);
      setSeats(res.data);
      setEdits(Object.fromEntries(res.data.map((s) => [s.applicationId, { score: s.score == null ? '' : String(s.score), absent: s.absent }])));
      setOpen(id);
    });

  const openQuotas = (cycleId: string) =>
    start(async () => {
      setQuotaCycle(cycleId);
      const res = await loadQuotas(cycleId);
      if (!res.ok) return setError(res.error);
      setQuota(res.data);
      setRows(res.data.quotas.map((q) => ({ category: q.category, reservedSeats: String(q.reservedSeats) })));
    });

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {note && <Alert severity="success">{note}</Alert>}

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('ent.new')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => createEntranceTest({ cycleId: f.cycleId, name: f.name, testDate: f.testDate, startsAt: f.startsAt, maxScore: Number(f.maxScore), passScore: f.passScore ? Number(f.passScore) : undefined, venue: f.venue, hallName: f.hallName, hallCapacity: Number(f.hallCapacity) }), undefined, () => setF({ ...f, name: '', testDate: '' }));
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('ent.cycle')} required>
            <TextInput select value={f.cycleId} onChange={(e) => setF({ ...f, cycleId: e.target.value })} required>
              {cycles.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('ent.name')} required>
            <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </FormField>
          <FormField label={t('ent.venue')}>
            <TextInput value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          </FormField>
          <FormField label={t('ent.date')} required>
            <TextInput type="date" value={f.testDate} onChange={(e) => setF({ ...f, testDate: e.target.value })} required />
          </FormField>
          <FormField label={t('ent.time')} required>
            <TextInput type="time" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} required />
          </FormField>
          <FormField label={t('ent.maxScore')} required>
            <TextInput type="number" value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} required />
          </FormField>
          <FormField label={t('ent.passScore')}>
            <TextInput type="number" value={f.passScore} onChange={(e) => setF({ ...f, passScore: e.target.value })} />
          </FormField>
          <FormField label={t('ent.hallName')}>
            <TextInput value={f.hallName} onChange={(e) => setF({ ...f, hallName: e.target.value })} />
          </FormField>
          <FormField label={t('ent.capacity')}>
            <TextInput type="number" value={f.hallCapacity} onChange={(e) => setF({ ...f, hallCapacity: e.target.value })} />
          </FormField>
          <Box>
            <Button type="submit" variant="contained" disabled={pending || !f.cycleId || f.name.trim().length < 3 || !f.testDate}>
              {t('ent.create')}
            </Button>
          </Box>
        </Box>
      </Paper>

      {tests.length === 0 && <Typography color="text.secondary">{t('ent.none')}</Typography>}
      {tests.map((x) => (
        <Paper key={x.id} variant="outlined" sx={{ p: 2.5 }} data-testid="entrance-test">
          <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{ flex: '1 1 240px' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {x.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDate(x.testDate, 'long', locale)} · {x.startsAt.slice(0, 5)} · {t('ent.maxIs', { n: x.maxScore })}
                {x.passScore != null ? ` · ${t('ent.passIs', { n: x.passScore })}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('ent.seatedOf', { n: x.seated, cap: x.capacity })} · {t('ent.scored', { n: x.scored })}
              </Typography>
            </Box>
            <Button size="small" variant="outlined" disabled={pending} onClick={() => run(async () => allocateEntranceSeats(x.id), undefined)}>
              {t('ent.allocate')}
            </Button>
            <Button size="small" disabled={pending} onClick={() => show(x.id)}>
              {t('ent.seating')}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            {x.halls.map((h) => `${h.name}: ${h.seated}/${h.capacity}`).join(' · ') || t('ent.noHalls')}
          </Typography>
          {open === x.id && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
                <FormField label={t('ent.hallName')}>
                  <TextInput value={newHall.name} onChange={(e) => setNewHall({ ...newHall, name: e.target.value })} />
                </FormField>
                <FormField label={t('ent.capacity')}>
                  <TextInput type="number" value={newHall.capacity} onChange={(e) => setNewHall({ ...newHall, capacity: e.target.value })} />
                </FormField>
                <Button size="small" variant="outlined" disabled={pending || !newHall.name.trim()} onClick={() => run(() => addEntranceHall(x.id, newHall.name, Number(newHall.capacity)), undefined, () => setNewHall({ name: '', capacity: '40' }))}>
                  {t('ent.addHall')}
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('ent.candidate')}</TableCell>
                    <TableCell>{t('ent.hall')}</TableCell>
                    <TableCell>{t('ent.seat')}</TableCell>
                    <TableCell>{t('ent.score')}</TableCell>
                    <TableCell>{t('ent.absent')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {seats.map((s) => (
                    <TableRow key={s.applicationId}>
                      <TableCell>
                        {s.applicantName}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {s.applicationNo}
                        </Typography>
                      </TableCell>
                      <TableCell>{s.hall}</TableCell>
                      <TableCell>{s.seatNo}</TableCell>
                      <TableCell sx={{ width: 110 }}>
                        <TextInput type="number" value={edits[s.applicationId]?.score ?? ''} disabled={edits[s.applicationId]?.absent} onChange={(e) => setEdits({ ...edits, [s.applicationId]: { ...edits[s.applicationId], score: e.target.value } })} />
                      </TableCell>
                      <TableCell>
                        <Checkbox size="small" checked={edits[s.applicationId]?.absent ?? false} onChange={(e) => setEdits({ ...edits, [s.applicationId]: { score: '', absent: e.target.checked } })} slotProps={{ input: { 'aria-label': t('ent.absent') } }} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/api/download?kind=hall-ticket&test=${x.id}&app=${s.applicationId}`} underline="hover">
                          {t('ent.ticket')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                sx={{ mt: 2 }}
                variant="contained"
                size="small"
                disabled={pending || seats.length === 0}
                onClick={() =>
                  run(
                    () =>
                      saveEntranceScores(
                        x.id,
                        seats.flatMap((s): { applicationId: string; score?: number; absent?: boolean }[] => {
                          const e = edits[s.applicationId];
                          if (!e) return [];
                          if (e.absent) return [{ applicationId: s.applicationId, absent: true }];
                          return e.score === '' ? [] : [{ applicationId: s.applicationId, score: Number(e.score) }];
                        }),
                      ),
                    t('ent.saved'),
                  )
                }
              >
                {t('ent.saveScores')}
              </Button>
            </Box>
          )}
        </Paper>
      ))}

      {cycles.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <SectionTitle flush>{t('quota.title')}</SectionTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('quota.help')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
            <FormField label={t('ent.cycle')}>
              <TextInput select value={quotaCycle} onChange={(e) => openQuotas(e.target.value)} sx={{ minWidth: 240 }}>
                {cycles.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            {!quota && (
              <Button size="small" variant="outlined" disabled={pending} onClick={() => openQuotas(quotaCycle)}>
                {t('quota.load')}
              </Button>
            )}
          </Stack>
          {quota && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('quota.general', { n: quota.generalSeats, left: quota.generalLeft })}
              </Typography>
              {rows.map((r, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                  <TextInput value={r.category} placeholder={t('quota.category')} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} slotProps={{ htmlInput: { 'aria-label': t('quota.category') } }} />
                  <TextInput type="number" value={r.reservedSeats} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reservedSeats: e.target.value } : x)))} sx={{ width: 100 }} slotProps={{ htmlInput: { 'aria-label': t('quota.reserved') } }} />
                  <Typography variant="caption" color="text.secondary">
                    {t('quota.taken', { n: quota.quotas.find((q) => q.category.toLowerCase() === r.category.trim().toLowerCase())?.taken ?? 0 })}
                  </Typography>
                  <Button size="small" color="error" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    {t('quota.remove')}
                  </Button>
                </Stack>
              ))}
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setRows([...rows, { category: '', reservedSeats: '1' }])}>
                  {t('quota.add')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const res = await saveQuotas(quotaCycle, rows.map((r) => ({ category: r.category, reservedSeats: Number(r.reservedSeats) })));
                      if (res.ok) {
                        setQuota(res.data);
                        setNote(t('ent.saved'));
                      } else setError(res.error);
                    })
                  }
                >
                  {t('quota.save')}
                </Button>
              </Stack>
            </Box>
          )}
        </Paper>
      )}
    </Stack>
  );
}
