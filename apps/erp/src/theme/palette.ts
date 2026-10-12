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
  live: '#f97316',
  liveContainer: '#ffeddc',
  onLiveContainer: '#9a3412',
  success: '#15803d',
  successContainer: '#dcf5e5',
  onSuccessContainer: '#166534',
  warning: '#a35c06',
  warningContainer: '#fdf2d6',
  onWarningContainer: '#7c4a03',
  record: SEMANTIC.record,
  chart: ['#0f9488', '#b45309', '#64748b', '#ea580c', '#0f766e'],
} as const;

const KX_DARK = {
  live: '#fdba74',
  liveContainer: '#3a2416',
  onLiveContainer: '#fdba74',
  success: '#86efac',
  successContainer: '#16301f',
  onSuccessContainer: '#86efac',
  warning: '#fcd34d',
  warningContainer: '#3b2f12',
  onWarningContainer: '#fcd34d',
  record: '#F28B82',
  chart: ['#14b8a6', '#f59e0b', '#94a3b8', '#f97316', '#5eead4'],
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
