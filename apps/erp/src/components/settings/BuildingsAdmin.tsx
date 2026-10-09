'use client';

import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addBuilding, addFloor, placeRoom } from '@/app/(dashboard)/settings/institution/actions';
import { SectionTitle } from '@/components/PageHeader';
import { Card, EmptyState, FormGrid, SelectInput, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { BuildingsTree } from '@/lib/institution';

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
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <SectionTitle>{t('bld.addBuilding')}</SectionTitle>
      <Card sx={{ p: 2.5, mb: 3 }}>
        <FormGrid cols={3}>
          <SelectInput label={t('bld.campus')} value={campusId} options={tree.campuses.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => setCampusId(e.target.value)} />
          <TextInput label={t('bld.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label={t('bld.code')} value={code} onChange={(e) => setCode(e.target.value)} />
        </FormGrid>
        <Button sx={{ mt: 2 }} variant="contained" disabled={pending || !name.trim() || !campusId} onClick={() => run(() => addBuilding({ campusId, name, code }), () => { setName(''); setCode(''); })}>
          {t('bld.add')}
        </Button>
      </Card>

      {tree.buildings.length === 0 ? (
        <EmptyState icon={<ApartmentOutlined />} title={t('bld.empty')}>{t('bld.emptyHint')}</EmptyState>
      ) : (
        tree.buildings.map((b) => {
          const d = floorDraft[b.id] ?? { level: '', label: '' };
          return (
            <Card key={b.id} sx={{ p: 2.5, mb: 2 }} data-testid="building">
              <Typography variant="h6" component="h3">
                {b.name} {b.code && <Chip size="small" label={b.code} sx={{ ml: 1 }} />}
              </Typography>
              {b.floors.map((f) => (
                <Stack key={f.id} direction="row" sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography sx={{ minWidth: 140, fontWeight: 600 }}>{f.label}</Typography>
                  {f.rooms.length === 0 ? <Typography variant="body2" color="text.secondary">{t('bld.noRooms')}</Typography> : f.rooms.map((r) => <Chip key={r.id} size="small" variant="outlined" label={r.name} />)}
                </Stack>
              ))}
              <Stack direction="row" sx={{ mt: 2, gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <TextInput label={t('bld.level')} value={d.level} inputMode="numeric" onChange={(e) => setFloorDraft({ ...floorDraft, [b.id]: { ...d, level: e.target.value.replace(/[^\d-]/g, '').slice(0, 3) } })} />
                <TextInput label={t('bld.floorLabel')} value={d.label} onChange={(e) => setFloorDraft({ ...floorDraft, [b.id]: { ...d, label: e.target.value } })} />
                <Button variant="outlined" disabled={pending || d.level === '' || !d.label.trim() || Number.isNaN(Number(d.level))} onClick={() => run(() => addFloor(b.id, { level: Number(d.level), label: d.label }), () => setFloorDraft({ ...floorDraft, [b.id]: { level: '', label: '' } }))}>
                  {t('bld.addFloor')}
                </Button>
              </Stack>
            </Card>
          );
        })
      )}

      {tree.unplacedRooms.length > 0 && (
        <>
          <SectionTitle>{t('bld.unplaced')}</SectionTitle>
          <Card sx={{ p: 2.5 }}>
            {tree.unplacedRooms.map((r) => (
              <Stack key={r.id} direction="row" sx={{ alignItems: 'flex-end', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ minWidth: 160 }}>{r.name}</Typography>
                <SelectInput label={t('bld.chooseFloor')} value={placing[r.id] ?? ''} options={floors} onChange={(e) => setPlacing({ ...placing, [r.id]: e.target.value })} sx={{ minWidth: 240 }} />
                <Button variant="outlined" disabled={pending || !placing[r.id]} onClick={() => run(() => placeRoom(r.id, placing[r.id]))}>
                  {t('bld.place')}
                </Button>
              </Stack>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
