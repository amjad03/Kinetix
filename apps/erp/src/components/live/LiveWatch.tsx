'use client';

import ArrowBack from '@mui/icons-material/ArrowBack';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import Fullscreen from '@mui/icons-material/Fullscreen';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MicOffOutlined from '@mui/icons-material/MicOffOutlined';
import Refresh from '@mui/icons-material/Refresh';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import WifiOffOutlined from '@mui/icons-material/WifiOffOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatTime } from '@/lib/dates';
import { endedText, type LiveSession, type RefusalCode, type StreamMessage } from '@/lib/live/events';
import { LivePlayer } from '@/lib/live/player';
import { LiveBoard } from './LiveBoard';
import { LiveChip } from './LiveChip';

type Status =
  | { kind: 'connecting' }
  | { kind: 'watching' }
  | { kind: 'offline' }
  | { kind: 'reconnecting' }
  | { kind: 'ended'; reason: string }
  | { kind: 'refused'; code: RefusalCode | 'failed'; error: string };

export interface WatchBoard {
  id: string;
  name: string;
  room: string | null;
  session: LiveSession | null;
}

const REFUSAL_TITLE: Record<RefusalCode | 'failed', string> = {
  turned_off: 'Live view is turned off',
  no_class: 'No class on this board right now',
  offline: 'This board is offline',
  unknown_board: 'Board not found',
  expired: 'Your session has ended',
  forbidden: "You can't watch classes",
  unavailable: "Can't reach KINETIX Cloud",
  other: "Can't watch this class",
  failed: "Couldn't open the live view",
};

export function LiveWatch({ board, timeZone }: { board: WatchBoard; timeZone: string }) {
  // One player for the page's lifetime; it is mutated as frames arrive and `version` redraws.
  const [p] = useState(() => new LivePlayer());
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'connecting' });
  const [session, setSession] = useState<LiveSession | null>(board.session);
  const [hasFrame, setHasFrame] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  const [slow, setSlow] = useState(false);

  useEffect(() => {
    p.reset();
    const es = new EventSource(`/api/live/${board.id}`);
    let final = false;
    es.onmessage = (ev) => {
      let m: StreamMessage;
      try {
        m = JSON.parse(ev.data) as StreamMessage;
      } catch {
        return;
      }
      switch (m.type) {
        case 'watching':
          if (m.session) setSession(m.session);
          setStatus({ kind: 'watching' });
          break;
        case 'frame':
          if (m.frame.snapshot) p.reset(m.frame.snapshot);
          p.apply(Array.isArray(m.frame.events) ? m.frame.events : []);
          setHasFrame(true);
          setStatus((s) => (s.kind === 'offline' || s.kind === 'reconnecting' || s.kind === 'connecting' ? { kind: 'watching' } : s));
          setVersion(p.version);
          break;
        case 'offline':
          setStatus({ kind: 'offline' });
          break;
        case 'reconnecting':
          setStatus((s) => (s.kind === 'watching' || s.kind === 'offline' ? { kind: 'reconnecting' } : s));
          break;
        case 'ended':
          final = true;
          es.close();
          setStatus({ kind: 'ended', reason: m.reason });
          break;
        case 'refused':
          final = true;
          es.close();
          setStatus({ kind: 'refused', code: m.code, error: m.error });
          break;
      }
    };
    es.onerror = () => {
      if (final) return;
      // CLOSED: the stream was refused (signed out, no access). Otherwise the browser retries.
      if (es.readyState === EventSource.CLOSED) setStatus({ kind: 'refused', code: 'failed', error: 'Sign in again, or try again in a moment.' });
      else setStatus((s) => (s.kind === 'watching' ? { kind: 'reconnecting' } : s));
    };
    return () => es.close();
  }, [board.id, attempt, p]);

  // A board that has not answered in a while may be on an older app without live view.
  useEffect(() => {
    if (hasFrame || status.kind !== 'watching') return;
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [hasFrame, status.kind]);

  const retry = useCallback(() => {
    setHasFrame(false);
    setSlow(false);
    setStatus({ kind: 'connecting' });
    setAttempt((a) => a + 1);
  }, []);

  const title = [session?.subject, session?.section].filter(Boolean).join(' · ') || 'Unscheduled class';

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: -1 }}>
        <Button component={Link} href="/live" startIcon={<ArrowBack />} size="small">
          Live classrooms
        </Button>
      </Box>

      {/* Status strip, like the board's own */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1, md: 2 }, mb: 2 }} data-testid="live-info">
        <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
              {title}
            </Typography>
            <StatusChip status={status} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {session ? `${session.teacher} · since ${formatTime(session.startedAt, timeZone)} · ` : ''}
            {board.name}
            {board.room ? ` · ${board.room}` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasFrame && (
            <Chip variant="outlined" label={`Page ${p.index + 1} of ${p.pageCount}`} data-testid="live-page" sx={{ fontVariantNumeric: 'tabular-nums' }} />
          )}
          <Tooltip title="Full screen">
            <IconButton aria-label="Full screen" onClick={() => stage.current?.requestFullscreen?.().catch(() => {})}>
              <Fullscreen />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box ref={stage} sx={{ width: '100%', maxWidth: 'calc((100dvh - 250px) * 16 / 9)', minWidth: { xs: 0, sm: 480 }, mx: 'auto', ':fullscreen': { maxWidth: 'none', display: 'grid', placeItems: 'center', bgcolor: '#000' } }}>
        <LiveBoard player={p} version={version}>
          <Overlay status={status} hasFrame={hasFrame} slow={slow} onRetry={retry} />
          {status.kind === 'watching' && hasFrame && p.strokes.length === 0 && (
            <Box
              data-testid="live-empty"
              sx={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', px: 2, py: 0.75, borderRadius: 16, bgcolor: 'rgba(32,33,36,.72)', color: '#fff', typography: 'body2', whiteSpace: 'nowrap' }}
            >
              {p.pageCount > 1 ? 'This page is empty so far' : 'Nothing on the board yet'}
            </Box>
          )}
        </LiveBoard>
      </Box>

      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 3 }, mt: 1.5, color: 'text.secondary', justifyContent: 'center' }}
        data-testid="live-notes"
      >
        <Note icon={<VisibilityOutlined />}>Viewing is recorded in the audit log.</Note>
        <Note icon={<MicOffOutlined />}>Board only: classroom sound is not part of live view yet.</Note>
      </Box>
    </>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, '& svg': { fontSize: 18 } }}>
      {icon}
      <Typography variant="caption" component="span" sx={{ fontSize: '0.8125rem' }}>
        {children}
      </Typography>
    </Box>
  );
}

