'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { addMap, addSkill, openPassport, recordEvidence, removeMap, revokePassport, skillDetail, skillEvidence, tagItem, untag, verifyPassport } from '@/app/(dashboard)/skills/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { MAP_KINDS, SDG_ITEM_TYPES, SKILL_CATEGORIES, type ManualEvidence, type Passport, type SdgDashboard, type SdgGoal, type Skill, type SkillDetail } from '@/lib/skills';
import type { ActionResult } from '@/lib/types';

/** Loads a read-only value for a dialog and reloads it after a change. */
function useRead<T>(load: () => Promise<ActionResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, []);
  useEffect(() => {
    let live = true;
    void run().then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

type Toast = (m: string) => void;
const opts = (t: (k: MessageKey) => string, prefix: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}` as MessageKey) }));

export function SkillsDesk({ skills, sdg, initialTab }: { skills: Skill[]; sdg: SdgDashboard; initialTab: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<'skill' | 'tag' | 'passport' | { skill: Skill } | { goal: SdgGoal } | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const goalName = (n: number) => t(`sk.goal.${n}` as MessageKey);

  return (
    <>
      <Tabbed
        label={t('nav.skills')}
        initial={initialTab}
        tabs={[
          {
            id: 'skills',
            label: t('sk.tab.skills', { n: skills.length }),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg('skill')}>{t('sk.addSkill')}</Button></Bar>
                <Grid
                  testId="sk-skills"
                  empty={t('sk.noSkills')}
                  rows={skills}
                  cols={[
                    { label: t('sk.code'), cell: (s) => s.code },
                    { label: t('ops.f.name'), cell: (s) => s.name },
                    { label: t('sk.col.category'), cell: (s) => t(`sk.cat.${s.category}` as MessageKey) },
                    { label: t('sk.col.sources'), cell: (s) => s.sources, num: true },
                    { label: t('sk.col.manual'), cell: (s) => s.manualEvidence, num: true },
                    { label: '', cell: (s) => <Button size="small" onClick={() => setDlg({ skill: s })}>{t('sk.manage')}</Button> },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'passport',
            label: t('sk.tab.passport'),
            node: (
              <>
                <Typography sx={{ mb: 2 }}>{t('sk.pp.intro')}</Typography>
                <Bar><Button variant="contained" onClick={() => setDlg('passport')}>{t('sk.pp.open')}</Button></Bar>
              </>
            ),
          },
          {
            id: 'sdg',
            label: t('sk.tab.sdg'),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg('tag')}>{t('sk.sdg.tag')}</Button></Bar>
                <Grid
                  testId="sk-sdg"
                  empty={t('sk.sdg.noItems')}
                  rows={sdg.goals}
                  cols={[
                    { label: t('sk.sdg.goal'), cell: (g) => `${g.number}. ${goalName(g.number)}`, sort: (g) => g.number },
                    { label: t('sk.sdg.items'), cell: (g) => g.count, num: true },
                    { label: t('sk.sdg.people'), cell: (g) => g.participation, num: true },
                    { label: '', cell: (g) => <Button size="small" disabled={g.count === 0} onClick={() => setDlg({ goal: g })}>{t('sk.sdg.view')}</Button> },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {dlg === 'skill' && (
        <FormDialog
          title={t('sk.addSkill')}
          onSubmit={addSkill}
          onClose={done}
          fields={[
            { name: 'code', label: t('sk.code'), required: true },
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'category', label: t('sk.col.category'), kind: 'select', init: 'skill', options: opts(t, 'sk.cat', SKILL_CATEGORIES) },
            { name: 'description', label: t('sk.description'), kind: 'multiline' },
          ]}
        />
      )}
      {dlg === 'tag' && (
        <FormDialog
          title={t('sk.sdg.tag')}
          onSubmit={tagItem}
          onClose={done}
          fields={[
            { name: 'sdgNumber', label: t('sk.sdg.goal'), kind: 'select', init: '4', options: sdg.goals.map((g) => ({ value: String(g.number), label: `${g.number}. ${goalName(g.number)}` })) },
            { name: 'itemType', label: t('sk.sdg.type'), kind: 'select', init: 'course', options: opts(t, 'sk.sdg.type', SDG_ITEM_TYPES) },
            { name: 'itemId', label: t('sk.sdg.itemId'), kind: 'uuid', required: true },
            { name: 'note', label: t('sk.sdg.note') },
          ]}
        />
      )}
      {dlg === 'passport' && (
        <FormDialog
          title={t('sk.pp.open')}
          submitLabel={t('sk.pp.open')}
          onSubmit={async (v) => {
            setStudentId(v.studentId);
            return { ok: true, data: null };
          }}
          onClose={() => setDlg(null)}
          fields={[{ name: 'studentId', label: t('sk.studentId'), kind: 'uuid', required: true }]}
        />
      )}
      {studentId && <PassportDialog studentId={studentId} onClose={() => setStudentId(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && 'skill' in dlg && <SkillDialog skill={dlg.skill} onClose={() => setDlg(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && 'goal' in dlg && <GoalDialog goal={dlg.goal} title={t('sk.sdg.goalTitle', { n: dlg.goal.number, name: goalName(dlg.goal.number) })} onClose={() => setDlg(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

function SkillDialog({ skill, onClose, toast }: { skill: Skill; onClose: () => void; toast: Toast }) {
  const { t } = useI18n();
  const detail = useRead<SkillDetail>(() => skillDetail(skill.id));
  const evidence = useRead<ManualEvidence[]>(() => skillEvidence(skill.id));
  const [sub, setSub] = useState<'map' | 'evidence' | null>(null);
  const refresh = (m: string) => {
    toast(m);
    detail.reload();
    evidence.reload();
  };
  return (
    <InfoDialog title={`${skill.code} - ${skill.name}`} onClose={onClose}>
      {detail.error && <Typography color="error">{detail.error}</Typography>}
      <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.0625rem' }}>{t('sk.mapped')}</Typography>
        <Button variant="outlined" size="small" onClick={() => setSub('map')}>{t('sk.addMap')}</Button>
      </Stack>
      <Grid
        testId="sk-maps"
        empty={t('sk.noMaps')}
        rows={detail.data?.maps ?? []}
        cols={[
          { label: t('sk.kind'), cell: (m) => t(`sk.kind.${m.kind}` as MessageKey) },
          { label: t('sk.ref'), cell: (m) => m.label || '-' },
          { label: '', cell: (m) => <ActionButton tone="error" label={t('sk.remove')} run={() => removeMap(skill.id, m.id)} onDone={refresh} /> },
        ]}
      />
      <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', mt: 3, mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.0625rem' }}>{t('sk.evidenceList')}</Typography>
        <Button variant="outlined" size="small" onClick={() => setSub('evidence')}>{t('sk.recordEvidence')}</Button>
      </Stack>
      <Grid
        testId="sk-evidence"
        empty={t('sk.noEvidence')}
        rows={evidence.data ?? []}
        cols={[
          { label: t('ops.f.student'), cell: (e) => `${e.fullName} (${e.rollNo})` },
          { label: t('ops.f.title'), cell: (e) => e.title },
          { label: t('sk.level'), cell: (e) => e.level, num: true },
        ]}
      />
      {sub === 'map' && (
        <FormDialog
          title={t('sk.addMap')}
          intro={<Typography variant="body2">{t('sk.refHint')}</Typography>}
          onSubmit={(v) => addMap(skill.id, v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'kind', label: t('sk.kind'), kind: 'select', init: 'subject', options: opts(t, 'sk.kind', MAP_KINDS) },
            { name: 'ref', label: t('sk.ref') },
          ]}
        />
      )}
      {sub === 'evidence' && (
        <FormDialog
          title={t('sk.recordEvidence')}
          intro={<Typography variant="body2">{t('sk.evidenceIntro')}</Typography>}
          onSubmit={(v) => recordEvidence(skill.id, v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'studentId', label: t('sk.studentId'), kind: 'uuid', required: true },
            { name: 'level', label: t('sk.level'), kind: 'number', init: '3', required: true },
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'note', label: t('sk.note'), kind: 'multiline' },
          ]}
        />
      )}
    </InfoDialog>
  );
}

function PassportDialog({ studentId, onClose, toast }: { studentId: string; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const pp = useRead<Passport>(() => openPassport(studentId));
  const refresh = (m: string) => {
    toast(m);
    pp.reload();
  };
  const d = pp.data;
  return (
    <InfoDialog title={d ? `${d.student.fullName} (${d.student.rollNo})` : t('sk.tab.passport')} onClose={onClose}>
      {pp.error && <Typography color="error">{pp.error}</Typography>}
      {d && (
        <>
          <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Pill warn={!d.verification.verified} label={d.verification.verified && d.verification.verifiedAt ? t('sk.pp.verified', { date: fmt.date(d.verification.verifiedAt.slice(0, 10), 'short') }) : t('sk.pp.unverified')} />
            <ActionButton label={t('sk.pp.verify')} run={() => verifyPassport(studentId)} onDone={refresh} />
            {d.verification.verified && <ActionButton tone="error" label={t('sk.pp.revoke')} run={() => revokePassport(studentId)} onDone={refresh} />}
            <Button size="small" component="a" href={`/api/download?kind=passport&id=${studentId}`}>{t('sk.pp.download')}</Button>
          </Stack>
          <Typography variant="h6" sx={{ fontSize: '1.0625rem', mb: 1 }}>{t('sk.pp.skills')}</Typography>
          <Grid
            testId="sk-passport-skills"
            empty={t('sk.pp.noLevel')}
            rows={d.skills}
            cols={[
              { label: t('ops.f.name'), cell: (s) => s.name },
              { label: t('sk.col.category'), cell: (s) => t(`sk.cat.${s.category}` as MessageKey) },
              { label: t('sk.level'), cell: (s) => (s.level === null ? t('sk.pp.noLevel') : t('sk.pp.levelOf', { n: s.level })), sort: (s) => s.level ?? 0 },
              { label: t('sk.mapped'), cell: (s) => s.evidence.map((e) => `${e.title}: ${e.detail}`).join('; ') || '-' },
            ]}
          />
          <Typography variant="h6" sx={{ fontSize: '1.0625rem', mt: 3, mb: 1 }}>{t('sk.pp.certificates')}</Typography>
          <Grid
            empty={t('sk.pp.none')}
            rows={d.certificates}
            cols={[
              { label: t('ops.f.title'), cell: (c) => c.title },
              { label: t('ops.f.date'), cell: (c) => fmt.date(c.issuedOn, 'short'), sort: (c) => c.issuedOn },
            ]}
          />
          <Typography variant="h6" sx={{ fontSize: '1.0625rem', mt: 3, mb: 1 }}>{t('sk.pp.clubs')}</Typography>
          <Grid
            empty={t('sk.pp.none')}
            rows={d.activities.clubs}
            cols={[
              { label: t('sk.sdg.type.club'), cell: (c) => c.club },
              { label: t('cl.points'), cell: (c) => c.points, num: true },
            ]}
          />
          <Typography variant="h6" sx={{ fontSize: '1.0625rem', mt: 3, mb: 1 }}>{t('sk.pp.events')}</Typography>
          <Grid
            empty={t('sk.pp.none')}
            rows={d.activities.events}
            cols={[
              { label: t('sk.sdg.type.event'), cell: (e) => e.title },
              { label: t('ops.f.date'), cell: (e) => fmt.date(e.on, 'short'), sort: (e) => e.on },
            ]}
          />
        </>
      )}
    </InfoDialog>
  );
}

function GoalDialog({ goal, title, onClose, toast }: { goal: SdgGoal; title: string; onClose: () => void; toast: Toast }) {
  const { t } = useI18n();
  return (
    <InfoDialog title={title} onClose={onClose}>
      <Grid
        testId="sk-goal-items"
        empty={t('sk.sdg.noItems')}
        rows={goal.items}
        cols={[
          { label: t('sk.sdg.type'), cell: (i) => t(`sk.sdg.type.${i.itemType}` as MessageKey) },
          { label: t('ops.f.title'), cell: (i) => i.title },
          { label: t('sk.sdg.note'), cell: (i) => i.note || '-' },
          { label: t('sk.sdg.people'), cell: (i) => i.participation, num: true },
          { label: '', cell: (i) => <ActionButton tone="error" label={t('sk.remove')} run={() => untag(i.id)} onDone={(m) => { toast(m); onClose(); }} /> },
        ]}
      />
    </InfoDialog>
  );
}
