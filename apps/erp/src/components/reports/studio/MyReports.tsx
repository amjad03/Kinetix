'use client';

import { FileBarChart, FolderPen, MoreHorizontal, Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteReport, duplicateReport, renameFolder, setFavourite, updateReportMeta } from '@/app/(dashboard)/reports/studio-actions';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { DataTable, Dialog, useToast, type Column, type TableFilter } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { SavedReportRow } from '@/lib/report-studio';
import { Labelled, Pick } from './controls';
import { SaveDialog, ScheduleDialog } from './Dialogs';

type Mode = { kind: 'rename' | 'move' | 'share' | 'delete' | 'schedule'; row: SavedReportRow } | { kind: 'folder' } | null;

/** The person's saved reports and those shared with them: open, edit, rename, file, share, copy, schedule or delete. */
export function MyReports({ reports, folders }: { reports: SavedReportRow[]; folders: { name: string; count: number }[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [pending, start] = useTransition();
  const [folderFrom, setFolderFrom] = useState(folders[0]?.name ?? '');
  const [folderTo, setFolderTo] = useState('');

  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        setMode(null);
        router.refresh();
      } else toast.error(res.error);
    });

  const columns: Column<SavedReportRow>[] = [
    {
      id: 'name',
      header: t('rs.col.name'),
      rowHeader: true,
      sort: (r) => r.name,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.favourite && <Star aria-label={t('rs.lib.favourites')} className="size-3.5 fill-current text-amber-ink" />}
          <Link href={`/reports/view?id=${r.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.name}
          </Link>
        </span>
      ),
    },
    { id: 'dataset', header: t('rs.col.dataset'), sort: (r) => r.datasetLabel, cell: (r) => r.datasetLabel, hideBelow: 'md' },
    { id: 'folder', header: t('rs.col.folder'), sort: (r) => r.folder, cell: (r) => r.folder || '–', hideBelow: 'sm' },
    { id: 'owner', header: t('rs.col.owner'), sort: (r) => r.owner, cell: (r) => (r.mine ? t('rs.mine.you') : r.owner), hideBelow: 'lg' },
    { id: 'shared', header: t('rs.col.shared'), sort: (r) => r.sharedRoles.length, cell: (r) => (r.sharedRoles.length ? r.sharedRoles.map((x) => t(`role.${x}` as never)).join(', ') : t('rs.notShared')), hideBelow: 'lg' },
    { id: 'schedules', header: t('rs.col.schedules'), align: 'right', sort: (r) => r.schedules, cell: (r) => (r.schedules ? fmt.number(r.schedules) : '–'), hideBelow: 'md' },
    { id: 'updated', header: t('rs.col.updated'), sort: (r) => r.updatedAt, cell: (r) => fmt.dateTime(r.updatedAt), hideBelow: 'sm' },
    {
      id: 'actions',
      header: '',
      csv: false,
      width: 48,
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t('rs.act.menu', { name: r.name })} onClick={(e) => e.stopPropagation()} data-testid={`rs-menu-${r.id}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => router.push(`/reports/view?id=${r.id}`)}>{t('rs.act.open')}</DropdownMenuItem>
            {r.canEdit && <DropdownMenuItem onSelect={() => router.push(`/reports/builder?id=${r.id}`)}>{t('rs.act.edit')}</DropdownMenuItem>}
            {r.canEdit && <DropdownMenuItem onSelect={() => setMode({ kind: 'rename', row: r })}>{t('rs.act.rename')}</DropdownMenuItem>}
            {r.canEdit && <DropdownMenuItem onSelect={() => setMode({ kind: 'move', row: r })}>{t('rs.act.move')}</DropdownMenuItem>}
            {r.canEdit && <DropdownMenuItem onSelect={() => setMode({ kind: 'share', row: r })}>{t('rs.act.share')}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => act(async () => duplicateReport(r.id), t('rs.duplicated'))}>{t('rs.act.duplicate')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => act(async () => setFavourite(`custom:${r.id}`, !r.favourite), r.favourite ? t('rs.unstarred') : t('rs.starred'))}>{r.favourite ? t('rs.unstar') : t('rs.star')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMode({ kind: 'schedule', row: r })}>{t('rs.act.schedule')}</DropdownMenuItem>
            {r.canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setMode({ kind: 'delete', row: r })}>
                  {t('rs.act.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filters: TableFilter<SavedReportRow>[] = [
    { id: 'folder', label: t('rs.col.folder'), options: [{ value: '_none', label: t('rs.folder.none') }, ...[...new Set(reports.map((r) => r.folder).filter(Boolean))].sort().map((f) => ({ value: f, label: f }))], match: (r, v) => (v === '_none' ? !r.folder : r.folder === v) },
    { id: 'whose', label: t('rs.mine.filter'), options: [{ value: 'mine', label: t('rs.mine.onlyMine') }, { value: 'shared', label: t('rs.mine.shared') }, { value: 'starred', label: t('rs.lib.favourites') }], match: (r, v) => (v === 'mine' ? r.mine : v === 'shared' ? !r.mine : r.favourite) },
  ];

  const row = mode && 'row' in mode ? mode.row : null;
  return (
    <>
      <DataTable
        label={t('rs.tab.mine')}
        columns={columns}
        rows={reports}
        rowId={(r) => r.id}
        filters={filters}
        rowHref={(r) => `/reports/view?id=${r.id}`}
        initialSort={{ id: 'updated', dir: 'desc' }}
        testId="rs-mine"
        toolbar={
          <>
            {folders.length > 0 && (
              <Button variant="outline" className="h-9" onClick={() => setMode({ kind: 'folder' })}>
                <FolderPen />
                {t('rs.folder.rename')}
              </Button>
            )}
            <Button asChild className="h-9">
              <Link href="/reports/builder" data-testid="rs-new">
                <Plus />
                {t('rs.mine.new')}
              </Link>
            </Button>
          </>
        }
        empty={
          <EmptyState
            icon={<FileBarChart />}
            title={t('rs.mine.empty')}
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href="/reports/library">{t('rs.tab.library')}</Link>
                </Button>
                <Button asChild>
                  <Link href="/reports/builder" data-testid="rs-new">
                    {t('rs.mine.new')}
                  </Link>
                </Button>
              </>
            }
          >
            {t('rs.mine.emptyHelp')}
          </EmptyState>
        }
      />
      {row && (mode?.kind === 'rename' || mode?.kind === 'move' || mode?.kind === 'share') && (
        <SaveDialog
          title={t(`rs.${mode.kind}.title` as never)}
          fields={mode.kind === 'rename' ? ['name', 'description'] : mode.kind === 'move' ? ['folder'] : ['share']}
          initial={{ name: row.name, description: row.description, folder: row.folder, sharedRoles: row.sharedRoles }}
          folders={folders.map((f) => f.name)}
          onSave={async (v) => {
            const res = await updateReportMeta(row.id, mode.kind === 'rename' ? { name: v.name, description: v.description } : mode.kind === 'move' ? { folder: v.folder } : { sharedRoles: v.sharedRoles });
            if (res.ok) router.refresh();
            return res;
          }}
          onClose={() => setMode(null)}
        />
      )}
      {row && mode?.kind === 'schedule' && <ScheduleDialog source={{ reportId: row.id }} title={row.name} runtime={[]} onClose={() => setMode(null)} />}
      {row && mode?.kind === 'delete' && (
        <Dialog
          title={t('rs.act.delete')}
          onClose={() => setMode(null)}
          busy={pending}
          actions={
            <>
              <Button variant="ghost" onClick={() => setMode(null)}>
                {t('rs.cancel')}
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => act(() => deleteReport(row.id), t('rs.deleted'))} data-testid="rs-confirm-delete">
                {t('rs.act.delete')}
              </Button>
            </>
          }
        >
          <p className="text-sm">{t('rs.confirmDelete', { name: row.name })}</p>
        </Dialog>
      )}
      {mode?.kind === 'folder' && (
        <Dialog
          title={t('rs.folder.rename')}
          onClose={() => setMode(null)}
          busy={pending}
          actions={
            <>
              <Button variant="ghost" onClick={() => setMode(null)}>
                {t('rs.cancel')}
              </Button>
              <Button disabled={pending || !folderFrom} onClick={() => act(async () => renameFolder(folderFrom, folderTo.trim()), t('rs.saved'))}>
                {t('rs.save.save')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Labelled label={t('rs.folder.which')}>
              <Pick label={t('rs.folder.which')} value={folderFrom} onChange={setFolderFrom} options={folders.map((f) => ({ value: f.name, label: `${f.name} (${f.count})` }))} />
            </Labelled>
            <Labelled label={t('rs.folder.newName')} htmlFor="rs-folder-to">
              <Input id="rs-folder-to" className="h-9" value={folderTo} maxLength={60} onChange={(e) => setFolderTo(e.target.value)} />
              <span className="text-xs text-muted-foreground">{t('rs.folder.emptyHint')}</span>
            </Labelled>
          </div>
        </Dialog>
      )}
    </>
  );
}
