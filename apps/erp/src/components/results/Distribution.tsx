'use client';
import { useI18n } from '@/i18n/client';
import { BANDS } from '@/lib/results';

import { Tooltip } from '@/components/kx';
import { cn } from '@/lib/utils';
import { size } from '@/lib/sx';
/**
 * How the class did: one bar per score band, a single series in the primary colour. Bars are
 * anchored to the baseline with rounded tops; the count sits above each bar that has students,
 * and hovering a band names it. The marks table below is the full data.
 */
export function Distribution({ bands, total }: { bands: { label: string; count: number }[]; total: number }) {
  const { t } = useI18n();
  const name = (label: string) => (label === BANDS[0].label ? t('results.band.below40') : label);
  const max = Math.max(1, ...bands.map((b) => b.count));
  const H = 160;
  return (
    <div data-testid="distribution" role="img" aria-label={t('results.chartLabel', { bands: bands.map((b) => `${name(b.label)}: ${b.count}`).join(', ') })}>
      <div className="relative grid gap-[2px] items-end px-1" style={{ height: size(H + 24), gridTemplateColumns: `repeat(${bands.length}, 1fr)` }}>
        {/* Recessive gridlines at half and full scale */}
        {[0.5, 1].map((f) => (
          <div className="absolute left-0 right-0 border-t border-border border-dashed opacity-[0.6]" style={{ bottom: H * f }} key={f} aria-hidden />
        ))}
        {bands.map((b) => (
          <Tooltip key={b.label} title={`${t.plural('results.bandTip', b.count, { band: name(b.label) })}${total ? ` (${Math.round((b.count / total) * 100)}%)` : ''}`} placement="top" followCursor>
            <div className="h-full flex flex-col justify-end items-center cursor-default [&:hover_.kx-bar]:bg-teal-ink" data-band={b.label} data-count={b.count}>
              {b.count > 0 && (
                <span className="text-xs leading-4 tracking-[0.3px] tabular-nums text-foreground font-medium mb-1">
                  {b.count}
                </span>
              )}
              <div className={cn('kx-bar w-full max-w-[56px] [transition:background-color_120ms] relative z-[1]', b.count ? 'bg-teal' : 'bg-border', b.count ? 'rounded-[4px_4px_0_0]' : 'rounded-[10px]')} style={{ height: size(b.count ? Math.max(4, (b.count / max) * H) : 2) }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="border-t border-border-strong grid gap-[2px] pt-1.5 px-1" style={{ gridTemplateColumns: `repeat(${bands.length}, 1fr)` }}>
        {bands.map((b) => (
          <span className="tracking-[0.3px] text-muted-foreground text-center text-[0.625rem] sm:text-[0.75rem]" key={b.label}>
            {name(b.label)}
          </span>
        ))}
      </div>
    </div>
  );
}
