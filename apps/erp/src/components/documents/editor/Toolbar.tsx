'use client';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  ChevronDown,
  Copy,
  Eye,
  Grid3x3,
  Group,
  Lock,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Ruler,
  Scan,
  SendToBack,
  Trash2,
  Undo2,
  Ungroup,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { Dispatch, ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { EditorAction } from '@/lib/doc-editor/model';
import { cn } from '@/lib/utils';
import { type ViewState, ZOOM_MAX, ZOOM_MIN } from './EditorCanvas';

/** A toolbar icon button with a tooltip (its accessible name) and an optional pressed state. */
export function ToolButton({ label, onClick, children, disabled, pressed, shortcut, testId }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean; shortcut?: string; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn('grid size-8 shrink-0 place-items-center rounded-md text-foreground/80 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-35', pressed && 'bg-primary/12 text-primary')}
    >
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

/** Align to the selection (or the page, for one element) and distribute three or more. */
export function AlignTools({ dispatch, count }: { dispatch: Dispatch<EditorAction>; count: number }) {
  const { t } = useI18n();
  const ic = 'size-4';
  return (
    <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label={t('de.align')}>
      <ToolButton label={t('de.alignLeft')} onClick={() => dispatch({ type: 'align', mode: 'left' })} disabled={!count} testId="align-left">
        <AlignStartVertical className={ic} />
      </ToolButton>
      <ToolButton label={t('de.alignHCenter')} onClick={() => dispatch({ type: 'align', mode: 'hcenter' })} disabled={!count} testId="align-hcenter">
        <AlignCenterVertical className={ic} />
      </ToolButton>
      <ToolButton label={t('de.alignRight')} onClick={() => dispatch({ type: 'align', mode: 'right' })} disabled={!count}>
        <AlignEndVertical className={ic} />
      </ToolButton>
      <ToolButton label={t('de.alignTop')} onClick={() => dispatch({ type: 'align', mode: 'top' })} disabled={!count}>
        <AlignStartHorizontal className={ic} />
      </ToolButton>
      <ToolButton label={t('de.alignVCenter')} onClick={() => dispatch({ type: 'align', mode: 'vcenter' })} disabled={!count}>
        <AlignCenterHorizontal className={ic} />
      </ToolButton>
      <ToolButton label={t('de.alignBottom')} onClick={() => dispatch({ type: 'align', mode: 'bottom' })} disabled={!count}>
        <AlignEndHorizontal className={ic} />
      </ToolButton>
      <ToolButton label={t('de.distributeH')} onClick={() => dispatch({ type: 'distribute', axis: 'x' })} disabled={count < 3}>
        <AlignHorizontalDistributeCenter className={ic} />
      </ToolButton>
      <ToolButton label={t('de.distributeV')} onClick={() => dispatch({ type: 'distribute', axis: 'y' })} disabled={count < 3}>
        <AlignVerticalDistributeCenter className={ic} />
      </ToolButton>
    </div>
  );
}

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** Undo/redo, zoom, sides, view options and the selection's arrange tools. */
export function EditorToolbar({
  dispatch,
  canUndo,
  canRedo,
  view,
  setView,
  onFit,
  onZoom,
  sides,
  sideId,
  count,
  grouped,
  card,
}: {
  dispatch: Dispatch<EditorAction>;
  canUndo: boolean;
  canRedo: boolean;
  view: ViewState;
  setView: (fn: (v: ViewState) => ViewState) => void;
  onFit: () => void;
  onZoom: (z: number) => void;
  sides: { id: string; label: string }[];
  sideId: string;
  count: number;
  grouped: boolean;
  card: boolean;
}) {
  const { t } = useI18n();
  const ic = 'size-4';
  const toggle = (k: 'grid' | 'snap' | 'smartGuides' | 'margins' | 'bleed' | 'rulers') => setView((v) => ({ ...v, [k]: !v[k] }));
  return (
    <div role="toolbar" aria-label={t('de.toolbar')} className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-card px-2">
      <ToolButton label={t('de.undo')} shortcut="Control+Z" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} testId="undo">
        <Undo2 className={ic} />
      </ToolButton>
      <ToolButton label={t('de.redo')} shortcut="Control+Shift+Z" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} testId="redo">
        <Redo2 className={ic} />
      </ToolButton>
      <Sep />
      <ToolButton label={t('de.zoomOut')} shortcut="-" onClick={() => onZoom(view.zoom / 1.25)} disabled={view.zoom <= ZOOM_MIN}>
        <Minus className={ic} />
      </ToolButton>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="flex h-8 w-[74px] items-center justify-center gap-1 rounded-md text-[12px] font-medium tabular-nums hover:bg-muted" aria-label={t('de.zoom')} data-testid="zoom-menu">
            {Math.round(view.zoom * 100)}% <ChevronDown className="size-3" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={4} className="z-[60] min-w-[150px] rounded-lg border bg-popover p-1 text-[13px] shadow-xl">
            <DropdownMenu.Item onSelect={onFit} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
              {t('de.fitPage')} <span className="text-[11px] text-muted-foreground">Ctrl 0</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            {ZOOMS.map((z) => (
              <DropdownMenu.Item key={z} onSelect={() => onZoom(z)} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
                {Math.round(z * 100)}%{z === 1 && <span className="text-[11px] text-muted-foreground">{t('de.trueSize')}</span>}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ToolButton label={t('de.zoomIn')} shortcut="+" onClick={() => onZoom(view.zoom * 1.25)} disabled={view.zoom >= ZOOM_MAX}>
        <Plus className={ic} />
      </ToolButton>
      <ToolButton label={t('de.fitPage')} shortcut="Control+0" onClick={onFit}>
        <Maximize className={ic} />
      </ToolButton>
      {sides.length > 1 && (
        <>
          <Sep />
          <div role="radiogroup" aria-label={t('de.side')} className="flex rounded-md border p-0.5">
            {sides.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={sideId === s.id} onClick={() => dispatch({ type: 'setSide', sideId: s.id })} className={cn('h-7 rounded px-3 text-[12px] font-medium', sideId === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} data-testid={`side-${s.id}`}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      <Sep />
      <ToolButton label={t('de.view.grid')} pressed={view.grid} onClick={() => toggle('grid')} shortcut="Control+'">
        <Grid3x3 className={ic} />
      </ToolButton>
      <ToolButton label={t('de.view.snap')} pressed={view.snap} onClick={() => toggle('snap')}>
        <Magnet className={ic} />
      </ToolButton>
      <ToolButton label={t('de.view.guides')} pressed={view.smartGuides} onClick={() => toggle('smartGuides')}>
        <Scan className={ic} />
      </ToolButton>
      <ToolButton label={card ? t('de.view.safeBleed') : t('de.view.margins')} pressed={card ? view.margins && view.bleed : view.margins} onClick={() => setView((v) => (card ? { ...v, margins: !(v.margins && v.bleed), bleed: !(v.margins && v.bleed) } : { ...v, margins: !v.margins }))}>
        <Eye className={ic} />
      </ToolButton>
      <ToolButton label={t('de.view.rulers')} pressed={view.rulers} onClick={() => toggle('rulers')}>
        <Ruler className={ic} />
      </ToolButton>
      <Sep />
      <AlignTools dispatch={dispatch} count={count} />
      <Sep />
      <ToolButton label={t('de.bringToFront')} shortcut="Control+Shift+]" onClick={() => dispatch({ type: 'zorder', to: 'front' })} disabled={!count} testId="bring-front">
        <BringToFront className={ic} />
      </ToolButton>
      <ToolButton label={t('de.sendToBack')} shortcut="Control+Shift+[" onClick={() => dispatch({ type: 'zorder', to: 'back' })} disabled={!count}>
        <SendToBack className={ic} />
      </ToolButton>
      <ToolButton label={grouped ? t('de.ungroup') : t('de.groupAction')} shortcut={grouped ? 'Control+Shift+G' : 'Control+G'} onClick={() => dispatch({ type: grouped ? 'ungroup' : 'group' })} disabled={grouped ? false : count < 2}>
        {grouped ? <Ungroup className={ic} /> : <Group className={ic} />}
      </ToolButton>
      <ToolButton label={t('de.lock')} shortcut="Control+L" onClick={() => dispatch({ type: 'toggleLock' })} disabled={!count}>
        <Lock className={ic} />
      </ToolButton>
      <ToolButton label={t('de.duplicate')} shortcut="Control+D" onClick={() => dispatch({ type: 'duplicate' })} disabled={!count}>
        <Copy className={ic} />
      </ToolButton>
      <ToolButton label={t('de.delete')} shortcut="Delete" onClick={() => dispatch({ type: 'remove' })} disabled={!count}>
        <Trash2 className={ic} />
      </ToolButton>
    </div>
  );
}
