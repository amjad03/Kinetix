'use client';
import { useRef, useState, useTransition } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { removeBrandImage, saveBranding, uploadBrandImage } from '@/app/(dashboard)/settings/branding/actions';
import { useNotice } from '@/components/hr/Common';
import { Alert, Button, Chip } from '@/components/kx';
import { Card, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { BRAND_ASSETS, type Branding, brandImageUrl, FONT_FAMILIES, FONT_INFO, type FontFamilyId, HEX, type Palette, PALETTE_KEYS, paletteChecks, previewUrl, SIGNATORY_ROLES, type SignatoryRole, tint } from '@/lib/doc-designs';

const DEFAULT_TITLES: Record<SignatoryRole, string> = { principal: 'Principal', registrar: 'Registrar', controller: 'Controller of Examinations', finance: 'Finance Officer', hr: 'HR Manager' };

/** Settings > Institution > Branding: images, signatories, palette with contrast checks, fonts, and live previews. */
export function BrandingAdmin({ initial, canEdit, institution }: { initial: Branding; canEdit: boolean; institution: string }) {
  const { t } = useI18n();
  const { run, view } = useNotice();
  const [b, setB] = useState(initial);
  const [palette, setPalette] = useState<Palette>(initial.palette);
  const [fonts, setFonts] = useState(initial.fonts);
  const [tagline, setTagline] = useState(initial.tagline ?? '');
  const [gstin, setGstin] = useState(initial.gstin ?? '');
  const [signers, setSigners] = useState(() => Object.fromEntries(SIGNATORY_ROLES.map((r) => [r, { name: initial.signatories[r]?.name ?? '', designation: initial.signatories[r]?.designation ?? DEFAULT_TITLES[r] }])) as Record<SignatoryRole, { name: string; designation: string }>);
  const [busy, start] = useTransition();
  const checks = paletteChecks(Object.fromEntries(PALETTE_KEYS.map((k) => [k, HEX.test(palette[k]) ? palette[k] : initial.palette[k]])) as Palette);
  const valid = PALETTE_KEYS.every((k) => HEX.test(palette[k]));

  const save = () =>
    start(async () => {
      const r = await run(() => saveBranding({ palette, fonts, tagline, gstin, signatories: Object.fromEntries(SIGNATORY_ROLES.filter((r) => signers[r].name.trim() || b.signatories[r]).map((r) => [r, signers[r]])) }), t('br.saved'));
      if (r.ok) setB(r.data);
    });

  const colorName = (k: string) => t(`br.c.${k}` as MessageKey);

  return (
    <>
      {view}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 gap-5">
          <Card title={t('br.assets')} subtitle={t('br.assetHelp')}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {BRAND_ASSETS.map((k) => (
                <ImageSlot key={k} kind={k} label={t(`br.asset.${k}` as MessageKey)} version={b.assets[k]?.version} dark={k === 'logo_dark'} canEdit={canEdit} onChange={setB} run={run} />
              ))}
            </div>
          </Card>

          <Card title={t('br.palette')} subtitle={t('br.paletteHelp')}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PALETTE_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <label className="relative block size-11 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-inner" style={{ background: HEX.test(palette[k]) ? palette[k] : '#ffffff' }}>
                    <span className="sr-only">{colorName(k)}</span>
                    <input type="color" disabled={!canEdit} value={HEX.test(palette[k]) ? palette[k] : '#000000'} onChange={(e) => setPalette({ ...palette, [k]: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" data-testid={`color-${k}`} />
                  </label>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <span className="text-[13px] font-medium">{colorName(k)}</span>
                    <input
                      aria-label={`${colorName(k)}: ${t('br.hex')}`}
                      disabled={!canEdit}
                      value={palette[k]}
                      onChange={(e) => setPalette({ ...palette, [k]: e.target.value.trim().startsWith('#') ? e.target.value.trim() : `#${e.target.value.trim()}` })}
                      className={`h-8 w-full rounded-md border bg-background px-2 font-mono text-[13px] uppercase ${HEX.test(palette[k]) ? '' : 'border-destructive'}`}
                      maxLength={7}
                      data-testid={`hex-${k}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <h3 className="mt-5 mb-2 text-[13px] font-semibold">{t('br.contrast')}</h3>
            {checks.some((c) => c.level === 'fail') && (
              <Alert severity="warning" className="mb-3">
                {t('br.contrastWarn')}
              </Alert>
            )}
            <ul className="grid gap-2 sm:grid-cols-2" data-testid="contrast-checks">
              {checks.map((c) => (
                <li key={`${c.fg}-${c.bg}`} className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-[13px]">
                  <span className="grid h-7 w-10 shrink-0 place-items-center rounded text-[13px] font-bold" style={{ background: palette[c.bg], color: c.fg === 'white' ? '#ffffff' : palette[c.fg] }} aria-hidden>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t('br.contrastPair', { fg: colorName(c.fg), bg: colorName(c.bg) })}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.ratio.toFixed(1)}:1</span>
                  <Chip size="small" color={c.level === 'aa' ? 'success' : c.level === 'large' ? 'warning' : 'error'} label={t(c.level === 'aa' ? 'br.contrastOk' : c.level === 'large' ? 'br.contrastLarge' : 'br.contrastFail')} />
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('br.fonts')} subtitle={t('br.fontHelp')}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['heading', 'body'] as const).map((k) => (
                <div key={k} className="grid gap-2">
                  <SelectInput label={t(k === 'heading' ? 'br.fontHeading' : 'br.fontBody')} value={fonts[k]} disabled={!canEdit} onChange={(e) => setFonts({ ...fonts, [k]: e.target.value as FontFamilyId })} options={FONT_FAMILIES.map((f) => ({ value: f, label: FONT_INFO[f].label }))} />
                  <p className="m-0 rounded-md bg-muted px-3 py-2 text-[15px] leading-snug" style={{ fontFamily: FONT_INFO[fonts[k]].css }}>
                    {institution} · प्रमाणपत्र · ಪ್ರಮಾಣಪತ್ರ
                  </p>
                </div>
              ))}
              <TextInput label={t('br.tagline')} helper={t('br.taglineHelp')} value={tagline} disabled={!canEdit} onChange={(e) => setTagline(e.target.value)} inputProps={{ maxLength: 160 }} />
              <TextInput label={t('br.gstin')} helper={t('br.gstinHelp')} value={gstin} disabled={!canEdit} onChange={(e) => setGstin(e.target.value.toUpperCase())} inputProps={{ maxLength: 15 }} />
            </div>
          </Card>

          <Card title={t('br.signatories')} subtitle={t('br.signHelp')}>
            <div className="grid gap-3">
              {SIGNATORY_ROLES.map((r) => (
                <div key={r} className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]">
                  <TextInput label={`${t(`br.role.${r}` as MessageKey)}: ${t('br.name')}`} value={signers[r].name} disabled={!canEdit} onChange={(e) => setSigners({ ...signers, [r]: { ...signers[r], name: e.target.value } })} inputProps={{ maxLength: 120 }} />
                  <TextInput label={t('br.designation')} value={signers[r].designation} disabled={!canEdit} onChange={(e) => setSigners({ ...signers, [r]: { ...signers[r], designation: e.target.value } })} inputProps={{ maxLength: 120 }} />
                  <ImageSlot kind={`signature:${r}`} label={t('br.signature')} version={b.signatories[r]?.signatureVersion} canEdit={canEdit} onChange={setB} run={run} compact />
                </div>
              ))}
            </div>
          </Card>

          {canEdit && (
            <div className="flex justify-end">
              <Button variant="contained" disabled={busy || !valid} onClick={save} data-testid="save-branding">
                {t('br.save')}
              </Button>
            </div>
          )}
        </div>

        <aside className="grid content-start gap-5 xl:sticky xl:top-4">
          <Card title={t('br.livePreview')}>
            <LivePreview palette={valid ? palette : initial.palette} fonts={fonts} institution={institution} tagline={tagline} logo={b.assets.emblem ? brandImageUrl('emblem', b.assets.emblem.version) : b.assets.logo ? brandImageUrl('logo', b.assets.logo.version) : null} />
          </Card>
          <Card title={t('br.docPreview')} subtitle={t('br.docPreviewHelp')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl('preset:bonafide_certificate:classic', { width: 760, v: b.updatedAt ?? '0' })} alt={t('br.docPreview')} className="w-full rounded-md border bg-white shadow-sm" loading="lazy" data-testid="doc-preview" />
          </Card>
        </aside>
      </div>
    </>
  );
}

/** One branding image: preview, upload or replace, remove. */
function ImageSlot({ kind, label, version, dark, canEdit, onChange, run, compact }: { kind: string; label: string; version?: string; dark?: boolean; canEdit: boolean; onChange: (b: Branding) => void; run: ReturnType<typeof useNotice>['run']; compact?: boolean }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const upload = (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    start(async () => {
      const r = await run(() => uploadBrandImage(form), t('br.uploaded'));
      if (r.ok) onChange(r.data);
    });
  };
  const remove = () =>
    start(async () => {
      const r = await run(() => removeBrandImage(kind), t('br.removed'));
      if (r.ok) onChange(r.data);
    });
  return (
    <div className="grid gap-2" data-testid={`slot-${kind}`}>
      {!compact && <span className="text-[13px] font-medium">{label}</span>}
      <div className={`grid place-items-center overflow-hidden rounded-md border ${compact ? 'h-14' : 'aspect-square'} ${dark ? 'bg-slate-800' : 'bg-[repeating-conic-gradient(#f1f5f9_0_25%,#ffffff_0_50%)] bg-[length:16px_16px]'}`}>
        {version ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandImageUrl(kind, version)} alt={label} className="max-h-full max-w-full object-contain p-1.5" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{t('br.none')}</span>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-1">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => upload(e.target.files?.[0])} aria-label={`${label}: ${t('br.upload')}`} />
          <Button size="small" variant="outlined" startIcon={<ImageUp className="size-4" />} disabled={busy} onClick={() => input.current?.click()}>
            {t(version ? 'br.replace' : 'br.upload')}
          </Button>
          {version && (
            <Button size="small" color="error" startIcon={<Trash2 className="size-4" />} disabled={busy} onClick={remove} aria-label={`${label}: ${t('br.remove')}`}>
              {t('br.remove')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** A certificate and an ID card in HTML, restyled as colours and fonts change (before saving). */
function LivePreview({ palette: p, fonts, institution, tagline, logo }: { palette: Palette; fonts: Branding['fonts']; institution: string; tagline: string; logo: string | null }) {
  const { t } = useI18n();
  const head = FONT_INFO[fonts.heading].css;
  const body = FONT_INFO[fonts.body].css;
  const crest = (size: number) =>
    logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" className="object-contain" style={{ width: size, height: size }} />
    ) : (
      <span className="grid place-items-center rounded-full font-bold" style={{ width: size, height: size, background: p.primary, color: '#fff', fontFamily: head }}>
        {institution.trim().charAt(0)}
      </span>
    );
  return (
    <div className="grid gap-4" data-testid="live-preview">
      <div className="relative overflow-hidden rounded-md shadow-sm" style={{ background: p.paper, color: p.ink, fontFamily: body }}>
        <div className="absolute inset-[6px] rounded-sm border-2" style={{ borderColor: p.primary }} />
        <div className="absolute inset-[10px] rounded-sm border" style={{ borderColor: p.secondary }} />
        <div className="relative grid justify-items-center gap-1 px-8 pt-6 pb-6 text-center">
          {crest(36)}
          <div className="text-[13px] font-bold tracking-[0.12em] uppercase" style={{ color: p.primary, fontFamily: head }}>
            {institution}
          </div>
          {tagline && (
            <div className="text-[10px] italic" style={{ color: p.secondary, fontFamily: head }}>
              {tagline}
            </div>
          )}
          <div className="my-1 h-px w-3/4" style={{ background: p.secondary }} />
          <div className="text-[17px] font-bold tracking-[0.18em] uppercase" style={{ color: p.primary, fontFamily: head }}>
            {t('br.sample.title')}
          </div>
          <p className="m-0 max-w-[300px] text-[11px] leading-relaxed">{t('br.sample.body')}</p>
          <div className="mt-2 flex w-full items-end justify-between text-[9px]">
            <span className="rounded px-1.5 py-0.5" style={{ background: tint(p.accent, p.paper, 0.15), color: p.accent }}>
              QR
            </span>
            <span className="grid size-10 place-items-center rounded-full border-2 text-[8px] font-bold" style={{ borderColor: '#9aa1aa', background: 'radial-gradient(circle at 35% 30%, #ffffff, #c7ccd3 60%, #8e959e)', color: '#5e656e' }}>
              ✓
            </span>
            <span className="border-t px-3 pt-0.5" style={{ borderColor: p.ink }}>
              {t('br.role.principal')}
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto w-[200px] overflow-hidden rounded-[10px] shadow-md" style={{ background: p.paper, color: p.ink, fontFamily: body }}>
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: `linear-gradient(110deg, ${tint('#000000', p.primary, 0.3)}, ${p.primary} 55%, ${p.tertiary})`, color: '#fff' }}>
          {crest(22)}
          <span className="truncate text-[10px] leading-tight font-bold" style={{ fontFamily: head }}>
            {institution}
          </span>
        </div>
        <div className="grid justify-items-center gap-1 px-3 py-3">
          <span className="text-[8px] font-bold tracking-[0.15em] uppercase" style={{ color: p.secondary }}>
            {t('br.sample.card')}
          </span>
          <span className="size-14 rounded-full border-2" style={{ borderColor: p.accent, background: tint(p.primary, p.paper, 0.15) }} />
          <span className="text-[12px] font-bold" style={{ color: p.primary, fontFamily: head }}>
            {t('br.sample.name')}
          </span>
          <span className="h-4 w-28 bg-[repeating-linear-gradient(90deg,#111_0_1px,transparent_1px_3px,#111_3px_5px,transparent_5px_6px)]" aria-hidden />
        </div>
        <div className="h-1.5" style={{ background: p.accent }} />
      </div>
    </div>
  );
}
