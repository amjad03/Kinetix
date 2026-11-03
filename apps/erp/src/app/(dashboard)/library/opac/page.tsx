import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { MineButton, ReserveButton } from '@/components/library/OpacActions';
import { Button } from '@/components/shadcn/button';
import { Card, EmptyState, ErrorState, FormRow, FormRowActions, PageHeader, SelectInput, StatusPill, TextInput } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { OPAC_FIELDS, OPAC_SORTS, opacApiQuery, opacHref, opacState, type OpacFacet } from '@/lib/library-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lp.opac.title') };
}

interface Facet {
  value: string;
  label?: string;
  count: number;
}
interface Opac {
  total: number;
  page: number;
  facets: Record<OpacFacet, Facet[]> & { availableNow: number };
  rows: { id: string; title: string; author: string; isbn: string | null; callNo: string | null; subject: string; publisher: string; pubYear: number | null; edition: string; material: string; language: string; copies: number; available: number; reservable: boolean; branches: { branch: string; available: number; copies: number }[] }[];
}
interface Mine {
  member: { cardNo: string; fullName: string };
  rules: { loanDays: number; maxBooks: number; maxRenewals: number };
  current: { id: string; title: string; accessionNo: string | null; dueOn: string; overdue: boolean; fineSoFarPaise: number; canRenew: boolean; renewCount: number }[];
  reservations: { id: string; title: string; status: string; expiresAt: string | null }[];
}

const MATERIALS = ['book', 'reference', 'thesis', 'cd', 'map', 'other'];

/**
 * The online catalogue in the ERP: search by any word, title, author, subject or ISBN, narrow by facets (subject,
 * material, language, author, decade, branch, on the shelf now) whose counts follow the other choices, see copies per
 * branch, and reserve a title whose copies are out, for oneself or a member at the desk; with one's own loans to renew.
 */
