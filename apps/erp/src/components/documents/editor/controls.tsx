'use client';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Minus, Plus, Trash2 } from 'lucide-react';
import { Popover } from 'radix-ui';
import { type ReactNode, useId, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { COLOR_REF, COLOR_TOKENS, type Fill, FONT_FAMILIES, FONT_FAMILY_INFO, type FontFamilyId, type Palette, resolveColor, type Stroke, type TextStyle } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';

/** Editor field label + control, stacked. */
export function Row({ label, children, className, htmlFor }: { label: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1', className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A titled group in the properties panel. */
export function Section({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2.5 border-b px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export const inputClass = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary/50 aria-[invalid=true]:border-destructive';

/**
 * A number field that accepts typing freely and commits valid numbers (clamped), with an optional
 * unit; arrow keys step (Shift for ten steps).
 */
export function NumberField({ value, onChange, min = -Infinity, max = Infinity, step = 1, unit, label, invalid, id, decimals = 2 }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label: string; invalid?: boolean; id?: string; decimals?: number }) {
  const fmt = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : String(Math.round(v * 10 ** decimals) / 10 ** decimals));
  // While typing, the field shows what was typed; otherwise the value.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? fmt(value);
  const setText = setDraft;
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="relative">
      <input
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        className={cn(inputClass, unit && 'pr-8', 'tabular-nums')}
        value={text}
        onFocus={() => setDraft(fmt(value))}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = Number(text) || 0;
            const next = Math.min(max, Math.max(min, Math.round((cur + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)) * 1000) / 1000));
            setText(fmt(next));
            onChange(next);
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

export function SelectField<T extends string>({ value, onChange, options, label, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; id?: string }) {
  return (
    <select id={id} aria-label={label} className={cn(inputClass, 'pr-6')} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50', checked ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
    </label>
  );
}

/** A row of icon buttons where one is pressed. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.label}
          aria-label={o.label}
          onClick={() => onChange(o.value)}
          className={cn('flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-primary/50', value === o.value ? 'bg-primary/12 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted')}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

const TOKEN_LABEL: Record<string, MessageKey> = {
  primary: 'br.c.primary',
  secondary: 'br.c.secondary',
  tertiary: 'br.c.tertiary',
  accent: 'br.c.accent',
  ink: 'br.c.ink',
  paper: 'br.c.paper',
  muted: 'de.c.muted',
  line: 'de.c.line',
  white: 'br.c.white',
  black: 'de.c.black',
};
const TINTS = [100, 70, 50, 35, 20, 12, 6];
const SHADES = [20, 40];

/** "Primary 20 %", "Primary, 30 % darker" or the hex, for a colour reference. */
export function useColorName() {
  const { t } = useI18n();
  return (ref: string) => {
    const m = /^([a-z]+)(?:([.!])(\d{1,3}))?$/.exec(ref);
    if (!m || !TOKEN_LABEL[m[1]]) return ref.toUpperCase();
    const base = t(TOKEN_LABEL[m[1]]);
    if (!m[2]) return base;
    return m[2] === '.' ? t('de.c.tint', { name: base, n: m[3] }) : t('de.c.shade', { name: base, n: m[3] });
  };
}

/** A colour: the institution's palette tokens (with tints and shades) or any hex. */
export function ColorField({ value, onChange, palette, label, allowNone, onNone }: { value: string | undefined; onChange: (v: string) => void; palette: Palette; label: string; allowNone?: boolean; onNone?: () => void }) {
  const { t } = useI18n();
  const name = useColorName();
  const [hex, setHex] = useState('');
  const id = useId();
  const m = value ? /^([a-z]+)(?:([.!])(\d{1,3}))?$/.exec(value) : null;
  const base = m?.[1] ?? null;
  const swatch = value ? resolveColor(value, palette) : 'transparent';
  return (
    <Popover.Root onOpenChange={(o) => o && setHex(value && value.startsWith('#') ? value : resolveColor(value ?? 'ink', palette))}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`${label}: ${value ? name(value) : t('de.none')}`} className={cn(inputClass, 'flex items-center gap-2 text-left')}>
          <span className="size-4 shrink-0 rounded-[4px] border shadow-inner" style={{ background: value ? swatch : 'repeating-linear-gradient(45deg,#ddd 0 3px,#fff 3px 6px)' }} />
          <span className="truncate">{value ? name(value) : t('de.none')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="z-[60] w-[260px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl outline-none">
          <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{t('de.c.palette')}</div>
          <div className="grid grid-cols-5 gap-1.5" role="listbox" aria-label={t('de.c.palette')}>
            {COLOR_TOKENS.map((tok) => (
              <button
                key={tok}
                type="button"
                role="option"
                aria-selected={base === tok}
                title={t(TOKEN_LABEL[tok])}
                aria-label={t(TOKEN_LABEL[tok])}
                onClick={() => onChange(tok)}
                className={cn('h-7 rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-primary', base === tok && 'ring-2 ring-primary ring-offset-1')}
                style={{ background: resolveColor(tok, palette) }}
              />
            ))}
          </div>
          {base && (
            <>
              <div className="mt-3 mb-1.5 text-[11px] font-semibold text-muted-foreground">{t('de.c.tints', { name: t(TOKEN_LABEL[base]) })}</div>
              <div className="flex gap-1">
                {TINTS.map((n) => {
                  const ref = n === 100 ? base : `${base}.${n}`;
                  return <button key={n} type="button" title={name(ref)} aria-label={name(ref)} onClick={() => onChange(ref)} className={cn('h-6 flex-1 rounded border outline-none focus-visible:ring-2 focus-visible:ring-primary', value === ref && 'ring-2 ring-primary ring-offset-1')} style={{ background: resolveColor(ref, palette) }} />;
                })}
                {SHADES.map((n) => {
                  const ref = `${base}!${n}`;
                  return <button key={`s${n}`} type="button" title={name(ref)} aria-label={name(ref)} onClick={() => onChange(ref)} className={cn('h-6 flex-1 rounded border outline-none focus-visible:ring-2 focus-visible:ring-primary', value === ref && 'ring-2 ring-primary ring-offset-1')} style={{ background: resolveColor(ref, palette) }} />;
                })}
              </div>
            </>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input type="color" aria-label={t('de.c.custom')} value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'} onChange={(e) => onChange(e.target.value.toLowerCase())} className="h-8 w-9 cursor-pointer rounded border bg-transparent p-0.5" />
            <input
              id={id}
              aria-label={t('br.hex')}
              className={cn(inputClass, 'font-mono')}
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                if (COLOR_REF.test(e.target.value.trim())) onChange(e.target.value.trim().toLowerCase());
              }}
              placeholder="#1f3a5f"
            />
          </div>
          {allowNone && (
            <button type="button" onClick={onNone} className="mt-2 w-full rounded-md border py-1.5 text-[12px] hover:bg-muted">
              {t('de.none')}
            </button>
          )}
          <p className="m-0 mt-2 text-[11px] leading-snug text-muted-foreground">{t('de.c.help')}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------------------------
// Fills (solid or gradient)
// ---------------------------------------------------------------------------------------------

const fillCss = (f: Fill, palette: Palette) => {
  if (typeof f === 'string') return resolveColor(f, palette);
  const stops = [...f.stops].sort((a, b) => a.at - b.at).map((s) => `${resolveColor(s.color, palette)} ${Math.round(s.at * 100)}%`).join(', ');
  return f.kind === 'linear' ? `linear-gradient(${f.angleDeg + 90}deg, ${stops})` : `radial-gradient(circle at ${Math.round((f.cx ?? 0.5) * 100)}% ${Math.round((f.cy ?? 0.5) * 100)}%, ${stops})`;
};

/** A fill: none (when optional), a colour, or a linear or radial gradient with editable stops. */
export function FillField({ value, onChange, palette, label, optional = true }: { value: Fill | undefined; onChange: (v: Fill | undefined) => void; palette: Palette; label: string; optional?: boolean }) {
  const { t } = useI18n();
  const mode = value === undefined ? 'none' : typeof value === 'string' ? 'solid' : value.kind;
  const first = value === undefined ? 'primary' : typeof value === 'string' ? value : value.stops[0].color;
  const setMode = (m: string) => {
    if (m === 'none') onChange(undefined);
    else if (m === 'solid') onChange(first);
    else {
      const stops = typeof value === 'object' ? value.stops : [{ at: 0, color: first }, { at: 1, color: first === 'primary' ? 'tertiary' : 'paper' }];
      onChange(m === 'linear' ? { kind: 'linear', angleDeg: typeof value === 'object' && value.kind === 'linear' ? value.angleDeg : 0, stops } : { kind: 'radial', cx: 0.5, cy: 0.5, r: 1, stops });
    }
  };
  const modes = [...(optional ? [{ value: 'none', label: t('de.none') }] : []), { value: 'solid', label: t('de.fill.solid') }, { value: 'linear', label: t('de.fill.linear') }, { value: 'radial', label: t('de.fill.radial') }];
  return (
    <div className="grid gap-2" role="group" aria-label={label}>
      <Segmented value={mode} onChange={setMode} options={modes} label={label} />
      {typeof value === 'string' && <ColorField value={value} onChange={onChange} palette={palette} label={label} />}
      {typeof value === 'object' && (
        <div className="grid gap-2 rounded-md border bg-muted/30 p-2">
          <div className="h-5 rounded border" style={{ background: fillCss(value, palette) }} aria-hidden />
          {value.kind === 'linear' ? (
            <Row label={t('de.fill.angle')}>
              <div className="flex items-center gap-2">
                <input type="range" min={-180} max={180} step={5} value={value.angleDeg} aria-label={t('de.fill.angle')} onChange={(e) => onChange({ ...value, angleDeg: Number(e.target.value) })} className="flex-1 accent-primary" />
                <span className="w-10 text-right text-[12px] tabular-nums">{value.angleDeg}°</span>
              </div>
            </Row>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Row label={t('de.fill.cx')}>
                <NumberField label={t('de.fill.cx')} value={Math.round((value.cx ?? 0.5) * 100)} min={-100} max={200} unit="%" onChange={(v) => onChange({ ...value, cx: v / 100 })} decimals={0} />
              </Row>
              <Row label={t('de.fill.cy')}>
                <NumberField label={t('de.fill.cy')} value={Math.round((value.cy ?? 0.5) * 100)} min={-100} max={200} unit="%" onChange={(v) => onChange({ ...value, cy: v / 100 })} decimals={0} />
              </Row>
              <Row label={t('de.fill.r')}>
                <NumberField label={t('de.fill.r')} value={Math.round((value.r ?? 1) * 100)} min={1} max={300} unit="%" onChange={(v) => onChange({ ...value, r: v / 100 })} decimals={0} />
              </Row>
            </div>
          )}
          <div className="text-[11px] font-medium text-muted-foreground">{t('de.fill.stops')}</div>
          {value.stops.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_64px_28px] items-center gap-1.5">
              <ColorField value={s.color} palette={palette} label={t('de.fill.stopN', { n: i + 1 })} onChange={(c) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })} />
              <NumberField label={t('de.fill.at')} value={Math.round(s.at * 100)} min={0} max={100} unit="%" decimals={0} onChange={(v) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, at: v / 100 } : x)) })} />
              <button type="button" disabled={value.stops.length <= 2} aria-label={t('de.fill.removeStop')} title={t('de.fill.removeStop')} onClick={() => onChange({ ...value, stops: value.stops.filter((_, j) => j !== i) })} className="grid size-7 place-items-center rounded hover:bg-muted disabled:opacity-30">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {value.stops.length < 12 && (
            <button type="button" onClick={() => onChange({ ...value, stops: [...value.stops, { at: 0.5, color: 'secondary' }].sort((a, b) => a.at - b.at) })} className="flex items-center justify-center gap-1 rounded-md border border-dashed py-1 text-[12px] hover:bg-muted">
              <Plus className="size-3.5" /> {t('de.fill.addStop')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Strokes
// ---------------------------------------------------------------------------------------------

/** A line style: on or off, colour, width in points, solid / dashed / dotted. */
export function StrokeField({ value, onChange, palette, label, optional = true }: { value: Stroke | undefined; onChange: (v: Stroke | undefined) => void; palette: Palette; label: string; optional?: boolean }) {
  const { t } = useI18n();
  const dash = !value?.dashMm?.length ? 'solid' : value.dashMm[0] <= 0.6 ? 'dotted' : 'dashed';
  return (
    <div className="grid gap-2">
      {optional && <Toggle checked={!!value} onChange={(on) => onChange(on ? { color: 'ink', widthPt: 0.75 } : undefined)} label={label} />}
      {value && (
        <div className="grid grid-cols-[1fr_76px] gap-2">
          <ColorField value={value.color} palette={palette} label={t('de.color')} onChange={(c) => onChange({ ...value, color: c })} />
          <NumberField label={t('de.stroke.width')} value={value.widthPt} min={0.05} max={40} step={0.25} unit="pt" onChange={(v) => onChange({ ...value, widthPt: v })} />
          <div className="col-span-2">
            <Segmented
              label={t('de.stroke.style')}
              value={dash}
              onChange={(d) => onChange({ ...value, dashMm: d === 'solid' ? undefined : d === 'dashed' ? [2, 1] : [0.3, 0.8], cap: d === 'dotted' ? 'round' : value.cap })}
              options={[
                { value: 'solid', label: t('de.stroke.solid') },
                { value: 'dashed', label: t('de.stroke.dashed') },
                { value: 'dotted', label: t('de.stroke.dotted') },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Text style
// ---------------------------------------------------------------------------------------------

/** Font (the branding's heading or body font, or a family), size, weight, italic, colour, alignment, spacing and case. */
export function TextStyleField({ value, onChange, palette, fonts, compact }: { value: TextStyle; onChange: (v: TextStyle) => void; palette: Palette; fonts: { heading: FontFamilyId; body: FontFamilyId }; compact?: boolean }) {
  const { t } = useI18n();
  const family: FontFamilyId = value.font === 'heading' ? fonts.heading : value.font === 'body' ? fonts.body : value.font;
  const weights = FONT_FAMILY_INFO[family].weights;
  const set = (p: Partial<TextStyle>) => onChange({ ...value, ...p });
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_76px] gap-2">
        <SelectField
          label={t('de.font')}
          value={value.font}
          onChange={(f) => {
            const fam: FontFamilyId = f === 'heading' ? fonts.heading : f === 'body' ? fonts.body : (f as FontFamilyId);
            const w = FONT_FAMILY_INFO[fam].weights;
            set({ font: f, weight: w.includes(value.weight) ? value.weight : w.includes(700) && value.weight > 400 ? 700 : 400 });
          }}
          options={[
            { value: 'heading', label: t('de.font.heading', { name: FONT_FAMILY_INFO[fonts.heading].label }) },
            { value: 'body', label: t('de.font.body', { name: FONT_FAMILY_INFO[fonts.body].label }) },
            ...FONT_FAMILIES.map((f) => ({ value: f, label: FONT_FAMILY_INFO[f].label })),
          ]}
        />
        <NumberField label={t('de.size')} value={value.sizePt} min={2} max={200} step={0.5} unit="pt" onChange={(v) => set({ sizePt: v })} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <ColorField value={value.color} palette={palette} label={t('de.color')} onChange={(c) => set({ color: c })} />
        <div className="flex gap-1">
          <button type="button" aria-pressed={value.weight === 700} aria-label={t('de.bold')} title={t('de.bold')} onClick={() => set({ weight: value.weight === 700 ? 400 : weights.includes(700) ? 700 : 600 })} className={cn('grid size-8 place-items-center rounded-md border', value.weight >= 600 && 'bg-primary/12 text-primary')}>
            <Bold className="size-4" />
          </button>
          <button type="button" aria-pressed={!!value.italic} aria-label={t('de.italic')} title={t('de.italic')} onClick={() => set({ italic: !value.italic || undefined })} className={cn('grid size-8 place-items-center rounded-md border', value.italic && 'bg-primary/12 text-primary')}>
            <Italic className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField label={t('de.weight')} value={String(value.weight) as '400' | '600' | '700'} onChange={(w) => set({ weight: Number(w) as 400 | 600 | 700 })} options={weights.map((w) => ({ value: String(w) as '400' | '600' | '700', label: t(`de.weight.${w}` as MessageKey) }))} />
        <Segmented
          label={t('de.align')}
          value={value.align}
          onChange={(a) => set({ align: a })}
          options={[
            { value: 'left', label: t('de.align.left'), icon: <AlignLeft className="size-3.5" /> },
            { value: 'center', label: t('de.align.center'), icon: <AlignCenter className="size-3.5" /> },
            { value: 'right', label: t('de.align.right'), icon: <AlignRight className="size-3.5" /> },
            { value: 'justify', label: t('de.align.justify'), icon: <AlignJustify className="size-3.5" /> },
          ]}
        />
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <Row label={t('de.lineHeight')}>
            <NumberField label={t('de.lineHeight')} value={value.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => set({ lineHeight: v })} />
          </Row>
          <Row label={t('de.letterSpacing')}>
            <NumberField label={t('de.letterSpacing')} value={value.letterSpacingPt ?? 0} min={-2} max={30} step={0.25} unit="pt" onChange={(v) => set({ letterSpacingPt: v || undefined })} />
          </Row>
          <Row label={t('de.case')} className="col-span-2">
            <SelectField
              label={t('de.case')}
              value={value.transform ?? 'none'}
              onChange={(v) => set({ transform: v === 'none' ? undefined : v })}
              options={(['none', 'uppercase', 'lowercase', 'capitalize'] as const).map((v) => ({ value: v, label: t(`de.case.${v}` as MessageKey) }))}
            />
          </Row>
        </div>
      )}
    </div>
  );
}

/** A small stepper for counts (table columns). */
export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)} className="grid size-7 place-items-center rounded border disabled:opacity-40">
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center text-[13px] tabular-nums">{value}</span>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)} className="grid size-7 place-items-center rounded border disabled:opacity-40">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
