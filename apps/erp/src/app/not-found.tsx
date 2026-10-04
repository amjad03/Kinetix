import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Box from '@mui/material/Box';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState } from '@/components/States';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 12, px: 2 }}>
      <EmptyState icon={<SearchOffOutlined />} title={t('state.notFound')} actions={<LinkButton variant="contained" href="/">{t('state.goToday')}</LinkButton>}>
        {t('state.notFoundBody')}
      </EmptyState>
    </Box>
  );
}
