'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { LiveAudioPlayer } from './audio-player';

import { Button, IconButton, Slider, Tooltip } from '@/components/kx';
import { Headphones as HeadphonesOutlined, Mic, Square as Stop, Volume2 as VolumeUp, VolumeX as VolumeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const { t } = useI18n();
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState({ played: 0, resets: 0 });

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setStats({ played: player.played, resets: player.resets }), 500);
    return () => clearInterval(t);
  }, [listening, player]);

  return (
    <div className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-[24px] bg-secondary text-secondary-foreground min-h-[48px]"
      data-testid="live-audio"
      data-listening={listening ? 'true' : 'false'}
      data-played={stats.played}
    >
      <div className="inline-flex items-center gap-1.5">
        <div className={cn('grid place-items-center w-[28px] h-[28px] rounded-full bg-orange text-white motion-reduce:[animation:none]', listening ? '[animation:kxMicPulse_1.6s_ease-in-out_infinite]' : '[animation:none]')}
        >
          <Mic className="text-[18px]" />
        </div>
        <p className="text-[13px] leading-[19px] font-medium whitespace-nowrap">
          {t('live.mic.on')}
        </p>
      </div>
      {listening ? (
        <>
          <Tooltip title={muted ? t('live.mic.unmute') : t('live.mic.mute')}>
            <IconButton className="text-inherit"
              size="small"
              aria-label={muted ? t('live.mic.unmuteClass') : t('live.mic.muteClass')}
              aria-pressed={muted}
              onClick={() => {
                player.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeOff className="size-5" /> : <VolumeUp className="size-5" />}
            </IconButton>
          </Tooltip>
          <Slider className="w-[64px] sm:w-[96px] mx-1 text-secondary-foreground"
            size="small"
            aria-label={t('live.mic.volume')}
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
          />
          <Button className="text-inherit rounded-[200px]" size="small" variant="text" startIcon={<Stop />} onClick={onStop}>
            {t('live.mic.stop')}
          </Button>
        </>
      ) : (
        <Button className="rounded-[200px]" size="small" variant="contained" startIcon={<HeadphonesOutlined />} onClick={onListen}>
          {t('live.mic.listen')}
        </Button>
      )}
    </div>
  );
}
