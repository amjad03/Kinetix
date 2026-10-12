'use client';
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

import { Button, Chip, CircularProgress, IconButton, Tooltip } from '@/components/kx';
import { ArrowLeft as ArrowBack, CalendarX as EventBusyOutlined, CloudOff as CloudOffOutlined, Eye as VisibilityOutlined, Lock as LockOutlined, Maximize as Fullscreen, MicOff as MicOffOutlined, RefreshCw as Refresh, WifiOff as WifiOffOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <div className="flex items-center gap-2 mb-2 -ml-2">
        <Button component={Link} href="/live" startIcon={<ArrowBack />} size="small">
          {t('live.classrooms')}
        </Button>
      </div>

      {/* Status strip, like the board's own */}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4" data-testid="live-info">
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-[1.5rem] md:text-[1.75rem]">
              {title}
            </h1>
            <StatusChip status={status} />
          </div>
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-1">
            {session ? t('live.since', { teacher: session.teacher, time: fmt.time(session.startedAt, timeZone) }) : ''}
            {board.name}
            {board.room ? ` · ${board.room}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {audio?.allowed && audio.on && status.kind !== 'ended' && status.kind !== 'refused' && (
            <LiveAudioControls player={player} listening={listening} onListen={listen} onStop={stopListening} />
          )}
          {hasFrame && (
            <Chip className="tabular-nums" variant="outlined" label={t('live.page', { n: p.index + 1, d: p.pageCount })} data-testid="live-page" />
          )}
          <Tooltip title={t('live.fullScreen')}>
            <IconButton aria-label={t('live.fullScreen')} onClick={() => stage.current?.requestFullscreen?.().catch(() => {})}>
              <Fullscreen />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className="w-full max-w-[calc((100dvh_-_250px)_*_16_/_9)] min-w-0 sm:min-w-[480px] mx-auto [&:fullscreen]:max-w-none [&:fullscreen]:grid [&:fullscreen]:place-items-center [&:fullscreen]:bg-[#000]" ref={stage}>
        <LiveBoard player={p} version={version}>
          <Overlay status={status} hasFrame={hasFrame} slow={slow} onRetry={retry} canChangeSettings={canChangeSettings} />
          {status.kind === 'watching' && hasFrame && p.strokes.length === 0 && (
            <div className="absolute left-1/2 bottom-[16px] [transform:translateX(-50%)] px-4 py-1.5 rounded-[160px] bg-[rgba(32,33,36,.72)] text-white text-[13px] leading-[19px] whitespace-nowrap"
              data-testid="live-empty"
            >
              {p.pageCount > 1 ? t('live.pageEmpty') : t('live.boardEmpty')}
            </div>
          )}
        </LiveBoard>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-6 mt-3 text-muted-foreground justify-center"
        data-testid="live-notes"
      >
        <Note icon={<VisibilityOutlined />}>{t('live.audited')}</Note>
        {audio && !audio.allowed && (
          <Note icon={<MicOffOutlined />}>
            {t('live.audioOffLeaders')}
            {canChangeSettings && (
              <>
                {' '}
                <Link className="text-teal-ink font-medium" href="/settings" data-testid="live-audio-settings">
                  {t('live.audioSettings')}
                </Link>
              </>
            )}
          </Note>
        )}
        {audio?.allowed && !audio.on && <Note icon={<MicOffOutlined />}>{t('live.micOff')}</Note>}
      </div>
    </>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 [&_svg]:text-[18px]">
      {icon}
      <span className="tracking-[0.3px] text-[0.8125rem]">
        {children}
      </span>
    </div>
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
      return <Chip className="text-muted-foreground" size="small" variant="outlined" label={t('live.boardOffline')} />;
    case 'ended':
      return <Chip className="bg-accent" size="small" label={t('live.ended')} />;
    case 'refused':
      return <Chip className="bg-accent" size="small" label={t('live.notAvailable')} />;
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
        <p className="text-[13px] leading-[19px] mt-3">
          {status.kind === 'connecting' ? t('live.connectingBoard') : t('live.waitingBoard')}
        </p>
        {slow && (
          <p className="text-xs leading-4 tracking-[0.3px] mt-1 max-w-[380px]">
            {t('live.slow')}
          </p>
        )}
      </Center>
    );
  }
  if (status.kind === 'reconnecting' || status.kind === 'offline') {
    const offline = status.kind === 'offline';
    return (
      <Center testId={offline ? 'live-offline' : 'live-reconnecting'} scrim={hasFrame}>
        {offline ? <WifiOffOutlined /> : <CircularProgress size={28} />}
        <h6 className="text-base leading-6 font-medium tracking-[0.1px] mt-3">
          {offline ? t('live.wentOffline') : t('live.reconnecting')}
        </h6>
        <p className="text-[13px] leading-[19px] opacity-[0.85]">
          {offline ? t('live.offlineBody') : t('live.reconnectingBody')}
        </p>
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
      <h6 className="text-base leading-6 font-medium tracking-[0.1px] mt-3">
        {title}
      </h6>
      <p className="text-[13px] leading-[19px] opacity-[0.85] max-w-[420px]">
        {text}
      </p>
      <div className="flex gap-2 mt-4">
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
      </div>
    </Center>
  );
}

function Center({ children, testId, scrim }: { children: ReactNode; testId: string; scrim: boolean }) {
  return (
    <div className={cn('absolute inset-0 flex flex-col items-center justify-center text-center p-6 [&>svg]:text-[36px] [&>svg]:opacity-[0.9]', scrim ? 'bg-[rgba(32,33,36,.72)]' : 'bg-transparent', scrim ? 'text-white' : 'text-[#3c4043]')}
      data-testid={testId}
      role="status"
    >
      {children}
    </div>
  );
}
