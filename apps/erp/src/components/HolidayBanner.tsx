import BeachAccessOutlined from '@mui/icons-material/BeachAccessOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getI18n } from '@/i18n/server';
import { LinkButton } from './LinkButton';

/** A holiday for the whole institution on the day shown: no classes, none counted as missed. */
export async function HolidayBanner({ title, date }: { title: string; date: string }) {
  const { t } = await getI18n();
  return (
    <Box
      data-testid="holiday-banner"
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        px: 2.5,
        py: 2,
        mb: 3,
        borderRadius: '16px',
        bgcolor: 'kx.warningContainer',
        color: 'kx.onWarningContainer',
      }}
    >
      <Box aria-hidden sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'kx.warning', color: 'kx.pane', flexShrink: 0 }}>
        <BeachAccessOutlined />
      </Box>
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
        <Typography variant="h6" component="p">
          {t('holiday.title', { title })}
        </Typography>
        <Typography variant="body2">{t('holiday.body')}</Typography>
      </Box>
      <LinkButton href={`/calendar?month=${date.slice(0, 7)}`} variant="outlined" color="inherit">
        {t('holiday.openCalendar')}
      </LinkButton>
    </Box>
  );
}
