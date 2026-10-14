'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { addAnnotation, removeAnnotation } from '@/app/(dashboard)/evaluation/desk/actions';
import { TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { afterDraw, afterRedo, afterUndo, ANNOTATION_TOOLS, DEFAULT_PEN, emptyHistory, extendStroke, INK_COLOURS, INK_WIDTHS, inkAnnotation, newAnnotation, onPage, pointOnPage, strokePath, undoTarget, type Annotation, type AnnotationKind, type InkHistory, type Pen, type Point, type Stroke } from '@/lib/annotations';

import { Box, Button, ToggleButton, ToggleButtonGroup } from '@/components/kx';
import { cn } from '@/lib/utils';
import { pal, size } from '@/lib/sx';
const COLOUR = { tick: '#1b873f', cross: '#c62828', comment: '#1565c0', highlight: '#f9a825', ink: '#d81b60' } as const;
const GLYPH = { tick: '✓', cross: '✗', comment: '\u{1F4AC}', ink: '✎' } as const;

/**
 * A script page with its marks over it. Marks are placed as fractions of the page, so they sit in the same
 * spot at any zoom. `earlier` marks (from the first and second valuer, shown to a third valuer) are read only.
 */
export function PageAnnotator({ allocationId, pageIndex, src, alt, marks, earlier, locked, onChange }: { allocationId: string; pageIndex: number; src: string; alt: string; marks: Annotation[]; earlier: Annotation[]; locked: boolean; onChange: (next: Annotation[]) => void }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<AnnotationKind>('tick');
  const [start, setStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [pendingComment, setPendingComment] = useState<Point | null>(null);
  const [text, setText] = useState('');
  const [pen, setPen] = useState<Stroke | null>(null);
  /** Strokes lifted but not yet saved (shown dashed until the API answers). */
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [ink, setInk] = useState<Pen>(DEFAULT_PEN);
  const [histories, setHistories] = useState<Record<number, InkHistory>>({});
  const history = histories[pageIndex] ?? emptyHistory();
  const setHistory = (h: InkHistory) => setHistories((all) => ({ ...all, [pageIndex]: h }));
  const [error, setError] = useState<string | null>(null);
  const here = onPage(marks, pageIndex);
  // The latest marks, for saves that finish after other marks changed.
  const marksRef = useRef(marks);
  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  const before = onPage(earlier, pageIndex);

  const at = (e: PointerEvent): Point | null => {
    const r = box.current?.getBoundingClientRect();
    return r ? pointOnPage(e.clientX, e.clientY, r) : null;
  };

  const save = async (point: Point, end: Point, comment = '') => {
    const body = newAnnotation(pageIndex, tool, point, end, comment);
    if (!body) return;
    const res = await addAnnotation(allocationId, body);
    if (!res.ok) return setError(res.error || t('ev.ann.err'));
    setError(null);
    onChange([...marks, res.data]);
  };

  const down = (e: PointerEvent) => {
    if (locked) return;
    const p = at(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tool === 'ink') return setPen([[p.x, p.y]]);
    setStart(p);
    setCursor(p);
  };
  const move = (e: PointerEvent) => {
    if (pen) {
      const p = at(e);
      if (p) setPen(extendStroke(pen, p));
      return;
    }
    if (start) setCursor(at(e));
  };
  /** Each stroke is saved as the pen lifts, in the pen's colour and width: a vector mark of this page of this valuation. */
  const saveStroke = async (stroke: Stroke) => {
    const body = inkAnnotation(pageIndex, [stroke], ink);
    if (!body) return;
    setStrokes((all) => [...all, stroke]);
    const res = await addAnnotation(allocationId, body);
    setStrokes((all) => all.filter((x) => x !== stroke));
    if (!res.ok) return setError(res.error || t('ev.ann.err'));
    setError(null);
    setHistory(afterDraw(history, res.data.id));
    onChange([...marksRef.current, res.data]);
  };
  const undo = async () => {
    const target = undoTarget(history, here);
    if (!target) return;
    const res = await removeAnnotation(allocationId, target.id);
    if (!res.ok) return setError(res.error);
    setHistory(afterUndo(history, target));
    onChange(marksRef.current.filter((m) => m.id !== target.id));
  };
  const redo = async () => {
    const body = history.undone[0];
    if (!body) return;
    const res = await addAnnotation(allocationId, body);
    if (!res.ok) return setError(res.error || t('ev.ann.err'));
    setHistory(afterRedo(history, res.data.id));
    onChange([...marksRef.current, res.data]);
  };
  const clearPage = async () => {
    const mine = here.filter((a) => a.kind === 'ink');
    if (mine.length === 0 || !window.confirm(t('xc.ink.clearConfirm', { n: mine.length }))) return;
    let left = marksRef.current;
    for (const a of mine) {
      const res = await removeAnnotation(allocationId, a.id);
      if (!res.ok) {
        setError(res.error);
        break;
      }
      left = left.filter((m) => m.id !== a.id);
    }
    setHistory(emptyHistory());
    onChange(left);
  };
  const up = (e: PointerEvent) => {
    if (pen) {
      if (pen.length >= 2) void saveStroke(pen);
      setPen(null);
      return;
    }
    const p = at(e);
    const s = start;
    setStart(null);
    setCursor(null);
    if (!s || !p || locked) return;
    if (tool === 'comment') return setPendingComment(s);
    void save(s, p);
  };

  const remove = async (a: Annotation) => {
    const res = await removeAnnotation(allocationId, a.id);
    if (res.ok) onChange(marks.filter((m) => m.id !== a.id));
    else setError(res.error);
  };

  const draft = tool === 'highlight' && start && cursor ? { x: Math.min(start.x, cursor.x), y: Math.min(start.y, cursor.y), w: Math.abs(start.x - cursor.x), h: Math.abs(start.y - cursor.y) } : null;

  return (
    <div className="flex flex-col gap-2">
      {!locked && (
        <div className="flex flex-row gap-2 items-center flex-wrap">
          <p className="text-[13px] leading-[19px]">{t('ev.ann.tools')}</p>
          <ToggleButtonGroup size="small" exclusive value={tool} onChange={(_, v: AnnotationKind | null) => v && setTool(v)} aria-label={t('ev.ann.tools')}>
            {ANNOTATION_TOOLS.map((k) => (
              <ToggleButton key={k} value={k} data-testid={`ann-tool-${k}`}>
                {t(`ev.ann.${k}` as MessageKey)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
      )}
      {!locked && (
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
          {t('ev.ann.hint')}
        </span>
      )}
      <div className={cn('relative inline-block max-w-full leading-[0]', locked ? '[touch-action:auto]' : '[touch-action:none]', locked ? 'cursor-default' : '[cursor:crosshair]')}
        ref={box}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        data-testid="ann-surface"
      >
        {/* The page is streamed through the download route so the session token stays in its cookie. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} draggable={false} style={{ maxWidth: '100%', border: '1px solid var(--mui-palette-divider, #ccc)', userSelect: 'none' }} data-testid="evd-page" />
        {before.filter((a) => a.kind !== 'ink').map((a) => (
          <Mark key={a.id} a={a} dim label={t('ev.ann.round', { n: a.round ?? 0 })} />
        ))}
        {here.filter((a) => a.kind !== 'ink').map((a) => (
          <Mark key={a.id} a={a} label={a.text ?? t(`ev.ann.${a.kind}` as MessageKey)} onRemove={locked ? undefined : () => void remove(a)} removeLabel={t('ev.ann.remove')} />
        ))}
        {(here.some((a) => a.kind === 'ink') || before.some((a) => a.kind === 'ink') || strokes.length > 0 || pen) && (
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden data-testid="ann-ink">
            {before.filter((a) => a.kind === 'ink').flatMap((a) => (a.strokes ?? []).map((st, i) => <path key={`${a.id}-${i}`} d={strokePath(st)} fill="none" stroke="#757575" strokeOpacity={0.6} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />))}
            {here.filter((a) => a.kind === 'ink').flatMap((a) => (a.strokes ?? []).map((st, i) => <path key={`${a.id}-${i}`} d={strokePath(st)} fill="none" stroke={a.color ?? COLOUR.ink} strokeWidth={Number(a.width ?? 2)} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" data-testid="ink-stroke" />))}
            {[...strokes, ...(pen ? [pen] : [])].map((st, i) => <path key={`draft-${i}`} d={strokePath(st)} fill="none" stroke={ink.color} strokeDasharray="4 3" strokeWidth={ink.width} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        )}
        {draft && <div className="absolute pointer-events-none" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: size(`${draft.w * 100}%`), height: size(`${draft.h * 100}%`), border: `2px dashed ${COLOUR.highlight}` }} />}
      </div>
      {!locked && tool === 'ink' && (
        <div className="flex flex-row flex-wrap items-center gap-3" data-testid="ink-toolbar">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t('xc.ink.colour')}>
            {INK_COLOURS.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={ink.color === c.value}
                aria-label={t(`xc.ink.c.${c.key}` as MessageKey)}
                title={t(`xc.ink.c.${c.key}` as MessageKey)}
                onClick={() => setInk({ ...ink, color: c.value })}
                className={cn('size-7 rounded-full border-2', ink.color === c.value ? 'border-foreground ring-2 ring-offset-1 ring-foreground/30' : 'border-transparent')}
                style={{ background: c.value }}
                data-testid={`ink-colour-${c.key}`}
              />
            ))}
          </div>
          <ToggleButtonGroup size="small" exclusive value={ink.width} onChange={(_, v: number | null) => v && setInk({ ...ink, width: v })} aria-label={t('xc.ink.width')}>
            {INK_WIDTHS.map((w) => (
              <ToggleButton key={w} value={w} data-testid={`ink-width-${w}`}>
                {t(w === INK_WIDTHS[0] ? 'xc.ink.fine' : 'xc.ink.thick')}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button size="small" disabled={!undoTarget(history, here)} onClick={() => void undo()} data-testid="ink-undo">
            {t('xc.ink.undo')}
          </Button>
          <Button size="small" disabled={history.undone.length === 0} onClick={() => void redo()} data-testid="ink-redo">
            {t('xc.ink.redo')}
          </Button>
          <Button size="small" color="inherit" disabled={!here.some((a) => a.kind === 'ink')} onClick={() => void clearPage()} data-testid="ink-clear">
            {t('xc.ink.clearPage')}
          </Button>
        </div>
      )}
      {here.some((a) => a.kind === 'ink') && (
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground" data-testid="ink-count">
          {t('xc.ink.count', { n: here.filter((a) => a.kind === 'ink').length })}
        </span>
      )}
      {before.length > 0 && (
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
          {t('ev.ann.earlier')}
        </span>
      )}
      {pendingComment && (
        <FormRow className="gap-2">
          <TextInput label={t('ev.ann.commentLabel')} value={text} onChange={(e) => setText(e.target.value)} fullWidth autoFocus slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'ann-comment' } }} />
          <Button
            variant="contained"
            disabled={!text.trim()}
            onClick={() => {
              const p = pendingComment;
              const v = text;
              setPendingComment(null);
              setText('');
              void save(p, p, v);
            }}
          >
            {t('ev.ann.commentAdd')}
          </Button>
        </FormRow>
      )}
      {error && (
        <p className="text-[13px] leading-[19px] text-red-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** One mark on the page. Boxes are highlights; the rest are glyphs centred on their spot. */
function Mark({ a, dim, label, onRemove, removeLabel }: { a: Annotation; dim?: boolean; label: string; onRemove?: () => void; removeLabel?: string }) {
  const colour = dim ? '#757575' : COLOUR[a.kind];
  const stop = (e: PointerEvent) => e.stopPropagation();
  if (a.kind === 'highlight')
    return (
      <div className={cn('absolute', dim ? 'bg-[rgba(117,117,117,0.18)]' : 'bg-[rgba(249,168,37,0.3)]')} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: size(`${a.w * 100}%`), height: size(`${a.h * 100}%`), border: `1px ${dim ? 'dashed' : 'solid'} ${colour}` }}
        title={label}
        onPointerDown={stop}
        onPointerUp={stop}
        onDoubleClick={onRemove}
      />
    );
  return (
    <Box className={cn('absolute [transform:translate(-50%,-50%)] [font:inherit] text-[22px] font-bold leading-none [background:none] border-0 p-0', onRemove ? 'cursor-pointer' : 'cursor-default', dim ? 'opacity-[0.6]' : 'opacity-[1]')} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: pal(colour) }}
      component={onRemove ? 'button' : 'span'}
      type={onRemove ? 'button' : undefined}
      title={label}
      aria-label={onRemove ? `${label}: ${removeLabel}` : label}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={onRemove}
    >
      {GLYPH[a.kind]}
    </Box>
  );
}
