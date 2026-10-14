'use client';
import { History, Scale } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { installTemplate, saveOverrides, selectAffiliation, setProgrammeScheme } from '@/app/(dashboard)/settings/affiliation/actions';
import { Alert, Button } from '@/components/kx';
import { Card, DataTable, Dialog, EmptyState, FormActions, FormGrid, SelectInput, StatusPill, SwitchField, TabPanel, Tabs, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { buildOverrides, formValue, getPath, groupCatalogue, OVERRIDE_FIELDS, RULE_SECTIONS, showValue, type AffiliationOverview, type CatalogueProfile, type HistoryRow, type OverridePath, type RulesView } from '@/lib/affiliation';
import { formatDateTime } from '@/lib/dates';

type Tab = 'rules' | 'programmes' | 'overrides' | 'compare' | 'history' | 'sources';
const TABS: Tab[] = ['rules', 'programmes', 'overrides', 'compare', 'history', 'sources'];
type Programme = AffiliationOverview['programmes'][number];

/** Profile and scheme selects (the setup wizard step, and a programme's own scheme). */
function ProfilePicker({ catalogue, profile, scheme, onChange }: { catalogue: CatalogueProfile[]; profile: string; scheme: string; onChange: (profile: string, scheme: string) => void }) {
  const { t } = useI18n();
  const groups = groupCatalogue(catalogue);
  const chosen = catalogue.find((p) => p.code === profile);
  return (
    <FormGrid cols={2}>
      <SelectInput
        label={t('aff.profile')}
        value={profile}
        empty={t('aff.choose')}
        options={groups.flatMap((g) => g.profiles.map((p) => ({ value: p.code, label: `${t(`aff.kind.${g.kind}` as MessageKey)}: ${p.name}` })))}
        onChange={(e) => {
          const next = catalogue.find((p) => p.code === e.target.value);
          onChange(e.target.value, next?.defaultScheme ?? '');
        }}
        data-testid="aff-profile"
      />
      <SelectInput
        label={t('aff.scheme')}
        value={scheme}
        disabled={!chosen}
        options={(chosen?.schemes ?? []).map((s) => ({ value: s.code, label: `${s.name} (${t('aff.effective', { from: s.effectiveFrom })})` }))}
        onChange={(e) => onChange(profile, e.target.value)}
        data-testid="aff-scheme"
      />
    </FormGrid>
  );
}

/** Settings > Affiliation: choose the university or board, set schemes per programme, read and change the rules. */
export function AffiliationAdmin({ overview, rules, history, programId, tab: initialTab }: { overview: AffiliationOverview; rules: RulesView | null; history: HistoryRow[]; programId: string | null; tab: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sel = overview.selected;
  const [profile, setProfile] = useState(sel?.profileCode ?? '');
  const [scheme, setScheme] = useState(sel?.schemeCode ?? '');
  const [tab, setTab] = useState<Tab>((TABS as string[]).includes(initialTab) ? (initialTab as Tab) : 'rules');
  const [editing, setEditing] = useState<Programme | null>(null);
  const [progPick, setProgPick] = useState({ profile: '', scheme: '' });
  const [reason, setReason] = useState('');
  const [bad, setBad] = useState<OverridePath[]>([]);
  const ruleValues = rules?.rules ?? {};
  const [form, setForm] = useState<Partial<Record<OverridePath, string>>>(() => Object.fromEntries(OVERRIDE_FIELDS.map((f) => [f.path, formValue(getPath(ruleValues, f.path))])));
  const programme = overview.programmes.find((g) => g.programId === programId) ?? null;
  // Overrides of a programme that follows the institution are the institution's.
  const overrideTarget = programme?.follows === 'own' ? programme.programId : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, message: MessageKey = 'aff.saved', after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? t('aff.err.input')));
      if (res.ok) {
        toast.success(t(message));
        after?.();
        router.refresh();
      }
    });

  const go = (next: { programId?: string | null; tab?: Tab }) => {
    const q = new URLSearchParams();
    const pid = next.programId === undefined ? programId : next.programId;
    if (pid) q.set('programId', pid);
    q.set('tab', next.tab ?? tab);
    router.push(`/settings/affiliation?${q.toString()}`);
  };

  const saveRules = () => {
    if (!rules) return;
    const built = buildOverrides(rules.preset, form);
    if (!built.ok) {
      setBad(built.bad);
      setError(t('aff.ov.bad'));
      return;
    }
    setBad([]);
    run(() => saveOverrides(overrideTarget, built.overrides, reason), 'aff.saved', () => setReason(''));
  };

  const programmeColumns: Column<Programme>[] = useMemo(
    () => [
      { id: 'name', header: t('aff.prog.name'), cell: (r) => r.name, sort: (r) => r.name, rowHeader: true },
      { id: 'follows', header: t('aff.prog.follows'), cell: (r) => <StatusPill tone={r.follows === 'own' ? 'info' : 'neutral'}>{t(r.follows === 'own' ? 'aff.prog.own' : 'aff.prog.institution')}</StatusPill>, sort: (r) => r.follows },
      { id: 'scheme', header: t('aff.prog.scheme'), cell: (r) => (r.schemeName ? `${r.profileName ?? ''} · ${r.schemeName}` : '—'), sort: (r) => r.schemeName ?? '' },
      {
        id: 'actions',
        header: '',
        csv: false,
        align: 'right',
        cell: (r) => (
          <span className="inline-flex gap-2">
            <Button size="small" variant="outlined" onClick={() => { setEditing(r); setProgPick({ profile: r.profileCode ?? '', scheme: r.schemeCode ?? '' }); }}>
              {t('aff.prog.set')}
            </Button>
            {r.follows === 'own' && (
              <Button size="small" variant="text" disabled={pending} onClick={() => run(() => setProgrammeScheme(r.programId, null, null))}>
                {t('aff.prog.reset')}
              </Button>
            )}
            <Button size="small" variant="text" onClick={() => go({ programId: r.programId, tab: 'rules' })}>
              {t('aff.tab.rules')}
            </Button>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, pending, programId, tab],
  );

  return (
    <div data-testid="affiliation-admin" aria-busy={pending}>
      {error && (
        <Alert className="mb-4" severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="mb-6" title={sel ? t('aff.current') : t('aff.none')} subtitle={sel ? undefined : t('aff.noneHelp')} testId="aff-picker">
        {sel && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <b className="text-[15px]">{sel.name}</b>
            <span className="text-muted-foreground">· {sel.schemeName}</span>
            <StatusPill tone={sel.ruleAuthority === 'university' ? 'info' : 'neutral'}>{t(`aff.authority.${sel.ruleAuthority}` as MessageKey)}</StatusPill>
            <StatusPill>{t('aff.version', { n: sel.version })}</StatusPill>
            {Object.keys(sel.overrides).length > 0 && <StatusPill tone="warning">{t('aff.overridden')}</StatusPill>}
          </div>
        )}
        {sel && !sel.overridesValid && (
          <Alert className="mb-4" severity="warning">
            {t('aff.overridesInvalid')}
          </Alert>
        )}
        <ProfilePicker catalogue={overview.catalogue} profile={profile} scheme={scheme} onChange={(p, s) => { setProfile(p); setScheme(s); }} />
        {sel && (profile !== sel.profileCode || scheme !== sel.schemeCode) && Object.keys(sel.overrides).length > 0 && <p className="mt-3 text-[12.5px] text-amber-ink">{t('aff.changeWarn')}</p>}
        <FormActions>
          <Button variant="contained" disabled={pending || !profile || (profile === sel?.profileCode && scheme === sel?.schemeCode)} onClick={() => run(() => selectAffiliation(profile, scheme || null))} data-testid="aff-save">
            {t('aff.save')}
          </Button>
        </FormActions>
      </Card>

      {sel && rules && (
        <>
          <Tabs value={tab} onChange={setTab} label={t('nav.affiliation')} items={TABS.map((v) => ({ value: v, label: t(`aff.tab.${v}` as MessageKey) }))} />

          <TabPanel value="rules" active={tab}>
            <div className="my-4 max-w-md">
              <SelectInput
                label={t('aff.rulesFor')}
                value={programId ?? ''}
                empty={t('aff.wholeInstitution')}
                options={overview.programmes.map((g) => ({ value: g.programId, label: g.name }))}
                onChange={(e) => go({ programId: e.target.value || null })}
              />
            </div>
            <p className="mb-3 text-[13px] text-muted-foreground">
              {rules.profile.name} · {rules.scheme.name} · {t(`aff.authority.${rules.scheme.ruleAuthority}` as MessageKey)}
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {RULE_SECTIONS.map((s) => {
                const block = rules.description.find((d) => d.section === s);
                if (!block) return null;
                return (
                  <Card key={s} title={t(`aff.sec.${s}` as MessageKey)} testId={`aff-sec-${s}`}>
                    <ul className="m-0 list-disc pl-5 text-[13px] leading-[20px]">
                      {block.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </TabPanel>

          <TabPanel value="programmes" active={tab}>
            <p className="my-3 text-[13px] text-muted-foreground">{t('aff.prog.help')}</p>
            <DataTable columns={programmeColumns} rows={overview.programmes} rowId={(r) => r.programId} label={t('aff.tab.programmes')} testId="aff-programmes" />
            <Card className="mt-4" title={t('aff.template')} subtitle={t('aff.templateHelp')}>
              <Button variant="outlined" disabled={pending} onClick={() => run(() => installTemplate(programme?.follows === 'own' ? programme.programId : null), 'aff.templateDone')}>
                {t('aff.template')}
              </Button>
            </Card>
          </TabPanel>

          <TabPanel value="overrides" active={tab}>
            <Card className="mt-4" title={programme ? programme.name : t('aff.wholeInstitution')} subtitle={programme?.follows === 'own' ? t('aff.ov.forProgramme') : t('aff.ov.help')} testId="aff-overrides">
              <FormGrid cols={2}>
                {OVERRIDE_FIELDS.map((f) => {
                  const label = t(`aff.ov.${f.path}` as MessageKey);
                  const preset = getPath(rules.preset, f.path);
                  const helper = t('aff.ov.default', { v: f.kind === 'boolean' ? t(preset ? 'aff.yes' : 'aff.no') : f.kind === 'rounding' ? t(`aff.round.${String(preset)}` as MessageKey) : showValue(preset) });
                  if (f.kind === 'boolean')
                    return (
                      <div key={f.path}>
                        <SwitchField label={label} checked={form[f.path] === 'true'} onChange={(on) => setForm({ ...form, [f.path]: String(on) })} />
                        <p className="m-0 text-[12px] text-muted-foreground">{helper}</p>
                      </div>
                    );
                  if (f.kind === 'rounding')
                    return <SelectInput key={f.path} label={label} helper={helper} value={form[f.path] ?? 'half_up'} options={(['half_up', 'truncate'] as const).map((v) => ({ value: v, label: t(`aff.round.${v}`) }))} onChange={(e) => setForm({ ...form, [f.path]: e.target.value })} />;
                  return <TextInput key={f.path} label={label} helper={helper} error={bad.includes(f.path)} value={form[f.path] ?? ''} inputMode="decimal" onChange={(e) => setForm({ ...form, [f.path]: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) })} />;
                })}
              </FormGrid>
              <div className="mt-4">
                <TextInput label={t('aff.ov.reason')} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} data-testid="aff-reason" />
              </div>
              <FormActions>
                <Button variant="contained" disabled={pending || reason.trim().length < 3} onClick={saveRules} data-testid="aff-overrides-save">
                  {t('aff.ov.save')}
                </Button>
              </FormActions>
            </Card>
          </TabPanel>

          <TabPanel value="compare" active={tab}>
            <p className="my-3 text-[13px] text-muted-foreground">{t('aff.cmp.help')}</p>
            {rules.differences.length === 0 ? (
              <EmptyState icon={<Scale />} title={t('aff.cmp.none')} />
            ) : (
              <DataTable
                columns={[
                  { id: 'path', header: t('aff.cmp.path'), cell: (r) => (OVERRIDE_FIELDS.some((f) => f.path === r.path) ? t(`aff.ov.${r.path}` as MessageKey) : r.path), sort: (r) => r.path, rowHeader: true },
                  { id: 'before', header: t('aff.cmp.preset'), cell: (r) => showValue(r.before) },
                  { id: 'after', header: t('aff.cmp.now'), cell: (r) => <b>{showValue(r.after)}</b> },
                ]}
                rows={rules.differences}
                rowId={(r) => r.path}
                label={t('aff.tab.compare')}
                testId="aff-compare"
              />
            )}
          </TabPanel>

          <TabPanel value="history" active={tab}>
            {history.length === 0 ? (
              <EmptyState icon={<History />} title={t('aff.hist.empty')} />
            ) : (
              <DataTable
                columns={[
                  { id: 'at', header: t('aff.hist.when'), cell: (r) => formatDateTime(r.at, 'Asia/Kolkata', true, locale), sort: (r) => r.at },
                  { id: 'who', header: t('aff.hist.who'), cell: (r) => r.actor ?? '—', sort: (r) => r.actor ?? '' },
                  {
                    id: 'what',
                    header: t('aff.hist.what'),
                    cell: (r) => (
                      <div>
                        <b className="block">{t(`aff.hist.${r.action.replace('affiliation.', '')}` as MessageKey)}</b>
                        {Object.entries(r.data?.changes ?? {}).map(([k, v]) => (
                          <span key={k} className="block text-[12.5px] text-muted-foreground">
                            {OVERRIDE_FIELDS.some((f) => f.path === k) ? t(`aff.ov.${k}` as MessageKey) : k}: {showValue(v.before)} → {showValue(v.after)}
                          </span>
                        ))}
                      </div>
                    ),
                    csv: (r) => `${r.action} ${JSON.stringify(r.data?.changes ?? {})}`,
                  },
                  { id: 'reason', header: t('aff.hist.reason'), cell: (r) => r.data?.reason ?? '', sort: (r) => r.data?.reason ?? '' },
                ]}
                rows={history}
                rowId={(r) => String(r.id)}
                label={t('aff.tab.history')}
                exportName="affiliation-history"
                testId="aff-history"
              />
            )}
          </TabPanel>

          <TabPanel value="sources" active={tab}>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title={t('aff.src.sources')} subtitle={t('aff.src.revised', { date: rules.scheme.revisedOn })}>
                <ul className="m-0 list-disc pl-5 text-[13px] leading-[20px]">
                  {rules.scheme.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
              {rules.scheme.notes.length > 0 && (
                <Card title={t('aff.src.notes')} tone="default">
                  <ul className="m-0 list-disc pl-5 text-[13px] leading-[20px]">
                    {rules.scheme.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </TabPanel>
        </>
      )}

      {editing && (
        <Dialog
          title={`${t('aff.prog.set')}: ${editing.name}`}
          size="md"
          busy={pending}
          onClose={() => setEditing(null)}
          actions={
            <Button variant="contained" disabled={pending || !progPick.profile} onClick={() => run(() => setProgrammeScheme(editing.programId, progPick.profile, progPick.scheme || null), 'aff.saved', () => setEditing(null))}>
              {t('aff.save')}
            </Button>
          }
        >
          <ProfilePicker catalogue={overview.catalogue} profile={progPick.profile} scheme={progPick.scheme} onChange={(p, s) => setProgPick({ profile: p, scheme: s })} />
        </Dialog>
      )}
    </div>
  );
}
