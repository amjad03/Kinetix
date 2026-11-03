import { LinkButton } from '@/components/LinkButton';
import { getI18n } from '@/i18n/server';

/** The hostel's own pages beyond the desk and the lists: the gate and the reports (shown in the page headers). */
export async function HostelLinks({ here }: { here?: 'gate' | 'reports' }) {
  const { t } = await getI18n();
  return (
    <>
      {here !== 'gate' && (
        <LinkButton href="/hostel/gate" variant="outlined" data-testid="ho-link-gate">
          {t('hsp.gate.title')}
        </LinkButton>
      )}
      {here !== 'reports' && (
        <LinkButton href="/hostel/reports" variant="outlined" data-testid="ho-link-reports">
          {t('hsp.rep.title')}
        </LinkButton>
      )}
    </>
  );
}
