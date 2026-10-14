'use client';
import { ArrowLeft, Check, CircleAlert, Eye, History, Layers, Loader2, Plus, Save, Star, Table2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react';
import { type DesignWithLayout, getDesign, type PreviewSubject, restoreDesignVersion, saveDesignLayout, setDefaultDesign, subjectData } from '@/app/(dashboard)/documents/designs-actions';
import { Button, Chip, Snackbar } from '@/components/kx';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { brandImageUrl, type Branding } from '@/lib/doc-designs';
import { type AddKind, type AddOptions, newElement } from '@/lib/doc-editor/factory';
import { familiesIn, fontFaceCss, loadFonts } from '@/lib/doc-editor/fonts';
import { currentSide, editorReducer, initialState, isDirty, type LayoutProblem, pageMm, problemsFrom, validateLayout } from '@/lib/doc-editor/model';
import { browserMeasurer, type CanvasImage, CanvasRenderer } from '@/lib/doc-editor/render';
import { DOC_TYPE_INFO, type DocBinding, type DocData, type DocElement, type DocLayout, type FontFamilyId, type ImageSource, SIGNATORY_ROLES, type SignatoryRole } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import { LeaveDialog, PrintPreviewDialog, SaveDialog, UploadDialog, VersionsDialog } from './dialogs';
import { EditorCanvas, PX_PER_MM, type ViewState, ZOOM_MAX, ZOOM_MIN } from './EditorCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { AddPanel, DataPanel, LayersPanel } from './SidePanels';
import { EditorToolbar } from './Toolbar';

export interface EditorProps {
  design: DesignWithLayout;
  branding: Branding;
  bindings: DocBinding[];
  sample: DocData;
  /** The layout of the design this one was copied from, for "Reset to the original". */
  original: DocLayout | null;
  canUpload: boolean;
}

const VIEW_KEY = 'kx.designer.view';
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Images the canvas can draw: the institution's branding images with their natural sizes. */
function useBrandImages(branding: Branding): Partial<Record<ImageSource, CanvasImage | null>> {
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const urls = useMemo(() => {
    const m: Partial<Record<ImageSource, string>> = {};
    for (const k of ['logo', 'logo_dark', 'emblem', 'seal'] as const) if (branding.assets[k]) m[k] = brandImageUrl(k, branding.assets[k]!.version);
    for (const r of SIGNATORY_ROLES) if (branding.signatories[r]?.hasSignature) m[`signature:${r}`] = brandImageUrl(`signature:${r}`, branding.signatories[r]!.signatureVersion);
    return m;
  }, [branding]);
  useEffect(() => {
    for (const [k, u] of Object.entries(urls)) {
      const img = new Image();
      img.onload = () => setSizes((s) => (s[k]?.w === img.naturalWidth ? s : { ...s, [k]: { w: img.naturalWidth || 1, h: img.naturalHeight || 1 } }));
      img.src = u!;
    }
  }, [urls]);
  return useMemo(() => {
    const out: Partial<Record<ImageSource, CanvasImage | null>> = {};
    for (const [k, u] of Object.entries(urls) as [ImageSource, string][]) {
      const a = k.startsWith('signature:') ? null : branding.assets[k as 'logo'];
      const size = sizes[k] ?? (a ? { w: a.width, h: a.height } : null);
      if (size) out[k] = { href: u, width: size.w, height: size.h };
    }
    return out;
  }, [urls, sizes, branding]);
}

/** The template designer: canvas, add/layers/data panels, properties, toolbar, saving and previews. */
export function DesignEditor({ design: initialDesign, branding: initialBranding, bindings, sample, original, canUpload }: EditorProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [design, setDesign] = useState(initialDesign);
  const [branding, setBranding] = useState(initialBranding);
  const [state, dispatch] = useReducer(editorReducer, initialDesign.layout, initialState);
  const [name, setName] = useState(initialDesign.name);
  const [tab, setTab] = useState<'add' | 'layers' | 'data'>('add');
  const [dialog, setDialog] = useState<null | 'save' | 'versions' | 'preview' | 'leave' | { upload: ImageSource }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<{ problems: LayoutProblem[]; layout: DocLayout } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [subject, setSubject] = useState<PreviewSubject | null>(null);
  const [loadedSubject, setLoadedSubject] = useState<{ id: string; data: DocData | null } | null>(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [saving, startSave] = useTransition();
  const [viewport, setViewport] = useState({ w: 900, h: 700 });
  const [view, setViewState] = useState<ViewState>(() => ({ zoom: 1, panX: 40, panY: 40, grid: false, gridStep: 1, snap: true, smartGuides: true, margins: true, bleed: true, rulers: true }));
  const [focusText, setFocusText] = useState(0);
  const fitted = useRef(false);
  const leaveTo = useRef<string | null>(null);
  const layout = state.layout;
  const side = currentSide(state);
  const page = pageMm(layout);
  const dirty = isDirty(state) || name.trim() !== design.name;
  const card = layout.page.size === 'CR80';
  const subjectKind = DOC_TYPE_INFO[layout.docType].subject;

  // View options (not zoom) are remembered per browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as Partial<ViewState> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the remembered view options after hydration
      if (saved) setViewState((v) => ({ ...v, grid: !!saved.grid, gridStep: saved.gridStep ?? v.gridStep, snap: saved.snap ?? v.snap, smartGuides: saved.smartGuides ?? v.smartGuides, margins: saved.margins ?? v.margins, bleed: saved.bleed ?? v.bleed, rulers: saved.rulers ?? v.rulers }));
    } catch {
      /* private mode */
    }
  }, []);
  const setView = useCallback((fn: (v: ViewState) => ViewState) => {
    setViewState((v) => {
      const n = fn(v);
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ grid: n.grid, gridStep: n.gridStep, snap: n.snap, smartGuides: n.smartGuides, margins: n.margins, bleed: n.bleed, rulers: n.rulers }));
      } catch {
        /* private mode */
      }
      return n;
    });
  }, []);

  const fit = useCallback(() => {
    const pad = 56;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((viewport.w - pad * 2) / (page.w * PX_PER_MM), (viewport.h - pad * 2) / (page.h * PX_PER_MM))));
    const s = z * PX_PER_MM;
    setViewState((v) => ({ ...v, zoom: z, panX: (viewport.w - page.w * s) / 2, panY: (viewport.h - page.h * s) / 2 }));
  }, [viewport, page.w, page.h]);
  const zoomTo = useCallback(
    (z: number) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
      setViewState((v) => {
        const cx = viewport.w / 2;
        const cy = viewport.h / 2;
        const k = nz / v.zoom;
        return { ...v, zoom: nz, panX: cx - (cx - v.panX) * k, panY: cy - (cy - v.panY) * k };
      });
    },
    [viewport],
  );
  const onViewport = useCallback((w: number, h: number) => setViewport({ w, h }), []);
  useEffect(() => {
    if (!fitted.current && viewport.w > 100) {
      fitted.current = true;
      fit();
    }
  }, [viewport, fit]);
  // A new page size or orientation: fit it again.
  const pageKey = `${page.w}x${page.h}`;
  const lastPage = useRef(pageKey);
  useEffect(() => {
    if (lastPage.current !== pageKey) {
      lastPage.current = pageKey;
      fit();
    }
  }, [pageKey, fit]);

  // Data on the canvas: the sample, or a real person's details over it.
  useEffect(() => {
    if (!subject) return;
    let live = true;
    void subjectData(subject.type, subject.id).then((r) => live && setLoadedSubject({ id: subject.id, data: r.ok ? r.data : null }));
    return () => {
      live = false;
    };
  }, [subject]);
  const subjectBlock = subject && loadedSubject?.id === subject.id ? loadedSubject.data : null;
  const data = useMemo<DocData>(() => (subjectBlock ? { ...sample, ...subjectBlock } : sample), [sample, subjectBlock]);

  // Fonts: the branding's, or the template's own.
  const brandFonts = branding.fonts;
  const fonts = useMemo(() => ({ heading: (layout.fonts?.heading ?? brandFonts.heading) as FontFamilyId, body: (layout.fonts?.body ?? brandFonts.body) as FontFamilyId }), [layout.fonts, brandFonts]);
  const layoutJson = useMemo(() => JSON.stringify(layout), [layout]);
  const families = useMemo(() => familiesIn(layoutJson, fonts).sort().join(','), [layoutJson, fonts]);
  const indic = /[ऀ-ॿಀ-೿]/.test(layoutJson + JSON.stringify(data)) ? 'indic' : '';
  useEffect(() => {
    let live = true;
    void loadFonts(families.split(',') as FontFamilyId[], indic ? 'कಕ' : '').then(() => live && setFontsVersion((v) => v + 1));
    return () => {
      live = false;
    };
  }, [families, indic]);

  const images = useBrandImages(branding);
  const signatories = useMemo(() => Object.fromEntries(Object.entries(branding.signatories).map(([r, s]) => [r, { name: s!.name, designation: s!.designation }])) as Partial<Record<SignatoryRole, { name: string; designation: string }>>, [branding]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const measurer = useMemo(() => browserMeasurer(), [fontsVersion]);
  const renderer = useMemo(() => new CanvasRenderer({ fonts: layout.fonts, page: layout.page }, { palette: branding.palette, fonts: brandFonts, images, signatories }, measurer), [layout.fonts, layout.page, branding.palette, brandFonts, images, signatories, measurer]);

  // Validation against the shared schema, as you edit; the server's issues until the next change.
  const [clientProblems, setClientProblems] = useState<LayoutProblem[]>([]);
  useEffect(() => {
    const h = setTimeout(() => {
      const r = validateLayout(JSON.parse(layoutJson));
      setClientProblems(r.ok ? [] : r.problems);
    }, 250);
    return () => clearTimeout(h);
  }, [layoutJson]);
  const problems = useMemo(() => [...clientProblems, ...(serverProblems && serverProblems.layout === layout ? serverProblems.problems : [])], [clientProblems, serverProblems, layout]);
  const problemIds = useMemo(() => new Set(problems.filter((p) => p.sideId === side.id && p.elementId).map((p) => p.elementId!)), [problems, side.id]);

  const presetElement = useCallback((sideId: string, id: string): DocElement | null => original?.sides.find((s) => s.id === sideId)?.elements.find((e) => e.id === id) ?? null, [original]);

  const add = useCallback(
    (kind: AddKind, o: AddOptions = {}) => {
      dispatch({ type: 'add', element: newElement(kind, layout, o) });
      setTab((x) => (x === 'data' ? 'add' : x));
    },
    [layout],
  );

  // --- saving ------------------------------------------------------------------------------
  const save = useCallback(
    (note: string, then?: () => void) =>
      startSave(async () => {
        setSaveError(null);
        const sent = layout;
        const local = validateLayout(JSON.parse(JSON.stringify(sent)));
        if (!local.ok) {
          setSaveError(t('de.fixProblems', { n: local.problems.length }));
          setDialog(null);
          return;
        }
        const r = await saveDesignLayout(design.id, sent, note, name.trim() !== design.name ? name : undefined);
        if (!r.ok) {
          setSaveError(r.error);
          if (r.issues?.length) setServerProblems({ problems: problemsFrom(sent, r.issues), layout: sent });
          setDialog(null);
          return;
        }
        dispatch({ type: 'markSaved', json: JSON.stringify(sent) });
        setDesign((d) => ({ ...d, ...r.data, layout: d.layout }));
        setName(r.data.name);
        setServerProblems(null);
        setDialog(null);
        setToast(t('de.saved', { n: r.data.version }));
        then?.();
      }),
    [layout, design, name, t],
  );

  const restore = (v: number) =>
    startSave(async () => {
      const r = await restoreDesignVersion(design.id, v);
      if (!r.ok) return setSaveError(r.error);
      const full = await getDesign(design.id);
      if (!full.ok) return setSaveError(full.error);
      dispatch({ type: 'load', layout: full.data.layout });
      setDesign(full.data);
      setName(full.data.name);
      setDialog(null);
      setToast(t('dt.restored'));
    });

  const makeDefault = () =>
    startSave(async () => {
      const r = await setDefaultDesign(layout.docType, design.id);
      if (!r.ok) return setSaveError(r.error);
      setDesign((d) => ({ ...d, isDefault: true }));
      setToast(t('dt.defaultSet', { type: t(`dt.type.${layout.docType}` as MessageKey) }));
    });

  // --- leaving -------------------------------------------------------------------------------
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const leave = (to = `/documents/templates?type=${layout.docType}`) => {
    if (dirty) {
      leaveTo.current = to;
      setDialog('leave');
    } else router.push(to);
  };

  // --- keyboard ------------------------------------------------------------------------------
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setDialog('save');
        return;
      }
      if (isTyping(e.target)) return;
      // Keys inside a menu, popover or dialog belong to it.
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')) return;
      const s = stateRef.current;
      const has = s.selection.length > 0;
      const k = e.key;
      const onCanvas = e.target === document.body || (e.target instanceof Element && !!e.target.closest('[data-testid="canvas"]'));
      if (k === ' ') {
        // Space pans the canvas; on a button it still presses the button.
        if (!onCanvas) return;
        if (!e.repeat) setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (mod && k.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && k.toLowerCase() === 'a') {
        e.preventDefault();
        dispatch({ type: 'selectAll' });
      } else if (mod && k.toLowerCase() === 'd') {
        e.preventDefault();
        dispatch({ type: 'duplicate' });
      } else if (mod && k.toLowerCase() === 'c') dispatch({ type: 'copy' });
      else if (mod && k.toLowerCase() === 'x') dispatch({ type: 'cut' });
      else if (mod && k.toLowerCase() === 'v') {
        e.preventDefault();
        dispatch({ type: 'paste' });
      } else if (mod && k.toLowerCase() === 'g') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'ungroup' : 'group' });
      } else if (mod && k.toLowerCase() === 'l') {
        e.preventDefault();
        dispatch({ type: 'toggleLock' });
      } else if (mod && (k === ']' || k === '[')) {
        e.preventDefault();
        dispatch({ type: 'zorder', to: k === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward' });
      } else if (mod && k === '0') {
        e.preventDefault();
        fit();
      } else if (mod && k === '1') {
        e.preventDefault();
        zoomTo(1);
      } else if (mod && k === "'") {
        e.preventDefault();
        setView((v) => ({ ...v, grid: !v.grid }));
      } else if (!mod && (k === '+' || k === '=')) zoomTo(view.zoom * 1.25);
      else if (!mod && k === '-') zoomTo(view.zoom / 1.25);
      else if ((k === 'Delete' || k === 'Backspace') && has) {
        e.preventDefault();
        dispatch({ type: 'remove' });
      } else if (k === 'Escape') dispatch({ type: 'select', ids: [] });
      else if (k === 'Tab' && onCanvas && e.target !== document.body) {
        // On the canvas, Tab steps through the elements; past the last one, focus moves on.
        const els = currentSide(s).elements;
        const at = has ? els.findIndex((x) => x.id === s.selection[s.selection.length - 1]) : -1;
        if ((!e.shiftKey && at === els.length - 1) || (e.shiftKey && (at === 0 || !has))) {
          dispatch({ type: 'select', ids: [] });
          return;
        }
        e.preventDefault();
        dispatch({ type: 'selectNext', dir: e.shiftKey ? -1 : 1 });
      } else if (k.startsWith('Arrow') && has) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        dispatch({ type: 'nudge', dx: k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy: k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0, at: Date.now() });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [dialog, fit, zoomTo, view.zoom, setView]);

  const selected = side.elements.filter((e) => state.selection.includes(e.id));
  const grouped = selected.length > 1 && selected.every((e) => e.group && e.group === selected[0].group);
  const sides = layout.sides.map((s) => ({ id: s.id, label: s.id === 'front' ? t('dt.front') : s.id === 'back' ? t('dt.back') : (s.label ?? s.id) }));
  const sideLabel = sides.find((s) => s.id === side.id)?.label ?? side.id;
  const signatoryRoles = SIGNATORY_ROLES.filter((r) => branding.signatories[r]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground" data-testid="designer">
      <style>{fontFaceCss()}</style>
      {/* App bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="text" startIcon={<ArrowLeft className="size-4" />} onClick={() => leave()} data-testid="back">
          {t('de.back')}
        </Button>
        <span aria-hidden className="h-6 w-px bg-border" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input aria-label={t('de.designName')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-8 w-[min(320px,28vw)] min-w-[120px] rounded-md border border-transparent bg-transparent px-2 text-[15px] font-semibold outline-none hover:border-border focus:border-primary" data-testid="design-name" />
          <Chip size="small" variant="outlined" label={t(`dt.type.${layout.docType}` as MessageKey)} />
          <Chip size="small" variant="outlined" label={t('dt.version', { n: design.version })} />
          <span className={cn('flex shrink-0 items-center gap-1 text-[12px] whitespace-nowrap', dirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-live="polite" data-testid="save-state">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : dirty ? <CircleAlert className="size-3.5" /> : <Check className="size-3.5" />}
            {saving ? t('de.saving') : dirty ? t('de.unsaved') : t('de.allSaved')}
          </span>
          {problems.length > 0 && (
            <button type="button" onClick={() => setTab('layers')} className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] font-medium text-destructive" data-testid="problem-count">
              <CircleAlert className="size-3.5" /> {t('de.problemCount', { n: problems.length })}
            </button>
          )}
        </div>
        <Button variant="text" startIcon={<History className="size-4" />} onClick={() => setDialog('versions')} data-testid="open-versions">
          {t('dt.history')}
        </Button>
        <Button variant="outlined" startIcon={<Eye className="size-4" />} onClick={() => setDialog('preview')} data-testid="print-preview-btn">
          {t('de.printPreview')}
        </Button>
        {design.isDefault ? (
          <Chip color="success" icon={<Star className="size-3.5" />} label={t('dt.default')} />
        ) : (
          <Button variant="outlined" startIcon={<Star className="size-4" />} disabled={dirty || saving} title={dirty ? t('de.saveFirst') : undefined} onClick={makeDefault} data-testid="set-default">
            {t('dt.setDefault')}
          </Button>
        )}
        <Button variant="contained" startIcon={<Save className="size-4" />} disabled={saving || !dirty} onClick={() => setDialog('save')} data-testid="save">
          {t('dt.save')}
        </Button>
      </header>
      {saveError && (
        <div role="alert" className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/8 px-4 py-2 text-[13px] text-destructive" data-testid="save-error">
          <CircleAlert className="size-4 shrink-0" /> <span className="min-w-0 flex-1">{saveError}</span>
          <button type="button" className="text-[12px] underline" onClick={() => setSaveError(null)}>
            {t('dt.close')}
          </button>
        </div>
      )}
      <EditorToolbar dispatch={dispatch} canUndo={state.past.length > 0} canRedo={state.future.length > 0} view={view} setView={setView} onFit={fit} onZoom={zoomTo} sides={sides} sideId={side.id} count={selected.length} grouped={grouped} card={card} />
      <div className="flex min-h-0 flex-1">
        {/* Left: add, layers, data */}
        <aside className="flex w-[272px] shrink-0 flex-col border-r bg-card" aria-label={t('de.panels')}>
          <div role="tablist" aria-label={t('de.panels')} className="grid grid-cols-3 gap-1 border-b p-1.5">
            {(
              [
                ['add', t('de.tab.add'), <Plus key="i" className="size-4" />],
                ['layers', t('de.tab.layers'), <Layers key="i" className="size-4" />],
                ['data', t('de.tab.data'), <Table2 key="i" className="size-4" />],
              ] as const
            ).map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)} className={cn('flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium', tab === id ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted')} data-testid={`tab-${id}`}>
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'add' && <AddPanel onAdd={add} bindings={bindings} data={data} signatories={signatoryRoles.length ? signatoryRoles : ['principal']} canUpload={canUpload} onUpload={(s) => setDialog({ upload: s })} />}
            {tab === 'layers' && <LayersPanel state={state} dispatch={dispatch} problems={problems} />}
            {tab === 'data' && <DataPanel subjectKind={subjectKind} subject={subject} onSubject={setSubject} bindings={bindings} data={data} />}
          </div>
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('de.canvas')}>
          <EditorCanvas
            state={state}
            dispatch={dispatch}
            renderer={renderer}
            data={data}
            palette={branding.palette}
            view={view}
            setView={setView}
            problems={problemIds}
            spaceHeld={spaceHeld}
            onEditText={() => setFocusText((n) => n + 1)}
            onDropAdd={add}
            onViewport={onViewport}
            sideLabel={sideLabel}
          />
          <span className="sr-only" aria-live="polite">
            {selected.length === 1 ? t('de.selectedOne', { name: selected[0].name ?? selected[0].id, x: selected[0].x.toFixed(1), y: selected[0].y.toFixed(1), w: selected[0].w.toFixed(1), h: selected[0].h.toFixed(1) }) : selected.length ? t('de.nSelected', { n: selected.length }) : ''}
          </span>
        </main>

        {/* Right: properties */}
        <aside className="flex w-[312px] shrink-0 flex-col border-l bg-card" aria-label={t('de.properties')}>
          <PropertiesPanel state={state} dispatch={dispatch} env={{ palette: branding.palette, fonts, brandFonts, bindings, data, problems, presetElement, canUpload, onUpload: (s) => setDialog({ upload: s }), focusText }} />
        </aside>
      </div>

      <SaveDialog open={dialog === 'save'} onClose={() => setDialog(null)} onSave={(note) => save(note)} busy={saving} version={design.version} />
      {dialog === 'versions' && <VersionsDialog id={design.id} current={design.version} dirty={dirty} onClose={() => setDialog(null)} onRestore={restore} />}
      {dialog === 'preview' && <PrintPreviewDialog layout={layout} sides={sides} initialSide={side.id} subject={subject} onClose={() => setDialog(null)} title={name} />}
      <LeaveDialog
        open={dialog === 'leave'}
        onStay={() => setDialog(null)}
        onLeave={() => {
          dispatch({ type: 'markSaved', json: JSON.stringify(layout) });
          setName(design.name);
          setDialog(null);
          router.push(leaveTo.current ?? '/documents/templates');
        }}
        onSave={() => save('', () => router.push(leaveTo.current ?? '/documents/templates'))}
      />
      {dialog && typeof dialog === 'object' && 'upload' in dialog && (
        <UploadDialog
          initial={dialog.upload}
          onClose={() => setDialog(null)}
          onDone={(b) => {
            setBranding(b);
            setDialog(null);
            setToast(t('br.uploaded'));
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} message={toast} />
    </div>
  );
}
