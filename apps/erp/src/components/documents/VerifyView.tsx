import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Logo } from '@/components/Logo';

export type VerifyTone = 'valid' | 'bad' | 'unknown';

/** The public verification result: no sign-in, and only what is printed on the document. */
export function VerifyView({ tone, heading, lines, footer }: { tone: VerifyTone; heading: string; lines: { label: string; value: string }[]; footer: string }) {
  const Icon = tone === 'valid' ? CheckCircleOutlined : tone === 'bad' ? CancelOutlined : HelpOutlineOutlined;
  const color = tone === 'valid' ? 'success.main' : tone === 'bad' ? 'error.main' : 'text.secondary';
  return (
    <Box component="main" sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', display: 'grid', placeItems: 'center', p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 480, bgcolor: 'background.paper', border: 1, borderColor: 'm3.outlineVariant', borderRadius: '16px', p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
          <Logo />
        </Box>
        <Icon sx={{ fontSize: 64, color }} aria-hidden />
        <Typography variant="h5" component="h1" role="status" sx={{ mt: 1, color }} data-testid="verify-heading">
          {heading}
        </Typography>
        <Box component="dl" sx={{ mt: 3, mb: 0, textAlign: 'left', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, columnGap: 2 }}>
          {lines.map((l) => (
            <Box key={l.label} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2" color="text.secondary">
                {l.label}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>
                {l.value}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3 }}>
          {footer}
        </Typography>
      </Box>
    </Box>
  );
}
