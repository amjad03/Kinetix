import { createTheme, type Shadows } from '@mui/material/styles';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import { paletteFor, type KxColors } from './palette';
import { brandScheme, type M3Scheme } from './scheme';

declare module '@mui/material/styles' {
  interface Palette {
    m3: M3Scheme;
    kx: KxColors;
  }
  interface PaletteOptions {
    m3?: M3Scheme;
    kx?: KxColors;
  }
}

export const FONT_STACK =
  'var(--font-sans-flex), "Google Sans Flex", var(--font-noto-devanagari), var(--font-noto-kannada), Roboto, "Segoe UI", Arial, sans-serif';

/** Headlines: the display cut of the same family. */
export const DISPLAY_STACK = `var(--font-sans-flex-display), ${FONT_STACK}`;

/** M3 shape scale. Cards 16 (we use 12 for dense admin cards), dialogs 28, pills full. */
export const SHAPE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999 } as const;

// M3 elevation levels 1–3. Admin surfaces are flat: only menus, popovers and snackbars lift.
const level1 = '0 1px 2px 0 rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)';
const level2 = '0 1px 2px 0 rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15)';
const level3 = '0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px 0 rgba(0,0,0,.30)';
const shadows = ['none', level1, level1, level2, level2, level2, level2, level2, level2, ...Array(16).fill(level3)] as Shadows;

const type = (size: number, line: number, weight = 400, tracking = 0) => ({
  fontSize: `${size / 16}rem`,
  lineHeight: `${line}px`,
  fontWeight: weight,
  letterSpacing: tracking ? `${tracking}px` : 0,
});

