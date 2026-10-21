'use client';
import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createTenant, setTenantEdition } from '@/app/(dashboard)/zynetix/actions';
import { Button } from '@/components/kx';
import { DataTable, Dialog, FormGrid, SelectInput, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Edition, PlatformTenant } from '@/lib/zynetix';

const year = new Date().getFullYear();
const blank = { slug: '', name: '', kind: 'college' as PlatformTenant['kind'], edition: 'board' as Edition, yearLabel: `${year}-${String((year + 1) % 100).padStart(2, '0')}`, yearStart: `${year}-06-01`, yearEnd: `${year + 1}-05-31`, adminName: '', adminEmail: '', city: '' };

/** Platform team: every institution, its edition (ERP + board, or Zynetix only), and a new institution. */
export function TenantsDesk({ tenants }: { tenants: PlatformTenant[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState(tenants);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [made, setMade] = useState<{ name: string; email: string; password: string } | null>(null);
  const [busy, start] = useTransition();
  const editions = (['full', 'board'] as const).map((e) => ({ value: e, label: t(e === 'full' ? 'zx.pl.full' : 'zx.pl.board') }));

  const setEdition = (r: PlatformTenant, edition: Edition) =>
    start(async () => {
      const res = await setTenantEdition(r.id, edition);
      if (!res.ok) return toast.error(res.error);
      setRows((l) => l.map((x) => (x.id === r.id ? { ...x, edition } : x)));
      toast.success(t('zx.pl.editionSaved', { name: r.name }));
    });
  const create = () =>
    form &&
    start(async () => {
      const res = await createTenant(form);
      if (!res.ok) return toast.error(res.error);
      setRows((l) => [...l, res.data!.tenant]);
      setMade({ name: res.data!.admin.fullName, email: res.data!.admin.email, password: res.data!.admin.temporaryPassword });
      setForm(null);
    });

  const columns: Column<PlatformTenant>[] = [
    { id: 'name', header: t('zx.pl.name'), rowHeader: true, sort: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: 'slug', header: t('zx.pl.slug'), sort: (r) => r.slug, cell: (r) => r.slug },
    { id: 'kind', header: t('zx.pl.kind'), hideBelow: 'md', sort: (r) => r.kind, cell: (r) => t(`zx.pl.k.${r.kind}`) },
    {
      id: 'edition',
      header: t('zx.pl.edition'),
      sort: (r) => r.edition,
      csv: (r) => r.edition,
      cell: (r) => (
        <div className="w-[200px]">
          <SelectInput aria-label={t('zx.pl.editionOf', { name: r.name })} value={r.edition} disabled={busy} onChange={(e) => setEdition(r, e.target.value as Edition)} options={editions} slotProps={{ htmlInput: { 'data-testid': 'zx-tenant-edition' } }} />
        </div>
      ),
    },
    { id: 'created', header: t('zx.pl.created'), hideBelow: 'lg', sort: (r) => r.createdAt, cell: (r) => fmt.date(r.createdAt.slice(0, 10), 'short') },
  ];
  const set = (patch: Partial<typeof blank>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <>
      <DataTable
        testId="zx-tenants"
        label={t('zx.pl.institutions')}
        rows={rows}
        rowId={(r) => r.id}
        columns={columns}
        exportName="institutions"
        toolbar={
          <Button variant="contained" startIcon={<Plus />} onClick={() => setForm({ ...blank })}>
            {t('zx.pl.add')}
          </Button>
        }
      />
      {form && (
        <Dialog
          title={t('zx.pl.add')}
          size="md"
          busy={busy}
          onClose={() => setForm(null)}
          actions={
            <>
              <Button onClick={() => setForm(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="contained" onClick={create} disabled={busy}>
                {t('zx.pl.create')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <FormGrid>
              <TextInput label={t('zx.pl.name')} required value={form.name} onChange={(e) => set({ name: e.target.value })} />
              <TextInput label={t('zx.pl.slug')} required helper={t('zx.pl.slugHelp')} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
              <SelectInput label={t('zx.pl.kind')} value={form.kind} onChange={(e) => set({ kind: e.target.value as PlatformTenant['kind'] })} options={(['school', 'college', 'university'] as const).map((k) => ({ value: k, label: t(`zx.pl.k.${k}`) }))} />
              <SelectInput label={t('zx.pl.edition')} value={form.edition} onChange={(e) => set({ edition: e.target.value as Edition })} options={editions} />
              <TextInput label={t('zx.pl.yearLabel')} value={form.yearLabel} onChange={(e) => set({ yearLabel: e.target.value })} />
              <TextInput label={t('zx.pl.city')} value={form.city} onChange={(e) => set({ city: e.target.value })} />
              <TextInput label={t('zx.pl.yearStart')} type="date" value={form.yearStart} onChange={(e) => set({ yearStart: e.target.value })} />
              <TextInput label={t('zx.pl.yearEnd')} type="date" value={form.yearEnd} onChange={(e) => set({ yearEnd: e.target.value })} />
              <TextInput label={t('zx.pl.adminName')} required value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
              <TextInput label={t('zx.pl.adminEmail')} required type="email" value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
            </FormGrid>
          </div>
        </Dialog>
      )}
      {made && (
        <Dialog title={t('zx.t.passwordTitle')} onClose={() => setMade(null)} actions={<Button variant="contained" onClick={() => setMade(null)}>{t('zx.t.done')}</Button>}>
          <p className="text-sm">{t('zx.t.passwordBody', { name: made.name, login: made.email })}</p>
          <p className="mt-3 rounded-lg border bg-muted px-3 py-2 font-mono text-lg tracking-wider">{made.password}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('zx.t.passwordOnce')}</p>
        </Dialog>
      )}
    </>
  );
}
