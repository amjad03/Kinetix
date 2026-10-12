'use client';
import { useState, useTransition } from 'react';
import { addBuilding, addFloor, placeRoom } from '@/app/(dashboard)/settings/institution/actions';
import { SectionTitle } from '@/components/PageHeader';
import { Card, EmptyState, FormGrid, SelectInput, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { BuildingsTree } from '@/lib/institution';

import { Alert, Button, Chip } from '@/components/kx';
import { Building2 as ApartmentOutlined } from 'lucide-react';
/** Settings > Buildings and rooms: campus buildings, floors, and where each room sits. */
export function BuildingsAdmin({ tree }: { tree: BuildingsTree }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [campusId, setCampusId] = useState(tree.campuses[0]?.id ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [floorDraft, setFloorDraft] = useState<Record<string, { level: string; label: string }>>({});
  const [placing, setPlacing] = useState<Record<string, string>>({});
  const floors = tree.buildings.flatMap((b) => b.floors.map((f) => ({ value: f.id, label: `${b.name} - ${f.label}` })));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? null));
      if (r.ok) {
        toast.success(t('inst.saved'));
        after?.();
      }
    });

  return (
    <div data-testid="buildings-admin" aria-busy={pending}>
      {error && (
        <Alert className="mb-4" severity="error">
          {error}
        </Alert>
      )}
      <SectionTitle>{t('bld.addBuilding')}</SectionTitle>
      <Card className="p-5 mb-6">
        <FormGrid cols={3}>
          <SelectInput label={t('bld.campus')} value={campusId} options={tree.campuses.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => setCampusId(e.target.value)} />
          <TextInput label={t('bld.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label={t('bld.code')} value={code} onChange={(e) => setCode(e.target.value)} />
        </FormGrid>
        <Button className="mt-4" variant="contained" disabled={pending || !name.trim() || !campusId} onClick={() => run(() => addBuilding({ campusId, name, code }), () => { setName(''); setCode(''); })}>
          {t('bld.add')}
        </Button>
      </Card>

      {tree.buildings.length === 0 ? (
        <EmptyState icon={<ApartmentOutlined />} title={t('bld.empty')}>{t('bld.emptyHint')}</EmptyState>
      ) : (
        tree.buildings.map((b) => {
          const d = floorDraft[b.id] ?? { level: '', label: '' };
          return (
            <Card className="p-5 mb-4" key={b.id} data-testid="building">
              <h3 className="text-base leading-6 font-medium tracking-[0.1px]">
                {b.name} {b.code && <Chip className="ml-2" size="small" label={b.code} />}
              </h3>
              {b.floors.map((f) => (
                <div className="flex flex-row mt-3 items-center flex-wrap gap-2" key={f.id}>
                  <p className="text-sm leading-[21px] min-w-[140px] font-semibold">{f.label}</p>
                  {f.rooms.length === 0 ? <p className="text-[13px] leading-[19px] text-muted-foreground">{t('bld.noRooms')}</p> : f.rooms.map((r) => <Chip key={r.id} size="small" variant="outlined" label={r.name} />)}
                </div>
              ))}
              <div className="flex flex-row mt-4 gap-3 items-end flex-wrap">
                <TextInput label={t('bld.level')} value={d.level} inputMode="numeric" onChange={(e) => setFloorDraft({ ...floorDraft, [b.id]: { ...d, level: e.target.value.replace(/[^\d-]/g, '').slice(0, 3) } })} />
                <TextInput label={t('bld.floorLabel')} value={d.label} onChange={(e) => setFloorDraft({ ...floorDraft, [b.id]: { ...d, label: e.target.value } })} />
                <Button variant="outlined" disabled={pending || d.level === '' || !d.label.trim() || Number.isNaN(Number(d.level))} onClick={() => run(() => addFloor(b.id, { level: Number(d.level), label: d.label }), () => setFloorDraft({ ...floorDraft, [b.id]: { level: '', label: '' } }))}>
                  {t('bld.addFloor')}
                </Button>
              </div>
            </Card>
          );
        })
      )}

      {tree.unplacedRooms.length > 0 && (
        <>
          <SectionTitle>{t('bld.unplaced')}</SectionTitle>
          <Card className="p-5">
            {tree.unplacedRooms.map((r) => (
              <div className="flex flex-row items-end gap-3 mb-3 flex-wrap" key={r.id}>
                <p className="text-sm leading-[21px] min-w-[160px]">{r.name}</p>
                <SelectInput className="min-w-[240px]" label={t('bld.chooseFloor')} value={placing[r.id] ?? ''} options={floors} onChange={(e) => setPlacing({ ...placing, [r.id]: e.target.value })} />
                <Button variant="outlined" disabled={pending || !placing[r.id]} onClick={() => run(() => placeRoom(r.id, placing[r.id]))}>
                  {t('bld.place')}
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