export function buildTheme() {
  const light = brandScheme(false);
  const dark = brandScheme(true);

  return createTheme({
    cssVariables: { colorSchemeSelector: 'media', cssVarPrefix: 'kx' },
    colorSchemes: { light: { palette: paletteFor(light, false) }, dark: { palette: paletteFor(dark, true) } },
    shape: { borderRadius: SHAPE.md },
    shadows,
    typography: {
      fontFamily: FONT_STACK,
      // M3 type scale.
      h1: { ...type(36, 44), fontFamily: DISPLAY_STACK }, // display small
      h2: { ...type(32, 40), fontFamily: DISPLAY_STACK }, // headline large
      h3: { ...type(28, 36), fontFamily: DISPLAY_STACK }, // headline medium
      h4: { ...type(24, 32), fontFamily: DISPLAY_STACK }, // headline small
      h5: type(22, 28), // title large
      h6: type(16, 24, 500, 0.1), // title medium
      subtitle1: type(16, 24, 500, 0.1),
      subtitle2: type(14, 20, 500, 0.1), // title small
      body1: type(16, 24, 400, 0.1), // body large
      body2: type(14, 20, 400, 0.2), // body medium
      caption: type(12, 16, 400, 0.3), // body small
      overline: { ...type(11, 16, 500, 0.5), textTransform: 'none' }, // label small
      button: { ...type(14, 20, 500, 0.1), textTransform: 'none' }, // label large
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: 'antialiased', fontFeatureSettings: '"tnum" 0' },
          '::selection': { background: 'var(--kx-palette-m3-primaryContainer)' },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: SHAPE.full, minHeight: 40, paddingInline: 24 },
          sizeSmall: { minHeight: 32, paddingInline: 16 },
          text: { paddingInline: 12 },
          outlined: ({ theme }) => ({ borderColor: theme.vars.palette.m3.outline }),
        },
        variants: [
          {
            // M3 "filled tonal" button.
            props: { variant: 'contained', color: 'secondary' },
            style: ({ theme }) => ({
              backgroundColor: theme.vars.palette.m3.secondaryContainer,
              color: theme.vars.palette.m3.onSecondaryContainer,
              '&:hover': { backgroundColor: theme.vars.palette.m3.secondaryContainer, boxShadow: `inset 0 0 0 100px ${theme.vars.palette.action.hover}` },
            }),
          },
        ],
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: SHAPE.full } } },
      MuiFab: { styleOverrides: { root: { borderRadius: SHAPE.lg, boxShadow: level3, textTransform: 'none' } } },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: SHAPE.md } },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: ({ theme }) => ({ borderRadius: SHAPE.md, borderColor: theme.vars.palette.m3.outlineVariant, backgroundColor: theme.vars.palette.kx.pane }),
        },
      },
      MuiCardContent: { styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } } },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRadius: SHAPE.xl,
            backgroundColor: theme.vars.palette.m3.surfaceContainerHigh,
            boxShadow: level3,
            padding: 8,
          }),
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { ...type(24, 32), paddingTop: 20 } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '12px 16px 16px', gap: 8 } } },
      MuiBackdrop: { styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(0,0,0,.32)' } } } },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: SHAPE.xs, backgroundColor: theme.vars.palette.m3.surfaceContainer, boxShadow: level2, minWidth: 180 }),
          list: { paddingBlock: 8 },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 48, ...type(14, 20, 400, 0.1) } } },
      MuiPopover: {
        styleOverrides: { paper: ({ theme }) => ({ borderRadius: SHAPE.lg, backgroundColor: theme.vars.palette.m3.surfaceContainerHigh, boxShadow: level2 }) },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: SHAPE.xs, backgroundColor: theme.vars.palette.m3.surfaceContainer, boxShadow: level2 }),
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 400 },
        styleOverrides: {
          tooltip: ({ theme }) => ({
            backgroundColor: theme.vars.palette.m3.inverseSurface,
            color: theme.vars.palette.m3.inverseOnSurface,
            borderRadius: SHAPE.xs,
            ...type(12, 16, 400, 0.3),
            padding: '4px 8px',
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: SHAPE.sm, fontWeight: 500, letterSpacing: '0.1px' },
          outlined: ({ theme }) => ({ borderColor: theme.vars.palette.m3.outlineVariant }),
          sizeSmall: { height: 24, fontSize: '0.75rem' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: SHAPE.xs,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.m3.outline },
          }),
        },
      },
      MuiTextField: { defaultProps: { variant: 'outlined', fullWidth: true } },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({ borderBottomColor: theme.vars.palette.m3.outlineVariant, paddingBlock: 12 }),
          head: ({ theme }) => ({ color: theme.vars.palette.m3.onSurfaceVariant, ...type(12, 16, 500, 0.4), whiteSpace: 'nowrap' }),
        },
      },
      MuiTableRow: {
        styleOverrides: { root: ({ theme }) => ({ '&.MuiTableRow-hover:hover': { backgroundColor: theme.vars.palette.m3.surfaceContainerLow } }) },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: SHAPE.full },
          grouped: ({ theme }) => ({ borderColor: theme.vars.palette.m3.outline }),
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            textTransform: 'none',
            ...type(14, 20, 500, 0.1),
            color: theme.vars.palette.m3.onSurface,
            paddingInline: 16,
            height: 40,
            '&:first-of-type': { borderTopLeftRadius: SHAPE.full, borderBottomLeftRadius: SHAPE.full },
            '&:last-of-type': { borderTopRightRadius: SHAPE.full, borderBottomRightRadius: SHAPE.full },
            '&.Mui-selected': {
              backgroundColor: theme.vars.palette.m3.secondaryContainer,
              color: theme.vars.palette.m3.onSecondaryContainer,
              '&:hover': { backgroundColor: theme.vars.palette.m3.secondaryContainer },
            },
          }),
        },
      },
      MuiSwitch: {
        // M3 switch: 52×32 track, 16 px thumb that grows to 24 px when on.
        styleOverrides: {
          root: { width: 52, height: 32, padding: 0, margin: 8, overflow: 'visible' },
          switchBase: ({ theme }) => ({
            padding: 0,
            margin: 8,
            transitionDuration: '200ms',
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              margin: 4,
              color: theme.vars.palette.m3.onPrimary,
              '& + .MuiSwitch-track': { backgroundColor: theme.vars.palette.m3.primary, opacity: 1, border: 0 },
              '& .MuiSwitch-thumb': { width: 24, height: 24 },
            },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.38 },
            '&.Mui-disabled.Mui-checked .MuiSwitch-thumb': { color: theme.vars.palette.m3.surface },
          }),
          thumb: ({ theme }) => ({ boxShadow: 'none', width: 16, height: 16, color: theme.vars.palette.m3.outline }),
          track: ({ theme }) => ({
            borderRadius: 16,
            backgroundColor: theme.vars.palette.m3.surfaceContainerHighest,
            border: `2px solid ${theme.vars.palette.m3.outline}`,
            opacity: 1,
            boxSizing: 'border-box',
          }),
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: ({ theme }) => ({ borderRadius: SHAPE.full, backgroundColor: theme.vars.palette.m3.secondaryContainer }),
          bar: { borderRadius: SHAPE.full },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: SHAPE.md } } },
      MuiSnackbarContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.m3.inverseSurface,
            color: theme.vars.palette.m3.inverseOnSurface,
            borderRadius: SHAPE.xs,
          }),
        },
      },
      MuiSkeleton: { styleOverrides: { root: ({ theme }) => ({ backgroundColor: theme.vars.palette.m3.surfaceContainerHigh }) } },
      MuiDivider: { styleOverrides: { root: ({ theme }) => ({ borderColor: theme.vars.palette.m3.outlineVariant }) } },
      MuiDateCalendar: { styleOverrides: { root: { height: 'auto', maxHeight: 360 } } },
    },
  });
}
