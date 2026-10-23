'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { controlKey, endedKey, type CastSignalData, type CastStreamMessage, type IceServer } from '@/lib/cast/events';

import { Alert, Button } from '@/components/kx';
import { Cast as CastOutlined, ScreenShareOff as StopScreenShareOutlined } from 'lucide-react';
export interface CastBoard {
  deviceId: string;
  name: string;
  room: string | null;
  teacher: string;
  section: string | null;
  subject: string | null;
  needsApproval: boolean;
}

type Phase = 'idle' | 'connecting' | 'waiting' | 'live';

/**
 * The laptop's side of a cast: getDisplayMedia, then a WebRTC offer to the board. Signalling goes through
 * this server (/api/cast/stream down, /api/cast/send up); the video goes straight to the board (or via TURN).
 */
export function CastClient({ boards, guest = false }: { boards: CastBoard[]; guest?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<string>('');
  const [active, setActive] = useState<string | null>(null);
  const media = useRef<MediaStream | null>(null);
  const source = useRef<EventSource | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const conn = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const hasRtc = typeof RTCPeerConnection !== 'undefined';
  const canScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && hasRtc;
  // Phones' browsers cannot capture the screen: they can show the camera (a page, a model, an experiment).
  const canCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && hasRtc;
  // Browsers capture only on https (or localhost): a LAN demo server over http needs https or the apps.
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;

  const post = useCallback(async (body: { kind: 'stop' } | { kind: 'signal'; data: CastSignalData }) => {
    if (!conn.current) return;
    await fetch('/api/cast/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, conn: conn.current }) }).catch(() => undefined);
  }, []);

  const teardown = useCallback(() => {
    source.current?.close();
    source.current = null;
    pc.current?.close();
    pc.current = null;
    media.current?.getTracks().forEach((tr) => tr.stop());
    media.current = null;
    conn.current = null;
    pendingIce.current = [];
    setPhase('idle');
    setActive(null);
  }, []);

  useEffect(() => teardown, [teardown]);

  const startPeer = useCallback(
    async (iceServers: IceServer[]) => {
      const stream = media.current;
      if (!stream || pc.current) return;
      const peer = new RTCPeerConnection({ iceServers });
      pc.current = peer;
      stream.getTracks().forEach((tr) => peer.addTrack(tr, stream));
      peer.onicecandidate = (e) => {
        if (e.candidate) void post({ kind: 'signal', data: { type: 'candidate', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setPhase('live');
          setStatus(t('cast.status.live'));
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await post({ kind: 'signal', data: { type: 'offer', sdp: offer.sdp ?? '' } });
    },
    [post, t],
  );

  const onSignal = useCallback(async (data: CastSignalData) => {
    const peer = pc.current;
    if (!peer) return;
    if (data.type === 'answer') {
      await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      for (const c of pendingIce.current.splice(0)) await peer.addIceCandidate(c).catch(() => undefined);
    } else if (data.type === 'candidate') {
      const init = { candidate: data.candidate, sdpMid: data.sdpMid ?? undefined, sdpMLineIndex: data.sdpMLineIndex ?? undefined };
      if (peer.remoteDescription) await peer.addIceCandidate(init).catch(() => undefined);
      else pendingIce.current.push(init);
    }
  }, []);

  const start = async (b: CastBoard, capture: 'screen' | 'camera' = 'screen') => {
    setStatus(t('cast.status.connecting'));
    let stream: MediaStream;
    try {
      stream =
        capture === 'camera'
          ? await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
          : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    } catch {
      setStatus(t('cast.status.denied'));
      return;
    }
    media.current = stream;
    setActive(b.deviceId);
    setPhase('connecting');
    // The browser's own "Stop sharing" button ends the cast.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void post({ kind: 'stop' });
      teardown();
      setStatus(t('cast.status.stopped'));
    });
    const es = new EventSource(`/api/cast/stream?deviceId=${b.deviceId}`);
    source.current = es;
    es.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as CastStreamMessage;
      switch (m.t) {
        case 'conn':
          conn.current = m.conn;
          break;
        case 'ack':
          if (m.approved) void startPeer(m.iceServers);
          else {
            setPhase('waiting');
            setStatus(t('cast.status.waiting'));
          }
          break;
        case 'approved':
          void startPeer(m.iceServers);
          break;
        case 'signal':
          void onSignal(m.data);
          break;
        case 'ended':
          teardown();
          setStatus(t(endedKey(m.reason)));
          break;
        case 'control': {
          const key = controlKey(m.action);
          if (key) setStatus(t(key));
          break;
        }
        case 'refused':
          teardown();
          setStatus(t('cast.status.failed', { error: m.error }));
          break;
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        teardown();
        setStatus(t('cast.status.stopped'));
      }
    };
  };

  const stop = () => {
    void post({ kind: 'stop' });
    teardown();
    setStatus(t('cast.status.stopped'));
  };

  if (insecure) return <Alert severity="warning">{t('cast.insecure')}</Alert>;
  if (!canScreen && !canCamera) return <Alert severity="info">{t('cast.unsupported')}</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
          {t('cast.boards')}
        </h2>
        {!guest && (
          <Button size="small" onClick={() => router.refresh()} disabled={phase !== 'idle'}>
            {t('cast.refresh')}
          </Button>
        )}
      </div>
      {boards.length === 0 && <Alert severity="info">{t('cast.noBoards')}</Alert>}
      {boards.map((b) => (
        <div className="flex items-center gap-4 p-4 rounded-[30px] bg-muted" key={b.deviceId} data-testid="cast-board">
          <CastOutlined />
          <div className="flex-1">
            <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{b.name}</h6>
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {[b.subject, b.section, b.teacher].filter(Boolean).join(' · ')}
            </p>
          </div>
          {active === b.deviceId ? (
            <Button color="error" variant="outlined" startIcon={<StopScreenShareOutlined />} onClick={stop}>
              {t('cast.stop')}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2 justify-end">
              {canScreen && (
                <Button variant="contained" disabled={phase !== 'idle'} onClick={() => void start(b)}>
                  {t('cast.start')}
                </Button>
              )}
              {canCamera && (
                <Button variant={canScreen ? 'outlined' : 'contained'} disabled={phase !== 'idle'} onClick={() => void start(b, 'camera')} data-testid="cast-camera">
                  {t('cast.camera')}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      <p className="text-sm leading-[21px] text-muted-foreground" role="status" data-testid="cast-status">
        {status || (boards.length ? t('cast.status.choose' as MessageKey) : '')}
      </p>
    </div>
  );
}
