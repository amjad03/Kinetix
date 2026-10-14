'use client';

import { Download, ExternalLink, FolderOpen, Pencil } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { editEvidence } from '@/app/(dashboard)/accreditation/actions';
import { FormDialog } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { DataTable, EmptyState, StatusPill, type Column } from '@/components/ui';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import { accDownload } from '@/lib/accreditation-ui';

export interface RepoRow {
  id: string;
  metric: string;
  metricTitle: string;
  year: string;
  title: string;
  url: string | null;
  note: string | null;
  fileName: string | null;
  tags: string[];
  validUntil: string | null;
  expired: boolean;
  uploadedBy: string | null;
}

/** Every evidence document of the framework's period with its tags and validity: filter by tag, find what is expiring, retag. */
export function EvidenceRepository({ fw, cycle, rows, tags, tag, expiring, canEdit }: { fw: string; cycle: string; rows: RepoRow[]; tags: string[]; tag: string; expiring: string; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = useState<RepoRow | null>(null);
  const base = `cycle=${cycle}&tab=evidence`;
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries({ tag, expiring, ...patch })) if (v) p.set(k, v);
    return p.toString();
  };
  const columns: Column<RepoRow>[] = [
    { id: 'title', header: t('acx2.ev.document'), rowHeader: true, sort: (r) => r.title, cell: (r) => <b className="font-[550]">{r.title}</b> },
    { id: 'metric', header: t('acx2.ev.metric'), sort: (r) => r.metric, cell: (r) => <NextLink href={`/accreditation/${fw}/metrics/${encodeURIComponent(r.metric)}?cycle=${cycle}`} title={r.metricTitle}>{r.metric}</NextLink> },
    { id: 'year', header: t('acx2.ev.year'), hideBelow: 'sm', sort: (r) => r.year, cell: (r) => r.year },
    { id: 'tags', header: t('acx2.ev.tags'), hideBelow: 'md', csv: (r) => r.tags.join(', '), cell: (r) => (r.tags.length ? <span className="flex flex-wrap gap-1">{r.tags.map((x) => <StatusPill key={x}>{x}</StatusPill>)}</span> : <span className="text-muted-foreground">-</span>) },
    { id: 'valid', header: t('acx2.ev.validUntil'), sort: (r) => r.validUntil, cell: (r) => (r.validUntil ? <StatusPill tone={r.expired ? 'danger' : 'neutral'}>{fmt.date(r.validUntil, 'short')}</StatusPill> : <span className="text-muted-foreground">-</span>) },
    {
      id: 'open',
      header: t('acx2.ev.open'),
      csv: false,
      cell: (r) => (
        <span className="flex gap-1.5">
          {r.fileName && (
            <a href={accDownload(fw, `file-${r.id}`)} className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12.5px] no-underline hover:bg-accent" aria-label={`${t('acx.m.download')} ${r.title}`}>
              <Download className="size-3.5" aria-hidden />
            </a>
          )}
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12.5px] no-underline hover:bg-accent" aria-label={`${t('acx.m.open')} ${r.title}`}>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setEdit(r)} aria-label={`${t('acx2.ev.edit')} ${r.title}`}>
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <UrlSelect label={t('acx2.ev.tag')} value={q({})} options={[{ value: q({ tag: '' }), label: t('acx2.ev.allTags') }, ...tags.map((x) => ({ value: q({ tag: x }), label: x }))]} minWidth={180} testId="acx-ev-tag" />
        <UrlSelect label={t('acx2.ev.validity')} value={q({})} options={[{ value: q({ expiring: '' }), label: t('acx2.ev.any') }, { value: q({ expiring: '0' }), label: t('acx2.ev.expired') }, { value: q({ expiring: '60' }), label: t('acx2.ev.within60') }]} minWidth={200} testId="acx-ev-validity" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title={t('acx2.ev.none')}>
          {t('acx2.ev.noneBody')}
        </EmptyState>
      ) : (
        <DataTable label={t('acx2.ev.title')} rows={rows} rowId={(r) => r.id} columns={columns} exportName={`${fw}-evidence-${cycle}`} rowTone={(r) => (r.expired ? 'danger' : undefined)} />
      )}
      {edit && (
        <FormDialog
          title={`${t('acx2.ev.edit')}: ${edit.title}`}
          fields={[
            { name: 'tags', label: t('acx2.ev.tags'), init: edit.tags.join(', ') },
            { name: 'validUntil', label: t('acx2.ev.validUntil'), kind: 'date', init: edit.validUntil ?? '' },
          ]}
          onSubmit={(v) => editEvidence(fw, edit.id, v)}
          onClose={(done) => {
            setEdit(null);
            if (done) router.refresh();
          }}
        />
      )}
    </>
  );
}
