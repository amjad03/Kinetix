import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import SwapVert from '@mui/icons-material/SwapVert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { Metadata } from 'next';
import { StatusPill } from '@/components/admissions/Chips';
import { TableFrame } from '@/components/DataTable';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import { STUDENT_STATUSES, type StudentRow } from '@/lib/admissions';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.students') };
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await requireSection('students');
  const sp = await searchParams;
  const status = (STUDENT_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : '';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const rows = await load(() => api<StudentRow[]>(`/v1/students?${params}`));
  const { t } = await getI18n();
  const link = (s: string) => `/students${s || q ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}` : ''}`;
  return (
    <>
      <PageHeader
        title={t('nav.students')}
        subtitle={t('stu.subtitle')}
        actions={
          me && canChangeLifecycle(me.roles) ? (
            <LinkButton href="/students/promotion" variant="outlined" startIcon={<SwapVert />}>
              {t('stu.promotion')}
            </LinkButton>
          ) : undefined
        }
      />
      <Stack component="form" method="get" direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField name="q" size="small" defaultValue={q} label={t('stu.search')} sx={{ minWidth: 260 }} />
        {status && <input type="hidden" name="status" value={status} />}
        <Button type="submit" variant="outlined">
          {t('common.search')}
        </Button>
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 0.75 }}>
        <LinkButton size="small" href={link('')} variant={status ? 'outlined' : 'contained'}>
          {t('adm.allStatuses')}
        </LinkButton>
        {STUDENT_STATUSES.filter((s) => s !== 'applicant').map((s) => (
          <LinkButton key={s} size="small" href={link(s)} variant={status === s ? 'contained' : 'outlined'}>
            {t(`adm.stu.${s}` as MessageKey)}
          </LinkButton>
        ))}
      </Stack>
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : rows.data!.length === 0 ? (
        <EmptyState icon={<GroupsOutlined />} title={t('stu.none')} testId="no-students">
          {t('stu.noneBody')}
        </EmptyState>
      ) : (
        <TableFrame testId="students">
          <Table sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('adm.field.name')}</TableCell>
                <TableCell>{t('stu.class')}</TableCell>
                <TableCell>{t('stu.roll')}</TableCell>
                <TableCell>{t('adm.col.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.data!.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography component={NextLink} href={`/students/${s.id}`} variant="subtitle2" sx={{ color: 'primary.main', textDecoration: 'none' }}>
                      {s.fullName}
                    </Typography>
                  </TableCell>
                  <TableCell>{s.className}</TableCell>
                  <TableCell>{s.rollNo}</TableCell>
                  <TableCell>
                    <StatusPill kind="student" status={s.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}
