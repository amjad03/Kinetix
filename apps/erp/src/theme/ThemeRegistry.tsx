'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import 'dayjs/locale/en-in';
import 'dayjs/locale/hi';
import 'dayjs/locale/kn';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/locales';
import { buildTheme } from './theme';

const DAYJS_LOCALE: Record<Locale, string> = { en: 'en-in', hi: 'hi', kn: 'kn' };

const theme = buildTheme();

export function ThemeRegistry({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'kx' }}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={DAYJS_LOCALE[locale]}>
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
