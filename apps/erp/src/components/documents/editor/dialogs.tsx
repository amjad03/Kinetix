'use client';
import { Download, ExternalLink, FileDown, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { designVersions, type PreviewSubject } from '@/app/(dashboard)/documents/designs-actions';
import { uploadBrandImage } from '@/app/(dashboard)/settings/branding/actions';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@/components/kx';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Branding, DocTemplateVersion } from '@/lib/doc-designs';
import type { DocLayout, ImageSource } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import { inputClass, Segmented } from './controls';

/** Save as a new version, with an optional note. */
export function SaveDialog({ open, onClose, onSave, busy, version }: { open: boolean; onClose: () => void; onSave: (note: string) => void; busy: boolean; version: number }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="save-title">
      <DialogTitle id="save-title">{t('de.saveTitle', { n: version + 1 })}</DialogTitle>
      <DialogContent>
        <label htmlFor="save-note" className="mb-1 block text-[13px] font-medium">
          {t('de.saveNote')}
        </label>
        <input
          id="save-note"
          autoFocus
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) onSave(note);
          }}
          placeholder={t('de.saveNoteHint')}
          className={cn(inputClass, 'h-9')}
          data-testid="save-note"
        />
        <p className="m-0 mt-2 text-[12px] text-muted-foreground">{t('de.saveHelp')}</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" disabled={busy} onClick={() => onSave(note)} data-testid="save-confirm">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('de.saveVersion')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Every saved version, newest first, with restore (which saves the old layout as a new version). */
