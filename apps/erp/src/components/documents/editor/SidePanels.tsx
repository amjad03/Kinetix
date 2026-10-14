'use client';
import {
  AlertTriangle,
  Award,
  Barcode,
  Braces,
  Circle,
  Droplets,
  Eye,
  EyeOff,
  Fingerprint,
  Frame,
  GripVertical,
  Heading,
  Image as ImageIcon,
  ListOrdered,
  Lock,
  LockOpen,
  Minus,
  PenLine,
  QrCode,
  RectangleHorizontal,
  Search,
  Shapes,
  Signature,
  Square,
  Stamp,
  Table,
  Type,
  Upload,
  User,
  Waves,
} from 'lucide-react';
import { type Dispatch, type ReactNode, useEffect, useState } from 'react';
import { searchSubjects, type PreviewSubject } from '@/app/(dashboard)/documents/designs-actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { bindingLabel, type AddKind, type AddOptions } from '@/lib/doc-editor/factory';
import { currentSide, type EditorAction, type EditorState, type LayoutProblem } from '@/lib/doc-editor/model';
import type { DocBinding, DocData, DocElement, ImageSource, SignatoryRole } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import { BindingPicker } from './BindingPicker';
import { inputClass } from './controls';
import { elementLabel } from './PropertiesPanel';

// ---------------------------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------------------------

interface Tile {
  kind: AddKind;
  label: MessageKey;
  icon: ReactNode;
  opts?: AddOptions;
}

const ic = 'size-5';

