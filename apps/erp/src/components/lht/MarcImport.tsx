'use client';

import { FileUp } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { sendMarc } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/shadcn/button';
import { Card, FormGrid, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

interface Preview {
  records: number;
  books: { title: string; author: string | null; isbn: string | null; pubYear: number | null; inCatalogue: boolean; valid: boolean }[];
}

/** Catalogue records from another library system (MARC 21, ISO 2709 or MARCXML): checked first, then added with copies. */
export function MarcImport({ branches }: { branches: { value: string; label: string }[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState('1');
  const [branch, setBranch] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();

  const form = () => {
    const f = new FormData();
    f.append('file', file!);
    f.append('copies', copies || '0');
    if (branch) f.append('branchId', branch);
    return f;
  };
  const run = (mode: 'preview' | 'import') => {
    if (!file) return setError(t('lht.marc.choose'));
    setError('');
    start(async () => {
      const res = await sendMarc(mode, form());
      if (!res.ok) return setError(res.error);
      if (mode === 'preview') setPreview(res.data as unknown as Preview);
      else {
        const d = res.data as { records: number; created: number; skipped: number };
        toast.success(t('lht.marc.done', { created: d.created, skipped: d.skipped }));
        setPreview(null);
        setFile(null);
        if (input.current) input.current.value = '';
      }
    });
  };

  return (
    <Card title={t('lht.marc.title')} testId="lht-marc">
      <p className="mt-0 mb-4 text-sm text-muted-foreground">{t('lht.marc.hint')}</p>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <input ref={input} type="file" accept=".mrc,.marc,.xml,.dat" className="sr-only" id="lht-marc-file" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPreview(null))} />
          <Button type="button" variant="outline" className="h-9" onClick={() => input.current?.click()}>
            <FileUp />
            {t('lht.marc.pick')}
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : t('lht.marc.noFile')}</span>
        </div>
        <FormGrid>
          <TextInput label={t('lht.marc.copies')} type="number" value={copies} onChange={(e) => setCopies(e.target.value)} fullWidth />
          <SelectInput label={t('lht.marc.branch')} value={branch} onChange={(e) => setBranch(e.target.value)} options={branches} empty={t('lht.none')} fullWidth />
        </FormGrid>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="h-9" disabled={busy} onClick={() => run('preview')} data-testid="lht-marc-preview">
            {t('lht.marc.check')}
          </Button>
          <Button type="button" className="h-9" disabled={busy || !preview} onClick={() => run('import')} data-testid="lht-marc-import">
            {t('lht.marc.import')}
          </Button>
        </div>
        {preview && (
          <div className="border-t pt-4">
            <p className="mt-0 mb-2 text-sm font-medium">{t('lht.marc.found', { n: fmt.number(preview.records), have: fmt.number(preview.books.filter((b) => b.inCatalogue).length) })}</p>
            <ul className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto pl-0 text-sm">
              {preview.books.slice(0, 50).map((b, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 font-medium break-words">{b.title || '—'}</span>
                  {b.author && <span className="text-muted-foreground">{b.author}</span>}
                  {b.isbn && <span className="text-muted-foreground">ISBN {b.isbn}</span>}
                  {b.inCatalogue && <StatusPill tone="neutral">{t('lht.marc.have')}</StatusPill>}
                  {!b.valid && <StatusPill tone="danger">{t('lht.marc.noTitle')}</StatusPill>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
