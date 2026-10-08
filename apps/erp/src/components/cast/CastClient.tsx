'use client';

import CastOutlined from '@mui/icons-material/CastOutlined';
import StopScreenShareOutlined from '@mui/icons-material/StopScreenShareOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { endedKey, type CastSignalData, type CastStreamMessage, type IceServer } from '@/lib/cast/events';

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
export function CastClient({ boards }: { boards: CastBoard[] }) {
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
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof RTCPeerConnection !== 'undefined';

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

  const start = async (b: CastBoard) => {
    setStatus(t('cast.status.connecting'));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
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

  if (!supported) return <Alert severity="info">{t('cast.unsupported')}</Alert>;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">
          {t('cast.boards')}
        </Typography>
        <Button size="small" onClick={() => router.refresh()} disabled={phase !== 'idle'}>
          {t('cast.refresh')}
        </Button>
      </Box>
      {boards.length === 0 && <Alert severity="info">{t('cast.noBoards')}</Alert>}
      {boards.map((b) => (
        <Box key={b.deviceId} data-testid="cast-board" sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 3, bgcolor: 'm3.surfaceContainer' }}>
          <CastOutlined />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1">{b.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[b.subject, b.section].filter(Boolean).join(' · ')} · {b.teacher}
            </Typography>
          </Box>
          {active === b.deviceId ? (
            <Button color="error" variant="outlined" startIcon={<StopScreenShareOutlined />} onClick={stop}>
              {t('cast.stop')}
            </Button>
          ) : (
            <Button variant="contained" disabled={phase !== 'idle'} onClick={() => void start(b)}>
              {t('cast.start')}
            </Button>
          )}
        </Box>
      ))}
      <Typography role="status" color="text.secondary" data-testid="cast-status">
        {status || (boards.length ? t('cast.status.choose' as MessageKey) : '')}
      </Typography>
    </Stack>
  );
}
