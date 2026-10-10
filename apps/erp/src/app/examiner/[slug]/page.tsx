import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { ClaimButton, InviteLogin, PaperPanel, PortalCard, ValuationPanel, type PortalPaper, type PortalScript } from '@/components/exams/ExaminerPortal';
import { Logo } from '@/components/Logo';
import { getI18n } from '@/i18n/server';
import { api } from '@/lib/api';
import type { MessageKey } from '@/i18n/messages';
import { inviteInfo } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('uni.portal.title'), robots: { index: false } };
}

interface Home {
  name: string;
  organisation: string;
  assignments: { id: string; role: string; session: string; subject: string; status: string; scripts: number; valued: number }[];
}

/**
 * The external examiner portal: an invite link opens a one-time-code sign-in; afterwards only the examiner's own
 * assignments show, with anonymised scripts (a code and a maximum, never the student) or the question paper.
 */
export default async function ExaminerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params;
  const { invite } = await searchParams;
  const { t } = await getI18n();
  const frame = (children: React.ReactNode) => (
    <Box component="main" sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 860, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}><Logo /></Box>
        <Typography variant="h5" component="h1" sx={{ mb: 3 }}>{t('uni.portal.title')}</Typography>
        {children}
      </Box>
    </Box>
  );

  if (invite) {
    const info = await inviteInfo(slug, invite);
    if (!info) return frame(<Typography>{t('uni.portal.invalid')}</Typography>);
    return frame(<InviteLogin slug={slug} token={invite} who={info.name} phone={info.phone} role={info.role} institution={info.institution} />);
  }

  const home = await api<Home>('/v1/examiner-portal/me');
  const parts = await Promise.all(
    home.assignments.map(async (a) => {
      const scripts = a.role === 'valuer' ? await api<PortalScript[]>(`/v1/examiner-portal/assignments/${a.id}/scripts`) : [];
      const paper = a.role === 'valuer' ? null : await api<PortalPaper | null>(`/v1/examiner-portal/assignments/${a.id}/question-paper`);
      return { a, scripts, paper };
    }),
  );
  return frame(
    <>
      <Typography sx={{ mb: 2 }}>{home.name}{home.organisation ? `, ${home.organisation}` : ''}</Typography>
      {parts.length === 0 && <Typography>{t('uni.portal.empty')}</Typography>}
      {parts.map(({ a, scripts, paper }) => (
        <PortalCard key={a.id} title={`${t(`uni.ex.role.${a.role}` as MessageKey)}: ${a.subject} (${a.session})`}>
          {a.role === 'valuer' ? <ValuationPanel scripts={scripts} /> : <PaperPanel assignmentId={a.id} role={a.role} paper={paper} />}
          <Box sx={{ mt: 2 }}><ClaimButton assignmentId={a.id} /></Box>
        </PortalCard>
      ))}
    </>,
  );
}
