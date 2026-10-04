import { SEMANTIC, withAlpha, type M3Scheme } from './scheme';

/** Fixed semantic colours (live, success, record) with tonal containers for chips and dots. */
export interface KxColors {
  live: string;
  liveContainer: string;
  onLiveContainer: string;
  success: string;
  successContainer: string;
  onSuccessContainer: string;
  record: string;
  /** The app frame behind the navigation and the content pane (Gmail-style). */
  frame: string;
  /** The rounded content pane. */
  pane: string;
  /** A tonal panel inside the pane (compose form). */
  tonal: string;
}

const KX_LIGHT = {
  live: SEMANTIC.live,
  liveContainer: '#FEEFE3',
  onLiveContainer: '#8A3B00',
  success: SEMANTIC.success,
  successContainer: '#E6F4EA',
  onSuccessContainer: '#0D652D',
  record: SEMANTIC.record,
};

const KX_DARK = {
  live: '#FCAD70',
  liveContainer: '#4A2600',
  onLiveContainer: '#FFDCC2',
  success: '#81C995',
  successContainer: '#0F3D1F',
  onSuccessContainer: '#CEEAD6',
  record: '#F28B82',
};

/** Maps Material 3 roles onto MUI's palette slots, plus the full M3 scheme under `m3`. */
export function paletteFor(s: M3Scheme, dark: boolean) {
  const kx: KxColors = {
    ...(dark ? KX_DARK : KX_LIGHT),
    frame: dark ? s.surface : s.surfaceContainerLow,
    pane: dark ? s.surfaceContainerLow : s.surfaceContainerLowest,
    tonal: dark ? s.surfaceContainerHigh : s.surfaceContainerLow,
  };
  return {
    mode: dark ? ('dark' as const) : ('light' as const),
    primary: { main: s.primary, contrastText: s.onPrimary },
    secondary: { main: s.secondary, contrastText: s.onSecondary },
    error: { main: s.error, contrastText: s.onError },
    warning: { main: kx.live, contrastText: dark ? '#2B1300' : '#FFFFFF' },
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
      selected: withAlpha(s.onSurface, 0.1),
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
