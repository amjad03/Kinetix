import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { safe } from '@/lib/depth-ui';

interface Mine {
  id: string;
  kind: string;
  title: string;
  year: number | null;
  venue: string;
  url: string | null;
  fileName: string | null;
  verified: boolean;
}
interface Everyone extends Mine {
  teacher: string;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acc.title.mine') };
}

const KINDS = ['publication', 'fdp', 'award', 'patent', 'book', 'other'] as const;

export default async function MyEvidencePage() {
  await requireSection('facultyEvidence');
  const { t } = await getI18n();
  const data = await load(async () => ({ mine: await api<Mine[]>('/v1/accreditation/my-evidence'), all: await safe(api<Everyone[]>('/v1/accreditation/faculty-evidence'), null) }));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { mine, all } = data.data;
  const kinds = Object.fromEntries(KINDS.map((k) => [k, t(`acc.kind.${k}`)]));
  const cols: Panel['columns'] = [
    { key: 'kind', label: t('acc.c.kind'), kind: 'pill', words: kinds },
    { key: 'title', label: t('acc.c.title') },
    { key: 'year', label: t('acc.c.year') },
    { key: 'venue', label: t('acc.c.venue') },
    { key: 'verified', label: t('acc.c.verified'), kind: 'yes' },
  ];
  const panels: Panel[] = [
    {
      id: 'mine',
      title: t('acc.mine.title'),
      hint: t('acc.mine.hint'),
      empty: t('acc.mine.none'),
      columns: cols,
      rows: mine.map((m) => ({ ...m })),
      forms: [
        {
          id: 'mine-new',
          title: t('acc.mine.new'),
          submit: t('acc.add'),
          path: '/v1/accreditation/my-evidence',
          fields: [
            { name: 'kind', label: t('acc.c.kind'), type: 'select', required: true, options: KINDS.map((k) => ({ value: k, label: kinds[k] })) },
            { name: 'title', label: t('acc.c.title'), type: 'text', required: true },
            { name: 'year', label: t('acc.c.year'), type: 'number' },
            { name: 'venue', label: t('acc.c.venue'), type: 'text' },
            { name: 'url', label: t('acc.f.link'), type: 'text' },
          ],
        },
      ],
    },
  ];
  // The quality team sees everyone's evidence and verifies it; teachers get a 403 on that list and the panel is left out.
  if (all) {
    panels.push({
      id: 'all',
      title: t('acc.mine.all'),
      empty: t('acc.mine.none'),
      columns: [{ key: 'teacher', label: t('acc.c.teacher') }, ...cols],
      rows: all.map((m) => ({ ...m })),
      actions: [{ label: t('acc.a.verify'), path: '/v1/accreditation/faculty-evidence/{id}/verify', show: { key: 'verified', is: [false] } }],
    });
  }
  return (
    <>
      <PageHeader title={t('acc.title.mine')} subtitle={t('acc.sub.mine')} />
      <DepthDesk panels={panels} />
    </>
  );
}
