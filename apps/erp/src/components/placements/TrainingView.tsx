'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addSession, markSession, removeSession, saveScores } from '@/app/(dashboard)/placements/actions';
import { useDialog, useRun } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { CheckboxField, DataTable, Dialog, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';
import type { TrainingDetail } from '@/lib/placements-depth';

type Student = TrainingDetail['students'][number];
type Session = TrainingDetail['sessions'][number];

/**
 * A placement training programme (aptitude, technical, soft skills, mock interviews): its sessions, attendance per
 * session and the students' test scores, with each student's attendance over the programme.
 */
export function TrainingView({ tr, canEdit }: { tr: TrainingDetail; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const run = useRun();
  const [marking, setMarking] = useState<Session | null>(null);
  const [scoring, setScoring] = useState(false);
  const live = tr.status !== 'cancelled';
  const hoursDone = tr.sessions.reduce((s, x) => s + Number(x.hours), 0);

  const sessionCols: Column<Session>[] = [
    { id: 'on', header: t('ivd.date'), rowHeader: true, cell: (s) => fmt.date(s.heldOn, 'short') },
    { id: 'topic', header: t('pd.tr.topic'), cell: (s) => s.topic },
    { id: 'hours', header: t('pd.tr.hours'), align: 'right', cell: (s) => fmt.number(Number(s.hours)) },
    { id: 'present', header: t('pd.tr.present'), align: 'right', cell: (s) => tr.students.filter((x) => x.attendance[s.id] === true).length },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (s) =>
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setMarking(s)} disabled={!tr.students.length}>{t('pd.tr.mark')}</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void run(() => removeSession(tr.id, s.id), t('pd.tr.removed'))}>{t('pd.co.remove')}</Button>
          </div>
        ) : null,
    },
  ];
  const studentCols: Column<Student>[] = [
    { id: 'student', header: t('ops.f.student'), rowHeader: true, sort: (s) => s.rollNo, cell: (s) => <>{s.fullName}<span className="block text-xs text-muted-foreground">{`${s.rollNo} · ${s.className}`}</span></> },
    { id: 'att', header: t('pd.tr.attendance'), align: 'right', sort: (s) => s.attendancePct ?? -1, cell: (s) => (s.attendancePct === null ? '—' : `${s.attendancePct}% (${s.present}/${tr.sessions.length})`) },
    ...tr.tests.map((test): Column<Student> => ({ id: `t-${test}`, header: test, align: 'right', hideBelow: 'md', cell: (s) => (s.scores[test] ? `${fmt.number(Number(s.scores[test].score))} / ${fmt.number(Number(s.scores[test].maxScore))}` : '—') })),
  ];

  return (
    <>
      <RecordPage
        title={tr.title}
        subtitle={[tr.trainer, tr.batchYear ? t('pd.tr.batch', { year: tr.batchYear }) : null].filter(Boolean).join(' · ') || undefined}
        status={{ label: statusLabel(t, tr.status), tone: statusTone(tr.status) }}
        facts={[
          { label: t('pd.kind'), value: t(`pd.tkind.${tr.kind as 'aptitude'}`) },
          { label: t('pd.tr.dates'), value: `${fmt.date(tr.startsOn, 'short')} – ${fmt.date(tr.endsOn, 'short')}` },
          { label: t('pd.tr.hoursDone'), value: `${fmt.number(hoursDone)} / ${fmt.number(Number(tr.hours))}` },
          { label: t('pd.sessions'), value: fmt.number(tr.sessions.length) },
          { label: t('pd.tr.students'), value: fmt.number(tr.students.length) },
        ]}
        primary={
          canEdit && live ? (
            <>
              <Button onClick={() => open({ title: t('pd.tr.addSession'), fields: [{ name: 'heldOn', label: t('ivd.date'), kind: 'date', required: true }, { name: 'topic', label: t('pd.tr.topic'), required: true }, { name: 'hours', label: t('pd.tr.hours'), kind: 'number', init: '1' }], run: (v) => addSession(tr.id, v) })} data-testid="training-session">
                {t('pd.tr.addSession')}
              </Button>
              <Button variant="outline" onClick={() => setScoring(true)} disabled={!tr.students.length}>{t('pd.tr.scores')}</Button>
            </>
          ) : undefined
        }
        overview={
          <div className="grid gap-6">
            {tr.description && <p className="whitespace-pre-wrap text-sm">{tr.description}</p>}
            <DataTable label={t('pd.sessions')} columns={sessionCols} rows={tr.sessions} rowId={(s) => s.id} empty={t('pd.tr.noSessions')} />
          </div>
        }
        related={[{ value: 'students', label: t('pd.tr.students'), count: tr.students.length, content: <DataTable label={t('pd.tr.students')} columns={studentCols} rows={tr.students} rowId={(s) => s.id} empty={t('pd.tr.noStudents')} exportName="training-students" pageSize={50} /> }]}
      />
      {dialog}
      {marking && (
        <AttendanceDialog
          session={marking}
          students={tr.students}
          onClose={() => setMarking(null)}
          onSave={async (present, absent) => {
            const r = await markSession(tr.id, marking.id, present, absent);
            if (!r.ok) return r.error;
            toast.success(t('ops.saved'));
            setMarking(null);
            router.refresh();
          }}
        />
      )}
      {scoring && (
        <ScoresDialog
          students={tr.students}
          onClose={() => setScoring(false)}
          onSave={async (v, scores) => {
            const r = await saveScores(tr.id, v, scores);
            if (!r.ok) return r.error;
            toast.success(t('ops.saved'));
            setScoring(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function AttendanceDialog({ session, students, onClose, onSave }: { session: Session; students: Student[]; onClose: () => void; onSave: (present: string[], absent: string[]) => Promise<string | void> }) {
  const { t, fmt } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [present, setPresent] = useState<Set<string>>(() => new Set(students.filter((s) => s.attendance[session.id] !== false).map((s) => s.id)));
  return (
    <Dialog
      title={t('pd.tr.markOf', { topic: session.topic, date: fmt.date(session.heldOn, 'short') })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t('ops.cancel')}</Button>
          <Button onClick={() => start(async () => { const e = await onSave([...present], students.filter((s) => !present.has(s.id)).map((s) => s.id)); if (e) setError(e); })} disabled={pending} data-testid="attendance-save">{t('ops.save')}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{t('pd.tr.markHelp', { n: present.size, total: students.length })}</p>
      <div className="grid max-h-[50vh] gap-1 overflow-y-auto">
        {students.map((s) => (
          <CheckboxField
            key={s.id}
            label={`${s.rollNo} · ${s.fullName}`}
            checked={present.has(s.id)}
            onChange={(c) => {
              const next = new Set(present);
              if (c) next.add(s.id);
              else next.delete(s.id);
              setPresent(next);
            }}
          />
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Dialog>
  );
}

function ScoresDialog({ students, onClose, onSave }: { students: Student[]; onClose: () => void; onSave: (v: Record<string, string>, scores: { studentId: string; score: number }[]) => Promise<string | void> }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState({ testName: '', maxScore: '100', takenOn: '' });
  const [scores, setScores] = useState<Record<string, string>>({});
  const save = () =>
    start(async () => {
      if (test.testName.trim().length < 2) return setError(t('ops.err.field', { field: t('pd.tr.testName') }));
      const max = Number(test.maxScore);
      if (!(max > 0)) return setError(t('ops.err.field', { field: t('pd.tr.maxScore') }));
      const list = Object.entries(scores).filter(([, v]) => v.trim() !== '');
      const bad = list.find(([, v]) => !/^\d+(\.\d+)?$/.test(v.trim()) || Number(v) > max);
      if (bad) return setError(t('pd.tr.badScore', { max }));
      const e = await onSave(test, list.map(([studentId, v]) => ({ studentId, score: Number(v) })));
      if (e) setError(e);
    });
  return (
    <Dialog
      title={t('pd.tr.scores')}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t('ops.cancel')}</Button>
          <Button onClick={save} disabled={pending} data-testid="scores-save">{t('ops.save')}</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <TextInput className="min-w-[180px] flex-1" label={t('pd.tr.testName')} value={test.testName} onChange={(e) => setTest({ ...test, testName: e.target.value })} />
        <TextInput className="w-28" label={t('pd.tr.maxScore')} inputMode="numeric" value={test.maxScore} onChange={(e) => setTest({ ...test, maxScore: e.target.value })} />
        <TextInput className="w-40" type="date" label={t('ivd.date')} value={test.takenOn} onChange={(e) => setTest({ ...test, takenOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      </div>
      <div className="grid max-h-[45vh] gap-2 overflow-y-auto">
        {students.map((s) => (
          <div key={s.id} className="flex items-end gap-2">
            <span className="min-w-0 flex-1 text-sm">{`${s.rollNo} · ${s.fullName}`}</span>
            <TextInput className="w-24" label={t('pd.score')} inputMode="decimal" value={scores[s.id] ?? ''} onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} />
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Dialog>
  );
}
