'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import {
  addAchievement, addBearer, addEvidence, addMedia, allAchievements, approveMedia, clubAchievementsOf, clubBearers, committeeEvidence, endBearer, eventMedia, issueCertificates, removeEvidence, removeMedia,
} from '@/app/(dashboard)/campus-life/extras-actions';
import { ActionButton, FormDialog, Grid, Pill } from '@/components/ops/kit';
import { FileFormDialog, SectionHead, useLoad } from '@/components/pathways-b/common';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { CampusEvent, ClubMember, Committee, Meeting } from '@/lib/clife';
import {
  ACHIEVEMENT_LEVELS, downloadPath, EVIDENCE_KINDS, MEDIA_TYPES, sizeLabel,
  type AchievementLogRow, type ClubAchievement, type EvidenceRow, type MediaRow, type OfficeBearer,
} from '@/lib/pathways-b';

type Toast = (m: string) => void;
const levels = (t: (k: MessageKey) => string) => ACHIEVEMENT_LEVELS.map((l) => ({ value: l, label: t(`pwb.level.${l}` as MessageKey) }));

/** Office bearers and the achievements log of one club, shown under its members and activities. */
export function ClubExtras({ clubId, members, toast }: { clubId: string; members: ClubMember[]; toast: Toast }) {
  const { t, fmt } = useI18n();
  const bearers = useLoad<OfficeBearer[]>(() => clubBearers(clubId));
  const wins = useLoad<ClubAchievement[]>(() => clubAchievementsOf(clubId));
  const [dlg, setDlg] = useState<'bearer' | 'win' | null>(null);
  const active = members.filter((m) => m.status === 'active');
  const roster = active.map((m) => ({ studentId: m.studentId, fullName: m.fullName, rollNo: m.rollNo }));
  const refresh = (m: string) => {
    toast(m);
    bearers.reload();
    wins.reload();
  };
  const close = (m?: string) => {
    setDlg(null);
    if (m) refresh(m);
  };
  return (
    <>
      <SectionHead title={t('pwb.cl.bearers')}>
        <Button variant="outlined" size="small" disabled={active.length === 0} onClick={() => setDlg('bearer')} data-testid="pwb-add-bearer">{t('pwb.cl.addBearer')}</Button>
      </SectionHead>
      <Grid
        testId="pwb-bearers"
        empty={t('pwb.cl.noBearers')}
        rows={bearers.data ?? []}
        cols={[
          { label: t('pwb.cl.post'), cell: (b) => b.post, sort: (b) => b.post },
          { label: t('ops.f.student'), cell: (b) => b.fullName, sort: (b) => b.fullName },
          { label: t('pwb.cl.from'), cell: (b) => fmt.date(b.fromOn, 'short'), sort: (b) => b.fromOn },
          { label: t('pwb.cl.to'), cell: (b) => (b.toOn ? fmt.date(b.toOn, 'short') : t('cl.ongoing')), sort: (b) => b.toOn ?? '9999' },
          { label: '', cell: (b) => (b.active ? <ActionButton tone="error" label={t('pwb.cl.endTerm')} run={() => endBearer(b.id)} onDone={refresh} /> : <Pill label={t('cl.ended')} />) },
        ]}
      />
      <SectionHead title={t('pwb.cl.wins')}>
        <Button variant="outlined" size="small" onClick={() => setDlg('win')} data-testid="pwb-add-win">{t('pwb.cl.addWin')}</Button>
      </SectionHead>
      <Grid
        testId="pwb-wins"
        empty={t('pwb.cl.noWins')}
        rows={wins.data ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (w) => w.title, sort: (w) => w.title },
          { label: t('pwb.cl.level'), cell: (w) => t(`pwb.level.${w.level}` as MessageKey), sort: (w) => ACHIEVEMENT_LEVELS.indexOf(w.level) },
          { label: t('pwb.cl.position'), cell: (w) => w.position || '-' },
          { label: t('ops.f.date'), cell: (w) => fmt.date(w.achievedOn, 'short'), sort: (w) => w.achievedOn },
          { label: t('pwb.cl.participants'), cell: (w) => w.participants.map((p) => p.name).join(', ') || '-' },
        ]}
      />
      {dlg === 'bearer' && (
        <FormDialog
          title={t('pwb.cl.addBearer')}
          onSubmit={(v) => addBearer(clubId, v)}
          onClose={close}
          fields={[
            { name: 'studentId', label: t('ops.f.student'), kind: 'select', required: true, options: active.map((m) => ({ value: m.studentId, label: `${m.fullName} (${m.rollNo})` })) },
            { name: 'post', label: t('pwb.cl.post'), required: true },
            { name: 'fromOn', label: t('pwb.cl.from'), kind: 'date', required: true },
            { name: 'toOn', label: t('pwb.cl.to'), kind: 'date' },
          ]}
        />
      )}
      {dlg === 'win' && (
        <FormDialog
          title={t('pwb.cl.addWin')}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.cl.participantsHelp')}</Typography>}
          onSubmit={(v) => addAchievement(clubId, roster, v)}
          onClose={close}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'level', label: t('pwb.cl.level'), kind: 'select', init: 'institutional', options: levels(t) },
            { name: 'position', label: t('pwb.cl.position') },
            { name: 'achievedOn', label: t('ops.f.date'), kind: 'date', required: true },
            { name: 'participants', label: t('pwb.cl.participants'), kind: 'multiline' },
            { name: 'description', label: t('cl.description'), kind: 'multiline' },
          ]}
        />
      )}
    </>
  );
}

