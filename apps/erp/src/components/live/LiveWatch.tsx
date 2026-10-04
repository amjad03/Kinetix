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
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { endedText, type LiveAudioInfo, type LiveSession, type RefusalCode, type StreamMessage } from '@/lib/live/events';
import { LivePlayer } from '@/lib/live/player';
import { LiveAudioPlayer } from './audio-player';
import { LiveAudioControls } from './LiveAudioControls';
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

const REFUSAL_BODY: Partial<Record<RefusalCode | 'failed', MessageKey>> = {
  no_class: 'live.refusedBody.no_class',
  offline: 'live.refusedBody.offline',
  expired: 'live.refusedBody.expired',
  unavailable: 'live.refusedBody.unavailable',
  failed: 'live.signInAgain',
};

export function LiveWatch({ board, timeZone, canChangeSettings = false }: { board: WatchBoard; timeZone: string; canChangeSettings?: boolean }) {
  const { t, fmt } = useI18n();
  // One player for the page's lifetime; it is mutated as frames arrive and `version` redraws.
  const [p] = useState(() => new LivePlayer());
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'connecting' });
  const [session, setSession] = useState<LiveSession | null>(board.session);
  const [hasFrame, setHasFrame] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  const [slow, setSlow] = useState(false);
  // Class audio: what the API allows and whether the mic is on; the player exists for the page's lifetime.
  const [audio, setAudio] = useState<LiveAudioInfo | null>(null);
  const [listening, setListening] = useState(false);
  const [player] = useState(() => new LiveAudioPlayer());
  const stopListening = useCallback(() => {
    player.stop();
    setListening(false);
  }, [player]);
  const listen = useCallback(() => {
    void player.start().then(() => setListening(true));
  }, [player]);
  // Stop when leaving the page.
  useEffect(() => () => player.stop(), [player]);

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
        case 'audio-state':
          setAudio(m.audio);
          if (!m.audio.allowed || !m.audio.on) stopListening();
          break;
        case 'audio':
          player.push(m.data);
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
          stopListening();
          setAudio(null);
          setStatus({ kind: 'ended', reason: m.reason });
          break;
        case 'refused':
          final = true;
          es.close();
          stopListening();
          setAudio(null);
          setStatus({ kind: 'refused', code: m.code, error: m.error });
          break;
      }
    };
    es.onerror = () => {
      if (final) return;
      // CLOSED: the stream was refused (signed out, no access). Otherwise the browser retries.
      if (es.readyState === EventSource.CLOSED) setStatus({ kind: 'refused', code: 'failed', error: '' });
      else setStatus((s) => (s.kind === 'watching' ? { kind: 'reconnecting' } : s));
    };
    return () => {
      es.close();
      stopListening();
    };
  }, [board.id, attempt, p, player, stopListening]);

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

  const title = [session?.subject, session?.section].filter(Boolean).join(' · ') || t('live.unscheduled');

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: -1 }}>
        <Button component={Link} href="/live" startIcon={<ArrowBack />} size="small">
          {t('live.classrooms')}
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
            {session ? t('live.since', { teacher: session.teacher, time: fmt.time(session.startedAt, timeZone) }) : ''}
            {board.name}
            {board.room ? ` · ${board.room}` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {audio?.allowed && audio.on && status.kind !== 'ended' && status.kind !== 'refused' && (
            <LiveAudioControls player={player} listening={listening} onListen={listen} onStop={stopListening} />
          )}
          {hasFrame && (
            <Chip variant="outlined" label={t('live.page', { n: p.index + 1, d: p.pageCount })} data-testid="live-page" sx={{ fontVariantNumeric: 'tabular-nums' }} />
          )}
          <Tooltip title={t('live.fullScreen')}>
            <IconButton aria-label={t('live.fullScreen')} onClick={() => stage.current?.requestFullscreen?.().catch(() => {})}>
              <Fullscreen />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box ref={stage} sx={{ width: '100%', maxWidth: 'calc((100dvh - 250px) * 16 / 9)', minWidth: { xs: 0, sm: 480 }, mx: 'auto', ':fullscreen': { maxWidth: 'none', display: 'grid', placeItems: 'center', bgcolor: '#000' } }}>
        <LiveBoard player={p} version={version}>
          <Overlay status={status} hasFrame={hasFrame} slow={slow} onRetry={retry} canChangeSettings={canChangeSettings} />
          {status.kind === 'watching' && hasFrame && p.strokes.length === 0 && (
            <Box
              data-testid="live-empty"
              sx={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', px: 2, py: 0.75, borderRadius: 16, bgcolor: 'rgba(32,33,36,.72)', color: '#fff', typography: 'body2', whiteSpace: 'nowrap' }}
            >
              {p.pageCount > 1 ? t('live.pageEmpty') : t('live.boardEmpty')}
            </Box>
          )}
        </LiveBoard>
      </Box>

      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 3 }, mt: 1.5, color: 'text.secondary', justifyContent: 'center' }}
        data-testid="live-notes"
      >
        <Note icon={<VisibilityOutlined />}>{t('live.audited')}</Note>
        {audio && !audio.allowed && (
          <Note icon={<MicOffOutlined />}>
            {t('live.audioOffLeaders')}
            {canChangeSettings && (
              <>
                {' '}
                <Box component={Link} href="/settings" sx={{ color: 'primary.main', fontWeight: 500 }} data-testid="live-audio-settings">
                  {t('live.audioSettings')}
                </Box>
              </>
            )}
          </Note>
        )}
        {audio?.allowed && !audio.on && <Note icon={<MicOffOutlined />}>{t('live.micOff')}</Note>}
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
  const { t } = useI18n();
  switch (status.kind) {
    case 'watching':
      return <LiveChip />;
    case 'connecting':
      return <Chip size="small" variant="outlined" label={t('live.connecting')} />;
    case 'reconnecting':
      return <Chip size="small" variant="outlined" label={t('live.reconnecting')} />;
    case 'offline':
      return <Chip size="small" variant="outlined" label={t('live.boardOffline')} sx={{ color: 'text.secondary' }} />;
    case 'ended':
      return <Chip size="small" label={t('live.ended')} sx={{ bgcolor: 'm3.surfaceContainerHighest' }} />;
    case 'refused':
      return <Chip size="small" label={t('live.notAvailable')} sx={{ bgcolor: 'm3.surfaceContainerHighest' }} />;
  }
}

