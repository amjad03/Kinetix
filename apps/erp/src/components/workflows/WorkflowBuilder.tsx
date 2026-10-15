'use client';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { AlertTriangle, Bell, Check, ChevronLeft, FlaskConical, GitBranch, History, Maximize2, Minus, Pause, Play, Plus, Save, ShieldCheck, Trash2, Workflow, X, Zap } from 'lucide-react';
import { discardDraft, publishWorkflow, saveDraft, setWorkflowActive, testWorkflow } from '@/app/(dashboard)/workflows/builder/actions';
import { Button } from '@/components/kx';
import { SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import {
  APPROVER_ROLES,
  BRANCH_OPS,
  blankNode,
  CHANNELS,
  countNodes,
  findNode,
  formatValue,
  insertNode,
  MODULES,
  NOTIFY_WHEN,
  parseValue,
  removeNode,
  TEMPLATES,
  TRIGGER_SOURCES,
  updateNode,
  validateGraph,
  type AnyNode,
  type Approver,
  type BuilderGraph,
  type BuilderNode,
  type GraphIssue,
  type Lane,
  type TestPathStep,
  type WorkflowDetail,
} from '@/lib/workflow-builder';

const KIND: Record<AnyNode['type'], { icon: ReactNode; tile: string }> = {
  trigger: { icon: <Zap />, tile: 'bg-teal-soft text-teal-ink' },
  condition: { icon: <GitBranch />, tile: 'bg-amber-soft text-amber-ink' },
  approval: { icon: <ShieldCheck />, tile: 'bg-blue-soft text-blue-ink' },
  notify: { icon: <Bell />, tile: 'bg-orange-soft text-orange-ink' },
};
const OP_KEY: Record<string, string> = { '>': 'gt', '>=': 'ge', '<': 'lt', '<=': 'le', '==': 'eq', '!=': 'ne', in: 'in' };
const STATUS_TONE = { active: 'success', draft: 'warning', paused: 'neutral' } as const;
const hours = (s: string) => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s)))) as number | null;

