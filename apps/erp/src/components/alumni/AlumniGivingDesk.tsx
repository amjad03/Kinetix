'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState, useTransition } from 'react';
import { recordDonation, recordPledge, saveCampaign, saveOpportunity, signUp, withdraw } from '@/app/(dashboard)/alumni/actions';
import { SuccessStoriesQueue } from '@/components/alumni/SuccessStoriesQueue';
import { FormDialog, Grid, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { DONATION_MODES, receiptPath, type AlumniOption, type CampaignRow, type DonationRow, type OpportunityRow } from '@/lib/govern';
import type { StoryRow } from '@/lib/pathways-a';

/** Campaigns, donations with receipts, and volunteering. */
export function AlumniGivingDesk({ campaigns, donations, opportunities, alumni, stories, initialTab }: { campaigns: CampaignRow[]; donations: DonationRow[]; opportunities: OpportunityRow[] | null; alumni: AlumniOption[]; stories: StoryRow[] | null; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [campaign, setCampaign] = useState<CampaignRow | 'new' | null>(null);
  const [pledge, setPledge] = useState<CampaignRow | null>(null);
  const [donate, setDonate] = useState<CampaignRow | null>(null);
  const [opportunity, setOpportunity] = useState<OpportunityRow | 'new' | null>(null);
  const [signing, setSigning] = useState<OpportunityRow | null>(null);

  const alumniOptions = [{ value: '', label: t('alm.f.noAlumni') }, ...alumni.map((a) => ({ value: a.id, label: `${a.fullName} (${a.graduationYear})` }))];
  const campaignName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? '-';
  const modeOptions = DONATION_MODES.map((m) => ({ value: m, label: t(`alm.mode.${m}` as MessageKey) }));
  const done = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      toast(res.ok ? t('ops.saved') : res.error);
    });
  const close = (m?: string) => {
    setCampaign(null);
    setPledge(null);
    setDonate(null);
    setOpportunity(null);
    setSigning(null);
    if (m) toast(m);
  };

  const campaignCols: Col<CampaignRow>[] = [
    { label: t('alm.col.campaign'), cell: (c) => c.name, sort: (c) => c.name },
    { label: t('alm.col.goal'), cell: (c) => fmt.rupees(c.goalPaise), num: true, sort: (c) => c.goalPaise },
    { label: t('alm.col.raised'), cell: (c) => fmt.rupees(c.raisedPaise), num: true, sort: (c) => c.raisedPaise },
    { label: t('alm.col.percent'), cell: (c) => (c.percent === null ? '-' : `${c.percent}%`), num: true, sort: (c) => c.percent },
    { label: t('alm.col.donors'), cell: (c) => fmt.number(c.donors), num: true, sort: (c) => c.donors },
    { label: t('alm.col.pledged'), cell: (c) => fmt.rupees(c.pledgedOpenPaise), num: true, sort: (c) => c.pledgedOpenPaise },
    { label: t('alm.col.status'), cell: (c) => <Pill label={t(`alm.status.${c.status}` as MessageKey)} warn={c.status === 'closed'} /> },
    {
      label: '',
      cell: (c) => (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {c.status === 'active' && <Button size="small" onClick={() => setDonate(c)} data-testid={`alm-donate-${c.id}`}>{t('alm.donate')}</Button>}
          {c.status === 'active' && <Button size="small" onClick={() => setPledge(c)}>{t('alm.pledge')}</Button>}
          <Button size="small" onClick={() => setCampaign(c)}>{t('alm.edit')}</Button>
        </Stack>
      ),
    },
  ];

  const donationCols: Col<DonationRow>[] = [
    { label: t('alm.col.receipt'), cell: (d) => d.receiptSerial, sort: (d) => d.receiptSerial },
    { label: t('alm.col.date'), cell: (d) => fmt.date(d.receivedOn), sort: (d) => d.receivedOn },
    { label: t('alm.col.donor'), cell: (d) => d.donorName, sort: (d) => d.donorName },
    { label: t('alm.col.campaign'), cell: (d) => campaignName(d.campaignId) },
    { label: t('alm.col.amount'), cell: (d) => fmt.rupees(d.amountPaise), num: true, sort: (d) => d.amountPaise },
    { label: t('alm.col.mode'), cell: (d) => t(`alm.mode.${d.mode}` as MessageKey) },
    { label: '', cell: (d) => <Button size="small" href={receiptPath(d.id)}>{t('alm.receipt')}</Button> },
  ];

  const oppCols: Col<OpportunityRow>[] = [
    { label: t('alm.col.opportunity'), cell: (o) => o.title, sort: (o) => o.title },
    { label: t('alm.col.date'), cell: (o) => (o.startsOn ? fmt.date(o.startsOn) : '-'), sort: (o) => o.startsOn },
    { label: t('alm.col.places'), cell: (o) => (o.slots === null ? fmt.number(o.signups.length) : `${fmt.number(o.signups.length)} / ${fmt.number(o.slots)}`), num: true },
    {
      label: t('alm.col.volunteers'),
      cell: (o) => (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {o.signups.map((s) => (
            <Button key={s.alumniId} size="small" disabled={pending} onClick={() => done(() => withdraw(o.id, s.alumniId))} title={t('alm.withdraw')}>
              {s.fullName} ×
            </Button>
          ))}
        </Stack>
      ),
    },
    { label: t('alm.col.status'), cell: (o) => <Pill label={t(`alm.oppStatus.${o.status}` as MessageKey)} warn={o.status === 'closed'} /> },
    {
      label: '',
      cell: (o) => (
        <Stack direction="row" spacing={0.5}>
          {o.status === 'open' && <Button size="small" onClick={() => setSigning(o)}>{t('alm.signUp')}</Button>}
          <Button size="small" onClick={() => setOpportunity(o)}>{t('alm.edit')}</Button>
        </Stack>
      ),
    },
  ];

  const campaignFields = (c?: CampaignRow): Field[] => [
    { name: 'name', label: t('alm.f.name'), required: true, init: c?.name },
    { name: 'description', label: t('alm.f.description'), kind: 'multiline', init: c?.description },
    { name: 'goal', label: t('alm.f.goal'), kind: 'rupees', init: c ? String(c.goalPaise / 100) : '' },
    { name: 'startsOn', label: t('alm.f.startsOn'), kind: 'date', init: c?.startsOn ?? '' },
    { name: 'endsOn', label: t('alm.f.endsOn'), kind: 'date', init: c?.endsOn ?? '' },
    { name: 'receiptNote', label: t('alm.f.receiptNote'), kind: 'multiline', init: c?.receiptNote },
    { name: 'status', label: t('alm.col.status'), kind: 'select', init: c?.status ?? 'active', options: [{ value: 'active', label: t('alm.status.active') }, { value: 'closed', label: t('alm.status.closed') }] },
  ];
  const today = new Date().toISOString().slice(0, 10);

  const tabs = [
    {
      id: 'campaigns',
      label: t('alm.tab.campaigns'),
      node: (
        <>
          <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} onClick={() => setCampaign('new')} data-testid="alm-new-campaign">{t('alm.newCampaign')}</Button>
          <Grid testId="alm-campaigns" empty={t('alm.empty.campaigns')} rows={campaigns} cols={campaignCols} />
        </>
      ),
    },
    { id: 'donations', label: t('alm.tab.donations'), node: <Grid testId="alm-donations" empty={t('alm.empty.donations')} rows={donations} cols={donationCols} exportName="alumni-donations" /> },
    ...(opportunities
      ? [
          {
            id: 'volunteering',
            label: t('alm.tab.volunteering'),
            node: (
              <>
                <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} onClick={() => setOpportunity('new')}>{t('alm.newOpportunity')}</Button>
                <Grid testId="alm-volunteering" empty={t('alm.empty.volunteering')} rows={opportunities} cols={oppCols} />
              </>
            ),
          },
        ]
      : []),
    ...(stories ? [{ id: 'stories', label: t('ssq.tab'), node: <SuccessStoriesQueue stories={stories} /> }] : []),
  ];

  return (
    <>
      <Tabbed label={t('nav.alumni')} initial={initialTab} tabs={tabs} />
      {campaign && <FormDialog title={campaign === 'new' ? t('alm.newCampaign') : t('alm.edit')} fields={campaignFields(campaign === 'new' ? undefined : campaign)} onSubmit={(v) => saveCampaign(v, campaign === 'new' ? undefined : campaign.id)} onClose={close} />}
      {pledge && (
        <FormDialog
          title={`${t('alm.pledge')}: ${pledge.name}`}
          fields={[
            { name: 'alumniId', label: t('alm.f.alumni'), kind: 'select', options: alumniOptions },
            { name: 'donorName', label: t('alm.f.donorName') },
            { name: 'amount', label: t('alm.f.amount'), kind: 'rupees', required: true },
            { name: 'pledgedOn', label: t('alm.f.pledgedOn'), kind: 'date', required: true, init: today },
            { name: 'dueOn', label: t('alm.f.dueOn'), kind: 'date' },
            { name: 'note', label: t('alm.f.note') },
          ]}
          onSubmit={(v) => recordPledge(pledge.id, v)}
          onClose={close}
        />
      )}
      {donate && (
        <FormDialog
          title={`${t('alm.donate')}: ${donate.name}`}
          fields={[
            { name: 'alumniId', label: t('alm.f.alumni'), kind: 'select', options: alumniOptions },
            { name: 'donorName', label: t('alm.f.donorName') },
            { name: 'donorPan', label: t('alm.f.pan') },
            { name: 'donorAddress', label: t('alm.f.address'), kind: 'multiline' },
            { name: 'amount', label: t('alm.f.amount'), kind: 'rupees', required: true },
            { name: 'mode', label: t('alm.f.mode'), kind: 'select', required: true, init: 'cash', options: modeOptions },
            { name: 'reference', label: t('alm.f.reference') },
            { name: 'receivedOn', label: t('alm.f.receivedOn'), kind: 'date', required: true, init: today },
            { name: 'note', label: t('alm.f.note') },
          ]}
          onSubmit={(v) => recordDonation(donate.id, v)}
          onClose={close}
        />
      )}
      {opportunity && (
        <FormDialog
          title={opportunity === 'new' ? t('alm.newOpportunity') : t('alm.edit')}
          fields={[
            { name: 'title', label: t('alm.f.title'), required: true, init: opportunity === 'new' ? '' : opportunity.title },
            { name: 'description', label: t('alm.f.description'), kind: 'multiline', init: opportunity === 'new' ? '' : opportunity.description },
            { name: 'startsOn', label: t('alm.f.startsOn'), kind: 'date', init: opportunity === 'new' ? '' : (opportunity.startsOn ?? '') },
            { name: 'slots', label: t('alm.f.slots'), kind: 'number', init: opportunity === 'new' || opportunity.slots === null ? '' : String(opportunity.slots) },
            { name: 'status', label: t('alm.col.status'), kind: 'select', init: opportunity === 'new' ? 'open' : opportunity.status, options: [{ value: 'open', label: t('alm.oppStatus.open') }, { value: 'closed', label: t('alm.oppStatus.closed') }] },
          ]}
          onSubmit={(v) => saveOpportunity(v, opportunity === 'new' ? undefined : opportunity.id)}
          onClose={close}
        />
      )}
      {signing && (
        <FormDialog
          title={`${t('alm.signUp')}: ${signing.title}`}
          fields={[
            { name: 'alumniId', label: t('alm.f.alumni'), kind: 'select', required: true, options: alumniOptions.slice(1) },
            { name: 'note', label: t('alm.f.note') },
          ]}
          onSubmit={(v) => signUp(signing.id, v)}
          onClose={close}
        />
      )}
      {toastNode}
    </>
  );
}
