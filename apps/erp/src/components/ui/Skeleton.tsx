import Box from '@mui/material/Box';
import MuiSkeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

/** Loading placeholders that keep the layout steady; announced once as "busy". */
export function SkeletonBlock({ height = 16, width = '100%', radius = 6 }: { height?: number | string; width?: number | string; radius?: number }) {
  return <MuiSkeleton variant="rounded" animation="wave" height={height} width={width} sx={{ borderRadius: `${radius}px` }} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <Stack spacing={1} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </Stack>
  );
}

export function SkeletonCard({ height = 160 }: { height?: number }) {
  return (
    <Box aria-hidden sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '16px', bgcolor: 'kx.pane', p: 2.5 }}>
      <SkeletonBlock height={16} width="40%" />
      <Box sx={{ mt: 2 }}>
        <SkeletonBlock height={height} />
      </Box>
    </Box>
  );
}

export function SkeletonStats({ n = 5 }: { n?: number }) {
  return (
    <Box aria-hidden sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '16px', bgcolor: 'kx.pane', p: 2.5 }}>
          <SkeletonBlock height={14} width="55%" />
          <Box sx={{ mt: 1.5 }}>
            <SkeletonBlock height={32} width="45%" />
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <SkeletonBlock height={12} width="70%" />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** A table-shaped placeholder. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Box aria-hidden sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '16px', bgcolor: 'kx.pane', overflow: 'hidden' }}>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <Box key={r} sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, px: 2, py: 1.75, borderBottom: r === rows ? 0 : 1, borderColor: 'm3.outlineVariant', bgcolor: r === 0 ? 'm3.surfaceContainerLow' : undefined }}>
          {Array.from({ length: cols }, (_, c) => (
            <SkeletonBlock key={c} height={14} width={r === 0 ? '50%' : c === 0 ? '80%' : '60%'} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