/** The visual builder: a canvas of nodes (zoom, pan, add on any connector), a side panel, validation, draft and publish. */
export function WorkflowBuilder({ initial }: { initial: WorkflowDetail }) {
  const { t } = useI18n();
  const toast = useToast();
  const [graph, setGraph] = useState<BuilderGraph>(initial.graph);
  const [name, setName] = useState(initial.name);
  const [module, setModule] = useState(initial.module);
  const [version, setVersion] = useState(initial.version);
  const [status, setStatus] = useState(initial.status);
  const [published, setPublished] = useState(initial.publishedVersion);
  const [hasDraft, setHasDraft] = useState(initial.hasDraft);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<string | null>(initial.graph.trigger.id);
  const [zoom, setZoom] = useState(1);
  const [addAt, setAddAt] = useState<{ lane: Lane; index: number; key: string } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testAmount, setTestAmount] = useState('');
  const [testPayload, setTestPayload] = useState<Record<string, string>>({});
  const [path, setPath] = useState<TestPathStep[] | null>(null);
  const [busy, start] = useTransition();
  const fieldKeys = initial.fields.map((f) => f.key);
  const issues = useMemo(() => validateGraph(graph, fieldKeys), [graph, fieldKeys]);
  const issuesOf = (id: string) => issues.filter((i) => i.nodeId === id);
  const onPath = new Set(path?.map((p) => p.nodeId) ?? []);

  const edit = (g: BuilderGraph) => {
    setGraph(g);
    setDirty(true);
    setPath(null);
  };
  const add = (type: BuilderNode['type']) => {
    const at = addAt ?? { lane: { parent: null } as Lane, index: graph.nodes.length };
    const node = blankNode(graph, type);
    edit(insertNode(graph, at.lane, at.index, node));
    setSel(node.id);
    setAddAt(null);
  };
  const patch = (id: string, p: Partial<AnyNode>) => edit(updateNode(graph, id, p));

  const save = async (): Promise<number | null> => {
    const res = await saveDraft(initial.id, { graph, name: name.trim() || undefined, module, expectedVersion: version });
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setVersion(res.data.version);
    setDirty(false);
    setHasDraft(true);
    return res.data.version;
  };
  const onSave = () =>
    start(async () => {
      if ((await save()) !== null) toast.success(t('wb.saved'));
    });
  const onActivate = () => {
    if (issues.length) {
      setShowIssues(true);
      setSel(issues[0].nodeId);
      toast.error(t('wb.blocked', { n: issues.length }));
      return;
    }
    start(async () => {
      const v = dirty || name !== initial.name || module !== initial.module ? await save() : version;
      if (v === null) return;
      const res = await publishWorkflow(initial.id, v);
      if (!res.ok) return toast.error(res.error);
      setVersion(res.data.version);
      setPublished(res.data.publishedVersion);
      setStatus('active');
      setHasDraft(false);
      toast.success(t('wb.activated', { n: res.data.publishedVersion }));
    });
  };
  const onPause = () =>
    start(async () => {
      const active = status !== 'active';
      const res = await setWorkflowActive(initial.id, active, version);
      if (!res.ok) return toast.error(res.error);
      setVersion(res.data.version);
      setStatus(active ? 'active' : 'paused');
      toast.success(t(active ? 'wb.resumed' : 'wb.paused'));
    });
  const onDiscard = () =>
    start(async () => {
      const res = await discardDraft(initial.id);
      if (!res.ok) return toast.error(res.error);
      window.location.reload();
    });
  const onTest = () =>
    start(async () => {
      if (dirty && (await save()) === null) return;
      const amount = testAmount.trim() === '' ? null : Number(testAmount);
      const payload = Object.fromEntries(Object.entries(testPayload).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number.isFinite(Number(v)) && v.trim() !== '' && initial.fields.find((f) => f.key === k)?.type === 'number' ? Number(v) : v]));
      const res = await testWorkflow(initial.id, amount, payload);
      if (!res.ok) return toast.error(res.error);
      setPath(res.data.path);
    });

  // The canvas scrolls both ways. Pan by dragging empty space, and Shift + wheel scrolls sideways
  // (for mice without a horizontal wheel). The flow starts centred horizontally.
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.scrollLeft = (cv.scrollWidth - cv.clientWidth) / 2;
    let drag: { x: number; y: number; l: number; t: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,select,textarea,[role=menu]')) return;
      drag = { x: e.clientX, y: e.clientY, l: cv.scrollLeft, t: cv.scrollTop, id: e.pointerId };
      cv.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      cv.scrollLeft = drag.l - (e.clientX - drag.x);
      cv.scrollTop = drag.t - (e.clientY - drag.y);
    };
    const up = () => {
      drag = null;
      cv.style.cursor = '';
    };
    const wheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.deltaX !== 0 || e.deltaY === 0 || cv.scrollWidth <= cv.clientWidth) return;
      cv.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cv.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      cv.removeEventListener('wheel', wheel);
    };
  }, []);

  const label = (n: AnyNode) => n.name.trim() || t(`wb.kind.${n.type}` as MessageKey);
  const nodeCard = (n: AnyNode) => {
    const k = KIND[n.type];
    const bad = issuesOf(n.id).length > 0;
    return (
      <button
        type="button"
        data-testid={`wb-node-${n.id}`}
        aria-pressed={sel === n.id}
        onClick={() => setSel(n.id)}
        className={`relative flex w-[260px] items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left shadow-card transition hover:border-foreground/30 ${sel === n.id ? 'border-primary ring-[3px] ring-primary/20' : ''} ${onPath.has(n.id) ? 'outline-2 outline-offset-2 outline-green-ink' : ''}`}
      >
        <span className={`grid size-[34px] shrink-0 place-items-center rounded-[10px] [&>svg]:size-[18px] ${k.tile}`}>{k.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t(`wb.kind.${n.type}` as MessageKey)}</span>
          <span className="block truncate text-[13.5px] font-semibold">{label(n)}</span>
        </span>
        {bad && <i className="absolute top-2 right-2 size-2 rounded-full bg-orange-ink" title={t('wb.issues')} data-testid="wb-warn" />}
      </button>
    );
  };
  const edge = (lane: Lane, index: number, short = false) => {
    const key = `${lane.parent ?? 'main'}:${'branch' in lane ? lane.branch : ''}:${index}`;
    return (
      <div className={`group relative w-0.5 bg-border ${short ? 'h-5' : 'h-10'}`}>
        {!short && (
          <button
            type="button"
            aria-label={t('wb.addHere')}
            onClick={() => setAddAt(addAt?.key === key ? null : { lane, index, key })}
            className="absolute top-1/2 left-1/2 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-card text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 [&>svg]:size-3"
            style={addAt?.key === key ? { opacity: 1 } : undefined}
          >
            <Plus />
          </button>
        )}
        {addAt?.key === key && <AddMenu onPick={add} onClose={() => setAddAt(null)} />}
      </div>
    );
  };
  const seq = (nodes: BuilderNode[], lane: Lane): ReactNode =>
    nodes.map((n, i) => (
      <Fragment key={n.id}>
        {i > 0 && edge(lane, i)}
        {nodeCard(n)}
        {n.type === 'condition' && (
          <>
            {edge(lane, i, true)}
            <div className="relative grid grid-cols-2 gap-10 pt-5 pb-5">
              <i aria-hidden className="absolute top-0 right-[calc(25%-10px)] left-[calc(25%-10px)] h-5 rounded-t-xl border-2 border-b-0 border-border" />
              {(['yes', 'no'] as const).map((b) => (
                <div key={b} className="flex flex-col items-center">
                  <span className={`mb-2 rounded-full px-2 text-[11.5px] font-semibold ${b === 'yes' ? 'bg-green-soft text-green-ink' : 'bg-red-soft text-red-ink'} ${path?.some((p) => p.nodeId === n.id && p.branch === b) ? 'ring-2 ring-green-ink' : ''}`}>{t(`wb.${b}`)}</span>
                  {seq(n[b], { parent: n.id, branch: b })}
                  {edge({ parent: n.id, branch: b }, n[b].length)}
                  <span aria-hidden className="w-0.5 flex-1 bg-border" />
                </div>
              ))}
              <i aria-hidden className="absolute right-[calc(25%-10px)] bottom-0 left-[calc(25%-10px)] h-5 rounded-b-xl border-2 border-t-0 border-border" />
            </div>
            
          </>
        )}
      </Fragment>
    ));

  const selected = sel ? findNode(graph, sel) : null;
  return (
    <div className="-mx-4 -mb-6 flex h-[calc(100dvh-150px)] min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card sm:mx-0" data-testid="wb-builder">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Link href="/workflows/builder" aria-label={t('wb.back')} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
          <ChevronLeft className="size-[18px]" />
        </Link>
        <h1 className="m-0 min-w-0 truncate text-[15px] font-bold">{name}</h1>
        <StatusPill tone={STATUS_TONE[status]}>{t(`wb.status.${status}` as MessageKey)}</StatusPill>
        {published > 0 && <span className="text-xs text-muted-foreground">{t('wb.live', { n: published })}</span>}
        {(hasDraft || dirty) && status !== 'draft' && <span className="text-xs text-orange-ink">{t('wb.unpublished')}</span>}
        <span className="flex-1" />
        <div className="relative">
          <Button size="small" variant="outlined" startIcon={<Plus />} onClick={() => setAddAt(addAt?.key === 'top' ? null : { lane: { parent: null }, index: graph.nodes.length, key: 'top' })}>
            {t('wb.add')}
          </Button>
          {addAt?.key === 'top' && <AddMenu onPick={add} onClose={() => setAddAt(null)} align="right" />}
        </div>
        <Button size="small" startIcon={<FlaskConical />} onClick={() => setTesting((v) => !v)} data-testid="wb-test-toggle">
          {t('wb.test')}
        </Button>
        {hasDraft && published > 0 && (
          <Button size="small" startIcon={<History />} onClick={onDiscard} disabled={busy}>
            {t('wb.discard')}
          </Button>
        )}
        <Button size="small" startIcon={<Save />} onClick={onSave} disabled={busy || !dirty} data-testid="wb-save">
          {t('wb.saveDraft')}
        </Button>
        {status !== 'draft' && !dirty && !hasDraft ? (
          <Button size="small" variant="outlined" startIcon={status === 'active' ? <Pause /> : <Play />} onClick={onPause} disabled={busy}>
            {t(status === 'active' ? 'wb.pause' : 'wb.resume')}
          </Button>
        ) : (
          <Button size="small" variant="contained" startIcon={issues.length ? <AlertTriangle /> : <Zap />} onClick={onActivate} disabled={busy} data-testid="wb-activate">
            {t('wb.activate')}
          </Button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1">
          <div
            ref={canvas}
            className="flex-1 cursor-grab overflow-auto bg-background"
            style={{ backgroundImage: 'radial-gradient(var(--border) 1.2px, transparent 1.2px)', backgroundSize: '18px 18px' }}
            data-testid="wb-canvas"
          >
            {/* Sized to its content (w-max) and at least the viewport (min-w-full), so wide branches grow the
                scroll area instead of spilling off the left edge. CSS zoom (not transform) so the scroll
                area follows the zoom level. */}
            <div className="flex w-max min-w-full flex-col items-center px-24 pt-10 pb-32" style={{ zoom }} data-testid="wb-flow">
              {nodeCard(graph.trigger)}
              {edge({ parent: null }, 0)}
              {seq(graph.nodes, { parent: null })}
              {graph.nodes.length > 0 && edge({ parent: null }, graph.nodes.length)}
              <div className="mt-1.5 text-xs text-muted-foreground">{t('wb.end')}</div>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 z-[3] flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-card">
            <Workflow className="size-3.5" /> {t('wb.count', { n: countNodes(graph), z: Math.round(zoom * 100) })}
            {issues.length > 0 && (
              <button type="button" className="ml-2 font-semibold text-orange-ink" onClick={() => setShowIssues((v) => !v)} data-testid="wb-issues-toggle">
                {t('wb.blocked', { n: issues.length })}
              </button>
            )}
          </div>
          <div className="absolute right-4 bottom-4 z-[3] flex flex-col rounded-lg border bg-card shadow-card">
            <ZoomBtn label={t('wb.zoomIn')} onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} icon={<Plus />} />
            <ZoomBtn label={t('wb.zoomOut')} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} icon={<Minus />} />
            <ZoomBtn label={t('wb.fit')} onClick={() => setZoom(1)} icon={<Maximize2 />} />
          </div>
          {(showIssues || testing) && (
            <div className="absolute top-4 left-4 z-[3] grid w-[300px] max-w-[calc(100%-32px)] gap-3">
              {showIssues && issues.length > 0 && <IssueList issues={issues} graph={graph} onPick={setSel} onClose={() => setShowIssues(false)} />}
              {testing && (
                <section className="rounded-xl border bg-card p-4 shadow-card" data-testid="wb-test">
                  <header className="mb-2 flex items-center gap-2">
                    <b className="flex-1 text-sm">{t('wb.test')}</b>
                    <button type="button" aria-label={t('wb.close')} onClick={() => setTesting(false)} className="text-muted-foreground">
                      <X className="size-4" />
                    </button>
                  </header>
                  <p className="mb-3 text-xs text-muted-foreground">{t('wb.test.note')}</p>
                  <div className="grid gap-3">
                    <TextInput label={t('wb.test.amount')} value={testAmount} onChange={(e) => setTestAmount(e.target.value)} type="number" fullWidth />
                    {initial.fields.map((f) =>
                      f.type === 'select' ? (
                        <SelectInput key={f.key} label={f.label} value={testPayload[f.key] ?? ''} empty="–" onChange={(e) => setTestPayload({ ...testPayload, [f.key]: e.target.value })} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} fullWidth />
                      ) : (
                        <TextInput key={f.key} label={f.label} value={testPayload[f.key] ?? ''} onChange={(e) => setTestPayload({ ...testPayload, [f.key]: e.target.value })} fullWidth />
                      ),
                    )}
                    <Button variant="contained" size="small" startIcon={<Play />} onClick={onTest} disabled={busy} data-testid="wb-test-run">
                      {t('wb.test.run')}
                    </Button>
                    {path && (
                      <ol className="grid gap-1 text-xs" data-testid="wb-test-path">
                        <li className="font-semibold">{t('wb.test.path')}</li>
                        {path.map((p, i) => {
                          const n = findNode(graph, p.nodeId);
                          return (
                            <li key={p.nodeId} className="flex items-center gap-1.5">
                              <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                              <span className="truncate">{n ? label(n) : p.nodeId}</span>
                              {p.branch && <span className={p.branch === 'yes' ? 'text-green-ink' : 'text-red-ink'}>→ {t(`wb.${p.branch}`)}</span>}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
        {selected && (
          <aside aria-label={t('wb.f.name')} className="absolute inset-y-0 right-0 z-[4] flex w-[340px] max-w-full flex-col border-l bg-card lg:static" data-testid="wb-panel">
            <Panel
              node={selected}
              detail={initial}
              name={name}
              module={module}
              setName={(v) => {
                setName(v);
                setDirty(true);
              }}
              setModule={(v) => {
                setModule(v);
                setDirty(true);
              }}
              issues={issuesOf(selected.id)}
              patch={(p) => patch(selected.id, p)}
              onDelete={() => {
                edit(removeNode(graph, selected.id));
                setSel(null);
              }}
              onClose={() => setSel(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center text-muted-foreground hover:text-foreground [&>svg]:size-4">
      {icon}
    </button>
  );
}

function AddMenu({ onPick, onClose, align }: { onPick: (t: BuilderNode['type']) => void; onClose: () => void; align?: 'right' }) {
  const { t } = useI18n();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div role="menu" className={`absolute z-20 grid w-44 gap-0.5 rounded-xl border bg-card p-1 shadow-card ${align === 'right' ? 'top-full right-0 mt-1' : 'top-1/2 left-5 -translate-y-1/2'}`} data-testid="wb-add-menu">
      {(['approval', 'condition', 'notify'] as const).map((k) => (
        <button key={k} type="button" role="menuitem" onClick={() => onPick(k)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
          <span className={`grid size-6 place-items-center rounded-md [&>svg]:size-3.5 ${KIND[k].tile}`}>{KIND[k].icon}</span>
          {t(`wb.kind.${k}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

function IssueList({ issues, graph, onPick, onClose }: { issues: GraphIssue[]; graph: BuilderGraph; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-orange-ink/30 bg-orange-soft p-3 text-orange-ink shadow-card" data-testid="wb-issues">
      <header className="mb-1.5 flex items-center gap-2">
        <AlertTriangle className="size-4" />
        <b className="flex-1 text-sm">{t('wb.issues')}</b>
        <button type="button" aria-label={t('wb.close')} onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>
      <ul className="grid gap-1 text-xs">
        {issues.map((i, k) => {
          const n = findNode(graph, i.nodeId);
          return (
            <li key={k}>
              <button type="button" className="text-left hover:underline" onClick={() => onPick(i.nodeId)}>
                <b>{n?.name.trim() || t(`wb.kind.${n?.type ?? 'trigger'}` as MessageKey)}</b>: {t(`wb.issue.${i.code}` as MessageKey)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const approverValue = (a: Approver | null | undefined) => (!a ? '' : a.kind === 'role' ? `role:${a.role}` : a.kind === 'user' ? `user:${a.userId}` : 'head');
const approverOf = (v: string): Approver | null => (v === 'head' ? { kind: 'department_head' } : v.startsWith('role:') ? { kind: 'role', role: v.slice(5) } : v.startsWith('user:') ? { kind: 'user', userId: v.slice(5) } : null);

/** The side panel: edit the selected node. */
function Panel({
  node,
  detail,
  name,
  module,
  setName,
  setModule,
  issues,
  patch,
  onDelete,
  onClose,
}: {
  node: AnyNode;
  detail: WorkflowDetail;
  name: string;
  module: string;
  setName: (v: string) => void;
  setModule: (v: string) => void;
  issues: GraphIssue[];
  patch: (p: Partial<AnyNode>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const roleOpts = APPROVER_ROLES.map((r) => ({ value: `role:${r}`, label: t(`wb.role.${r}` as MessageKey) }));
  const peopleOpts = detail.people.map((p) => ({ value: `user:${p.id}`, label: p.name }));
  const fieldOpts = [{ value: 'amount', label: t('wb.field.amount') }, ...detail.fields.map((f) => ({ value: f.key, label: f.label }))];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chips = (all: readonly string[], value: string[], prefix: string, onChange: (v: string[]) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {all.map((c) => (
        <button key={c} type="button" aria-pressed={value.includes(c)} onClick={() => onChange(toggle(value, c))} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${value.includes(c) ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'}`}>
          {value.includes(c) && <Check className="size-3" />}
          {t(`${prefix}.${c}` as MessageKey)}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className={`grid size-[34px] place-items-center rounded-[10px] [&>svg]:size-[18px] ${KIND[node.type].tile}`}>{KIND[node.type].icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{t(`wb.kind.${node.type}` as MessageKey)}</div>
          <b className="block truncate">{node.name || '–'}</b>
        </div>
        <button type="button" aria-label={t('wb.close')} onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </header>
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
        {node.type === 'trigger' && (
          <>
            <TextInput label={t('wb.create.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <SelectInput label={t('wb.col.module')} value={module} onChange={(e) => setModule(e.target.value)} options={MODULES.map((m) => ({ value: m, label: t(`wb.module.${m}` as MessageKey) }))} fullWidth />
          </>
        )}
        <TextInput label={t('wb.f.name')} value={node.name} onChange={(e) => patch({ name: e.target.value })} fullWidth data-testid="wb-f-name" />
        {node.type === 'trigger' && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('wb.f.sources')}</span>
            {chips(TRIGGER_SOURCES, node.sources, 'wb.source', (v) => patch({ sources: v }))}
          </div>
        )}
        {node.type === 'approval' && (
          <>
            {node.approvers && node.approvers.length >= 2 ? (
              <p className="rounded-lg bg-muted p-2.5 text-sm">{t('wb.approver.parallel', { n: node.approvers.length })}</p>
            ) : (
              <SelectInput
                label={t('wb.f.approver')}
                value={approverValue(node.approver)}
                empty={t('wb.choose')}
                onChange={(e) => patch({ approver: approverOf(e.target.value) })}
                options={[{ value: 'head', label: t('wb.approver.head') }, ...roleOpts, ...peopleOpts]}
                fullWidth
                data-testid="wb-f-approver"
              />
            )}
            <TextInput label={t('wb.f.sla')} type="number" value={node.slaHours ?? ''} onChange={(e) => patch({ slaHours: hours(e.target.value) })} fullWidth />
            <SelectInput
              label={t('wb.f.escalate')}
              value={node.escalateTo ? approverValue(node.escalateTo) : ''}
              empty={t('wb.none')}
              onChange={(e) => patch({ escalateTo: (approverOf(e.target.value) as never) ?? null })}
              options={[...roleOpts, ...peopleOpts]}
              fullWidth
            />
            <TextInput label={t('wb.f.reminder')} type="number" value={node.reminderHours ?? ''} onChange={(e) => patch({ reminderHours: hours(e.target.value) })} fullWidth />
          </>
        )}
        {node.type === 'condition' && (
          <>
            <SelectInput label={t('wb.f.field')} value={node.field} onChange={(e) => patch({ field: e.target.value })} options={fieldOpts} fullWidth />
            <SelectInput label={t('wb.f.op')} value={node.op} onChange={(e) => patch({ op: e.target.value as (typeof BRANCH_OPS)[number], value: parseValue(formatValue(node.value), e.target.value) })} options={BRANCH_OPS.map((o) => ({ value: o, label: t(`wb.op.${OP_KEY[o]}` as MessageKey) }))} fullWidth />
            <TextInput label={t('wb.f.value')} value={formatValue(node.value)} onChange={(e) => patch({ value: parseValue(e.target.value, node.op) })} helperText={node.op === 'in' ? t('wb.f.valueHelp') : undefined} fullWidth data-testid="wb-f-value" />
          </>
        )}
        {node.type === 'notify' && (
          <>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t('wb.f.channels')}</span>
              {chips(CHANNELS, node.channels, 'wb.channel', (v) => patch({ channels: v }))}
            </div>
            <SelectInput label={t('wb.f.template')} value={node.template} empty={t('wb.choose')} onChange={(e) => patch({ template: e.target.value })} options={TEMPLATES.map((m) => ({ value: m, label: t(`wb.template.${m}` as MessageKey) }))} fullWidth />
            <SelectInput label={t('wb.f.when')} value={node.when} onChange={(e) => patch({ when: e.target.value as (typeof NOTIFY_WHEN)[number] })} options={NOTIFY_WHEN.map((m) => ({ value: m, label: t(`wb.when.${m}` as MessageKey) }))} fullWidth />
            <SelectInput label={t('wb.f.to')} value={node.to} onChange={(e) => patch({ to: e.target.value })} options={[{ value: 'requester', label: t('wb.to.requester') }, ...APPROVER_ROLES.map((r) => ({ value: r, label: t(`wb.role.${r}` as MessageKey) }))]} fullWidth />
          </>
        )}
        {issues.map((i) => (
          <p key={i.code} className="flex items-center gap-2 rounded-lg bg-orange-soft px-3 py-2 text-sm text-orange-ink">
            <AlertTriangle className="size-4 shrink-0" />
            {t(`wb.issue.${i.code}` as MessageKey)}
          </p>
        ))}
      </div>
      <footer className="flex items-center gap-2 border-t px-4 py-3">
        {node.type !== 'trigger' && (
          <Button color="error" startIcon={<Trash2 />} onClick={onDelete}>
            {t('wb.delete')}
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="contained" onClick={onClose}>
          {t('wb.done')}
        </Button>
      </footer>
    </>
  );
}
