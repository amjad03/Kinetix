'use client';
import { useCallback, useEffect, useRef, useState, useTransition, useSyncExternalStore } from 'react';
import { lookupCode, type ScanResult } from '@/app/(dashboard)/scan/actions';
import { useI18n } from '@/i18n/client';

import { Alert, Button, Card, CardContent, TextField } from '@/components/kx';
import { InlineField } from '@/components/ui';
type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** Looks up a library or asset code: by camera where the browser can read codes, otherwise by typing (a hand scanner types it too). */
const noSubscribe = () => () => {};
const canScan = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

export function ScanDesk() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const supported = useSyncExternalStore(noSubscribe, canScan, () => false);
  const [pending, start] = useTransition();
  const video = useRef<HTMLVideoElement>(null);

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
    <div className="flex flex-col gap-4 max-w-[560px]">
      <form onSubmit={(e) => { e.preventDefault(); look(code); }}>
        <InlineField actions={<Button type="submit" variant="contained" disabled={pending}>{t('scan.lookup')}</Button>}>
          <TextField autoFocus fullWidth size="small" label={t('scan.code')} value={code} onChange={(e) => setCode(e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
        </InlineField>
      </form>
      {supported ? (
        <Button variant="outlined" onClick={() => setCamera((c) => !c)}>{camera ? t('scan.stopCamera') : t('scan.useCamera')}</Button>
      ) : (
        <p className="text-[13px] leading-[19px] text-muted-foreground">{t('scan.noCamera')}</p>
      )}
      {camera && <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 8 }} />}
      {error && <Alert severity="warning">{error}</Alert>}
      {result && (
        <Card variant="outlined">
          <CardContent>
            <span className="text-[11px] leading-4 font-medium tracking-[0.5px]">{result.kind === 'book' ? t('scan.book') : t('scan.asset')}</span>
            <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{result.title}</h6>
            {result.lines.map((l, i) => (
              <p className="text-[13px] leading-[19px]" key={i}><strong>{l.label}:</strong> {l.value}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
