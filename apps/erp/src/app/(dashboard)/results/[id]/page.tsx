import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MiniBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { Distribution } from '@/components/results/Distribution';
import { PublishButton } from '@/components/results/PublishButton';
import { PublishedChip } from '@/components/results/PublishedChip';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { canPublishMarks } from '@/lib/access';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { distribution, formatMarks, kindLabel, percent, resultCounts } from '@/lib/results';
import type { AssessmentDetail, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('results.marks') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = { fontVariantNumeric: 'tabular-nums' } as const;

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('results');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [res, structure] = await Promise.all([
    load(async () => {
      try {
        return await api<AssessmentDetail>(`/v1/assessments/${id}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) notFound();
        throw e;
      }
    }),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const a = res.data;
  const { t, fmt } = await getI18n();
  const className = structure.data?.sections.find((s) => s.id === a?.sectionId)?.displayName ?? t('results.class');

  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href={a ? `/results?class=${a.sectionId}` : '/results'} size="small" startIcon={<ArrowBack />}>
        {t('results.back')}
        {a ? ` · ${className}` : ''}
      </LinkButton>
    </Box>
  );
  if (!a)
    return (
      <>
        {back}
        <ErrorState message={res.error!} />
      </>
    );

  const c = resultCounts(a.students);
  const s = a.stats;
  const pct = (n: number | null) => (n === null ? '' : `${percent(n, a.maxMarks).toFixed(1)}%`);
  const bands = distribution(
    a.students.map((x) => x.marks),
    a.maxMarks,
  );

  return (
    <>
      {back}
      <PageHeader
        title={a.title}
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <span>
              {className} · {a.subject.name} · {kindLabel(a.kind, t)} · {fmt.date(a.heldOn, 'short')} · {t('results.outOf', { n: formatMarks(a.maxMarks) })} · {t('results.setBy', { name: a.createdBy })}
            </span>
            <PublishedChip publishedAt={a.publishedAt} />
          </Box>
        }
        actions={
          me && canPublishMarks(me.roles) ? (
            <PublishButton id={a.id} title={a.title} className={className} entered={c.entered + c.absent} missing={c.missing} published={!!a.publishedAt} />
          ) : undefined
        }
      />

      <StatGrid min={180}>
        <StatTile
          label={t('results.stat.average')}
          value={s.average === null ? '—' : formatMarks(s.average)}
          unit={s.average === null ? undefined : `/ ${formatMarks(a.maxMarks)}`}
          caption={s.average === null ? t('results.stat.noMarks') : pct(s.average)}
          bar={s.average === null ? undefined : <MiniBar value={percent(s.average, a.maxMarks)} label={t('results.classAverage', { p: pct(s.average) })} />}
          testId="stat-average"
        />
        <StatTile label={t('results.stat.highest')} value={formatMarks(s.highest)} unit={s.highest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.highest)} testId="stat-highest" />
        <StatTile label={t('results.stat.lowest')} value={formatMarks(s.lowest)} unit={s.lowest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.lowest)} testId="stat-lowest" />
        <StatTile
          label={t('results.stat.absent')}
          value={c.absent}
          caption={`${t('results.stat.marked', { n: c.entered, d: c.students })}${c.missing ? ` · ${t('results.stat.notEntered', { n: c.missing })}` : ''}`}
          tone={c.missing ? 'warning' : 'default'}
          testId="stat-absent"
        />
      </StatGrid>

      <SectionTitle>{t('results.howClassDid')}</SectionTitle>
      <Card sx={{ p: { xs: 2, md: 3 } }}>
        {c.entered === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('results.chartLater')}
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('results.chartHelp', { max: formatMarks(a.maxMarks) })} {c.absent ? t('results.absentNotShown', { n: c.absent }) : ''}
            </Typography>
            <Distribution bands={bands} total={c.entered} />
          </>
        )}
      </Card>

      <SectionTitle>{t('results.marks')}</SectionTitle>
      <TableFrame testId="marks-table">
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('results.col.roll')}</TableCell>
              <TableCell>{t('results.col.student')}</TableCell>
              <TableCell align="right">{t('results.col.marks')}</TableCell>
              <TableCell sx={{ width: { md: '26%' } }}>{t('results.col.score')}</TableCell>
              <TableCell>{t('results.col.remark')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {a.students.map((st) => {
              const p = st.marks === null ? null : percent(st.marks, a.maxMarks);
              return (
                <TableRow key={st.id} hover data-testid="mark-row" sx={{ '& td': { py: 1 } }}>
                  <TableCell sx={{ ...num, color: 'text.secondary', whiteSpace: 'nowrap' }}>{st.rollNo ?? '—'}</TableCell>
                  <TableCell>{st.fullName}</TableCell>
                  <TableCell align="right" sx={{ ...num, whiteSpace: 'nowrap' }}>
                    {st.absent ? (
                      <Chip size="small" label={t('results.absent')} variant="outlined" sx={{ color: 'text.secondary' }} data-status="absent" />
                    ) : st.marks === null ? (
                      <Typography variant="body2" color="text.secondary">
                        {t('results.notEntered')}
                      </Typography>
                    ) : (
                      <>
                        <strong>{formatMarks(st.marks)}</strong>
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' '}
                          / {formatMarks(a.maxMarks)}
                        </Typography>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {p !== null && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ flex: 1, minWidth: 48 }}>
                          <MiniBar value={p} color={p < 40 ? 'error.main' : 'primary.main'} label={`${p.toFixed(0)}%`} />
                        </Box>
                        <Typography variant="body2" sx={{ ...num, minWidth: 44, textAlign: 'right' }}>
                          {p.toFixed(0)}%
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{st.remark ?? ''}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}
