'use client';

import { BookOpen, Briefcase, CalendarClock, Pencil } from 'lucide-react';
import { useState, useTransition } from 'react';
import { saveStaffDetails } from '@/app/(dashboard)/hr/depth-actions';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, FormGrid, SelectInput, StatGrid, StatTile, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { aadhaarProblem, BLOOD, CADRES, MARITAL, NET_SET, PHD, POSTS, SOCIAL, type StaffDetails } from '@/lib/hr-depth';

type Draft = { [K in keyof StaffDetails]: StaffDetails[K] extends number | null ? string : StaffDetails[K] extends boolean ? boolean : string };

const toDraft = (d: StaffDetails): Draft =>
  Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'boolean' ? v : v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v)])) as Draft;

/**
 * The faculty side of a staff record: category and cadre, Ph.D. and NET/SET, pay scale, statutory and personal
 * details (Aadhaar kept encrypted, only the last four digits shown), retirement date and experience totals.
 */
export function FacultyProfile({ details, canEdit }: { details: StaffDetails; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState(false);
  const w = (prefix: string, v: string | null) => (v ? t(`hk.${prefix}.${v}` as MessageKey) : '–');
  const items: [MessageKey, string][] = [
    ['hk.d.staffCategory', w('cat', details.staffCategory)],
    ['hk.d.cadre', w('cadre', details.cadre)],
    ['hk.d.postType', w('post', details.postType)],
    ['hk.d.phd', details.phdStatus === 'none' ? t('hk.phd.none') : `${w('phd', details.phdStatus)}${details.phdYear ? ` (${details.phdYear})` : ''}`],
    ['hk.d.netSet', details.netSet === 'none' ? t('hk.net.none') : `${w('net', details.netSet)}${details.netSetYear ? ` (${details.netSetYear})` : ''}`],
    ['hk.d.payScale', [details.payScale, details.payLevel ? t('hk.d.level', { n: details.payLevel }) : ''].filter(Boolean).join(' · ') || '–'],
    ['hk.d.confirmedOn', details.confirmedOn ? fmt.date(details.confirmedOn, 'day') : '–'],
    ['hk.d.retiresOn', details.retiresOn ? fmt.date(details.retiresOn, 'day') : '–'],
    ['hk.d.socialCategory', w('social', details.socialCategory)],
    ['hk.d.bloodGroup', details.bloodGroup ?? '–'],
    ['hk.d.maritalStatus', w('marital', details.maritalStatus)],
    ['hk.d.fatherOrSpouseName', details.fatherOrSpouseName ?? '–'],
    ['hk.d.aadhaar', details.aadhaarLast4 ? `XXXX XXXX ${details.aadhaarLast4}` : '–'],
    ['hk.d.differentlyAbled', details.differentlyAbled ? t('hk.yes') : t('hk.no')],
    ['hk.d.emergency', [details.emergencyContactName, details.emergencyContactPhone].filter(Boolean).join(' · ') || '–'],
    ['hk.d.address', details.address ?? '–'],
    ['hk.d.lwf', details.lwfEnabled ? t('hk.yes') : t('hk.no')],
  ];
  return (
    <div className="grid gap-6">
      <StatGrid min={160}>
        <StatTile label={t('hk.d.teachingYears')} value={fmt.number(details.experience.teachingYears)} caption={t('hk.d.priorCaption', { n: details.experience.priorTeachingYears })} icon={<Briefcase />} />
        <StatTile label={t('hk.d.totalYears')} value={fmt.number(details.experience.totalYears)} caption={t('hk.d.hereCaption', { n: details.experience.serviceYears })} icon={<CalendarClock />} />
        <StatTile label={t('hk.d.publications')} value={fmt.number(details.publications.total)} caption={t('hk.d.indexedCaption', { n: details.publications.indexed })} icon={<BookOpen />} />
      </StatGrid>
      <Card
        title={t('hk.d.title')}
        action={
          canEdit ? (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setEditing(true)}>
              <Pencil />
              {t('hk.d.edit')}
            </Button>
          ) : undefined
        }
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{t(k)}</dt>
              <dd className="mt-1 text-sm font-medium whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {editing && <DetailsDialog details={details} onClose={() => setEditing(false)} />}
    </div>
  );
}

