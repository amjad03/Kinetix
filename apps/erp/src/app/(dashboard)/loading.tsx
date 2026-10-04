import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { getI18n } from '@/i18n/server';

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <Box aria-busy="true" aria-label={t('common.loading')}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Skeleton variant="text" width={180} height={36} />
          <Skeleton variant="text" width={240} height={20} />
        </Box>
        <Skeleton variant="rounded" width={280} height={40} sx={{ borderRadius: 5 }} />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={132} sx={{ borderRadius: 3 }} />
        ))}
      </Box>
      <Skeleton variant="text" width={160} height={28} sx={{ mt: 4, mb: 1.5 }} />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={76} sx={{ borderRadius: 3, mb: 1.25 }} />
      ))}
    </Box>
  );
}