/** Evidence files and links of one committee, and its report pack PDF for a date range. */
export function CommitteeExtras({ committee, meetings, toast }: { committee: Committee; meetings: Meeting[]; toast: Toast }) {
  const { t, fmt } = useI18n();
  const evidence = useLoad<EvidenceRow[]>(() => committeeEvidence(committee.id));
  const [adding, setAdding] = useState(false);
  const year = new Date().getFullYear();
  const [range, setRange] = useState({ from: `${year}-01-01`, to: new Date().toISOString().slice(0, 10) });
  const meetingName = (id: string | null) => meetings.find((m) => m.id === id)?.title ?? '-';
  const refresh = (m: string) => {
    toast(m);
    evidence.reload();
  };
  return (
    <>
      <SectionHead title={t('pwb.cm.evidence')}>
        <Button variant="outlined" size="small" onClick={() => setAdding(true)} data-testid="pwb-add-evidence">{t('pwb.cm.addEvidence')}</Button>
      </SectionHead>
      <Grid
        testId="pwb-evidence"
        empty={t('pwb.cm.noEvidence')}
        rows={evidence.data ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (e) => e.title, sort: (e) => e.title },
          { label: t('pwb.cm.kind'), cell: (e) => t(`pwb.ev.${e.kind}` as MessageKey), sort: (e) => e.kind },
          { label: t('pwb.cm.meeting'), cell: (e) => meetingName(e.meetingId) },
          { label: t('pwb.cm.what'), cell: (e) => (e.url ? t('pwb.cm.link') : e.sizeBytes ? sizeLabel(e.sizeBytes) : '-') },
          { label: t('ops.f.date'), cell: (e) => fmt.date(e.createdAt.slice(0, 10), 'short'), sort: (e) => e.createdAt },
          {
            label: '',
            cell: (e) => (
              <>
                {e.url ? <Button size="small" href={e.url} target="_blank" rel="noreferrer">{t('pwb.open')}</Button> : <Button size="small" href={downloadPath('committee-evidence', e.id)}>{t('pwb.download')}</Button>}
                <ActionButton tone="error" label={t('pwb.delete')} run={() => removeEvidence(e.id)} onDone={refresh} />
              </>
            ),
          },
        ]}
      />
      <SectionHead title={t('pwb.cm.pack')} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('pwb.cm.packHelp')}</Typography>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <FormField label={t('pwb.cm.packFrom')}>
          <TextInput type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </FormField>
        <FormField label={t('pwb.cm.packTo')}>
          <TextInput type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </FormField>
        <Button variant="contained" href={downloadPath('report-pack', committee.id, { from: range.from, to: range.to })} disabled={!range.from || !range.to} data-testid="pwb-pack">{t('pwb.cm.packDownload')}</Button>
      </Stack>
      {adding && (
        <FileFormDialog
          title={t('pwb.cm.addEvidence')}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.cm.evidenceHelp')}</Typography>}
          onSubmit={(v, file) => addEvidence(committee.id, v, file)}
          onClose={(m) => {
            setAdding(false);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'title', label: t('ops.f.title') },
            { name: 'kind', label: t('pwb.cm.kind'), kind: 'select', init: 'document', options: EVIDENCE_KINDS.map((k) => ({ value: k, label: t(`pwb.ev.${k}` as MessageKey) })) },
            { name: 'meetingId', label: t('pwb.cm.meeting'), kind: 'select', options: [{ value: '', label: t('ops.none') }, ...meetings.map((m) => ({ value: m.id, label: `${m.title} (${m.meetingOn})` }))] },
            { name: 'url', label: t('pwb.cm.url') },
          ]}
        />
      )}
    </>
  );
}

