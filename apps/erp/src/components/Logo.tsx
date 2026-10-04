import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/** KINETIX mark: a K in a rounded tile, in the primary colour. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 48 48"
      aria-hidden
      sx={{ width: size, height: size, flexShrink: 0, display: 'block' }}
    >
      <Box component="rect" width={48} height={48} rx={14} sx={{ fill: 'var(--kx-palette-m3-primary)' }} />
      <Box
        component="path"
        d="M15 12v24M33 12 20.5 24 33 36"
        sx={{ fill: 'none', stroke: 'var(--kx-palette-m3-onPrimary)', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }}
      />
    </Box>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <LogoMark size={size} />
      <Typography component="span" sx={{ fontSize: size * 0.62, fontWeight: 500, letterSpacing: 0, color: 'text.primary', whiteSpace: 'nowrap' }}>
        KINETIX{' '}
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          ERP
        </Box>
      </Typography>
    </Box>
  );
}
