'use client';

import HeadphonesOutlined from '@mui/icons-material/HeadphonesOutlined';
import Mic from '@mui/icons-material/Mic';
import Stop from '@mui/icons-material/Stop';
import VolumeOff from '@mui/icons-material/VolumeOff';
import VolumeUp from '@mui/icons-material/VolumeUp';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { LiveAudioPlayer } from './audio-player';

/**
 * "Teacher's mic is on" with Listen; while listening, mute, volume and Stop. Shown only when
 * this viewer may hear class audio and the teacher has it on.
 */
export function LiveAudioControls({
  player,
  listening,
  onListen,
  onStop,
}: {
  player: LiveAudioPlayer;
  listening: boolean;
  onListen: () => void;
  onStop: () => void;
}) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState({ played: 0, resets: 0 });

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setStats({ played: player.played, resets: player.resets }), 500);
    return () => clearInterval(t);
  }, [listening, player]);

  return (
    <Box
      data-testid="live-audio"
      data-listening={listening ? 'true' : 'false'}
      data-played={stats.played}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
        borderRadius: '24px',
        bgcolor: 'm3.secondaryContainer',
        color: 'm3.onSecondaryContainer',
        minHeight: 48,
      }}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: 'kx.live',
            color: '#fff',
            '@keyframes kxMicPulse': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(217,48,37,.45)' }, '50%': { boxShadow: '0 0 0 6px rgba(217,48,37,0)' } },
            animation: listening ? 'kxMicPulse 1.6s ease-in-out infinite' : 'none',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Mic sx={{ fontSize: 18 }} />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
          Teacher&apos;s mic is on
        </Typography>
      </Box>
      {listening ? (
        <>
          <Tooltip title={muted ? 'Unmute' : 'Mute'}>
            <IconButton
              size="small"
              aria-label={muted ? 'Unmute class audio' : 'Mute class audio'}
              aria-pressed={muted}
              onClick={() => {
                player.setMuted(!muted);
                setMuted(!muted);
              }}
              sx={{ color: 'inherit' }}
            >
              {muted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Slider
            size="small"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(_, v) => {
              const n = Array.isArray(v) ? v[0] : v;
              setVolume(n);
              player.setVolume(n);
              if (muted && n > 0) {
                setMuted(false);
                player.setMuted(false);
              }
            }}
            sx={{ width: { xs: 64, sm: 96 }, mx: 0.5, color: 'm3.onSecondaryContainer' }}
          />
          <Button size="small" variant="text" startIcon={<Stop />} onClick={onStop} sx={{ color: 'inherit', borderRadius: 20 }}>
            Stop
          </Button>
        </>
      ) : (
        <Button size="small" variant="contained" startIcon={<HeadphonesOutlined />} onClick={onListen} sx={{ borderRadius: 20 }}>
          Listen
        </Button>
      )}
    </Box>
  );
}