function DetailsDialog({ details, onClose }: { details: StaffDetails; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(details));
  const [aadhaar, setAadhaar] = useState('');
  const [busy, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const opts = (prefix: string, list: readonly string[]) => list.map((v) => ({ value: v, label: t(`hk.${prefix}.${v}` as MessageKey) }));
  const aadhaarErr = aadhaar.trim() ? aadhaarProblem(aadhaar) : null;
  const yearOk = (y: string) => !y || /^(19[5-9]\d|20\d\d)$/.test(y);
  const invalid = !!aadhaarErr || !yearOk(String(d.phdYear)) || !yearOk(String(d.netSetYear)) || (d.phdStatus === 'awarded' && !d.phdYear) || (d.netSet !== 'none' && !d.netSetYear) || !/^\d{2}$/.test(String(d.retirementAge));
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const str = (v: string) => (v.trim() ? v.trim() : null);
  const save = () =>
    start(async () => {
      const res = await saveStaffDetails(details.userId, {
        staffCategory: d.staffCategory as StaffDetails['staffCategory'],
        cadre: str(String(d.cadre)),
        postType: d.postType as StaffDetails['postType'],
        socialCategory: str(String(d.socialCategory)),
        religion: str(String(d.religion)),
        bloodGroup: str(String(d.bloodGroup)),
        maritalStatus: str(String(d.maritalStatus)),
        fatherOrSpouseName: str(String(d.fatherOrSpouseName)),
        differentlyAbled: !!d.differentlyAbled,
        address: str(String(d.address)),
        emergencyContactName: str(String(d.emergencyContactName)),
        emergencyContactPhone: str(String(d.emergencyContactPhone)),
        phdStatus: d.phdStatus as StaffDetails['phdStatus'],
        phdYear: d.phdStatus === 'none' ? null : num(String(d.phdYear)),
        netSet: d.netSet as StaffDetails['netSet'],
        netSetYear: d.netSet === 'none' ? null : num(String(d.netSetYear)),
        payScale: str(String(d.payScale)),
        payLevel: num(String(d.payLevel)),
        confirmedOn: str(String(d.confirmedOn)),
        retirementAge: Number(d.retirementAge),
        lwfEnabled: !!d.lwfEnabled,
        ...(aadhaar.trim() ? { aadhaar: aadhaar.replace(/\s/g, '') } : {}),
      });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.saved'));
      onClose();
    });
  return (
    <Dialog
      title={t('hk.d.edit')}
      size="md"
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={busy || invalid}>
            {t('hk.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <FormGrid cols={3}>
          <FormField label={t('hk.d.staffCategory')} required>
            <SelectInput value={String(d.staffCategory)} onChange={(e) => set('staffCategory', e.target.value)} options={opts('cat', ['teaching', 'non_teaching'])} />
          </FormField>
          <FormField label={t('hk.d.cadre')}>
            <SelectInput value={String(d.cadre)} onChange={(e) => set('cadre', e.target.value)} options={opts('cadre', CADRES)} empty="–" />
          </FormField>
          <FormField label={t('hk.d.postType')} required>
            <SelectInput value={String(d.postType)} onChange={(e) => set('postType', e.target.value)} options={opts('post', POSTS)} />
          </FormField>
          <FormField label={t('hk.d.phd')} required>
            <SelectInput value={String(d.phdStatus)} onChange={(e) => set('phdStatus', e.target.value)} options={opts('phd', PHD)} />
          </FormField>
          <FormField label={t('hk.d.phdYear')} error={!yearOk(String(d.phdYear)) || (d.phdStatus === 'awarded' && !d.phdYear) ? t('hk.err.year') : undefined}>
            <TextInput value={String(d.phdYear)} disabled={d.phdStatus === 'none'} onChange={(e) => set('phdYear', e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </FormField>
          <FormField label={t('hk.d.netSet')} required>
            <SelectInput value={String(d.netSet)} onChange={(e) => set('netSet', e.target.value)} options={opts('net', NET_SET)} />
          </FormField>
          <FormField label={t('hk.d.netSetYear')} error={!yearOk(String(d.netSetYear)) || (d.netSet !== 'none' && !d.netSetYear) ? t('hk.err.year') : undefined}>
            <TextInput value={String(d.netSetYear)} disabled={d.netSet === 'none'} onChange={(e) => set('netSetYear', e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </FormField>
          <FormField label={t('hk.d.payScale')}>
            <TextInput value={String(d.payScale)} onChange={(e) => set('payScale', e.target.value)} />
          </FormField>
          <FormField label={t('hk.d.payLevel')}>
            <TextInput value={String(d.payLevel)} onChange={(e) => set('payLevel', e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </FormField>
          <FormField label={t('hk.d.confirmedOn')}>
            <TextInput type="date" value={String(d.confirmedOn)} onChange={(e) => set('confirmedOn', e.target.value)} />
          </FormField>
          <FormField label={t('hk.d.retirementAge')} required>
            <TextInput value={String(d.retirementAge)} onChange={(e) => set('retirementAge', e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </FormField>
          <FormField label={t('hk.d.socialCategory')}>
            <SelectInput value={String(d.socialCategory)} onChange={(e) => set('socialCategory', e.target.value)} options={opts('social', SOCIAL)} empty="–" />
          </FormField>
          <FormField label={t('hk.d.religion')}>
            <TextInput value={String(d.religion)} onChange={(e) => set('religion', e.target.value)} />
          </FormField>
          <FormField label={t('hk.d.bloodGroup')}>
            <SelectInput value={String(d.bloodGroup)} onChange={(e) => set('bloodGroup', e.target.value)} options={BLOOD.map((b) => ({ value: b, label: b }))} empty="–" />
          </FormField>
          <FormField label={t('hk.d.maritalStatus')}>
            <SelectInput value={String(d.maritalStatus)} onChange={(e) => set('maritalStatus', e.target.value)} options={opts('marital', MARITAL)} empty="–" />
          </FormField>
          <FormField label={t('hk.d.fatherOrSpouseName')}>
            <TextInput value={String(d.fatherOrSpouseName)} onChange={(e) => set('fatherOrSpouseName', e.target.value)} />
          </FormField>
          <FormField label={t('hk.d.emergencyName')}>
            <TextInput value={String(d.emergencyContactName)} onChange={(e) => set('emergencyContactName', e.target.value)} />
          </FormField>
          <FormField label={t('hk.d.emergencyPhone')}>
            <TextInput value={String(d.emergencyContactPhone)} onChange={(e) => set('emergencyContactPhone', e.target.value)} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
          </FormField>
          <FormField label={t('hk.d.aadhaarNew')} helper={details.aadhaarLast4 ? t('hk.d.aadhaarOnFile', { last4: details.aadhaarLast4 }) : t('hk.d.aadhaarHelp')} error={aadhaarErr ? t(`hk.err.aadhaar.${aadhaarErr}`) : undefined}>
            <TextInput value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} autoComplete="off" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </FormField>
        </FormGrid>
        <FormField label={t('hk.d.address')}>
          <TextInput value={String(d.address)} onChange={(e) => set('address', e.target.value)} multiline minRows={2} />
        </FormField>
        <div className="flex flex-wrap gap-x-6">
          <CheckboxField label={t('hk.d.differentlyAbled')} checked={!!d.differentlyAbled} onChange={(v) => set('differentlyAbled', v)} />
          <CheckboxField label={t('hk.d.lwf')} checked={!!d.lwfEnabled} onChange={(v) => set('lwfEnabled', v)} />
        </div>
      </div>
    </Dialog>
  );
}
