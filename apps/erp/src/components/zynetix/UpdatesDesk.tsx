'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { deleteRelease, createRelease, setBoardChannel, startRollout, stopRollout } from '@/app/(dashboard)/zynetix/panel-actions';
import { Alert, Button, Card, Snackbar } from '@/components/kx';
import { CheckboxField, DataTable, Dialog, FormField, SectionTitle, SelectInput, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { acceptFor, formatBytes, RELEASE_CHANNELS, RELEASE_PLATFORMS, rolloutProgress, stateTone, uploadType, versionOk, type PanelBoard, type PanelRelease, type ReleaseChannel, type ReleasePlatform, type Rollout, type RolloutBoard } from '@/lib/panel';

export type UpdatesBoard = PanelBoard & { updateChannel: ReleaseChannel };

/** Zynetix → Updates: upload a release, roll it out, and follow each board. */
export function UpdatesDesk({ releases, rollouts, boards }: { releases: PanelRelease[]; rollouts: Rollout[]; boards: UpdatesBoard[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [platform, setPlatform] = useState<ReleasePlatform>('android');
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState<ReleaseChannel>('stable');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [rollFor, setRollFor] = useState<PanelRelease | null>(null);

  const upload = () => {
    setError(null);
    if (!versionOk(version)) return setError(t('zx.p.err.version'));
    if (!file) return setError(t('zx.p.err.file'));
    start(async () => {
      const made = await createRelease({ platform, version, channel, notes });
      if (!made.ok) return setError(made.error);
      const res = await fetch(`/api/panel-release/${made.data.id}`, { method: 'PUT', headers: { 'content-type': uploadType(file), 'x-file-name': encodeURIComponent(file.name) }, body: file });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        await deleteRelease(made.data.id);
        return setError(body.message ?? t('error.loadPage'));
      }
      setVersion('');
      setNotes('');
      setFile(null);
      setToast(t('zx.p.uploaded', { version: made.data.version }));
      router.refresh();
    });
  };

  const remove = (r: PanelRelease) =>
    start(async () => {
      const res = await deleteRelease(r.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const columns: Column<PanelRelease>[] = [
    { id: 'version', header: t('zx.p.version'), rowHeader: true, sort: (r) => r.version, cell: (r) => <span className="font-medium">{r.version}</span> },
    { id: 'platform', header: t('zx.p.platform'), sort: (r) => r.platform, cell: (r) => t(`zx.p.platform.${r.platform}`) },
    { id: 'channel', header: t('zx.p.channel'), sort: (r) => r.channel, cell: (r) => <StatusPill tone={r.channel === 'beta' ? 'warning' : 'neutral'}>{t(`zx.p.channel.${r.channel}`)}</StatusPill> },
    { id: 'scope', header: t('zx.p.source'), hideBelow: 'md', cell: (r) => t(`zx.p.scope.${r.scope}`) },
    { id: 'size', header: t('zx.p.size'), align: 'right', hideBelow: 'md', cell: (r) => (r.fileName ? formatBytes(r.fileBytes) : t('zx.p.noFile')) },
    { id: 'created', header: t('zx.p.created'), hideBelow: 'lg', sort: (r) => r.createdAt, cell: (r) => fmt.dateTime(r.createdAt) },
    {
      id: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.fileName && (
            <Button size="small" variant="text" href={`/api/download?kind=panel-release&id=${r.id}`}>
              {t('zx.p.download')}
            </Button>
          )}
          <Button size="small" variant="outlined" disabled={!r.fileName || busy} onClick={() => setRollFor(r)} data-testid="zx-p-rollout">
            {t('zx.p.rollOut')}
          </Button>
          {r.scope === 'institution' && (
            <Button size="small" variant="text" color="error" disabled={busy} onClick={() => remove(r)}>
              {t('zx.p.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6" aria-busy={busy}>
      <Card className="px-5 py-4 max-w-[960px]" data-testid="zx-p-upload">
        <h2 className="m-0 inline-flex items-center gap-2 text-base font-semibold">
          <Upload className="size-5" /> {t('zx.p.upload')}
        </h2>
        {error && (
          <Alert className="mt-3" severity="error">
            {error}
          </Alert>
        )}
        <form
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            upload();
          }}
        >
          <SelectInput label={t('zx.p.platform')} value={platform} onChange={(e) => setPlatform(e.target.value as ReleasePlatform)} options={RELEASE_PLATFORMS.map((p) => ({ value: p, label: t(`zx.p.platform.${p}`) }))} />
          <TextInput label={t('zx.p.version')} value={version} onChange={(e) => setVersion(e.target.value)} helperText={t('zx.p.versionHelp')} slotProps={{ htmlInput: { 'data-testid': 'zx-p-version' } }} />
          <SelectInput label={t('zx.p.channel')} value={channel} onChange={(e) => setChannel(e.target.value as ReleaseChannel)} options={RELEASE_CHANNELS.map((c) => ({ value: c, label: t(`zx.p.channel.${c}`) }))} />
          <div className="md:col-span-2">
            <TextInput label={t('zx.p.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} fullWidth />
          </div>
          <FormField label={t('zx.p.file')}>
            <input type="file" accept={acceptFor(platform)} onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="zx-p-file" />
          </FormField>
          <div className="md:col-span-3">
            <Button type="submit" variant="contained" disabled={busy} data-testid="zx-p-upload-btn">
              {busy ? t('zx.p.uploading') : t('zx.p.uploadBtn')}
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <SectionTitle>{t('zx.p.releases')}</SectionTitle>
        {releases.length ? <DataTable testId="zx-p-releases" label={t('zx.p.releases')} rows={releases} rowId={(r) => r.id} columns={columns} /> : <p className="text-sm text-muted-foreground">{t('zx.p.noReleases')}</p>}
      </section>

      <section>
        <SectionTitle>{t('zx.p.rollouts')}</SectionTitle>
        {rollouts.length ? (
          <div className="grid gap-4">
            {rollouts.map((r) => (
              <RolloutCard key={r.id} rollout={r} onStop={() => start(async () => void (await stopRollout(r.id), router.refresh()))} busy={busy} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('zx.p.noRollouts')}</p>
        )}
      </section>

      <section>
        <SectionTitle>{t('zx.p.channels')}</SectionTitle>
        <p className="mb-2 text-[13px] text-muted-foreground">{t('zx.p.channelsHelp')}</p>
        <div className="grid max-w-[640px] gap-2">
          {boards
            .filter((b) => b.enrolled)
            .map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-4">
                <span>
                  {b.name} <span className="text-xs text-muted-foreground">{[b.platform, b.appVersion].filter(Boolean).join(' · ')}</span>
                </span>
                <SelectInput
                  label={t('zx.p.channel')}
                  value={b.updateChannel}
                  onChange={(e) =>
                    start(async () => {
                      const c = e.target.value as ReleaseChannel;
                      const res = await setBoardChannel(b.id, c);
                      if (!res.ok) return setError(res.error);
                      setToast(t('zx.p.channelSaved', { name: b.name, channel: t(`zx.p.channel.${c}`) }));
                      router.refresh();
                    })
                  }
                  options={RELEASE_CHANNELS.map((c) => ({ value: c, label: t(`zx.p.channel.${c}`) }))}
                />
              </div>
            ))}
        </div>
      </section>

      {rollFor && (
        <RolloutDialog
          release={rollFor}
          boards={boards.filter((b) => b.enrolled && (!b.platform || b.platform === rollFor.platform))}
          onClose={() => setRollFor(null)}
          onDone={() => {
            setRollFor(null);
            setToast(t('zx.p.started'));
            router.refresh();
          }}
        />
      )}
      <Snackbar open={!!toast} message={toast ?? ''} onClose={() => setToast(null)} />
    </div>
  );
}

function RolloutCard({ rollout: r, onStop, busy }: { rollout: Rollout; onStop: () => void; busy: boolean }) {
  const { t, fmt } = useI18n();
  const p = rolloutProgress(r);
  const columns: Column<RolloutBoard>[] = [
    { id: 'name', header: t('zx.p.board'), rowHeader: true, sort: (b) => b.name, cell: (b) => b.name },
    { id: 'state', header: t('zx.p.state'), sort: (b) => b.state, cell: (b) => <StatusPill tone={stateTone(b.state)}>{t(`zx.p.state.${b.state}`)}</StatusPill> },
    { id: 'version', header: t('zx.p.version'), hideBelow: 'md', cell: (b) => b.appVersion ?? '—' },
    { id: 'updated', header: t('zx.p.updated'), hideBelow: 'md', cell: (b) => (b.updatedAt ? fmt.dateTime(b.updatedAt) : '—') },
    { id: 'error', header: t('zx.p.error'), hideBelow: 'lg', cell: (b) => b.error ?? '' },
  ];
  return (
    <Card className="px-5 py-4" data-testid="zx-p-rollout-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {r.release.version} · {t(`zx.p.platform.${r.release.platform}`)}
          </span>
          <StatusPill tone={r.active ? 'success' : 'neutral'}>{t(r.active ? 'zx.p.active' : 'zx.p.stopped')}</StatusPill>
          <span className="text-xs text-muted-foreground">{t(`zx.p.target.${r.target}`)} · {fmt.dateTime(r.createdAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" data-testid="zx-p-progress">
            {t('zx.p.progress', { installed: p.installed, total: p.total })}
            {p.failed ? ` · ${t('zx.p.failedCount', { n: p.failed })}` : ''}
          </span>
          {r.active && (
            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={onStop}>
              {t('zx.p.stop')}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary" style={{ width: `${p.percent}%` }} />
      </div>
      {r.boards.length > 0 && (
        <div className="mt-3">
          <DataTable label={t('zx.p.rollouts')} rows={r.boards} rowId={(b) => b.deviceId} columns={columns} />
        </div>
      )}
    </Card>
  );
}

function RolloutDialog({ release, boards, onClose, onDone }: { release: PanelRelease; boards: UpdatesBoard[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [target, setTarget] = useState<'all' | 'selected'>('all');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await startRollout(release.id, target, chosen);
      if (!res.ok) return setError(res.error);
      onDone();
    });
  return (
    <Dialog
      title={t('zx.p.rolloutTitle', { version: release.version })}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            {t('zx.p.cancel')}
          </Button>
          <Button variant="contained" onClick={go} disabled={busy || (target === 'selected' && !chosen.length)} data-testid="zx-p-start">
            {t('zx.p.start')}
          </Button>
        </>
      }
    >
      {error && (
        <Alert className="mb-3" severity="error">
          {error}
        </Alert>
      )}
      <SelectInput
        label={t('zx.p.state')}
        value={target}
        onChange={(e) => setTarget(e.target.value as 'all' | 'selected')}
        options={[
          { value: 'all', label: t('zx.p.targetAll', { platform: t(`zx.p.platform.${release.platform}`) }) },
          { value: 'selected', label: t('zx.p.targetSelected') },
        ]}
      />
      {target === 'selected' && (
        <div className="mt-3 grid gap-1">
          {boards.length === 0 && <p className="text-sm text-muted-foreground">{t('zx.p.noBoardsFor')}</p>}
          {boards.map((b) => (
            <CheckboxField
              key={b.id}
              label={`${b.name}${b.appVersion ? ` (${b.appVersion})` : ''}`}
              checked={chosen.includes(b.id)}
              onChange={(on) => setChosen((c) => (on ? [...c, b.id] : c.filter((x) => x !== b.id)))}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}
