'use client';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, LockOpen, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { type Dispatch, useEffect, useId, useRef } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { currentSide, type EditorAction, type EditorState, type LayoutProblem, pageMm } from '@/lib/doc-editor/model';
import { type DocBinding, type DocData, type DocElement, type DocLayout, type ElementOf, FONT_FAMILIES, FONT_FAMILY_INFO, type FontFamilyId, FRAMES, IMAGE_SOURCES, type ImageSource, type Palette, PATTERNS, SIGNATORY_ROLES, type TextStyle } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import { BindingPicker, BindingText } from './BindingPicker';
import { ColorField, FillField, NumberField, Row, Section, Segmented, SelectField, Stepper, StrokeField, TextStyleField, Toggle } from './controls';
import { AlignTools } from './Toolbar';

type Up = (patch: Partial<DocElement>, key?: string) => void;

export interface PanelEnv {
  palette: Palette;
  /** The fonts `heading` and `body` stand for in this template. */
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  /** The institution's branding fonts. */
  brandFonts: { heading: FontFamilyId; body: FontFamilyId };
  bindings: DocBinding[];
  data: DocData;
  problems: LayoutProblem[];
  /** The element with the same id in the design this one was copied from (for "Reset"). */
  presetElement: (sideId: string, id: string) => DocElement | null;
  canUpload: boolean;
  onUpload: (source: ImageSource) => void;
  /** Goes up by one when the text of the selected element should take the focus (a double-click on the canvas). */
  focusText: number;
}

/** What is on the right: the selected element's properties, the selection's tools, or the page's. */
export function PropertiesPanel({ state, dispatch, env }: { state: EditorState; dispatch: Dispatch<EditorAction>; env: PanelEnv }) {
  const side = currentSide(state);
  const selected = side.elements.filter((e) => state.selection.includes(e.id));
  if (selected.length === 1) return <ElementPanel key={selected[0].id} e={selected[0]} state={state} dispatch={dispatch} env={env} />;
  if (selected.length > 1) return <MultiPanel selected={selected} state={state} dispatch={dispatch} />;
  return <PagePanel state={state} dispatch={dispatch} env={env} />;
}

const ELEMENT_LABEL: Record<DocElement['type'], MessageKey> = {
  text: 'de.el.text',
  field: 'de.el.field',
  fieldList: 'de.el.fieldList',
  image: 'de.el.image',
  signature: 'de.el.signature',
  qr: 'de.el.qr',
  barcode: 'de.el.barcode',
  table: 'de.el.table',
  shape: 'de.el.shape',
  watermark: 'de.el.watermark',
  pattern: 'de.el.pattern',
  frame: 'de.el.frame',
  seal: 'de.el.seal',
};
export const elementLabel = (e: DocElement): MessageKey => ELEMENT_LABEL[e.type];

