import { SEMANTIC, withAlpha, type M3Scheme } from './scheme';

/** Fixed semantic colours (live, success, warning, record) with tonal containers for chips and dots. */
export interface KxColors {
  live: string;
  liveContainer: string;
  onLiveContainer: string;
  success: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  warningContainer: string;
  onWarningContainer: string;
  record: string;
  /** The app ground behind the cards (a soft cool grey). */
  frame: string;
  /** A card: white in light mode. */
  pane: string;
  /** A tonal panel inside a card or the page. */
  tonal: string;
  /** Categorical chart colours, each at least 3:1 against a card. */
  chart: readonly [string, string, string, string, string];
}

const KX_LIGHT = {
  live: SEMANTIC.live,
  liveContainer: '#FEEFE3',
  onLiveContainer: '#8A3B00',
  success: SEMANTIC.success,
  successContainer: '#DCF3E4',
  onSuccessContainer: '#0B4A22',
  warning: SEMANTIC.warning,
  warningContainer: '#FEF0D4',
  onWarningContainer: '#5A2A00',
  record: SEMANTIC.record,
  chart: ['#1D4ED8', '#0E7490', '#7C3AED', '#BE185D', '#8F5B00'],
} as const;

const KX_DARK = {
  live: '#FCAD70',
  liveContainer: '#4A2600',
  onLiveContainer: '#FFDCC2',
  success: '#86D9A0',
  successContainer: '#0F3D1F',
  onSuccessContainer: '#CDEED8',
  warning: '#FBBF6A',
  warningContainer: '#4A2C00',
  onWarningContainer: '#FFE2B8',
  record: '#F28B82',
  chart: ['#9DB8FF', '#5EEAD4', '#C4B5FD', '#F9A8D4', '#FFC25E'],
} as const;

/** Maps Material 3 roles onto MUI's palette slots, plus the full M3 scheme under `m3`. */
export function paletteFor(s: M3Scheme, dark: boolean) {
  const kx: KxColors = {
    ...(dark ? KX_DARK : KX_LIGHT),
    frame: s.surface,
    pane: dark ? s.surfaceContainerLow : s.surfaceContainerLowest,
    tonal: dark ? s.surfaceContainerHigh : s.surfaceContainerLow,
  };
  return {
    mode: dark ? ('dark' as const) : ('light' as const),
    primary: { main: s.primary, contrastText: s.onPrimary },
    secondary: { main: s.secondary, contrastText: s.onSecondary },
    error: { main: s.error, contrastText: s.onError },
    warning: { main: kx.warning, contrastText: dark ? '#2B1300' : '#FFFFFF' },
    success: { main: kx.success, contrastText: dark ? '#00210B' : '#FFFFFF' },
    info: { main: s.primary, contrastText: s.onPrimary },
    background: { default: kx.frame, paper: kx.pane },
    text: { primary: s.onSurface, secondary: s.onSurfaceVariant, disabled: withAlpha(s.onSurface, 0.38) },
    divider: s.outlineVariant,
    action: {
      active: s.onSurfaceVariant,
      // M3 state layers: hover 8 %, focus 10 %, pressed 10 %, dragged 16 %.
      hover: withAlpha(s.onSurface, 0.08),
      hoverOpacity: 0.08,
      selected: withAlpha(s.primary, 0.1),
      selectedOpacity: 0.1,
      focus: withAlpha(s.onSurface, 0.1),
      focusOpacity: 0.1,
      disabled: withAlpha(s.onSurface, 0.38),
      disabledBackground: withAlpha(s.onSurface, 0.12),
      disabledOpacity: 0.38,
      activatedOpacity: 0.1,
    },
    m3: s,
    kx,
  };
}
