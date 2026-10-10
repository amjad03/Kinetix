import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { dl, opt, safe } from '@/lib/depth-ui';
import { cycleOptions, type AccOverview, type DvvRow } from '@/lib/accreditation-ui';

const BODIES = ['naac', 'nba', 'nirf'] as const;
type Body = (typeof BODIES)[number];

export async function generateMetadata({ params }: { params: Promise<{ body: string }> }): Promise<Metadata> {
  const { body } = await params;
  return { title: (await getI18n()).t(`acc.title.${body as Body}`) };
}

export default async function AccreditationPage({ params, searchParams }: { params: Promise<{ body: string }>; searchParams: Promise<{ cycle?: string }> }) {
  const { body } = await params;
  if (!BODIES.includes(body as Body)) notFound();
  const b = body as Body;
  await requireSection('accreditation');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const q = sp.cycle ? `?cycle=${encodeURIComponent(sp.cycle)}` : '';
    const ov = await api<AccOverview>(`/v1/accreditation/${b}/overview${q}`);
    const dvv = b === 'naac' ? await safe(api<DvvRow[]>(`/v1/accreditation/dvv?cycle=${ov.cycle}`), []) : [];
    return { ov, dvv };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { ov, dvv } = data.data;
  const base = `/v1/accreditation/${b}/metrics/{code}`;
  const cyc = { cycle: ov.cycle };
  const downloads =
    b === 'naac'
      ? [{ label: t('acc.dl.naac'), href: dl('accreditation', 'naac', `&cycle=${ov.cycle}`) }]
      : b === 'nba'
        ? [
            { label: t('acc.dl.nba1'), href: dl('accreditation', 'nba1', `&cycle=${ov.cycle}`) },
            { label: t('acc.dl.nba2'), href: dl('accreditation', 'nba2', `&cycle=${ov.cycle}`) },
          ]
        : [
            { label: t('acc.dl.nirf'), href: dl('accreditation', 'nirf', `&cycle=${ov.cycle}`) },
            { label: t('acc.dl.aishe'), href: dl('accreditation', 'aishe') },
          ];
  const stats = [{ label: t('acc.complete'), value: `${ov.completeness.complete}/${ov.completeness.total} (${fmt.number(ov.completeness.percent, { maximumFractionDigits: 1 })}%)` }];
  if (ov.estimate) {
    stats.push({ label: t('acc.predicted'), value: ov.estimate.estimate === null ? '-' : `${fmt.number(ov.estimate.estimate, { maximumFractionDigits: 2 })} (${ov.estimate.grade})` });
    stats.push({ label: t('acc.floor'), value: `${fmt.number(ov.estimate.floor, { maximumFractionDigits: 2 })} (${ov.estimate.floorGrade})` });
  }
  const panels: Panel[] = [
    {
      id: 'groups',
      title: t(`acc.groups.${b}`),
      hint: t(`acc.hint.${b}`),
      empty: t('acc.none'),
      stats,
      downloads,
      columns: [
        { key: 'id', label: t('acc.c.group') },
        { key: 'title', label: t('acc.c.title') },
        { key: 'weight', label: t('acc.c.weight'), kind: 'num' },
        { key: 'metrics', label: t('acc.c.metrics'), kind: 'num' },
        { key: 'complete', label: t('acc.c.complete'), kind: 'num' },
        { key: 'scored', label: t('acc.c.scored'), kind: 'num' },
        { key: 'mean', label: t('acc.c.mean'), kind: 'num' },
      ],
      rows: ov.groups.map((g) => ({ ...g })),
    },
    {
      id: 'metrics',
      title: t('acc.metrics'),
      hint: t('acc.metricsHint'),
      empty: t('acc.none'),
      columns: [
        { key: 'code', label: t('acc.c.code') },
        { key: 'kind', label: t('acc.c.kind'), kind: 'pill', words: { QnM: t('acc.kind.qnm'), QlM: t('acc.kind.qlm') }, tones: { QnM: 'info', QlM: 'neutral' } },
        { key: 'title', label: t('acc.c.title') },
        { key: 'value', label: t('acc.c.value'), kind: 'num' },
        { key: 'unit', label: t('acc.c.unit') },
        { key: 'source', label: t('acc.c.source'), kind: 'pill', words: { auto: t('acc.src.auto'), manual: t('acc.src.manual'), none: t('acc.src.none') }, tones: { auto: 'success', manual: 'info', none: 'warning' } },
        { key: 'score', label: t('acc.c.points'), kind: 'num' },
        { key: 'evidence', label: t('acc.c.evidence'), kind: 'num' },
        { key: 'complete', label: t('acc.c.done'), kind: 'yes' },
        { key: 'tpl', label: t('acc.c.template'), kind: 'link', href: dl('accreditation', `tmpl-${b}-{code}`), words: { link: t('acc.template') } },
      ],
      rows: ov.metrics.map((m) => ({ ...m, id: m.code, tpl: m.code })),
      actions: [
        { label: t('acc.a.figure'), method: 'PUT', path: base, body: cyc, show: { key: 'kind', is: ['QnM'] }, fields: [{ name: 'value', label: t('acc.c.value'), type: 'number', required: true }, { name: 'note', label: t('acc.f.note'), type: 'text' }] },
        { label: t('acc.a.narrative'), method: 'PUT', path: base, body: cyc, show: { key: 'kind', is: ['QlM'] }, fields: [{ name: 'textValue', label: t('acc.f.narrative'), type: 'textarea', required: true }] },
        { label: t('acc.a.marking'), method: 'PUT', path: base, body: cyc, fields: [{ name: 'selfScore', label: t('acc.f.marking'), type: 'number', required: true, hint: t('acc.f.markingHint') }] },
        { label: t('acc.a.evidence'), path: `${base}/evidence`, body: cyc, fields: [{ name: 'title', label: t('acc.c.title'), type: 'text', required: true }, { name: 'url', label: t('acc.f.link'), type: 'text' }, { name: 'note', label: t('acc.f.note'), type: 'text' }] },
      ],
    },
  ];
  if (b === 'naac') {
    panels.push({
      id: 'dvv',
      title: t('acc.dvv'),
      hint: t('acc.dvvHint'),
      empty: t('acc.dvvNone'),
      columns: [
        { key: 'metricCode', label: t('acc.c.code') },
        { key: 'query', label: t('acc.c.query') },
        { key: 'response', label: t('acc.c.response') },
        { key: 'status', label: t('acc.c.status'), kind: 'pill', words: { open: t('acc.st.open'), answered: t('acc.st.answered'), closed: t('acc.st.closed') }, tones: { open: 'warning', answered: 'info', closed: 'success' } },
      ],
      rows: dvv.map((d) => ({ ...d })),
      actions: [
        { label: t('acc.a.respond'), method: 'PUT', path: '/v1/accreditation/dvv/{id}', fields: [{ name: 'response', label: t('acc.c.response'), type: 'textarea', required: true }] },
        { label: t('acc.a.close'), method: 'PUT', path: '/v1/accreditation/dvv/{id}', body: { status: 'closed' }, show: { key: 'status', is: ['answered'] } },
      ],
      forms: [
        {
          id: 'dvv-new',
          title: t('acc.dvvNew'),
          submit: t('acc.add'),
          path: '/v1/accreditation/dvv',
          extra: cyc,
          fields: [
            { name: 'metricCode', label: t('acc.c.code'), type: 'select', required: true, options: opt(ov.metrics, (m) => m.code, (m) => m.code) },
            { name: 'query', label: t('acc.c.query'), type: 'textarea', required: true },
          ],
        },
      ],
    });
  }
  return (
    <>
      <PageHeader title={t(`acc.title.${b}`)} subtitle={t(`acc.sub.${b}`)} actions={<UrlSelect label={t('acc.cycle')} param="cycle" value={ov.cycle} options={cycleOptions(ov.cycle)} minWidth={160} />} />
      <DepthDesk panels={panels} />
    </>
  );
}
