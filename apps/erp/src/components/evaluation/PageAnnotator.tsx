'use client';
import { useRef, useState, type PointerEvent } from 'react';
import { addAnnotation, removeAnnotation } from '@/app/(dashboard)/evaluation/desk/actions';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ANNOTATION_TOOLS, extendStroke, inkAnnotation, newAnnotation, onPage, pointOnPage, strokePath, type Annotation, type AnnotationKind, type Point, type Stroke } from '@/lib/annotations';

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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const here = onPage(marks, pageIndex);
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
  const saveInk = async () => {
    const body = inkAnnotation(pageIndex, strokes);
    if (!body) return;
    const res = await addAnnotation(allocationId, body);
    if (!res.ok) return setError(res.error || t('ev.ann.err'));
    setError(null);
    setStrokes([]);
    onChange([...marks, res.data]);
  };
  const up = (e: PointerEvent) => {
    if (pen) {
      if (pen.length >= 2) setStrokes((all) => [...all, pen]);
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
            {here.filter((a) => a.kind === 'ink').flatMap((a) => (a.strokes ?? []).map((st, i) => <path key={`${a.id}-${i}`} d={strokePath(st)} fill="none" stroke={COLOUR.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />))}
            {[...strokes, ...(pen ? [pen] : [])].map((st, i) => <path key={`draft-${i}`} d={strokePath(st)} fill="none" stroke={COLOUR.ink} strokeDasharray="4 3" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        )}
        {draft && <div className="absolute pointer-events-none" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: size(`${draft.w * 100}%`), height: size(`${draft.h * 100}%`), border: `2px dashed ${COLOUR.highlight}` }} />}
      </div>
      {!locked && tool === 'ink' && (
        <div className="flex flex-row gap-2 items-center flex-wrap">
          <Button size="small" variant="contained" disabled={strokes.length === 0} onClick={() => void saveInk()} data-testid="ink-save">
            {t('ev.ann.inkSave', { n: strokes.length })}
          </Button>
          <Button size="small" disabled={strokes.length === 0} onClick={() => setStrokes((all) => all.slice(0, -1))}>
            {t('ev.ann.inkUndo')}
          </Button>
          <Button size="small" color="inherit" disabled={strokes.length === 0} onClick={() => setStrokes([])}>
            {t('ev.ann.inkClear')}
          </Button>
        </div>
      )}
      {here.filter((a) => a.kind === 'ink').length > 0 && (
        <div className="flex flex-row gap-2 items-center flex-wrap">
          {here.filter((a) => a.kind === 'ink').map((a, i) => (
            <Button key={a.id} size="small" color="inherit" disabled={locked} onClick={() => void remove(a)} aria-label={`${t('ev.ann.ink')} ${i + 1}: ${t('ev.ann.remove')}`}>
              {t('ev.ann.ink')} {i + 1} ✕
            </Button>
          ))}
        </div>
      )}
      {before.length > 0 && (
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
          {t('ev.ann.earlier')}
        </span>
      )}
      {pendingComment && (
        <div className="flex flex-row gap-2 items-start">
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
        </div>
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
