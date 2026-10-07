import Stack from '@mui/material/Stack';
import { LinkButton } from '@/components/LinkButton';
import { getI18n } from '@/i18n/server';

const TABS = [
  { href: '/admissions', key: 'pipeline', label: 'adm.tab.pipeline' },
  { href: '/admissions/applications', key: 'applications', label: 'adm.tab.applications' },
  { href: '/admissions/cycles', key: 'cycles', label: 'adm.tab.cycles' },
] as const;

/** The three admissions areas, as links across the top of each page. */
export async function AdmissionsTabs({ current }: { current: (typeof TABS)[number]['key'] }) {
  const { t } = await getI18n();
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1 }} component="nav" aria-label={t('nav.admissions')}>
      {TABS.map((tab) => (
        <LinkButton key={tab.key} href={tab.href} variant={tab.key === current ? 'contained' : 'outlined'} size="small" aria-current={tab.key === current ? 'page' : undefined}>
          {t(tab.label)}
        </LinkButton>
      ))}
    </Stack>
  );
}
