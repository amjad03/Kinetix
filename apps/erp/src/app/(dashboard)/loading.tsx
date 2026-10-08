import Box from '@mui/material/Box';
import { SkeletonBlock, SkeletonCard, SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton';
import { getI18n } from '@/i18n/server';

/** Shown while a page loads: the shape of a typical page (title, stat tiles, a card and a table). */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <Box aria-busy="true" role="status" aria-label={t('common.loading')}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ width: 260 }}>
          <SkeletonBlock height={30} width={200} />
          <Box sx={{ mt: 1 }}>
            <SkeletonBlock height={16} width={260} />
          </Box>
        </Box>
        <SkeletonBlock height={40} width={160} radius={10} />
      </Box>
      <SkeletonStats n={5} />
      <Box sx={{ display: 'grid', gap: 2.5, mt: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <SkeletonCard height={220} />
        <SkeletonTable rows={5} cols={3} />
      </Box>
    </Box>
  );
}
