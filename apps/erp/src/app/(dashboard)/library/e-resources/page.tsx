import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.er.title') };
}

/** The e-resource register with its access log, and the books and e-resources recommended for each topic. */
export default async function EResourcesPage({ searchParams }: { searchParams: Promise<{ resource?: string; q?: string; topic?: string }> }) {
  await requireSection('library');
  const { t } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const [resources, books] = await Promise.all([api<Record<string, unknown>[]>('/v1/library/eresources'), safe(api<{ id: string; title: string }[]>('/v1/library/books'), [])]);
    const resource = resources.find((r) => r.id === sp.resource);
    const q = (sp.q ?? '').trim();
    const [log, topics] = await Promise.all([
      resource ? safe(api<Record<string, unknown>[]>(`/v1/library/eresources/${resource.id}/access`), []) : [],
      q.length >= 2 ? safe(api<{ id: string; title: string; chapter: string }[]>(`/v1/library/topics?q=${encodeURIComponent(q)}`), []) : [],
    ]);
    const topic = topics.find((x) => x.id === sp.topic) ?? topics[0];
    const linked = topic ? await safe(api<{ books: { id: string; title: string; linkId: string }[]; eresources: { id: string; title: string; linkId: string }[] }>(`/v1/library/topics/${topic.id}/resources`), { books: [], eresources: [] }) : { books: [], eresources: [] };
    return { resources, books, resource, log, q, topics, topic, linked };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { resources, books, resource, log, q, topics, topic, linked } = data.data;
  const words = stateWords(t);
  const kinds = ['ebook', 'journal', 'database', 'video', 'other'] as const;
  const kindWords = Object.fromEntries(kinds.map((k) => [k, t(`dx.er.k.${k}`)]));

  const panels: Panel[] = [
    {
      id: 'register',
      title: t('dx.er.register'),
      hint: t('dx.er.registerHint'),
      empty: t('dx.er.none'),
      columns: [
        { key: 'title', label: t('dx.c.title') },
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: kindWords },
        { key: 'publisher', label: t('dx.er.publisher') },
        { key: 'licenceUntil', label: t('dx.er.licence'), kind: 'date' },
        { key: 'seats', label: t('dx.er.seats'), kind: 'num' },
        { key: 'opens', label: t('dx.er.opens'), kind: 'num' },
        { key: 'readers', label: t('dx.er.readers'), kind: 'num' },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
        { key: 'licenceExpired', label: t('dx.er.expired'), kind: 'yes' },
      ],
      rows: resources,
      actions: [{ label: t('dx.er.retire'), path: '/v1/library/eresources/{id}/retire', show: { key: 'status', is: ['active'] }, confirm: t('dx.er.retireConfirm') }],
      forms: [
        {
          id: 'eresource',
          title: t('dx.er.add'),
          submit: t('dx.add'),
          path: '/v1/library/eresources',
          fields: [
            { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
            { name: 'kind', label: t('dx.c.kind'), type: 'select', options: opt([...kinds], (k) => k, (k) => kindWords[k]), initial: 'ebook', required: true },
            { name: 'publisher', label: t('dx.er.publisher'), type: 'text' },
            { name: 'url', label: t('dx.c.link'), type: 'text', required: true },
            { name: 'licenceUntil', label: t('dx.er.licence'), type: 'date', nullable: true },
            { name: 'seats', label: t('dx.er.seats'), type: 'number', hint: t('dx.er.seatsHint') },
          ],
        },
      ],
    },
  ];

  if (resource) {
    panels.push({
      id: 'log',
      title: `${t('dx.er.log')}: ${String(resource.title)}`,
      empty: t('dx.er.noLog'),
      columns: [
        { key: 'name', label: t('dx.c.name') },
        { key: 'accessedAt', label: t('dx.er.when'), kind: 'datetime' },
      ],
      rows: log,
    });
  }

  panels.push({
    id: 'topics',
    title: topic ? `${t('dx.er.topicLinks')}: ${topic.title}` : t('dx.er.topicLinks'),
    hint: topic ? t('dx.er.topicHint', { chapter: topic.chapter }) : t('dx.er.topicSearchHint'),
    empty: t('dx.er.noLinks'),
    columns: [
      { key: 'title', label: t('dx.c.title') },
      { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: { book: t('dx.er.book'), eresource: t('dx.er.eresource') } },
    ],
    rows: [...linked.books.map((b) => ({ id: b.linkId, title: b.title, kind: 'book' })), ...linked.eresources.map((e) => ({ id: e.linkId, title: e.title, kind: 'eresource' }))],
    actions: [{ label: t('dx.remove'), method: 'DELETE', path: '/v1/library/topic-links/{id}' }],
    forms: topic
      ? [
          {
            id: 'link',
            title: t('dx.er.link'),
            submit: t('dx.add'),
            path: '/v1/library/topic-links',
            extra: { topicId: topic.id },
            fields: [
              { name: 'resourceKind', label: t('dx.c.kind'), type: 'select', options: [{ value: 'book', label: t('dx.er.book') }, { value: 'eresource', label: t('dx.er.eresource') }], required: true },
              { name: 'resourceId', label: t('dx.c.title'), type: 'select', options: [...books.map((b) => ({ value: b.id, label: `${t('dx.er.book')}: ${b.title}` })), ...resources.filter((r) => r.status === 'active').map((r) => ({ value: String(r.id), label: `${t('dx.er.eresource')}: ${String(r.title)}` }))], required: true, hint: t('dx.er.linkHint') },
            ],
          },
        ]
      : [],
  });

  return (
    <>
      <PageHeader title={t('dx.er.title')} subtitle={t('dx.er.subtitle')} actions={resources.length ? <UrlSelect label={t('dx.er.showLog')} param="resource" value={resource ? String(resource.id) : ''} options={opt(resources, (r) => String(r.id), (r) => String(r.title))} /> : undefined} />
      <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder={t('dx.er.topicSearch')} aria-label={t('dx.er.topicSearch')} style={{ padding: '8px 10px', minWidth: 240 }} />
        <button type="submit">{t('dx.er.search')}</button>
        {topics.length > 1 && (
          <select name="topic" defaultValue={topic?.id} aria-label={t('dx.er.topic')}>
            {topics.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        )}
      </form>
      <DepthDesk panels={panels} />
    </>
  );
}
