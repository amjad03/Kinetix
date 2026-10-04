'use client';

import Box from '@mui/material/Box';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LivePlayer } from '@/lib/live/player';
import { drawBoard, fitContain } from '@/lib/live/render';
import { useI18n } from '@/i18n/client';

/**
 * The board, scaled to fit its frame, redrawn whenever `version` changes. Read-only.
 * `children` are overlays (waiting, offline, ended).
 */
export function LiveBoard({ player, version, children }: { player: LivePlayer; version: number; children?: ReactNode }) {
  const { t } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || box.w === 0 || box.h === 0) return;
    const raf = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(box.w * dpr), h = Math.round(box.h * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { scale, dx, dy } = fitContain(player.canvas, box);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, dx * dpr, dy * dpr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, player.canvas.w, player.canvas.h);
      ctx.clip();
      drawBoard(ctx, player.canvas, player.background, player.strokes);
      ctx.restore();
    });
    return () => cancelAnimationFrame(raf);
  }, [box, version, player]);

  return (
    <Box
      ref={frame}
      data-testid="live-board"
      data-strokes={player.strokes.length}
      data-page={player.index + 1}
      data-background={player.background}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${player.canvas.w} / ${player.canvas.h}`,
        borderRadius: '12px',
        overflow: 'hidden',
        bgcolor: 'm3.surfaceContainerHighest',
        border: 1,
        borderColor: 'm3.outlineVariant',
        ':fullscreen': { border: 0, borderRadius: 0, aspectRatio: 'auto', height: '100%', bgcolor: '#000' },
      }}
    >
      <canvas ref={canvas} role="img" aria-label={t('live.boardAria')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {children}
    </Box>
  );
}
