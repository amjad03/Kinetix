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
import { formatDate } from '@/lib/dates';
import { distribution, formatMarks, KIND_LABEL, percent, resultCounts } from '@/lib/results';
import type { AssessmentDetail, Structure } from '@/lib/types';

export const metadata: Metadata = { title: 'Marks' };

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
  const className = structure.data?.sections.find((s) => s.id === a?.sectionId)?.displayName ?? 'Class';

  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href={a ? `/results?class=${a.sectionId}` : '/results'} size="small" startIcon={<ArrowBack />}>
        Results{a ? ` · ${className}` : ''}
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
              {className} · {a.subject.name} · {KIND_LABEL[a.kind] ?? a.kind} · {formatDate(a.heldOn, 'short')} · out of {formatMarks(a.maxMarks)} · set by {a.createdBy}
            </span>
            <PublishedChip publishedAt={a.publishedAt} />
          </Box>
        }
        actions={!a.publishedAt && me && canPublishMarks(me.roles) ? <PublishButton id={a.id} title={a.title} className={className} entered={c.entered + c.absent} missing={c.missing} /> : undefined}
      />

      <StatGrid min={180}>
        <StatTile
          label="Class average"
          value={s.average === null ? '—' : formatMarks(s.average)}
          unit={s.average === null ? undefined : `/ ${formatMarks(a.maxMarks)}`}
          caption={s.average === null ? 'No marks entered yet' : pct(s.average)}
          bar={s.average === null ? undefined : <MiniBar value={percent(s.average, a.maxMarks)} label={`Class average ${pct(s.average)}`} />}
          testId="stat-average"
        />
        <StatTile label="Highest" value={formatMarks(s.highest)} unit={s.highest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.highest)} testId="stat-highest" />
        <StatTile label="Lowest" value={formatMarks(s.lowest)} unit={s.lowest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.lowest)} testId="stat-lowest" />
        <StatTile
          label="Absent"
          value={c.absent}
          caption={`${c.entered} of ${c.students} marked${c.missing ? ` · ${c.missing} not entered` : ''}`}
          tone={c.missing ? 'warning' : 'default'}
          testId="stat-absent"
        />
      </StatGrid>

      <SectionTitle>How the class did</SectionTitle>
      <Card sx={{ p: { xs: 2, md: 3 } }}>
        {c.entered === 0 ? (
          <Typography variant="body2" color="text.secondary">
            The chart appears once marks are entered.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Students by score, as a share of {formatMarks(a.maxMarks)} marks. {c.absent ? `${c.absent} absent not shown.` : ''}
            </Typography>
            <Distribution bands={bands} total={c.entered} />
          </>
        )}
      </Card>

      <SectionTitle>Marks</SectionTitle>
      <TableFrame testId="marks-table">
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>Roll no.</TableCell>
              <TableCell>Student</TableCell>
              <TableCell align="right">Marks</TableCell>
              <TableCell sx={{ width: { md: '26%' } }}>Score</TableCell>
              <TableCell>Remark</TableCell>
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
                      <Chip size="small" label="Absent" variant="outlined" sx={{ color: 'text.secondary' }} data-status="absent" />
                    ) : st.marks === null ? (
                      <Typography variant="body2" color="text.secondary">
                        Not entered
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
