import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuditNote } from '@/components/conversations/AuditNote';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { senderSide } from '@/lib/conversations';
import { formatDateTime } from '@/lib/dates';
import { TIMEZONE } from '@/lib/school';
import type { ConversationThread } from '@/lib/types';

export const metadata: Metadata = { title: 'Conversation' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('conversations');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Reading the thread as a leader is audited by the API (conversation.read_by_leader).
  const res = await load(async () => {
    try {
      return await api<ConversationThread>(`/v1/conversations/${id}/messages`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });

  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/conversations" size="small" startIcon={<ArrowBack />}>
        Parent messages
      </LinkButton>
    </Box>
  );
  if (res.error !== undefined)
    return (
      <>
        {back}
        <ErrorState message={res.error} />
      </>
    );
  const { conversation: c, messages } = res.data;

  return (
    <>
      {back}
      <PageHeader title={`${c.family.fullName} and ${c.staff.fullName}`} subtitle={`About ${c.student.fullName} · ${c.className} · read-only`} />
      <AuditNote>Your opening of this conversation has been recorded in the audit log. You can read it here but not reply.</AuditNote>
      {messages.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No messages yet.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, maxWidth: 760 }} data-testid="thread">
          {messages.map((m) => {
            const side = senderSide(m, c);
            const staff = side === 'staff';
            return (
              <Box key={m.id} sx={{ display: 'flex', justifyContent: staff ? 'flex-end' : 'flex-start' }} data-testid="message" data-side={side}>
                <Box
                  sx={{
                    maxWidth: '82%',
                    px: 2,
                    py: 1.25,
                    borderRadius: staff ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    bgcolor: staff ? 'm3.secondaryContainer' : 'm3.surfaceContainerHigh',
                    color: staff ? 'm3.onSecondaryContainer' : 'text.primary',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 500, display: 'block', mb: 0.25 }}>
                    {side === 'staff' ? `${c.staff.fullName} · teacher` : side === 'family' ? `${c.family.fullName} · parent` : 'KINETIX'}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {m.body}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, textAlign: 'right' }}>
                    {formatDateTime(m.createdAt, TIMEZONE)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
}