export default async function OpacPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('library');
  const { t, fmt } = await getI18n();
  const state = opacState(await searchParams);
  const query = opacApiQuery(state);
  const data = await load(async () => {
    const [opac, mine] = await Promise.all([api<Opac>(`/v1/library/opac${query ? `?${query}` : ''}`), safe(api<Mine>('/v1/library/me'), null)]);
    return { opac, mine };
  });
  const header = <PageHeader title={t('lp.opac.title')} subtitle={t('lp.opac.subtitle')} actions={<LinkButton href="/library/desk" variant="outlined">{t('lht.desk.library')}</LinkButton>} />;
  if (data.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={data.error} />
      </>
    );
  const { opac, mine } = data.data;
  const word = (key: string, fallback: string) => {
    const s = t(key as MessageKey);
    return s === key ? fallback : s;
  };
  const facetLabel = (f: OpacFacet, v: Facet) => (f === 'material' ? word(`rk.o.library-books.material.${v.value}`, v.value) : f === 'decade' ? t('lp.opac.decade', { y: v.value }) : (v.label ?? v.value));
  const pages = Math.max(1, Math.ceil(opac.total / 20));
  const chosen = Object.entries(state.facets) as [OpacFacet, string][];

  return (
    <>
      {header}
      <Card testId="opac-search">
        <FormRow component="form" method="get" action="/library/opac">
          <TextInput name="q" label={t('lp.opac.q')} defaultValue={state.q} className="min-w-0 flex-[2]" placeholder={t('lp.opac.qHint')} />
          <SelectInput name="field" label={t('lp.opac.field')} defaultValue={state.field} options={OPAC_FIELDS.map((f) => ({ value: f, label: t(`lp.opac.f.${f}` as MessageKey) }))} className="min-w-40" />
          <SelectInput name="sort" label={t('lp.opac.sort')} defaultValue={state.sort} options={OPAC_SORTS.map((s) => ({ value: s, label: t(`lp.opac.s.${s}` as MessageKey) }))} className="min-w-36" />
          {chosen.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {state.available && <input type="hidden" name="available" value="true" />}
          <FormRowActions>
            <Button type="submit" data-testid="opac-go">
              <Search />
              {t('lp.opac.search')}
            </Button>
          </FormRowActions>
        </FormRow>
      </Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="grid gap-4" aria-label={t('lp.opac.narrow')} data-testid="opac-facets">
          <Card title={t('lp.opac.narrow')}>
            <div className="grid gap-4">
              <Link href={opacHref(state, { available: !state.available })} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted" aria-current={state.available ? 'true' : undefined}>
                <span className={state.available ? 'font-semibold' : ''}>{t('lp.opac.onShelf')}</span>
                <span className="text-muted-foreground">{fmt.number(opac.facets.availableNow)}</span>
              </Link>
              {(['subject', 'material', 'language', 'author', 'decade', 'branch'] as OpacFacet[]).map((f) =>
                opac.facets[f]?.length ? (
                  <div key={f}>
                    <p className="m-0 mb-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{t(`lp.opac.facet.${f}` as MessageKey)}</p>
                    <ul className="m-0 grid list-none gap-0.5 p-0">
                      {opac.facets[f].map((v) => {
                        const on = state.facets[f] === v.value;
                        return (
                          <li key={v.value}>
                            <Link href={opacHref(state, { facets: { [f]: on ? '' : v.value } })} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted" aria-current={on ? 'true' : undefined} data-testid={`facet-${f}`}>
                              <span className={`truncate ${on ? 'font-semibold text-primary' : ''}`}>{facetLabel(f, v)}</span>
                              <span className="shrink-0 text-muted-foreground">{fmt.number(v.count)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null,
              )}
              {(chosen.length > 0 || state.available) && (
                <LinkButton href={opacHref({ ...state, facets: {}, available: false })} variant="outlined">
                  {t('lp.opac.clear')}
                </LinkButton>
              )}
            </div>
          </Card>
        </aside>

        <section aria-label={t('lp.opac.results')} className="grid min-w-0 gap-3" data-testid="opac-results">
          <p className="m-0 text-sm text-muted-foreground">{t('lp.opac.found', { n: fmt.number(opac.total) })}</p>
          {opac.rows.length === 0 ? (
            <EmptyState icon={<Search />} title={t('lp.opac.none')} description={t('lp.opac.noneHint')} />
          ) : (
            opac.rows.map((b) => (
              <Card key={b.id} testId="opac-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-base font-semibold">{b.title}</p>
                    <p className="m-0 text-sm text-muted-foreground">{[b.author, b.edition, b.publisher, b.pubYear].filter(Boolean).join(' · ')}</p>
                    <p className="m-0 mt-1 text-xs text-muted-foreground">
                      {[b.callNo && t('lp.opac.callNo', { c: b.callNo }), b.isbn && `ISBN ${b.isbn}`, b.subject, MATERIALS.includes(b.material) && b.material !== 'book' ? word(`rk.o.library-books.material.${b.material}`, b.material) : ''].filter(Boolean).join(' · ')}
                    </p>
                    {b.branches.length > 0 && (
                      <p className="m-0 mt-1 text-xs">
                        {b.branches.map((br) => t('lp.opac.atBranch', { branch: br.branch || t('lp.opac.mainBranch'), a: br.available, n: br.copies })).join('  ·  ')}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusPill tone={b.available > 0 ? 'success' : b.copies > 0 ? 'warning' : 'neutral'}>{b.available > 0 ? t('lp.opac.availableN', { n: b.available }) : b.copies > 0 ? t('lp.opac.allOut') : t('lp.opac.noCopies')}</StatusPill>
                    {b.reservable && <ReserveButton bookId={b.id} title={b.title} desk />}
                  </div>
                </div>
              </Card>
            ))
          )}
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label={t('lp.opac.pages')}>
              {state.page > 1 ? <LinkButton href={opacHref(state, { page: state.page - 1 })} variant="outlined">{t('lp.opac.prev')}</LinkButton> : <span />}
              <span className="text-sm text-muted-foreground">{t('lp.opac.pageOf', { p: state.page, n: pages })}</span>
              {state.page < pages ? <LinkButton href={opacHref(state, { page: state.page + 1 })} variant="outlined">{t('lp.opac.next')}</LinkButton> : <span />}
            </nav>
          )}

          {mine && (
            <Card title={t('lp.opac.mine')} subtitle={t('lp.opac.mineSub', { card: mine.member.cardNo, days: mine.rules.loanDays, max: mine.rules.maxBooks })} testId="opac-mine">
              {mine.current.length === 0 && mine.reservations.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('lp.opac.mineNone')}</p>
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {mine.current.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <strong>{l.title}</strong> <span className="text-muted-foreground">{l.accessionNo}</span>
                        <br />
                        <span className={l.overdue ? 'text-destructive' : 'text-muted-foreground'}>{l.overdue ? t('lp.opac.overdue', { d: fmt.date(l.dueOn), fine: fmt.rupees(l.fineSoFarPaise) }) : t('lp.opac.due', { d: fmt.date(l.dueOn) })}</span>
                      </span>
                      {l.canRenew && <MineButton kind="renew" id={l.id} />}
                    </li>
                  ))}
                  {mine.reservations.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <strong>{r.title}</strong>
                        <br />
                        <span className="text-muted-foreground">{r.status === 'ready' && r.expiresAt ? t('lp.opac.ready', { d: fmt.date(r.expiresAt.slice(0, 10)) }) : t('lp.opac.waiting')}</span>
                      </span>
                      <MineButton kind="cancel" id={r.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
