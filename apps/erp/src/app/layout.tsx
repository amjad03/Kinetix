import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/client';
import { BCP47 } from '@/i18n/locales';
import { MESSAGES } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { googleSans, notoDevanagari, notoKannada } from '@/theme/fonts';
import { ThemeRegistry } from '@/theme/ThemeRegistry';

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
    { media: '(prefers-color-scheme: light)', color: '#f4f3fa' },
    { media: '(prefers-color-scheme: dark)', color: '#121318' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={BCP47[locale]} className={`${googleSans.variable} ${notoDevanagari.variable} ${notoKannada.variable}`} suppressHydrationWarning>
      <body>
        <I18nProvider locale={locale} messages={MESSAGES[locale]}>
          <ThemeRegistry locale={locale}>{children}</ThemeRegistry>
        </I18nProvider>
      </body>
    </html>
  );
}
