import { LinkButton } from '@/components/LinkButton';
import { EmptyState } from '@/components/States';
import { getI18n } from '@/i18n/server';

import { SearchX as SearchOffOutlined } from 'lucide-react';
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="max-w-[560px] mx-auto mt-24 px-4">
      <EmptyState icon={<SearchOffOutlined />} title={t('state.notFound')} actions={<LinkButton variant="contained" href="/">{t('state.goToday')}</LinkButton>}>
        {t('state.notFoundBody')}
      </EmptyState>
    </div>
  );
}
