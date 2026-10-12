'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { tagPoll } from '@/app/(dashboard)/obe/classroom/actions';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/dates';
import type { ClassroomActivity } from '@/lib/staff-changes';

import { Alert, Button, Checkbox, FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
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
    <div className="flex flex-col gap-4 mt-4">
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        {t('as.cls.hint')}
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {activities.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('as.cls.none')}</p>
      ) : (
        <div className="rounded-[12px] border bg-card overflow-x-auto">
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
                    <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {formatDate(a.openedAt.slice(0, 10), 'dayMonth', locale)}
                    </div>
                    {!a.hasAnswer && <StatusPill tone="warning">{t('as.cls.noAnswer')}</StatusPill>}
                  </TableCell>
                  <TableCell>{a.section}</TableCell>
                  <TableCell align="right">{a.responses}</TableCell>
                  <TableCell>
                    <div className="flex flex-row flex-wrap">
                      {cos.map((c) => (
                        <FormControlLabel key={c.id} label={c.code} title={c.statement} control={<Checkbox size="small" checked={picked[a.id]?.includes(c.id) ?? false} onChange={() => toggle(a.id, c.id)} />} />
                      ))}
                    </div>
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
        </div>
      )}
    </div>
  );
}
