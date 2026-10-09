'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { lookupCode, type ScanResult } from '@/app/(dashboard)/scan/actions';
import { useI18n } from '@/i18n/client';

type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** Looks up a library or asset code: by camera where the browser can read codes, otherwise by typing (a hand scanner types it too). */
export function ScanDesk() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pending, start] = useTransition();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => setSupported('BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia), []);

  const look = useCallback(
    (value: string) =>
      start(async () => {
        const res = await lookupCode(value);
        if (res.ok) {
          setResult(res.data);
          setError(null);
        } else {
          setResult(null);
          setError(res.error);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!camera) return;
    let stop = false;
    let stream: MediaStream | undefined;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        while (!stop) {
          const found = video.current ? await detector.detect(video.current) : [];
          if (found[0]) {
            setCode(found[0].rawValue);
            setCamera(false);
            look(found[0].rawValue);
            return;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch {
        setCamera(false);
        setError(t('scan.err.camera'));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [camera, look, t]);

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <form onSubmit={(e) => { e.preventDefault(); look(code); }}>
        <Stack direction="row" spacing={1}>
          <TextField autoFocus fullWidth size="small" label={t('scan.code')} value={code} onChange={(e) => setCode(e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Button type="submit" variant="contained" disabled={pending}>{t('scan.lookup')}</Button>
        </Stack>
      </form>
      {supported ? (
        <Button variant="outlined" onClick={() => setCamera((c) => !c)}>{camera ? t('scan.stopCamera') : t('scan.useCamera')}</Button>
      ) : (
        <Typography variant="body2" color="text.secondary">{t('scan.noCamera')}</Typography>
      )}
      {camera && <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 8 }} />}
      {error && <Alert severity="warning">{error}</Alert>}
      {result && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="overline">{result.kind === 'book' ? t('scan.book') : t('scan.asset')}</Typography>
            <Typography variant="h6">{result.title}</Typography>
            {result.lines.map((l, i) => (
              <Typography key={i} variant="body2"><strong>{l.label}:</strong> {l.value}</Typography>
            ))}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
