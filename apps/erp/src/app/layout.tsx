import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { googleSans, notoDevanagari, notoKannada } from '@/theme/fonts';
import { ThemeRegistry } from '@/theme/ThemeRegistry';

export const metadata: Metadata = {
  title: { default: 'KINETIX ERP', template: '%s · KINETIX ERP' },
  description: "The principal's view of the whole school: classes, attendance, homework, messages and boards.",
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3fa' },
    { media: '(prefers-color-scheme: dark)', color: '#121318' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${googleSans.variable} ${notoDevanagari.variable} ${notoKannada.variable}`} suppressHydrationWarning>
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
