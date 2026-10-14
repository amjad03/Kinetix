'use client';

import { Bookmark, ChevronDown, Star } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { deleteView, listViews, saveView, updateView } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { CheckboxField, Dialog, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { sameView, type SavedView, type SavedViewState } from '@/lib/records';

/** Roles a view can be shared with. */
const SHARE_ROLES = ['principal', 'tenant_admin', 'hod', 'teacher', 'admissions_officer', 'accountant', 'hr_manager', 'exam_controller', 'librarian'] as const;

/**
 * Saved views for a list: a person's named search, filters, columns, sort and density, chosen from a menu. Views
 * shared with one of the person's roles are listed too. One view can be the person's default for the page.
 */
export function SavedViews({ page, current, onApply, onDefault }: { page: string; current: SavedViewState; onApply: (state: SavedViewState) => void; onDefault?: (view: SavedView) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'save'>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    void listViews(page).then((res) => {
      if (!live || !res.ok) return;
      setViews(res.data);
      const def = res.data.find((v) => v.isDefault);
      if (def) onDefault?.(def);
      const same = res.data.find((v) => sameView(v.state, current));
      if (same) setActive(same.id);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const view = views.find((v) => v.id === active) ?? null;
  const modified = !!view && !sameView(view.state, current);
  const reload = async () => {
    const res = await listViews(page);
    if (res.ok) setViews(res.data);
  };
  const apply = (v: SavedView | null) => {
    setActive(v?.id ?? null);
    onApply(v ? v.state : {});
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? t('error.generic'));
      toast.success(done);
      await reload();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9 max-w-[220px] rounded-md" data-testid="saved-views">
            <Bookmark />
            <span className="truncate">{view ? view.name : t('rk.views.all')}</span>
            {modified && <span className="text-muted-foreground">*</span>}
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-60">
          <DropdownMenuItem onSelect={() => apply(null)}>{t('rk.views.all')}</DropdownMenuItem>
          {views.some((v) => v.mine) && <DropdownMenuLabel>{t('rk.views.mine')}</DropdownMenuLabel>}
          {views
            .filter((v) => v.mine)
            .map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => apply(v)} data-testid="saved-view">
                {v.isDefault && <Star aria-label={t('rk.views.default')} className="fill-current" />}
                <span className="truncate">{v.name}</span>
              </DropdownMenuItem>
            ))}
          {views.some((v) => !v.mine) && <DropdownMenuLabel>{t('rk.views.shared')}</DropdownMenuLabel>}
          {views
            .filter((v) => !v.mine)
            .map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => apply(v)}>
                <span className="truncate">{v.name}</span>
                {v.owner && <span className="ml-auto text-xs text-muted-foreground">{v.owner}</span>}
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog('save')} data-testid="save-view">
            {t('rk.views.saveAs')}
          </DropdownMenuItem>
          {view?.mine && modified && <DropdownMenuItem onSelect={() => run(() => updateView(view.id, { state: current }), t('rk.views.updated'))}>{t('rk.views.update', { name: view.name })}</DropdownMenuItem>}
          {view?.mine && !view.isDefault && <DropdownMenuItem onSelect={() => run(() => updateView(view.id, { isDefault: true }), t('rk.views.defaultSet'))}>{t('rk.views.makeDefault')}</DropdownMenuItem>}
          {view?.mine && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                run(async () => {
                  const res = await deleteView(view.id);
                  if (res.ok) setActive(null);
                  return res;
                }, t('rk.views.deleted'))
              }
            >
              {t('rk.views.delete', { name: view.name })}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'save' && (
        <SaveViewDialog
          busy={pending}
          onClose={() => setDialog(null)}
          onSave={(name, sharedRoles, isDefault) =>
            start(async () => {
              const res = await saveView({ page, name, state: current, sharedRoles, isDefault });
              if (!res.ok) return toast.error(res.error);
              toast.success(t('rk.views.saved', { name }));
              setDialog(null);
              await reload();
              setActive(res.data.id);
            })
          }
        />
      )}
    </>
  );
}

function SaveViewDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (name: string, roles: string[], isDefault: boolean) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [isDefault, setDefault] = useState(false);
  return (
    <Dialog
      title={t('rk.views.saveTitle')}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onSave(name.trim(), roles, isDefault)} disabled={busy || !name.trim()} data-testid="save-view-confirm">
            {t('rk.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), roles, isDefault);
        }}
      >
        <TextInput label={t('rk.views.name')} required value={name} onChange={(e) => setName(e.target.value)} autoFocus inputProps={{ maxLength: 80, 'data-testid': 'view-name' }} />
        <CheckboxField label={t('rk.views.makeDefault')} checked={isDefault} onChange={setDefault} />
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">{t('rk.views.shareWith')}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {SHARE_ROLES.map((r) => (
              <CheckboxField key={r} label={t(`role.${r}` as MessageKey)} checked={roles.includes(r)} onChange={(on) => setRoles((s) => (on ? [...s, r] : s.filter((x) => x !== r)))} />
            ))}
          </div>
          <p className="m-0 text-xs text-muted-foreground">{t('rk.views.shareHelp')}</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
