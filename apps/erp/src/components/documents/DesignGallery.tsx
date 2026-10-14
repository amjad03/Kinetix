'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, Copy, Eye, FileDown, History, Pencil, Trash2 } from 'lucide-react';
import { deleteDesign, designVersions, duplicateDesign, renameDesign, restoreDesignVersion, setDefaultDesign } from '@/app/(dashboard)/documents/designs-actions';
import { CustomiseButton } from '@/components/documents/CustomiseButton';
import { useNotice } from '@/components/hr/Common';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@/components/kx';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { DOC_GROUPS, type DocTemplateSummary, type DocTemplateVersion, type DocType, isCard, previewUrl } from '@/lib/doc-designs';
import { cn } from '@/lib/utils';

type Dlg = { kind: 'preview' | 'duplicate' | 'rename' | 'delete' | 'versions'; design: DocTemplateSummary } | null;

/** Documents > Templates: every document type's designs, with previews in the institution's branding. */
export function DesignGallery({ designs, canEdit, stamp, initialType }: { designs: DocTemplateSummary[]; canEdit: boolean; stamp: string; initialType: DocType }) {
  const { t } = useI18n();
  const { run, view } = useNotice();
  const [type, setType] = useState<DocType>(initialType);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [busy, start] = useTransition();
  const list = useMemo(() => designs.filter((d) => d.docType === type), [designs, type]);
  const typeName = (x: DocType) => t(`dt.type.${x}` as MessageKey);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    window.history.replaceState(null, '', url.toString());
  }, [type]);

  const adopt = (d: DocTemplateSummary) => start(async () => void (await run(() => setDefaultDesign(d.docType, d.id), t('dt.defaultSet', { type: typeName(d.docType) }))));

  return (
    <>
      {view}
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t('doc.tab.templates')} className="grid content-start gap-4">
          {DOC_GROUPS.map((g) => (
            <div key={g.id}>
              <div className="mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t(`dt.group.${g.id}` as MessageKey)}</div>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {g.types.map((x) => {
                  const inUse = designs.find((d) => d.docType === x && d.isDefault);
                  return (
                    <li key={x}>
                      <button
                        type="button"
                        onClick={() => setType(x)}
                        aria-current={x === type ? 'page' : undefined}
                        className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted', x === type && 'bg-primary/10 font-semibold text-primary')}
                        data-testid={`type-${x}`}
                      >
                        <span className="truncate">{typeName(x)}</span>
                        {inUse && <span className="shrink-0 text-[11px] text-muted-foreground">{inUse.system ? t(`dt.style.${inUse.style}` as MessageKey) : inUse.name}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <section aria-labelledby="design-type" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="design-type" className="m-0 text-lg font-semibold">
              {typeName(type)}
            </h2>
            <span className="text-[13px] text-muted-foreground">{t(list.length === 1 ? 'dt.designs_one' : 'dt.designs_other', { count: list.length })}</span>
          </div>
          <Alert severity="info" className="mb-4">
            {t('dt.sampleNote')}
          </Alert>
          <ul className={cn('m-0 grid list-none gap-4 p-0', isCard(type) ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')} data-testid="design-grid">
            {list.map((d) => (
              <li key={d.id} className={cn('flex flex-col overflow-hidden rounded-lg border bg-card shadow-card', d.isDefault && 'ring-2 ring-primary')} data-testid={`design-${d.id}`}>
                <button type="button" onClick={() => setDlg({ kind: 'preview', design: d })} className="group relative block bg-[linear-gradient(135deg,#eef1f5,#e2e7ee)] p-4" aria-label={`${t('dt.preview')}: ${d.name}`}>
                  <Thumb d={d} stamp={stamp} />
                  <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium shadow">
                      <Eye className="size-4" /> {t('dt.preview')}
                    </span>
                  </span>
                </button>
                <div className="grid gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-[14px]">{d.name}</b>
                    {d.isDefault && <Chip size="small" color="success" icon={<Check className="size-3.5" />} label={t('dt.default')} />}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {d.style && <Chip size="small" variant="outlined" label={t(`dt.style.${d.style}` as MessageKey)} />}
                    <Chip size="small" variant="outlined" label={d.system ? t('dt.system') : t('dt.version', { n: d.version })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {canEdit && !d.isDefault && (
                      <Button size="small" variant="contained" disabled={busy} onClick={() => adopt(d)} data-testid="use-design">
                        {t('dt.setDefault')}
                      </Button>
                    )}
                    {canEdit && <CustomiseButton design={d} size="small" />}
                    <span className="ml-auto flex">
                      <Tooltip title={t('dt.openPdf')}>
                        <IconButton size="small" aria-label={t('dt.openPdf')} onClick={() => window.open(previewUrl(d.id, { format: 'pdf', v: `${d.version}-${stamp}` }), '_blank', 'noopener')}>
                          <FileDown className="size-4" />
                        </IconButton>
                      </Tooltip>
                      {canEdit && (
                        <Tooltip title={t('dt.duplicate')}>
                          <IconButton size="small" aria-label={t('dt.duplicate')} onClick={() => setDlg({ kind: 'duplicate', design: d })}>
                            <Copy className="size-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canEdit && !d.system && (
                        <>
                          <Tooltip title={t('dt.rename')}>
                            <IconButton size="small" aria-label={t('dt.rename')} onClick={() => setDlg({ kind: 'rename', design: d })}>
                              <Pencil className="size-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('dt.history')}>
                            <IconButton size="small" aria-label={t('dt.history')} onClick={() => setDlg({ kind: 'versions', design: d })}>
                              <History className="size-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('dt.delete')}>
                            <IconButton size="small" color="error" aria-label={t('dt.delete')} onClick={() => setDlg({ kind: 'delete', design: d })}>
                              <Trash2 className="size-4" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {dlg?.kind === 'preview' && <PreviewDialog d={dlg.design} stamp={stamp} onClose={() => setDlg(null)} />}
      {(dlg?.kind === 'duplicate' || dlg?.kind === 'rename') && <NameDialog mode={dlg.kind} d={dlg.design} run={run} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'delete' && <DeleteDialog d={dlg.design} run={run} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'versions' && <VersionsDialog d={dlg.design} run={run} onClose={() => setDlg(null)} />}
    </>
  );
}

/** A design's thumbnail; cards show front and back. */
function Thumb({ d, stamp }: { d: DocTemplateSummary; stamp: string }) {
  const v = `${d.version}-${stamp}`;
  const img = (side?: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={previewUrl(d.id, { width: isCard(d.docType) ? 300 : 520, side, v })} alt="" loading="lazy" className="mx-auto block max-h-[340px] w-auto max-w-full rounded-[3px] bg-white shadow-[0_6px_20px_-6px_rgba(16,24,40,.35)]" />
  );
  if (!isCard(d.docType)) return img();
  return (
    <span className="grid grid-cols-2 items-center gap-3">
      {img('front')}
      {img('back')}
    </span>
  );
}

function PreviewDialog({ d, stamp, onClose }: { d: DocTemplateSummary; stamp: string; onClose: () => void }) {
  const { t } = useI18n();
  const [side, setSide] = useState<'front' | 'back'>('front');
  const card = isCard(d.docType);
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby="preview-title">
      <DialogTitle id="preview-title">
        {d.name} · {t(`dt.type.${d.docType}` as MessageKey)}
      </DialogTitle>
      <DialogContent>
        {card && (
          <div className="mb-3 flex gap-1" role="group">
            {(['front', 'back'] as const).map((s) => (
              <Button key={s} size="small" variant={side === s ? 'contained' : 'outlined'} onClick={() => setSide(s)} aria-pressed={side === s}>
                {t(s === 'front' ? 'dt.front' : 'dt.back')}
              </Button>
            ))}
          </div>
        )}
        <div className="grid place-items-center rounded-md bg-[linear-gradient(135deg,#eef1f5,#dfe5ec)] p-4 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl(d.id, { format: 'svg', animate: true, side: card ? side : undefined, width: card ? 560 : 1100, v: `${d.version}-${stamp}` })} alt={d.name} className={cn('h-auto max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(16,24,40,.45)]', card ? 'w-[380px] rounded-[14px]' : 'w-[880px]')} data-testid="design-preview" />
        </div>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<FileDown className="size-4" />} onClick={() => window.open(previewUrl(d.id, { format: 'pdf', v: `${d.version}-${stamp}` }), '_blank', 'noopener')}>
          {t('dt.openPdf')}
        </Button>
        <Button variant="contained" onClick={onClose}>
          {t('dt.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function NameDialog({ mode, d, run, onClose }: { mode: 'duplicate' | 'rename'; d: DocTemplateSummary; run: ReturnType<typeof useNotice>['run']; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(d.system ? t(`dt.style.${d.style}` as MessageKey) : d.name);
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = mode === 'duplicate' ? await run(() => duplicateDesign(d.id, name), t('dt.duplicated')) : await run(() => renameDesign(d.id, name), t('dt.renamed'));
      if (r.ok) onClose();
    });
  return (
    <Dialog open onClose={onClose} aria-labelledby="name-title">
      <DialogTitle id="name-title">{t(mode === 'duplicate' ? 'dt.duplicate' : 'dt.rename')}</DialogTitle>
      <DialogContent>
        <TextInput autoFocus fullWidth label={t(mode === 'duplicate' ? 'dt.copyName' : 'dt.newName')} value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 80 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={save}>
          {t('dt.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ d, run, onClose }: { d: DocTemplateSummary; run: ReturnType<typeof useNotice>['run']; onClose: () => void }) {
  const { t } = useI18n();
  const [busy, start] = useTransition();
  return (
    <Dialog open onClose={onClose} aria-labelledby="delete-title">
      <DialogTitle id="delete-title">{t('dt.deleteTitle', { name: d.name })}</DialogTitle>
      <DialogContent>
        <p className="m-0 text-sm text-muted-foreground">{t('dt.deleteBody')}</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={() => start(async () => void ((await run(() => deleteDesign(d.id), t('dt.deleted'))).ok && onClose()))}>
          {t('dt.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function VersionsDialog({ d, run, onClose }: { d: DocTemplateSummary; run: ReturnType<typeof useNotice>['run']; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<DocTemplateVersion[] | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    void designVersions(d.id).then((r) => setRows(r.ok ? r.data : []));
  }, [d.id]);
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="versions-title">
      <DialogTitle id="versions-title">
        {t('dt.history')} · {d.name}
      </DialogTitle>
      <DialogContent>
        <ol className="m-0 grid list-none gap-2 p-0" data-testid="versions">
          {(rows ?? []).map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
              <Chip size="small" color={v.version === d.version ? 'success' : 'default'} label={t('dt.version', { n: v.version })} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{v.note ?? v.name}</b>
                <span className="text-xs text-muted-foreground">
                  {fmt.dateTime(v.createdAt)}
                  {v.createdBy ? ` · ${t('dt.by', { name: v.createdBy })}` : ''}
                </span>
              </span>
              {v.version !== d.version && (
                <Button size="small" variant="outlined" disabled={busy} onClick={() => start(async () => void ((await run(() => restoreDesignVersion(d.id, v.version), t('dt.restored'))).ok && onClose()))}>
                  {t('dt.restore')}
                </Button>
              )}
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
