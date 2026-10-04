import localFont from 'next/font/local';

// Bundled OFL fonts (copied from packages/kinetix_ui/fonts): no Google Fonts request at runtime.
export const googleSans = localFont({
  variable: '--font-google-sans',
  display: 'swap',
  src: [
    { path: '../fonts/GoogleSans-400.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/GoogleSans-500.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/GoogleSans-700.ttf', weight: '700', style: 'normal' },
  ],
});

export const notoDevanagari = localFont({
  variable: '--font-noto-devanagari',
  display: 'swap',
  preload: false,
  src: [
    { path: '../fonts/NotoSansDevanagari-400.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/NotoSansDevanagari-500.ttf', weight: '500', style: 'normal' },
  ],
});

export const notoKannada = localFont({
  variable: '--font-noto-kannada',
  display: 'swap',
  preload: false,
  src: [
    { path: '../fonts/NotoSansKannada-400.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/NotoSansKannada-500.ttf', weight: '500', style: 'normal' },
  ],
});