/** What is shown over the board when it is not simply live. */
function Overlay({ status, hasFrame, slow, onRetry, canChangeSettings }: { status: Status; hasFrame: boolean; slow: boolean; onRetry: () => void; canChangeSettings: boolean }) {
  const { t } = useI18n();
  if (status.kind === 'watching' && hasFrame) return null;
  if (status.kind === 'watching' || status.kind === 'connecting') {
    return (
      <Center testId="live-waiting" scrim={false}>
        <CircularProgress size={28} />
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {status.kind === 'connecting' ? t('live.connectingBoard') : t('live.waitingBoard')}
        </Typography>
        {slow && (
          <Typography variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 380 }}>
            {t('live.slow')}
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
          {offline ? t('live.wentOffline') : t('live.reconnecting')}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.85 }}>
          {offline ? t('live.offlineBody') : t('live.reconnectingBody')}
        </Typography>
      </Center>
    );
  }
  const ended = status.kind === 'ended';
  const icon = ended ? <EventBusyOutlined /> : status.code === 'turned_off' || status.code === 'forbidden' ? <LockOutlined /> : <CloudOffOutlined />;
  const title = ended ? t('live.classEnded') : t(`live.refused.${status.code}`);
  const bodyKey = ended ? undefined : REFUSAL_BODY[status.code];
  const text = ended
    ? t(endedText(status.reason))
    : status.code === 'turned_off'
      ? t('live.turnedOffBody')
      : bodyKey && (t.locale !== 'en' || !status.error)
        ? t(bodyKey)
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
            {t('live.signIn')}
          </Button>
        ) : (
          <>
            <Button variant="contained" component={Link} href="/live">
              {t('live.back')}
            </Button>
            {status.kind === 'refused' && status.code === 'turned_off' && canChangeSettings && (
              <Button variant="outlined" component={Link} href="/settings">
                {t('live.turnedOffSettings')}
              </Button>
            )}
            {canRetry && (
              <Button variant="outlined" startIcon={<Refresh />} onClick={onRetry}>
                {t('common.tryAgain')}
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
