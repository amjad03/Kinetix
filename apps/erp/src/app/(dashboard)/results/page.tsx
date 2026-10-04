import ChevronRight from '@mui/icons-material/ChevronRight';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { PublishedChip } from '@/components/results/PublishedChip';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { load, requireSection } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { formatMarks, KIND_LABEL, percent } from '@/lib/results';
import { assessmentDetails, resultClasses } from '@/lib/results-data';
import type { AssessmentDetail } from '@/lib/types';

export const metadata: Metadata = { title: 'Results' };

const num = { fontVariantNumeric: 'tabular-nums' } as const;

function Average({ a }: { a: AssessmentDetail }) {
  if (a.stats.average === null)
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  const p = percent(a.stats.average, a.maxMarks);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }}>
      <Box sx={{ width: { xs: 48, md: 72 } }}>
        <MiniBar value={p} label={`Class average ${p.toFixed(0)}%`} />
      </Box>
      <Typography variant="body2" sx={{ ...num, minWidth: 92, textAlign: 'right' }}>
        {formatMarks(a.stats.average)} / {formatMarks(a.maxMarks)}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {p.toFixed(1)}%
        </Typography>
      </Typography>
    </Box>
  );
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireSection('results');
  const sp = await searchParams;
  const classes = await load(resultClasses);
  const list = classes.data ?? [];
  const klass = list.find((c) => c.id === sp.class) ?? list.find((c) => c.assessments.length > 0) ?? list[0];
  const details = klass ? await load(() => assessmentDetails(klass.assessments.map((a) => a.id))) : null;
  const rows = details?.data ?? [];
  const published = rows.filter((a) => a.publishedAt).length;

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Tests, assignments and exams, class by class. Teachers enter marks in the KINETIX Teacher App."
        actions={
          list.length > 0 && klass ? (
            <UrlSelect label="Class" param="class" value={klass.id} options={list.map((c) => ({ value: c.id, label: c.name }))} testId="results-class" />
          ) : undefined
        }
      />
      {classes.error !== undefined ? (
        <ErrorState message={classes.error} />
      ) : !klass ? (
        <EmptyState icon={<GradingOutlined />} title="No classes to show" testId="no-result-classes">
          Results appear here for the classes you teach.
        </EmptyState>
      ) : details?.error !== undefined ? (
        <ErrorState message={details.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<GradingOutlined />} title={`No assessments for ${klass.name} yet`} testId="no-assessments">
          When a teacher sets a test or assignment for this class in the Teacher App, it appears here with the marks entered.
        </EmptyState>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} data-testid="results-summary">
            {klass.name} · {klass.students} students · {rows.length} assessment{rows.length === 1 ? '' : 's'} · {published} published
          </Typography>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableFrame testId="assessments-table">
              <Table sx={{ minWidth: 860 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Assessment</TableCell>
                    <TableCell>Held on</TableCell>
                    <TableCell align="right">Marks entered</TableCell>
                    <TableCell align="right">Class average</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell aria-label="Open" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((a) => {
                    const done = a.students.filter((s) => s.marks !== null || s.absent).length;
                    return (
                      <TableRow key={a.id} hover data-testid="assessment-row">
                        <TableCell>
                          <Typography variant="subtitle2">{a.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {a.subject.name} · {KIND_LABEL[a.kind] ?? a.kind} · out of {formatMarks(a.maxMarks)} · {a.createdBy}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(a.heldOn, 'short')}</TableCell>
                        <TableCell align="right" sx={num} data-testid="assessment-entered">
                          {done} of {a.students.length}
                        </TableCell>
                        <TableCell align="right" data-testid="assessment-average">
                          <Average a={a} />
                        </TableCell>
                        <TableCell>
                          <PublishedChip publishedAt={a.publishedAt} />
                        </TableCell>
                        <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                          <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={`Marks for ${a.title}`}>
                            Marks
                          </LinkButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          </Box>
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }}>
            {rows.map((a) => (
              <Box key={a.id} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                    {a.title}
                  </Typography>
                  <PublishedChip publishedAt={a.publishedAt} />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {a.subject.name} · {formatDate(a.heldOn, 'short')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Average {a.stats.average === null ? '—' : `${formatMarks(a.stats.average)} / ${formatMarks(a.maxMarks)}`}
                </Typography>
                <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} sx={{ mt: 1, ml: -1 }}>
                  Marks
                </LinkButton>
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}