export function VersionsDialog({ id, current, onClose, onRestore, dirty }: { id: string; current: number; onClose: () => void; onRestore: (v: number) => void; dirty: boolean }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<DocTemplateVersion[] | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  useEffect(() => {
    void designVersions(id).then((r) => setRows(r.ok ? r.data : []));
  }, [id]);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="versions-title">
      <DialogTitle id="versions-title">{t('dt.history')}</DialogTitle>
      <DialogContent>
        {dirty && (
          <Alert severity="warning" className="mb-3">
            {t('de.restoreDiscards')}
          </Alert>
        )}
        {!rows && <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />}
        <ol className="m-0 grid list-none gap-2 p-0" data-testid="versions">
          {(rows ?? []).map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
              <Chip size="small" color={v.version === current ? 'success' : 'default'} label={t('dt.version', { n: v.version })} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{v.note ?? v.name}</b>
                <span className="text-xs text-muted-foreground">
                  {fmt.dateTime(v.createdAt)}
                  {v.createdBy ? ` · ${t('dt.by', { name: v.createdBy })}` : ''}
                </span>
              </span>
              {v.version !== current &&
                (confirm === v.version ? (
                  <Button size="small" variant="contained" color="warning" onClick={() => onRestore(v.version)} data-testid="restore-confirm">
                    {t('de.restoreConfirm')}
                  </Button>
                ) : (
                  <Button size="small" variant="outlined" startIcon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm(v.version)}>
                    {t('dt.restore')}
                  </Button>
                ))}
            </li>
          ))}
        </ol>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {t('dt.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The server's own rendering of the unsaved layout, as it will print: the PDF (every page and
 * side) or a PNG of one side, with the sample data or the chosen person.
 */
export function PrintPreviewDialog({ layout, sides, initialSide, subject, onClose, title }: { layout: DocLayout; sides: { id: string; label: string }[]; initialSide: string; subject: PreviewSubject | null; onClose: () => void; title: string }) {
  const { t } = useI18n();
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf');
  const [side, setSide] = useState(initialSide);
  // The result of the request for the current format and side (an older one is not shown).
  const [result, setResult] = useState<{ key: string; url: string | null; error: string | null } | null>(null);
  const [busy, start] = useTransition();
  const urlRef = useRef<string | null>(null);
  const key = `${format}:${side}`;
  useEffect(() => {
    let live = true;
    start(async () => {
      const res = await fetch('/api/doc-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout, format, side: format === 'png' ? side : undefined, width: 1400, subject: subject ? { type: subject.type, id: subject.id } : undefined }) }).catch(() => null);
      if (!live) return;
      if (!res || !res.ok) {
        let msg = t('de.previewFailed');
        try {
          const b = (await res?.json()) as { message?: string };
          if (b?.message) msg = b.message;
        } catch {
          /* not JSON */
        }
        if (live) setResult({ key: `${format}:${side}`, url: null, error: msg });
        return;
      }
      const blob = await res.blob();
      if (!live) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setResult({ key: `${format}:${side}`, url: urlRef.current, error: null });
    });
    return () => {
      live = false;
    };
  }, [layout, format, side, subject, t]);
  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), []);
  const url = result?.key === key ? result.url : null;
  const error = result?.key === key ? result.error : null;
  const file = `${title.replace(/[^\w-]+/g, '-')}.${format}`;
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby="pp-title">
      <DialogTitle id="pp-title">{t('de.printPreview')}</DialogTitle>
      <DialogContent>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="w-[200px]">
            <Segmented label={t('de.format')} value={format} onChange={(v) => setFormat(v)} options={[{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG' }]} />
          </div>
          {format === 'png' && sides.length > 1 && (
            <div className="w-[200px]">
              <Segmented label={t('de.side')} value={side} onChange={setSide} options={sides.map((s) => ({ value: s.id, label: s.label }))} />
            </div>
          )}
          <span className="text-[12px] text-muted-foreground">{subject ? t('de.previewWithPerson', { name: subject.name }) : t('de.previewWithSample')}</span>
        </div>
        <div className="relative grid min-h-[60vh] place-items-center overflow-hidden rounded-md bg-[linear-gradient(135deg,#eef1f5,#dfe5ec)]" data-testid="print-preview">
          {busy && <Loader2 className="absolute size-6 animate-spin text-muted-foreground" />}
          {error && (
            <Alert severity="error" className="m-4">
              {error}
            </Alert>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob of the server's rendering */}
          {url && !error && (format === 'pdf' ? <iframe title={t('de.printPreview')} src={url} className="h-[70vh] w-full border-0 bg-white" data-testid="preview-pdf" /> : <img src={url} alt={t('de.printPreview')} className="m-4 max-h-[66vh] w-auto max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(16,24,40,.45)]" data-testid="preview-png" />)}
        </div>
      </DialogContent>
      <DialogActions>
        {url && (
          <>
            <Button startIcon={<ExternalLink className="size-4" />} onClick={() => window.open(url, '_blank', 'noopener')}>
              {t('de.openNewTab')}
            </Button>
            <a href={url} download={file} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[14px] font-medium text-primary hover:bg-primary/5">
              {format === 'pdf' ? <FileDown className="size-4" /> : <Download className="size-4" />} {t('de.download')}
            </a>
          </>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('dt.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Asks before leaving with unsaved changes. */
export function LeaveDialog({ open, onStay, onLeave, onSave }: { open: boolean; onStay: () => void; onLeave: () => void; onSave: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onStay} aria-labelledby="leave-title">
      <DialogTitle id="leave-title">{t('de.leaveTitle')}</DialogTitle>
      <DialogContent>
        <p className="m-0 text-sm text-muted-foreground">{t('de.leaveBody')}</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onStay}>{t('de.keepEditing')}</Button>
        <Button color="error" onClick={onLeave} data-testid="discard">
          {t('de.discard')}
        </Button>
        <Button variant="contained" onClick={onSave}>
          {t('de.saveAndLeave')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const UPLOADABLE: ImageSource[] = ['logo', 'logo_dark', 'emblem', 'seal', 'signature:principal', 'signature:registrar', 'signature:controller', 'signature:finance', 'signature:hr'];
export const imageSourceLabel = (s: ImageSource): MessageKey => (s.startsWith('signature:') ? (`de.img.sig.${s.split(':')[1]}` as MessageKey) : (`de.img.${s}` as MessageKey));

/**
 * Uploads a branding image (logo, crest, seal or a signature) from the editor. It is the
 * institution's image, so every document that shows it changes.
 */
export function UploadDialog({ initial, onClose, onDone }: { initial: ImageSource; onClose: () => void; onDone: (b: Branding) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<ImageSource>(UPLOADABLE.includes(initial) ? initial : 'logo');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const send = () =>
    start(async () => {
      if (!file) return;
      if (file.size > 4_000_000 || !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
        setError(t('br.badFile'));
        return;
      }
      const fd = new FormData();
      fd.set('kind', kind);
      fd.set('file', file);
      const r = await uploadBrandImage(fd);
      if (r.ok) onDone(r.data);
      else setError(r.error);
    });
  return (
    <Dialog open onClose={onClose} aria-labelledby="upload-title">
      <DialogTitle id="upload-title">{t('de.uploadTitle')}</DialogTitle>
      <DialogContent>
        <div className="grid gap-3">
          <label className="grid gap-1 text-[13px] font-medium">
            {t('de.uploadAs')}
            <select value={kind} onChange={(e) => setKind(e.target.value as ImageSource)} className={cn(inputClass, 'h-9')}>
              {UPLOADABLE.map((s) => (
                <option key={s} value={s}>
                  {t(imageSourceLabel(s))}
                </option>
              ))}
            </select>
          </label>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={t('de.chooseFile')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
          <p className="m-0 text-[12px] text-muted-foreground">{t('de.uploadHelp')}</p>
          {error && <Alert severity="error">{error}</Alert>}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" disabled={!file || busy} onClick={send}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('br.upload')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
