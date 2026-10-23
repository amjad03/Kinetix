'use client';
import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { getLauncher, saveLauncher } from '@/app/(dashboard)/zynetix/panel-actions';
import { Alert, Button, Card, Chip, IconButton, Snackbar } from '@/components/kx';
import { SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { LAUNCHER_PRESETS, launcherProblem, type LauncherApp, type PanelBoard } from '@/lib/panel';

/** Zynetix → Panel home: the apps an Android panel's home shows next to the Zynetix board. */
export function LauncherDesk({ initial, boards }: { initial: LauncherApp[]; boards: PanelBoard[] }) {
  const { t } = useI18n();
  const [scope, setScope] = useState('');
  const [apps, setApps] = useState<LauncherApp[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const pick = (s: string) => {
    setScope(s);
    setError(null);
    start(async () => {
      const res = await getLauncher(s || null);
      if (!res.ok) return setError(res.error);
      setApps(res.data.apps);
    });
  };
  const edit = (i: number, patch: Partial<LauncherApp>) => setApps((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setApps((a) => {
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      const n = [...a];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = () => {
    const problem = launcherProblem(apps);
    if (problem) return setError(t(problem));
    setError(null);
    start(async () => {
      const res = await saveLauncher(scope || null, apps);
      if (!res.ok) return setError(res.error);
      setApps(res.data.apps);
      setToast(t('zx.p.home.saved'));
    });
  };

  return (
    <Card className="px-5 py-4 max-w-[960px]" data-testid="zx-p-launcher" aria-busy={busy}>
      <h2 className="m-0 inline-flex items-center gap-2 text-base font-semibold">
        <LayoutGrid className="size-5" /> {t('nav.zxPanelHome')}
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{t('zx.p.home.help')}</p>
      <div className="mt-3 max-w-[420px]">
        <SelectInput label={t('zx.p.home.scope')} value={scope} onChange={(e) => pick(e.target.value)} options={[{ value: '', label: t('zx.p.home.institution') }, ...boards.filter((b) => b.enrolled).map((b) => ({ value: b.id, label: b.name }))]} />
      </div>
      {error && (
        <Alert className="mt-3" severity="error">
          {error}
        </Alert>
      )}
      <p className="mt-4 text-sm font-medium">{t('zx.p.home.main')}</p>
      <div className="mt-2 grid gap-3">
        {apps.length === 0 && <p className="text-sm text-muted-foreground">{t('zx.p.home.empty')}</p>}
        {apps.map((a, i) => (
          <div key={i} className="grid grid-cols-1 items-start gap-2 md:grid-cols-[1fr_1.3fr_1.3fr_auto]" data-testid="zx-p-app-row">
            <TextInput label={t('zx.p.home.label')} value={a.label} onChange={(e) => edit(i, { label: e.target.value })} />
            <TextInput label={t('zx.p.home.package')} value={a.package} onChange={(e) => edit(i, { package: e.target.value })} slotProps={{ htmlInput: { spellCheck: false } }} />
            <TextInput label={t('zx.p.home.icon')} value={a.iconUrl ?? ''} onChange={(e) => edit(i, { iconUrl: e.target.value || null })} />
            <div className="flex gap-1">
              <IconButton aria-label={t('zx.p.home.up')} onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton aria-label={t('zx.p.home.down')} onClick={() => move(i, 1)} disabled={i === apps.length - 1}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton aria-label={t('zx.p.home.remove')} onClick={() => setApps((x) => x.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t('zx.p.home.presets')}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {LAUNCHER_PRESETS.filter((p) => !apps.some((a) => a.package === p.package)).map((p) => (
          <Chip key={p.package} size="small" label={p.label} onClick={() => setApps((a) => [...a, p])} data-testid="zx-p-preset" />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outlined" startIcon={<Plus className="size-4" />} onClick={() => setApps((a) => [...a, { package: '', label: '', iconUrl: null }])}>
          {t('zx.p.home.add')}
        </Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="zx-p-save">
          {t('zx.p.home.save')}
        </Button>
      </div>
      <Snackbar open={!!toast} message={toast ?? ''} onClose={() => setToast(null)} />
    </Card>
  );
}