function StatusChip({ status }: { status: Status }) {
  switch (status.kind) {
    case 'watching':
      return <LiveChip />;
    case 'connecting':
      return <Chip size="small" variant="outlined" label="Connecting…" />;
    case 'reconnecting':
      return <Chip size="small" variant="outlined" label="Reconnecting…" />;
    case 'offline':
      return <Chip size="small" variant="outlined" label="Board offline" sx={{ color: 'text.secondary' }} />;
    case 'ended':
      return <Chip size="small" label="Ended" sx={{ bgcolor: 'm3.surfaceContainerHighest' }} />;
    case 'refused':
      return <Chip size="small" label="Not available" sx={{ bgcolor: 'm3.surfaceContainerHighest' }} />;
  }
}

/** What is shown over the board when it is not simply live. */
function Overlay({ status, hasFrame, slow, onRetry }: { status: Status; hasFrame: boolean; slow: boolean; onRetry: () => void }) {
  if (status.kind === 'watching' && hasFrame) return null;
  if (status.kind === 'watching' || status.kind === 'connecting') {
    return (
      <Center testId="live-waiting" scrim={false}>
        <CircularProgress size={28} />
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {status.kind === 'connecting' ? 'Connecting to the board…' : 'Waiting for the board…'}
        </Typography>
        {slow && (
          <Typography variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 380 }}>
            The board has not sent anything yet. It may need the latest KINETIX Board app.
          </Typography>
        )}
      </Center>
    );
  }
  if (status.kind === 'reconnecting' || status.kind === 'offline') {
    const offline = status.kind === 'offline';
    return (
      <Center testId={offline ? 'live-offline' : 'live-reconnecting'} scrim={hasFrame}>
        {offline ? <WifiOffOutlined /> : <CircularProgress size={28} />}
        <Typography variant="subtitle1" sx={{ mt: 1.5 }}>
          {offline ? 'The board went offline' : 'Reconnecting…'}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.85 }}>
          {offline ? 'The class carries on here when the board is back online.' : 'The board will appear again in a moment.'}
        </Typography>
      </Center>
    );
  }
  const ended = status.kind === 'ended';
  const icon = ended ? <EventBusyOutlined /> : status.code === 'turned_off' || status.code === 'forbidden' ? <LockOutlined /> : <CloudOffOutlined />;
  const title = ended ? 'Class ended' : REFUSAL_TITLE[status.code];
  const text = ended
    ? endedText(status.reason)
    : status.code === 'turned_off'
      ? 'Your institution has turned live view off. An administrator can turn it on in the institution settings.'
      : status.error;
  const canRetry = !ended && status.code !== 'turned_off' && status.code !== 'forbidden' && status.code !== 'unknown_board';
  return (
    <Center testId={ended ? 'live-ended' : 'live-refused'} scrim={hasFrame}>
      {icon}
      <Typography variant="subtitle1" sx={{ mt: 1.5 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.85, maxWidth: 420 }}>
        {text}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        {status.kind === 'refused' && status.code === 'expired' ? (
          <Button variant="contained" href="/auth/end?reason=expired">
            Sign in
          </Button>
        ) : (
          <>
            <Button variant="contained" component={Link} href="/live">
              Back to Live
            </Button>
            {canRetry && (
              <Button variant="outlined" startIcon={<Refresh />} onClick={onRetry}>
                Try again
              </Button>
            )}
          </>
        )}
      </Box>
    </Center>
  );
}

function Center({ children, testId, scrim }: { children: ReactNode; testId: string; scrim: boolean }) {
  return (
    <Box
      data-testid={testId}
      role="status"
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        p: 3,
        // Over a drawn board: a scrim. Over the empty paper: the board's own ink colour.
        bgcolor: scrim ? 'rgba(32,33,36,.72)' : 'transparent',
        color: scrim ? '#fff' : '#3c4043',
        '& > svg': { fontSize: 36, opacity: 0.9 },
      }}
    >
      {children}
    </Box>
  );
}