function Problems({ list }: { list: LayoutProblem[] }) {
  const { t } = useI18n();
  if (!list.length) return null;
  return (
    <div role="alert" className="mx-3.5 mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[12px] text-destructive" data-testid="element-problems">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-3.5" /> {t('de.problems')}
      </div>
      <ul className="m-0 grid gap-0.5 pl-4">
        {list.map((p, i) => (
          <li key={i}>
            {p.field && <code className="mr-1 text-[11px]">{p.field}</code>}
            {p.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ElementPanel({ e, state, dispatch, env }: { e: DocElement; state: EditorState; dispatch: Dispatch<EditorAction>; env: PanelEnv }) {
  const { t } = useI18n();
  const up: Up = (patch, key) => dispatch({ type: 'update', id: e.id, patch, key, at: Date.now() });
  const bad = (field: string) => env.problems.some((p) => p.elementId === e.id && (p.field === field || p.field.startsWith(`${field}.`)));
  const mine = env.problems.filter((p) => p.elementId === e.id && p.sideId === state.sideId);
  const preset = env.presetElement(state.sideId, e.id);
  const side = currentSide(state);
  const earlier = side.elements.slice(0, side.elements.findIndex((x) => x.id === e.id));
  const nameId = useId();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="properties">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t(elementLabel(e))}</div>
          <input id={nameId} aria-label={t('de.name')} value={e.name ?? ''} placeholder={e.id} onChange={(ev) => dispatch({ type: 'rename', id: e.id, name: ev.target.value, at: Date.now() })} className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[14px] font-semibold outline-none hover:border-border focus:border-primary" />
        </div>
        <IconBtn label={e.locked ? t('de.unlock') : t('de.lock')} onClick={() => dispatch({ type: 'toggleLock', ids: [e.id] })}>
          {e.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
        </IconBtn>
        <IconBtn label={e.hidden ? t('de.show') : t('de.hide')} onClick={() => dispatch({ type: 'toggleHide', ids: [e.id] })}>
          {e.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconBtn>
        <IconBtn label={t('de.duplicate')} onClick={() => dispatch({ type: 'duplicate' })}>
          <Copy className="size-4" />
        </IconBtn>
        <IconBtn label={t('de.delete')} onClick={() => dispatch({ type: 'remove' })} danger disabled={e.locked}>
          <Trash2 className="size-4" />
        </IconBtn>
      </div>
      <Problems list={mine} />
      {e.locked && <p className="m-0 mx-3.5 mt-3 rounded-md bg-muted px-2.5 py-2 text-[12px] text-muted-foreground">{t('de.lockedNote')}</p>}

      <Section title={t('de.positionSize')}>
        <div className="grid grid-cols-2 gap-2">
          <Row label="X">
            <NumberField label="X" value={e.x} min={-500} max={2000} step={0.5} unit="mm" invalid={bad('x')} onChange={(v) => up({ x: v }, 'x')} />
          </Row>
          <Row label="Y">
            <NumberField label="Y" value={e.y} min={-500} max={2000} step={0.5} unit="mm" invalid={bad('y')} onChange={(v) => up({ y: v }, 'y')} />
          </Row>
          <Row label={t('de.width')}>
            <NumberField label={t('de.width')} value={e.w} min={0} max={2000} step={0.5} unit="mm" invalid={bad('w')} onChange={(v) => up({ w: v }, 'w')} />
          </Row>
          <Row label={t('de.height')}>
            <NumberField label={t('de.height')} value={e.h} min={0} max={2000} step={0.5} unit="mm" invalid={bad('h')} onChange={(v) => up({ h: v }, 'h')} />
          </Row>
          <Row label={t('de.rotation')}>
            <NumberField label={t('de.rotation')} value={e.rotationDeg ?? 0} min={-360} max={360} step={1} unit="°" onChange={(v) => up({ rotationDeg: v || undefined }, 'rot')} />
          </Row>
          <Row label={t('de.opacity')}>
            <NumberField label={t('de.opacity')} value={Math.round((e.opacity ?? 1) * 100)} min={0} max={100} step={5} unit="%" decimals={0} invalid={bad('opacity')} onChange={(v) => up({ opacity: v >= 100 ? undefined : v / 100 }, 'opacity')} />
          </Row>
        </div>
      </Section>

      <TypeSections e={e} up={up} env={env} bad={bad} />

      <Section title={t('de.advanced')}>
        <Row label={t('de.showIf')}>
          <SelectField
            label={t('de.showIf')}
            value={e.showIf ?? ''}
            onChange={(v) => up({ showIf: v || undefined })}
            options={[{ value: '', label: t('de.always') }, ...env.bindings.filter((b) => b.kind === 'value' || b.kind === 'list').map((b) => ({ value: b.key, label: t('de.whenHas', { field: b.key }) }))]}
          />
        </Row>
        {earlier.length > 0 && (
          <Row label={t('de.flowAfter')}>
            <SelectField label={t('de.flowAfter')} value={e.flowAfter ?? ''} onChange={(v) => up({ flowAfter: v || undefined })} options={[{ value: '', label: t('de.none') }, ...earlier.map((x) => ({ value: x.id, label: x.name ?? x.id }))]} />
          </Row>
        )}
        <Row label={t('de.pages')}>
          <SelectField label={t('de.pages')} value={e.pages ?? 'all'} onChange={(v) => up({ pages: v === 'all' ? undefined : v })} options={(['all', 'first', 'last'] as const).map((v) => ({ value: v, label: t(`de.pages.${v}` as MessageKey) }))} />
        </Row>
        {preset && (
          <button type="button" onClick={() => dispatch({ type: 'replace', id: e.id, element: preset })} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium hover:bg-muted" data-testid="reset-element">
            <RotateCcw className="size-3.5" /> {t('de.resetElement')}
          </button>
        )}
      </Section>
    </div>
  );
}

function IconBtn({ label, onClick, children, danger, disabled }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn('grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40', danger && 'hover:text-destructive')}>
      {children}
    </button>
  );
}

const imageLabel = (s: ImageSource): MessageKey => (s.startsWith('signature:') ? (`de.img.sig.${s.split(':')[1]}` as MessageKey) : (`de.img.${s}` as MessageKey));

/** The properties special to each type of element. */
function TypeSections({ e, up, env, bad }: { e: DocElement; up: Up; env: PanelEnv; bad: (f: string) => boolean }) {
  const { t } = useI18n();
  const P = env.palette;
  const style = (s: TextStyle, on: (s: TextStyle) => void, compact?: boolean) => <TextStyleField value={s} onChange={on} palette={P} fonts={env.fonts} compact={compact} />;
  const lists = env.bindings.filter((b) => b.kind === 'list');
  switch (e.type) {
    case 'text':
      return (
        <>
          <Section title={t('de.content')}>
            <TextContent e={e} up={up} env={env} invalid={bad('text')} />
            <Toggle checked={!!e.markdown} onChange={(v) => up({ markdown: v || undefined })} label={t('de.markdown')} />
          </Section>
          <Section title={t('de.typography')}>
            {style(e.style, (s) => up({ style: s }, 'style'))}
            <div className="grid grid-cols-2 gap-2">
              <Row label={t('de.vAlign')}>
                <SelectField label={t('de.vAlign')} value={e.vAlign} onChange={(v) => up({ vAlign: v })} options={(['top', 'middle', 'bottom'] as const).map((v) => ({ value: v, label: t(`de.vAlign.${v}` as MessageKey) }))} />
              </Row>
              <Row label={t('de.maxLines')}>
                <NumberField label={t('de.maxLines')} value={e.maxLines} min={1} max={500} decimals={0} onChange={(v) => up({ maxLines: Math.round(v) || undefined }, 'maxLines')} />
              </Row>
            </div>
            <Toggle checked={e.fit === 'shrink'} onChange={(v) => up({ fit: v ? 'shrink' : 'none' })} label={t('de.shrinkToFit')} />
            {e.fit === 'shrink' && (
              <Row label={t('de.minSize')}>
                <NumberField label={t('de.minSize')} value={e.minSizePt ?? e.style.sizePt * 0.5} min={2} max={200} step={0.5} unit="pt" onChange={(v) => up({ minSizePt: v }, 'minSize')} />
              </Row>
            )}
            {e.markdown && (
              <Row label={t('de.emphasisColor')}>
                <ColorField value={e.emphasisColor} palette={P} label={t('de.emphasisColor')} onChange={(c) => up({ emphasisColor: c })} allowNone onNone={() => up({ emphasisColor: undefined })} />
              </Row>
            )}
          </Section>
        </>
      );
    case 'field':
      return (
        <>
          <Section title={t('de.content')}>
            <BindingText label={t('de.label')} value={e.label} onChange={(v) => up({ label: v }, 'label')} bindings={env.bindings} data={env.data} rows={1} invalid={bad('label')} />
            <BindingText label={t('de.value')} value={e.value} onChange={(v) => up({ value: v }, 'value')} bindings={env.bindings} data={env.data} rows={1} invalid={bad('value')} />
            <div className="grid grid-cols-3 gap-2">
              <Row label={t('de.direction')} className="col-span-3">
                <Segmented label={t('de.direction')} value={e.direction} onChange={(v) => up({ direction: v })} options={[{ value: 'row', label: t('de.direction.row') }, { value: 'column', label: t('de.direction.column') }]} />
              </Row>
              {e.direction === 'row' && (
                <>
                  <Row label={t('de.labelWidth')} className="col-span-2">
                    <NumberField label={t('de.labelWidth')} value={e.labelWidthMm ?? e.w * 0.38} min={0} max={1000} step={0.5} unit="mm" onChange={(v) => up({ labelWidthMm: v }, 'lw')} />
                  </Row>
                  <Row label={t('de.separator')}>
                    <input aria-label={t('de.separator')} maxLength={4} value={e.separator ?? ''} onChange={(ev) => up({ separator: ev.target.value || undefined }, 'sep')} className="h-8 w-full rounded-md border bg-background px-2 text-center text-[13px]" />
                  </Row>
                </>
              )}
            </div>
          </Section>
          <Section title={t('de.labelStyle')}>{style(e.labelStyle, (s) => up({ labelStyle: s }, 'ls'), true)}</Section>
          <Section title={t('de.valueStyle')}>
            {style(e.valueStyle, (s) => up({ valueStyle: s }, 'vs'), true)}
            <StrokeField label={t('de.underline')} value={e.rule} onChange={(r) => up({ rule: r }, 'rule')} palette={P} />
          </Section>
        </>
      );
    case 'fieldList':
      return (
        <>
          <Section title={t('de.content')}>
            <Row label={t('de.list')}>
              <SelectField label={t('de.list')} value={e.source} onChange={(v) => up({ source: v })} options={uniq([e.source, ...lists.map((b) => b.key)]).map((k) => ({ value: k, label: k }))} />
            </Row>
            <div className="grid grid-cols-3 gap-2">
              <Row label={t('de.columns')}>
                <Stepper label={t('de.columns')} value={e.columns} min={1} max={4} onChange={(v) => up({ columns: v })} />
              </Row>
              <Row label={t('de.rowHeight')}>
                <NumberField label={t('de.rowHeight')} value={e.rowHeightMm} min={2} max={100} step={0.5} unit="mm" onChange={(v) => up({ rowHeightMm: v }, 'rh')} />
              </Row>
              <Row label={t('de.labelWidth')}>
                <NumberField label={t('de.labelWidth')} value={e.labelWidthMm ?? e.w * 0.38} min={0} max={1000} step={0.5} unit="mm" onChange={(v) => up({ labelWidthMm: v }, 'lw')} />
              </Row>
            </div>
          </Section>
          <Section title={t('de.labelStyle')}>{style(e.labelStyle, (s) => up({ labelStyle: s }, 'ls'), true)}</Section>
          <Section title={t('de.valueStyle')}>{style(e.valueStyle, (s) => up({ valueStyle: s }, 'vs'), true)}</Section>
        </>
      );
    case 'image':
      return <ImageSections e={e} up={up} env={env} />;
    case 'signature':
      return (
        <>
          <Section title={t('de.content')}>
            <Row label={t('de.signatory')}>
              <SelectField label={t('de.signatory')} value={e.role} onChange={(v) => up({ role: v })} options={SIGNATORY_ROLES.map((r) => ({ value: r, label: t(`br.role.${r}` as MessageKey) }))} />
            </Row>
            <Toggle checked={e.showImage} onChange={(v) => up({ showImage: v })} label={t('de.sig.showImage')} />
            <Toggle checked={e.showName} onChange={(v) => up({ showName: v })} label={t('de.sig.showName')} />
            <Toggle checked={e.showDesignation} onChange={(v) => up({ showDesignation: v })} label={t('de.sig.showDesignation')} />
            <StrokeField label={t('de.sig.line')} value={e.line} onChange={(l) => up({ line: l }, 'line')} palette={P} />
            {env.canUpload && (
              <button type="button" onClick={() => env.onUpload(`signature:${e.role}`)} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium hover:bg-muted">
                <Upload className="size-3.5" /> {t('de.uploadSignature')}
              </button>
            )}
          </Section>
          <Section title={t('de.nameStyle')}>{style(e.nameStyle, (s) => up({ nameStyle: s }, 'ns'), true)}</Section>
          <Section title={t('de.designationStyle')}>{style(e.designationStyle, (s) => up({ designationStyle: s }, 'ds'), true)}</Section>
        </>
      );
    case 'qr':
      return (
        <Section title={t('de.content')}>
          <Toggle checked={e.value === '{{verify.url}}'} onChange={(v) => up({ value: v ? '{{verify.url}}' : '' })} label={t('de.qr.verify')} />
          {e.value !== '{{verify.url}}' && <BindingText label={t('de.qr.value')} value={e.value} onChange={(v) => up({ value: v }, 'value')} bindings={env.bindings} data={env.data} rows={2} invalid={bad('value')} />}
          <p className="m-0 text-[11px] text-muted-foreground">{t('de.qr.help')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('de.color')}>
              <ColorField value={e.color} palette={P} label={t('de.color')} onChange={(c) => up({ color: c })} />
            </Row>
            <Row label={t('de.background')}>
              <ColorField value={e.background} palette={P} label={t('de.background')} onChange={(c) => up({ background: c })} allowNone onNone={() => up({ background: undefined })} />
            </Row>
            <Row label={t('de.qr.quiet')}>
              <Stepper label={t('de.qr.quiet')} value={e.quietZone} min={0} max={4} onChange={(v) => up({ quietZone: v })} />
            </Row>
          </div>
        </Section>
      );
    case 'barcode':
      return (
        <Section title={t('de.content')}>
          <BindingText label={t('de.barcode.value')} value={e.value} onChange={(v) => up({ value: v }, 'value')} bindings={env.bindings} data={env.data} rows={1} invalid={bad('value')} />
          <Row label={t('de.color')}>
            <ColorField value={e.color} palette={P} label={t('de.color')} onChange={(c) => up({ color: c })} />
          </Row>
          <Toggle checked={e.showText} onChange={(v) => up({ showText: v })} label={t('de.barcode.showText')} />
        </Section>
      );
    case 'table':
      return <TableSections e={e} up={up} env={env} />;
    case 'shape':
      return (
        <Section title={t('de.appearance')}>
          <Row label={t('de.shape')}>
            <Segmented label={t('de.shape')} value={e.shape} onChange={(v) => up({ shape: v })} options={(['rect', 'ellipse', 'line'] as const).map((v) => ({ value: v, label: t(`de.shape.${v}` as MessageKey) }))} />
          </Row>
          {e.shape !== 'line' && (
            <Row label={t('de.fill')}>
              <FillField value={e.fill} onChange={(f) => up({ fill: f }, 'fill')} palette={P} label={t('de.fill')} />
            </Row>
          )}
          <StrokeField label={t('de.border')} value={e.stroke} onChange={(s) => up({ stroke: s }, 'stroke')} palette={P} optional={e.shape !== 'line'} />
          {e.shape === 'line' && !e.stroke && (
            <button type="button" className="h-8 rounded-md border text-[12px]" onClick={() => up({ stroke: { color: 'primary', widthPt: 1 } })}>
              {t('de.border')}
            </button>
          )}
          {e.shape === 'rect' && (
            <Row label={t('de.radius')}>
              <NumberField label={t('de.radius')} value={e.radiusMm ?? 0} min={0} max={500} step={0.5} unit="mm" onChange={(v) => up({ radiusMm: v || undefined }, 'radius')} />
            </Row>
          )}
        </Section>
      );
    case 'watermark':
      return (
        <Section title={t('de.content')}>
          <Segmented label={t('de.wm.kind')} value={e.image ? 'image' : 'text'} onChange={(v) => up(v === 'image' ? { image: 'emblem', text: undefined } : { image: undefined, text: '{{institution.name}}' })} options={[{ value: 'text', label: t('de.wm.text') }, { value: 'image', label: t('de.wm.image') }]} />
          {e.image ? (
            <Row label={t('de.image')}>
              <SelectField label={t('de.image')} value={e.image} onChange={(v) => up({ image: v })} options={IMAGE_SOURCES.filter((s) => s !== 'photo').map((s) => ({ value: s, label: t(imageLabel(s)) }))} />
            </Row>
          ) : (
            <BindingText label={t('de.wm.text')} value={e.text ?? ''} onChange={(v) => up({ text: v }, 'text')} bindings={env.bindings} data={env.data} rows={1} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('de.angle')}>
              <NumberField label={t('de.angle')} value={e.angleDeg} min={-90} max={90} unit="°" onChange={(v) => up({ angleDeg: v }, 'angle')} />
            </Row>
            <Row label={t('de.wm.repeat')}>
              <SelectField label={t('de.wm.repeat')} value={e.repeat} onChange={(v) => up({ repeat: v })} options={[{ value: 'none', label: t('de.wm.once') }, { value: 'tile', label: t('de.wm.tile') }]} />
            </Row>
            {e.repeat === 'tile' && (
              <Row label={t('de.gap')}>
                <NumberField label={t('de.gap')} value={e.gapMm ?? 40} min={2} max={200} unit="mm" onChange={(v) => up({ gapMm: v }, 'gap')} />
              </Row>
            )}
          </div>
          {!e.image && style(e.style ?? { font: 'heading', sizePt: 54, weight: 700, color: 'primary.10', align: 'center', lineHeight: 1, letterSpacingPt: 6, transform: 'uppercase' }, (s) => up({ style: s }, 'style'), true)}
        </Section>
      );
    case 'pattern':
      return (
        <Section title={t('de.appearance')}>
          <Row label={t('de.pattern')}>
            <SelectField label={t('de.pattern')} value={e.pattern} onChange={(v) => up({ pattern: v })} options={PATTERNS.map((p) => ({ value: p, label: t(`de.pattern.${p}` as MessageKey) }))} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('de.color')}>
              <ColorField value={e.color} palette={P} label={t('de.color')} onChange={(c) => up({ color: c })} />
            </Row>
            <Row label={t('de.color2')}>
              <ColorField value={e.color2} palette={P} label={t('de.color2')} onChange={(c) => up({ color2: c })} allowNone onNone={() => up({ color2: undefined })} />
            </Row>
            <Row label={t('de.lineWidth')}>
              <NumberField label={t('de.lineWidth')} value={e.lineWidthPt} min={0.05} max={3} step={0.05} unit="pt" onChange={(v) => up({ lineWidthPt: v }, 'lw')} />
            </Row>
            <Row label={t('de.radius')}>
              <NumberField label={t('de.radius')} value={e.radiusMm ?? 0} min={0} max={100} unit="mm" onChange={(v) => up({ radiusMm: v || undefined }, 'radius')} />
            </Row>
          </div>
          <Row label={t('de.density', { n: e.density })}>
            <input type="range" min={1} max={10} step={0.5} value={e.density} aria-label={t('de.density', { n: e.density })} onChange={(ev) => up({ density: Number(ev.target.value) }, 'density')} className="accent-primary" />
          </Row>
          {e.pattern === 'microtext' && <BindingText label={t('de.microtext')} value={e.text ?? '{{institution.name | upper}}'} onChange={(v) => up({ text: v }, 'text')} bindings={env.bindings} data={env.data} rows={1} />}
        </Section>
      );
    case 'frame':
      return (
        <Section title={t('de.appearance')}>
          <Row label={t('de.frameStyle')}>
            <SelectField label={t('de.frameStyle')} value={e.style} onChange={(v) => up({ style: v })} options={FRAMES.map((f) => ({ value: f, label: t(`de.frame.${f}` as MessageKey) }))} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('de.color')}>
              <ColorField value={e.color} palette={P} label={t('de.color')} onChange={(c) => up({ color: c })} />
            </Row>
            <Row label={t('de.color2')}>
              <ColorField value={e.color2} palette={P} label={t('de.color2')} onChange={(c) => up({ color2: c })} allowNone onNone={() => up({ color2: undefined })} />
            </Row>
            <Row label={t('de.stroke.width')}>
              <NumberField label={t('de.stroke.width')} value={e.widthPt} min={0.1} max={20} step={0.25} unit="pt" onChange={(v) => up({ widthPt: v }, 'w')} />
            </Row>
            <Row label={t('de.gap')}>
              <NumberField label={t('de.gap')} value={e.gapMm ?? 1.6} min={0} max={20} step={0.2} unit="mm" onChange={(v) => up({ gapMm: v }, 'gap')} />
            </Row>
            <Row label={t('de.radius')}>
              <NumberField label={t('de.radius')} value={e.radiusMm ?? 0} min={0} max={50} unit="mm" onChange={(v) => up({ radiusMm: v || undefined }, 'radius')} />
            </Row>
          </div>
        </Section>
      );
    case 'seal':
      return (
        <Section title={t('de.appearance')}>
          <Row label={t('de.seal.tone')}>
            <Segmented label={t('de.seal.tone')} value={e.tone} onChange={(v) => up({ tone: v })} options={[{ value: 'silver', label: t('de.seal.silver') }, { value: 'gold', label: t('de.seal.gold') }]} />
          </Row>
          <Row label={t('de.seal.centre')}>
            <SelectField label={t('de.seal.centre')} value={e.emblem} onChange={(v) => up({ emblem: v })} options={(['emblem', 'logo', 'none'] as const).map((v) => ({ value: v, label: t(`de.seal.centre.${v}` as MessageKey) }))} />
          </Row>
          <BindingText label={t('de.seal.ring')} value={e.ringText} onChange={(v) => up({ ringText: v }, 'ring')} bindings={env.bindings} data={env.data} rows={2} />
          <BindingText label={t('de.seal.serial')} value={e.serial} onChange={(v) => up({ serial: v }, 'serial')} bindings={env.bindings} data={env.data} rows={1} />
          <p className="m-0 text-[11px] text-muted-foreground">{t('de.seal.help')}</p>
        </Section>
      );
  }
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

function TextContent({ e, up, env, invalid }: { e: ElementOf<'text'>; up: Up; env: PanelEnv; invalid: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const focusText = env.focusText;
  useEffect(() => {
    if (focusText) area.current?.focus();
  }, [focusText]);
  const insert = (expr: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? e.text.length;
    const end = el?.selectionEnd ?? e.text.length;
    up({ text: e.text.slice(0, start) + expr + e.text.slice(end) }, 'text');
  };
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
          {t('de.text')}
        </label>
        <BindingPicker bindings={env.bindings} data={env.data} onPick={(expr) => insert(expr)} />
      </div>
      <textarea id={id} ref={area} rows={4} value={e.text} aria-invalid={invalid || undefined} onChange={(ev) => up({ text: ev.target.value }, 'text')} className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/50 aria-[invalid=true]:border-destructive" data-testid="text-content" />
    </div>
  );
}

function ImageSections({ e, up, env }: { e: ElementOf<'image'>; up: Up; env: PanelEnv }) {
  const { t } = useI18n();
  const P = env.palette;
  return (
    <>
      <Section title={t('de.content')}>
        <Row label={t('de.image')}>
          <SelectField label={t('de.image')} value={e.source} onChange={(v) => up({ source: v })} options={IMAGE_SOURCES.map((s) => ({ value: s, label: t(imageLabel(s)) }))} />
        </Row>
        {e.source !== 'photo' && env.canUpload && (
          <button type="button" onClick={() => env.onUpload(e.source)} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium hover:bg-muted" data-testid="upload-image">
            <Upload className="size-3.5" /> {t('de.uploadReplace')}
          </button>
        )}
        {e.source !== 'photo' && <p className="m-0 text-[11px] text-muted-foreground">{t('de.brandingImageHelp')}</p>}
        <Row label={t('de.fit')}>
          <Segmented label={t('de.fit')} value={e.fit} onChange={(v) => up({ fit: v })} options={(['contain', 'cover', 'fill'] as const).map((v) => ({ value: v, label: t(`de.fit.${v}` as MessageKey) }))} />
        </Row>
        <Row label={t('de.crop')}>
          <Segmented label={t('de.crop')} value={e.crop} onChange={(v) => up({ crop: v })} options={(['rect', 'rounded', 'circle'] as const).map((v) => ({ value: v, label: t(`de.crop.${v}` as MessageKey) }))} />
        </Row>
        {e.crop === 'rounded' && (
          <Row label={t('de.radius')}>
            <NumberField label={t('de.radius')} value={e.radiusMm ?? Math.min(e.w, e.h) / 8} min={0} max={100} step={0.25} unit="mm" onChange={(v) => up({ radiusMm: v }, 'radius')} />
          </Row>
        )}
        {e.source === 'photo' && (
          <Row label={t('de.placeholder')}>
            <SelectField label={t('de.placeholder')} value={e.placeholder ?? 'initials'} onChange={(v) => up({ placeholder: v })} options={(['initials', 'silhouette', 'none'] as const).map((v) => ({ value: v, label: t(`de.placeholder.${v}` as MessageKey) }))} />
          </Row>
        )}
      </Section>
      <Section title={t('de.appearance')}>
        <StrokeField label={t('de.border')} value={e.border} onChange={(b) => up({ border: b }, 'border')} palette={P} />
        <Row label={t('de.background')}>
          <FillField value={e.background} onChange={(f) => up({ background: f }, 'bg')} palette={P} label={t('de.background')} />
        </Row>
      </Section>
    </>
  );
}

function TableSections({ e, up, env }: { e: ElementOf<'table'>; up: Up; env: PanelEnv }) {
  const { t } = useI18n();
  const P = env.palette;
  const lists = env.bindings.filter((b) => b.kind === 'list');
  const rowKeys = lists.find((b) => b.key === e.source)?.itemKeys ?? [];
  const setCol = (i: number, patch: Partial<ElementOf<'table'>['columns'][number]>) => up({ columns: e.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, `col${i}`);
  const move = (i: number, d: number) => {
    const cols = [...e.columns];
    const [c] = cols.splice(i, 1);
    cols.splice(i + d, 0, c);
    up({ columns: cols });
  };
  const border = (k: 'outer' | 'horizontal' | 'vertical' | 'headerBottom') => <StrokeField label={t(`de.table.border.${k}` as MessageKey)} value={e.borders[k]} onChange={(s) => up({ borders: { ...e.borders, [k]: s } }, `b${k}`)} palette={P} />;
  return (
    <>
      <Section title={t('de.content')}>
        <Row label={t('de.list')}>
          <SelectField label={t('de.list')} value={e.source} onChange={(v) => up({ source: v })} options={uniq([e.source, ...lists.map((b) => b.key)]).map((k) => ({ value: k, label: `${k}${lists.find((b) => b.key === k) ? ` (${lists.find((b) => b.key === k)!.sample})` : ''}` }))} />
        </Row>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">{t('de.table.columns')}</span>
          <button type="button" disabled={e.columns.length >= 16} onClick={() => up({ columns: [...e.columns, { header: t('de.table.newColumn'), value: rowKeys[0] ? `{{row.${rowKeys[0]}}}` : '', width: 1, align: 'left' }] })} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] hover:bg-muted disabled:opacity-40" data-testid="add-column">
            <Plus className="size-3.5" /> {t('de.table.addColumn')}
          </button>
        </div>
        <ol className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0" data-testid="columns">
          {e.columns.map((c, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-md border bg-muted/30 p-2">
              <div className="flex items-center gap-1">
                <input aria-label={t('de.table.header')} value={c.header} onChange={(ev) => setCol(i, { header: ev.target.value })} className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-[12px] font-semibold" />
                <IconBtn label={t('de.moveUp')} onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="size-3.5" />
                </IconBtn>
                <IconBtn label={t('de.moveDown')} onClick={() => move(i, 1)} disabled={i === e.columns.length - 1}>
                  <ArrowDown className="size-3.5" />
                </IconBtn>
                <IconBtn label={t('de.table.removeColumn')} onClick={() => up({ columns: e.columns.filter((_, j) => j !== i) })} disabled={e.columns.length <= 1} danger>
                  <Trash2 className="size-3.5" />
                </IconBtn>
              </div>
              <BindingText label={t('de.table.cell')} value={c.value} onChange={(v) => setCol(i, { value: v })} bindings={env.bindings} data={env.data} rows={1} rowKeys={rowKeys} showPreview={false} />
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField label={t('de.table.width')} value={c.width} min={0.1} max={100} step={0.5} onChange={(v) => setCol(i, { width: v })} />
                <Segmented label={t('de.align')} value={c.align} onChange={(v) => setCol(i, { align: v })} options={(['left', 'center', 'right'] as const).map((v) => ({ value: v, label: t(`de.align.${v}` as MessageKey) }))} />
              </div>
            </li>
          ))}
        </ol>
        <Row label={t('de.table.empty')}>
          <input aria-label={t('de.table.empty')} value={e.emptyText ?? ''} onChange={(ev) => up({ emptyText: ev.target.value || undefined }, 'empty')} className="h-8 w-full rounded-md border bg-background px-2 text-[13px]" />
        </Row>
        <Row label={t('de.table.overflow')}>
          <Segmented label={t('de.table.overflow')} value={e.overflow} onChange={(v) => up({ overflow: v })} options={[{ value: 'paginate', label: t('de.table.paginate') }, { value: 'shrink', label: t('de.table.shrink') }]} />
        </Row>
      </Section>
      <Section title={t('de.table.headerRow')}>
        <Row label={t('de.height')}>
          <NumberField label={t('de.height')} value={e.header.heightMm} min={2} max={60} step={0.5} unit="mm" onChange={(v) => up({ header: { ...e.header, heightMm: v } }, 'hh')} />
        </Row>
        <FillField value={e.header.fill} onChange={(f) => up({ header: { ...e.header, fill: f } }, 'hf')} palette={P} label={t('de.fill')} />
        <TextStyleField value={e.header.style} onChange={(s) => up({ header: { ...e.header, style: s } }, 'hs')} palette={P} fonts={env.fonts} compact />
      </Section>
      <Section title={t('de.table.rows')}>
        <div className="grid grid-cols-2 gap-2">
          <Row label={t('de.rowHeight')}>
            <NumberField label={t('de.rowHeight')} value={e.body.rowHeightMm} min={2} max={60} step={0.5} unit="mm" onChange={(v) => up({ body: { ...e.body, rowHeightMm: v } }, 'rh')} />
          </Row>
          <Row label={t('de.table.padding')}>
            <NumberField label={t('de.table.padding')} value={e.cellPaddingMm} min={0} max={10} step={0.2} unit="mm" onChange={(v) => up({ cellPaddingMm: v }, 'pad')} />
          </Row>
        </div>
        <Row label={t('de.table.zebra')}>
          <FillField value={e.body.zebra} onChange={(f) => up({ body: { ...e.body, zebra: f } }, 'zebra')} palette={P} label={t('de.table.zebra')} />
        </Row>
        <TextStyleField value={e.body.style} onChange={(s) => up({ body: { ...e.body, style: s } }, 'bs')} palette={P} fonts={env.fonts} compact />
      </Section>
      <Section title={t('de.table.borders')}>
        {border('outer')}
        {border('horizontal')}
        {border('vertical')}
        {border('headerBottom')}
      </Section>
      {e.footer && e.footer.length > 0 && (
        <Section title={t('de.table.footer')}>
          {e.footer.map((f, fi) => (
            <div key={fi} className="grid gap-1.5 rounded-md border bg-muted/30 p-2">
              {f.cells.map((c, ci) => (
                <BindingText key={ci} label={t('de.table.footerCell', { n: ci + 1 })} value={c.text} onChange={(v) => up({ footer: e.footer!.map((ff, j) => (j === fi ? { ...ff, cells: ff.cells.map((cc, k) => (k === ci ? { ...cc, text: v } : cc)) } : ff)) }, `f${fi}${ci}`)} bindings={env.bindings} data={env.data} rows={1} />
              ))}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function MultiPanel({ selected, state, dispatch }: { selected: DocElement[]; state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { t } = useI18n();
  const grouped = selected.every((e) => e.group && e.group === selected[0].group);
  const op = selected.every((e) => (e.opacity ?? 1) === (selected[0].opacity ?? 1)) ? Math.round((selected[0].opacity ?? 1) * 100) : undefined;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="properties">
      <div className="border-b px-3.5 py-3">
        <div className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{grouped ? t('de.group') : t('de.selection')}</div>
        <div className="text-[14px] font-semibold">{t('de.nSelected', { n: selected.length })}</div>
      </div>
      <Section title={t('de.arrange')}>
        <AlignTools dispatch={dispatch} count={selected.length} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => dispatch({ type: grouped ? 'ungroup' : 'group' })} className="h-8 rounded-md border text-[12px] font-medium hover:bg-muted" data-testid="group-toggle">
            {grouped ? t('de.ungroup') : t('de.groupAction')}
          </button>
          <button type="button" onClick={() => dispatch({ type: 'duplicate' })} className="h-8 rounded-md border text-[12px] font-medium hover:bg-muted">
            {t('de.duplicate')}
          </button>
          <button type="button" onClick={() => dispatch({ type: 'toggleLock' })} className="h-8 rounded-md border text-[12px] font-medium hover:bg-muted">
            {t('de.lock')}
          </button>
          <button type="button" onClick={() => dispatch({ type: 'remove' })} className="h-8 rounded-md border text-[12px] font-medium text-destructive hover:bg-destructive/5">
            {t('de.delete')}
          </button>
        </div>
      </Section>
      <Section title={t('de.appearance')}>
        <Row label={t('de.opacity')}>
          <NumberField label={t('de.opacity')} value={op} min={0} max={100} step={5} unit="%" decimals={0} onChange={(v) => dispatch({ type: 'updateMany', ids: state.selection, patch: { opacity: v >= 100 ? undefined : v / 100 }, key: 'opacity', at: Date.now() })} />
        </Row>
      </Section>
    </div>
  );
}

function PagePanel({ state, dispatch, env }: { state: EditorState; dispatch: Dispatch<EditorAction>; env: PanelEnv }) {
  const { t } = useI18n();
  const l: DocLayout = state.layout;
  const side = currentSide(state);
  const size = pageMm(l);
  const pageProblems = env.problems.filter((p) => !p.elementId);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="properties">
      <div className="border-b px-3.5 py-3">
        <div className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t('de.page')}</div>
        <div className="text-[14px] font-semibold">{t(`dt.type.${l.docType}` as MessageKey)}</div>
        <p className="m-0 mt-1 text-[12px] text-muted-foreground">{t('de.pageHelp')}</p>
      </div>
      <Problems list={pageProblems} />
      <Section title={t('de.pageSize')}>
        <Row label={t('de.size')}>
          <SelectField
            label={t('de.size')}
            value={l.page.size}
            onChange={(v) => dispatch({ type: 'setPage', patch: v === 'custom' ? { size: v, widthMm: Math.round(size.w), heightMm: Math.round(size.h) } : { size: v } })}
            options={[
              { value: 'A4', label: 'A4 (210 × 297 mm)' },
              { value: 'A5', label: 'A5 (148 × 210 mm)' },
              { value: 'CR80', label: t('de.cr80') },
              { value: 'custom', label: t('de.custom') },
            ]}
          />
        </Row>
        {l.page.size === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('de.width')}>
              <NumberField label={t('de.width')} value={l.page.widthMm} min={20} max={1000} unit="mm" onChange={(v) => dispatch({ type: 'setPage', patch: { widthMm: v }, key: 'w', at: Date.now() })} />
            </Row>
            <Row label={t('de.height')}>
              <NumberField label={t('de.height')} value={l.page.heightMm} min={20} max={1000} unit="mm" onChange={(v) => dispatch({ type: 'setPage', patch: { heightMm: v }, key: 'h', at: Date.now() })} />
            </Row>
          </div>
        )}
        {l.page.size !== 'custom' && (
          <Row label={t('de.orientation')}>
            <Segmented label={t('de.orientation')} value={l.page.orientation} onChange={(v) => dispatch({ type: 'setPage', patch: { orientation: v } })} options={[{ value: 'portrait', label: t('de.portrait') }, { value: 'landscape', label: t('de.landscape') }]} />
          </Row>
        )}
        <Row label={l.page.size === 'CR80' ? t('de.safeMargin') : t('de.margin')}>
          <NumberField label={t('de.margin')} value={l.page.marginMm} min={0} max={50} step={0.5} unit="mm" onChange={(v) => dispatch({ type: 'setPage', patch: { marginMm: v }, key: 'margin', at: Date.now() })} />
        </Row>
        <p className="m-0 text-[11px] text-muted-foreground">{t('de.orientationHelp')}</p>
      </Section>
      <Section title={t('de.sideBackground', { side: side.label ?? side.id })}>
        <FillField value={side.background} onChange={(f) => dispatch({ type: 'setBackground', fill: f, key: 'bg', at: Date.now() })} palette={env.palette} label={t('de.background')} />
      </Section>
      <Section title={t('de.templateFonts')}>
        <p className="m-0 text-[11px] text-muted-foreground">{t('de.templateFontsHelp')}</p>
        {(['heading', 'body'] as const).map((k) => (
          <Row key={k} label={t(k === 'heading' ? 'br.fontHeading' : 'br.fontBody')}>
            <SelectField
              label={t(k === 'heading' ? 'br.fontHeading' : 'br.fontBody')}
              value={l.fonts?.[k] ?? ''}
              onChange={(v) => dispatch({ type: 'setFonts', fonts: { ...l.fonts, [k]: (v || undefined) as FontFamilyId | undefined } })}
              options={[{ value: '', label: t('de.brandFont', { name: FONT_FAMILY_INFO[env.brandFonts[k]].label }) }, ...FONT_FAMILIES.map((f) => ({ value: f, label: FONT_FAMILY_INFO[f].label }))]}
            />
          </Row>
        ))}
      </Section>
    </div>
  );
}
