'use client';

import { CalendarRange, Plus, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { createVersion, type NewVersion } from '@/app/(dashboard)/timetable/studio/actions';
import { Grid, type Col } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, FormField, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STATUS_TONE, type StudioOptions, type VersionRow } from '@/lib/timetable-studio';

/** The versions of the timetable, and starting a new one (generated, copied from the live timetable, or empty). */
export function StudioList({ rows, options, canEdit }: { rows: VersionRow[]; options: StudioOptions; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const cols: Col<VersionRow>[] = [
    { label: t('tts2.col.no'), cell: (r) => `v${r.versionNo}`, sort: (r) => r.versionNo },
    { label: t('tts2.col.name'), cell: (r) => <Link className="font-medium text-primary hover:underline" href={`/timetable/studio/${r.id}`}>{r.name}</Link>, sort: (r) => r.name },
    { label: t('tts2.col.status'), cell: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{t(`tts2.status.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
    { label: t('tts2.col.classes'), cell: (r) => r.classes.join(', '), wrap: true },
    { label: t('tts2.col.periods'), cell: (r) => r.periods, num: true },
    { label: t('tts2.col.unplaced'), cell: (r) => (r.unplaced ? <StatusPill tone="warning">{fmt.number(r.unplaced)}</StatusPill> : '0'), sort: (r) => r.unplaced },
    { label: t('tts2.col.from'), cell: (r) => (r.effectiveFrom ? fmt.date(r.effectiveFrom, 'short') : '-'), sort: (r) => r.effectiveFrom ?? '' },
    { label: t('tts2.col.by'), cell: (r) => r.createdBy ?? '' },
    { label: t('tts2.col.created'), cell: (r) => fmt.date(r.createdAt.slice(0, 10), 'short'), sort: (r) => r.createdAt },
  ];
  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setOpen(true)} data-testid="new-version">
            <Plus />
            {t('tts2.new')}
          </Button>
        </div>
      )}
      <Grid cols={cols} rows={rows} empty={t('tts2.empty')} emptyIcon={<CalendarRange />} testId="versions" exportName="timetable-versions" />
      {open && <NewVersionDialog options={options} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewVersionDialog({ options, onClose }: { options: StudioOptions; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const groups = useMemo(() => {
    const m = new Map<string, StudioOptions['sections']>();
    for (const s of options.sections) m.set(`${s.programId}|${s.term}`, [...(m.get(`${s.programId}|${s.term}`) ?? []), s]);
    return [...m.values()];
  }, [options.sections]);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>(groups[0]?.map((s) => s.id) ?? []);
  const [source, setSource] = useState<NewVersion['source']>('generate');
  const [combineSubject, setCombineSubject] = useState('');
  const shared = useMemo(() => {
    const secs = options.sections.filter((s) => picked.includes(s.id));
    return options.subjects.filter((sub) => secs.filter((s) => s.programId === sub.programId && s.term === sub.term).length >= 2);
  }, [options, picked]);
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
  const submit = () =>
    start(async () => {
      const combine = combineSubject ? [{ subjectId: combineSubject, sectionIds: options.sections.filter((s) => picked.includes(s.id) && options.subjects.find((x) => x.id === combineSubject)?.programId === s.programId).map((s) => s.id) }] : [];
      const res = await createVersion({ name: name || t('tts2.defaultName'), sectionIds: picked, source, combine });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('tts2.created'));
      router.push(`/timetable/studio/${res.data.id}`);
    });
  return (
    <Dialog
      title={t('tts2.new')}
      size="md"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || picked.length === 0} data-testid="create-version">
            <Wand2 />
            {source === 'generate' ? t('tts2.generate') : t('tts2.create')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('tts2.f.name')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tts2.defaultName')} />
        </FormField>
        <FormField label={t('tts2.f.source')}>
          <SelectInput value={source} onChange={(e) => setSource(e.target.value as NewVersion['source'])} options={(['generate', 'copy', 'blank'] as const).map((v) => ({ value: v, label: t(`tts2.source.${v}` as MessageKey) }))} />
        </FormField>
        <div>
          <p className="mb-1 text-[13px] font-semibold">{t('tts2.f.classes')}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t('tts2.f.classesHelp')}</p>
          <div className="grid max-h-[240px] grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2">
            {options.sections.map((s) => (
              <CheckboxField key={s.id} label={s.displayName} checked={picked.includes(s.id)} onChange={(v) => toggle(s.id, v)} />
            ))}
          </div>
        </div>
        {source === 'generate' && shared.length > 0 && (
          <FormField label={t('tts2.f.combine')} helper={t('tts2.f.combineHelp')}>
            <SelectInput value={combineSubject} onChange={(e) => setCombineSubject(e.target.value)} empty={t('tts2.f.noCombine')} options={shared.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