/** The achievements log across all clubs, filtered by level. */
export function AchievementsTab() {
  const { t } = useI18n();
  const [level, setLevel] = useState('');
  return (
    <>
      <Stack direction="row" sx={{ mb: 2 }}>
        <FormField label={t('pwb.cl.level')}>
          <TextInput select value={level} onChange={(e) => setLevel(e.target.value)} sx={{ minWidth: 200 }} slotProps={{ select: { displayEmpty: true } }} data-testid="pwb-level">
            <MenuItem value="">{t('pwb.cl.allLevels')}</MenuItem>
            {levels(t).map((l) => (
              <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
            ))}
          </TextInput>
        </FormField>
      </Stack>
      <AchievementsTable key={level} level={level} />
    </>
  );
}

function AchievementsTable({ level }: { level: string }) {
  const { t, fmt } = useI18n();
  const log = useLoad<AchievementLogRow[]>(() => allAchievements(level || undefined));
  return (
    <>
      {log.error && <Typography color="error">{log.error}</Typography>}
      <Grid
        testId="pwb-achievements"
        empty={t('pwb.cl.noWins')}
        rows={log.data ?? []}
        exportName="achievements"
        cols={[
          { label: t('cl.col.club'), cell: (w) => w.club, sort: (w) => w.club },
          { label: t('ops.f.title'), cell: (w) => w.title, sort: (w) => w.title },
          { label: t('pwb.cl.level'), cell: (w) => t(`pwb.level.${w.level}` as MessageKey), sort: (w) => ACHIEVEMENT_LEVELS.indexOf(w.level) },
          { label: t('pwb.cl.position'), cell: (w) => w.position || '-' },
          { label: t('ops.f.date'), cell: (w) => fmt.date(w.achievedOn, 'short'), sort: (w) => w.achievedOn },
          { label: t('pwb.cl.participants'), cell: (w) => w.participants.map((p) => p.name).join(', ') || '-' },
        ]}
      />
    </>
  );
}

/** Attendance certificates and the media gallery of one event. */
export function EventExtras({ event, toast }: { event: CampusEvent; toast: Toast }) {
  const { t } = useI18n();
  const media = useLoad<MediaRow[]>(() => eventMedia(event.id));
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const refresh = (m: string) => {
    toast(m);
    media.reload();
  };
  return (
    <>
      <SectionHead title={t('pwb.ev.certs')}>
        <Button
          variant="outlined"
          size="small"
          disabled={pending || event.checkedIn === 0}
          data-testid="pwb-certs"
          onClick={() =>
            start(async () => {
              const res = await issueCertificates(event.id);
              toast(res.ok ? t('pwb.ev.certsDone', { issued: res.data.issued, had: res.data.alreadyHad }) : res.error);
            })
          }
        >
          {t('pwb.ev.issueCerts')}
        </Button>
      </SectionHead>
      <Typography variant="body2" color="text.secondary">{event.checkedIn === 0 ? t('pwb.ev.certsNone') : t('pwb.ev.certsHelp', { n: event.checkedIn })}</Typography>
      <SectionHead title={t('pwb.ev.gallery')}>
        <Button variant="outlined" size="small" onClick={() => setAdding(true)} data-testid="pwb-add-media">{t('pwb.ev.addMedia')}</Button>
      </SectionHead>
      {(media.data ?? []).length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('pwb.ev.noMedia')}</Typography>
      ) : (
        <Box data-testid="pwb-gallery" sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {(media.data ?? []).map((m) => (
            <Stack key={m.id} spacing={0.5} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: 2, p: 1 }}>
              {m.contentType?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={downloadPath('event-media', m.id)} alt={m.caption || t('pwb.ev.photo')} loading="lazy" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <Button size="small" href={m.url ?? downloadPath('event-media', m.id)} target="_blank" rel="noreferrer">{m.kind === 'video' ? t('pwb.ev.video') : t('pwb.open')}</Button>
              )}
              <Typography variant="body2">{m.caption || '-'}</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {!m.approved && <Pill warn label={t('pwb.ev.waiting')} />}
                {!m.approved && <ActionButton label={t('pwb.ev.approve')} run={() => approveMedia(m.id)} onDone={refresh} />}
                <ActionButton tone="error" label={t('pwb.delete')} run={() => removeMedia(m.id)} onDone={refresh} />
              </Stack>
            </Stack>
          ))}
        </Box>
      )}
      {adding && (
        <FileFormDialog
          title={t('pwb.ev.addMedia')}
          allowed={MEDIA_TYPES}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.ev.mediaHelp')}</Typography>}
          onSubmit={(v, file) => addMedia(event.id, v, file)}
          onClose={(m) => {
            setAdding(false);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'caption', label: t('pwb.ev.caption') },
            { name: 'kind', label: t('pwb.cm.kind'), kind: 'select', init: 'photo', options: [{ value: 'photo', label: t('pwb.ev.photo') }, { value: 'video', label: t('pwb.ev.video') }] },
            { name: 'url', label: t('pwb.cm.url') },
          ]}
        />
      )}
    </>
  );
}
