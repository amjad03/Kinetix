import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/client';
import { BCP47 } from '@/i18n/locales';
import { getI18n, getMessages } from '@/i18n/server';
import { notoDevanagari, notoKannada, sansFlex, sansFlexDisplay } from '@/theme/fonts';
import '@/theme/tokens.css';
import './globals.css';
import { MODE_SCRIPT, ThemeRegistry } from '@/theme/ThemeRegistry';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t('app.name'), template: `%s · ${t('app.name')}` },
    description: t('app.description'),
    icons: { icon: '/icon.svg' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  const messages = await getMessages();
  return (
    <html lang={BCP47[locale]} className={`${sansFlex.variable} ${sansFlexDisplay.variable} ${notoDevanagari.variable} ${notoKannada.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </I18nProvider>
      </body>
    </html>
  );
}
