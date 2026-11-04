import { LinkButton } from '@/components/LinkButton';
import { getI18n } from '@/i18n/server';

/** Transport's own pages beyond the desk and the lists: the live map, and safety and capacity (shown in the page headers). */
export async function TransportLinks({ here }: { here?: 'live' | 'safety' }) {
  const { t } = await getI18n();
  return (
    <>
      {here !== 'live' && (
        <LinkButton href="/transport/live" variant="outlined" data-testid="tp-link-live">
          {t('tp.link.live')}
        </LinkButton>
      )}
      {here !== 'safety' && (
        <LinkButton href="/transport/safety" variant="outlined" data-testid="tp-link-safety">
          {t('tp.link.safety')}
        </LinkButton>
      )}
    </>
  );
}