/** Elements to add: click to place in the middle of the page, or drag onto the canvas. */
export function AddPanel({ onAdd, bindings, data, signatories, canUpload, onUpload }: { onAdd: (kind: AddKind, o?: AddOptions) => void; bindings: DocBinding[]; data: DocData; signatories: SignatoryRole[]; canUpload: boolean; onUpload: (source: ImageSource) => void }) {
  const { t } = useI18n();
  const lists = bindings.filter((b) => b.kind === 'list');
  const groups: { title: MessageKey; tiles: Tile[] }[] = [
    {
      title: 'de.add.text',
      tiles: [
        { kind: 'heading', label: 'de.add.heading', icon: <Heading className={ic} /> },
        { kind: 'text', label: 'de.add.paragraph', icon: <Type className={ic} /> },
      ],
    },
    {
      title: 'de.add.images',
      tiles: [
        { kind: 'image', label: 'de.img.photo', icon: <User className={ic} />, opts: { source: 'photo' } },
        { kind: 'image', label: 'de.img.logo', icon: <ImageIcon className={ic} />, opts: { source: 'logo' } },
        { kind: 'image', label: 'de.img.emblem', icon: <Award className={ic} />, opts: { source: 'emblem' } },
        { kind: 'image', label: 'de.img.seal', icon: <Stamp className={ic} />, opts: { source: 'seal' } },
        { kind: 'signature', label: 'de.add.signatureBlock', icon: <Signature className={ic} />, opts: { role: signatories[0] ?? 'principal' } },
        { kind: 'image', label: 'de.add.signatureImage', icon: <PenLine className={ic} />, opts: { source: `signature:${signatories[0] ?? 'principal'}` as ImageSource } },
      ],
    },
    {
      title: 'de.add.codes',
      tiles: [
        { kind: 'qr', label: 'de.add.qr', icon: <QrCode className={ic} /> },
        { kind: 'barcode', label: 'de.add.barcode', icon: <Barcode className={ic} /> },
      ],
    },
    {
      title: 'de.add.shapes',
      tiles: [
        { kind: 'rect', label: 'de.add.rect', icon: <Square className={ic} /> },
        { kind: 'rounded', label: 'de.add.rounded', icon: <RectangleHorizontal className={ic} /> },
        { kind: 'line', label: 'de.add.line', icon: <Minus className={ic} /> },
        { kind: 'circle', label: 'de.add.circle', icon: <Circle className={ic} /> },
        { kind: 'band', label: 'de.add.band', icon: <Shapes className={ic} /> },
        { kind: 'frame', label: 'de.add.frame', icon: <Frame className={ic} /> },
      ],
    },
    {
      title: 'de.add.security',
      tiles: [
        { kind: 'seal', label: 'de.add.seal', icon: <Fingerprint className={ic} /> },
        { kind: 'guilloche', label: 'de.add.guilloche', icon: <Waves className={ic} /> },
        { kind: 'rosette', label: 'de.add.rosette', icon: <Circle className={ic} /> },
        { kind: 'watermark', label: 'de.add.watermark', icon: <Droplets className={ic} /> },
      ],
    },
  ];
  const tile = (tl: Tile, key: string) => (
    <button
      key={key}
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-kx-add', JSON.stringify({ kind: tl.kind, opts: tl.opts ?? {} }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onAdd(tl.kind, tl.opts)}
      className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-background px-1 py-2.5 text-center text-[11.5px] leading-tight font-medium outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/50"
      data-testid={`add-${key}`}
    >
      <span className="text-primary/80 group-hover:text-primary">{tl.icon}</span>
      {t(tl.label)}
    </button>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 p-3">
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="m-0 mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t(g.title)}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {g.tiles.map((tl) => tile(tl, `${tl.kind}${tl.opts?.source ? `-${tl.opts.source.replace(':', '-')}` : ''}`))}
            {g.title === 'de.add.text' && (
              <BindingPicker
                bindings={bindings}
                data={data}
                onPick={(_, b) => b && onAdd('field', { binding: b })}
                trigger={
                  <button type="button" className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-background px-1 py-2.5 text-center text-[11.5px] leading-tight font-medium outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/50" data-testid="add-field">
                    <span className="text-primary/80 group-hover:text-primary">
                      <Braces className={ic} />
                    </span>
                    {t('de.add.field')}
                  </button>
                }
              />
            )}
            {g.title === 'de.add.text' && lists.some((b) => b.key.endsWith('fields')) && tile({ kind: 'fieldList', label: 'de.add.fieldList', icon: <ListOrdered className={ic} />, opts: { list: lists.find((b) => b.key.endsWith('fields')) } }, 'fieldList')}
            {g.title === 'de.add.images' && canUpload && (
              <button type="button" onClick={() => onUpload('logo')} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-background px-1 py-2.5 text-center text-[11.5px] leading-tight font-medium hover:border-primary/50 hover:bg-primary/5" data-testid="add-upload">
                <Upload className={cn(ic, 'text-primary/80')} />
                {t('de.add.upload')}
              </button>
            )}
          </div>
          {g.title === 'de.add.codes' && lists.length > 0 && (
            <>
              <h3 className="m-0 mt-4 mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t('de.add.tables')}</h3>
              <div className="grid gap-1.5">
                {lists.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/x-kx-add', JSON.stringify({ kind: 'table', opts: { list: l } }))}
                    onClick={() => onAdd('table', { list: l })}
                    className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-[12px] hover:border-primary/50 hover:bg-primary/5"
                    data-testid={`add-table-${l.key}`}
                  >
                    <Table className="size-4 shrink-0 text-primary/80" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-medium">{bindingLabel(l)}</b>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {l.key} · {l.sample}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------------------------

const GROUP_COLORS = ['#2e90fa', '#ee46bc', '#12b76a', '#f79009', '#7a5af8', '#06aed4'];

/** The current side's elements, top first: select, rename, lock, hide and reorder by dragging (or Alt + arrow keys). */
export function LayersPanel({ state, dispatch, problems }: { state: EditorState; dispatch: Dispatch<EditorAction>; problems: LayoutProblem[] }) {
  const { t } = useI18n();
  const side = currentSide(state);
  const els = side.elements;
  const top = [...els].reverse();
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const bad = new Set(problems.filter((p) => p.sideId === side.id && p.elementId).map((p) => p.elementId!));
  const groups = [...new Set(els.map((e) => e.group).filter(Boolean))] as string[];
  const groupColor = new Map(groups.map((g, i) => [g, GROUP_COLORS[i % GROUP_COLORS.length]]));
  if (!els.length) return <p className="m-0 p-4 text-center text-[13px] text-muted-foreground">{t('de.layers.empty')}</p>;
  return (
    <ol className="m-0 grid list-none content-start gap-px p-2" aria-label={t('de.layers')} data-testid="layers">
      {top.map((e, i) => {
        const index = els.length - 1 - i;
        const selected = state.selection.includes(e.id);
        return (
          <li
            key={e.id}
            draggable={editing !== e.id}
            onDragStart={(ev) => {
              setDragId(e.id);
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('text/plain', e.id);
            }}
            onDragOver={(ev) => {
              if (!dragId) return;
              ev.preventDefault();
              setOver(index);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOver(null);
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              if (dragId) dispatch({ type: 'reorder', id: dragId, index });
              setDragId(null);
              setOver(null);
            }}
            className={cn('group relative flex items-center gap-1 rounded-md pr-1 text-[13px]', selected ? 'bg-primary/12' : 'hover:bg-muted', over === index && dragId !== e.id && 'outline-2 outline-primary', e.hidden && 'opacity-55')}
            data-testid={`layer-${e.id}`}
          >
            {e.group && <span aria-hidden className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full" style={{ background: groupColor.get(e.group) }} />}
            <GripVertical aria-hidden className="ml-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/60" />
            {editing === e.id ? (
              <input
                autoFocus
                aria-label={t('de.name')}
                defaultValue={e.name ?? ''}
                placeholder={e.id}
                onBlur={(ev) => {
                  dispatch({ type: 'rename', id: e.id, name: ev.target.value, at: Date.now() });
                  setEditing(null);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                  if (ev.key === 'Escape') setEditing(null);
                }}
                className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-[13px]"
              />
            ) : (
              <button
                type="button"
                aria-pressed={selected}
                onClick={(ev) => dispatch({ type: 'select', ids: [e.id], mode: ev.shiftKey || ev.metaKey || ev.ctrlKey ? 'toggle' : 'set', deep: true })}
                onDoubleClick={() => setEditing(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'F2') setEditing(e.id);
                  if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
                    ev.preventDefault();
                    dispatch({ type: 'reorder', id: e.id, index: index + (ev.key === 'ArrowUp' ? 1 : -1) });
                  }
                }}
                title={t('de.layers.renameHint')}
                className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <TypeIcon e={e} />
                <span className="min-w-0 flex-1 truncate">{e.name ?? e.id}</span>
                {bad.has(e.id) && <AlertTriangle aria-label={t('de.problems')} className="size-3.5 shrink-0 text-destructive" />}
              </button>
            )}
            <button type="button" aria-label={e.hidden ? t('de.show') : t('de.hide')} title={e.hidden ? t('de.show') : t('de.hide')} onClick={() => dispatch({ type: 'toggleHide', ids: [e.id] })} className={cn('grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground', !e.hidden && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}>
              {e.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button type="button" aria-label={e.locked ? t('de.unlock') : t('de.lock')} title={e.locked ? t('de.unlock') : t('de.lock')} onClick={() => dispatch({ type: 'toggleLock', ids: [e.id] })} className={cn('grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground', !e.locked && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')} data-testid={`lock-${e.id}`}>
              {e.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function TypeIcon({ e }: { e: DocElement }) {
  const { t } = useI18n();
  const c = 'size-3.5 shrink-0 text-muted-foreground';
  const label = t(elementLabel(e));
  const i = (() => {
    switch (e.type) {
      case 'text':
        return <Type className={c} />;
      case 'field':
      case 'fieldList':
        return <Braces className={c} />;
      case 'image':
        return e.source === 'photo' ? <User className={c} /> : <ImageIcon className={c} />;
      case 'signature':
        return <Signature className={c} />;
      case 'qr':
        return <QrCode className={c} />;
      case 'barcode':
        return <Barcode className={c} />;
      case 'table':
        return <Table className={c} />;
      case 'shape':
        return e.shape === 'ellipse' ? <Circle className={c} /> : e.shape === 'line' ? <Minus className={c} /> : <Square className={c} />;
      case 'watermark':
        return <Droplets className={c} />;
      case 'pattern':
        return <Waves className={c} />;
      case 'frame':
        return <Frame className={c} />;
      case 'seal':
        return <Fingerprint className={c} />;
    }
  })();
  return (
    <span title={label} aria-label={label} role="img" className="contents">
      {i}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Preview data
// ---------------------------------------------------------------------------------------------

/** Which data the canvas shows: the sample person, or a real student or staff member. */
export function DataPanel({ subjectKind, subject, onSubject, bindings, data }: { subjectKind: 'student' | 'staff' | 'candidate' | 'none'; subject: PreviewSubject | null; onSubject: (s: PreviewSubject | null) => void; bindings: DocBinding[]; data: DocData }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PreviewSubject[]>([]);
  const [busy, setBusy] = useState(false);
  const real = subjectKind === 'student' || subjectKind === 'staff';
  useEffect(() => {
    if (!real) return;
    const h = setTimeout(() => {
      setBusy(true);
      void searchSubjects(subjectKind, q).then((r) => {
        setRows(r.ok ? r.data : []);
        setBusy(false);
      });
    }, 250);
    return () => clearTimeout(h);
  }, [q, real, subjectKind]);
  const [filter, setFilter] = useState('');
  const shown = bindings.filter((b) => b.kind === 'value' && (!filter || b.key.toLowerCase().includes(filter.toLowerCase()) || b.sample.toLowerCase().includes(filter.toLowerCase())));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 p-3">
      <section className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 className="m-0 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t('de.data.previewWith')}</h3>
        <button type="button" aria-pressed={!subject} onClick={() => onSubject(null)} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px]', !subject ? 'border-primary bg-primary/8 font-semibold' : 'hover:bg-muted')} data-testid="data-sample">
          <User className="size-4 text-primary" /> {t('de.data.sample')}
        </button>
        {subject && (
          <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/8 px-2.5 py-2 text-[13px]" data-testid="data-subject">
            <User className="size-4 text-primary" />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{subject.name}</b>
              <span className="block truncate text-[11px] text-muted-foreground">{subject.detail}</span>
            </span>
          </div>
        )}
        {real ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input aria-label={t(subjectKind === 'student' ? 'de.data.searchStudent' : 'de.data.searchStaff')} placeholder={t(subjectKind === 'student' ? 'de.data.searchStudent' : 'de.data.searchStaff')} value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputClass, 'pl-7')} data-testid="subject-search" />
            </div>
            <ul className="m-0 grid max-h-[240px] list-none gap-0.5 overflow-y-auto p-0" aria-busy={busy}>
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onSubject(r)} className={cn('w-full rounded-md px-2 py-1.5 text-left hover:bg-muted', subject?.id === r.id && 'bg-primary/10')} data-testid={`subject-${r.id}`}>
                    <span className="block truncate text-[13px] font-medium">{r.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{r.detail}</span>
                  </button>
                </li>
              ))}
              {!busy && !rows.length && <li className="px-2 py-2 text-[12px] text-muted-foreground">{t('de.data.none')}</li>}
            </ul>
          </>
        ) : (
          <p className="m-0 text-[12px] text-muted-foreground">{t('de.data.onlySample')}</p>
        )}
      </section>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 className="m-0 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t('de.fields')}</h3>
        <input aria-label={t('de.searchFields')} placeholder={t('de.searchFields')} value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass} />
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {shown.slice(0, 120).map((b) => {
            const v = b.key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data);
            return (
              <div key={b.key} className="rounded-md bg-muted/40 px-2 py-1">
                <dt className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{bindingLabel(b)}</span>
                  <code className="shrink-0 text-[10px]">{`{{${b.key}}}`}</code>
                </dt>
                <dd className="m-0 truncate text-[12px]">{v === undefined || v === null || v === '' ? '—' : String(v)}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
