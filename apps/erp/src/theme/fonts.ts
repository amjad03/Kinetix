import localFont from 'next/font/local';

// Bundled OFL fonts (copied from packages/kinetix_ui/fonts, see its NOTICE.md): no Google Fonts
// request at runtime. Google Sans Flex static instances, under our own family name.
export const sansFlex = localFont({
  variable: '--font-sans-flex',
  display: 'swap',
  src: [
    { path: '../fonts/SansFlex-400.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/SansFlex-500.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/SansFlex-700.ttf', weight: '700', style: 'normal' },
  ],
});

/** The display cut, for headlines (big type is regular weight). */
export const sansFlexDisplay = localFont({
  variable: '--font-sans-flex-display',
  display: 'swap',
  preload: false,
  src: [{ path: '../fonts/SansFlexDisplay-400.ttf', weight: '400', style: 'normal' }],
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
