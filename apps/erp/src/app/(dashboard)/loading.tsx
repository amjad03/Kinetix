import { SkeletonBlock, SkeletonCard, SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton';
import { getI18n } from '@/i18n/server';

/** Shown while a page loads: the shape of a typical page (title, stat tiles, a card and a table). */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div aria-busy="true" role="status" aria-label={t('common.loading')}>
      <div className="flex justify-between mb-6">
        <div className="w-[260px]">
          <SkeletonBlock height={30} width={200} />
          <div className="mt-2">
            <SkeletonBlock height={16} width={260} />
          </div>
        </div>
        <SkeletonBlock height={40} width={160} radius={10} />
      </div>
      <SkeletonStats n={5} />
      <div className="grid gap-5 mt-5 grid-cols-[1fr] lg:grid-cols-[1fr_1fr]">
        <SkeletonCard height={220} />
        <SkeletonTable rows={5} cols={3} />
      </div>
    </div>
  );
}
