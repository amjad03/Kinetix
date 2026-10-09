'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { campaignDetail, cancelCampaign, createCampaign, previewAudience, removeAudience, runDue, saveAudience, saveTemplate } from '@/app/(dashboard)/communication/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useLoad } from '@/components/pathways-b/common';
import { CheckboxField, Dialog, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { AUDIENCE_ROLES, CHANNELS, LOCALES_OFFERED, type AudienceRow, type CampaignDetail, type CampaignRow, type MessageTemplate } from '@/lib/pathways-b';

type Section = { value: string; label: string };

/** Templates, audiences and campaigns of the communication engine. */
export function CommsDesk({ templates, audiences, campaigns, sections, initialTab }: { templates: MessageTemplate[]; audiences: AudienceRow[]; campaigns: CampaignRow[]; sections: Section[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [tpl, setTpl] = useState<MessageTemplate | 'new' | null>(null);
  const [aud, setAud] = useState(false);
  const [camp, setCamp] = useState(false);
  const [detail, setDetail] = useState<CampaignRow | null>(null);
  const done = (m?: string) => {
    setTpl(null);
    setAud(false);
    setCamp(false);
    if (m) toast(m);
  };
  const tplName = (x: MessageTemplate) => `${x.key} · ${t(`pwb.ch.${x.channel}` as MessageKey)} · ${t(`pwb.lang.${x.locale}` as MessageKey)}`;
  const roleLabels = (rule: AudienceRow['rule']) => [
    ...(rule.roles ?? []).map((r) => t(`pwb.aud.${r}` as MessageKey)),
    ...(rule.sectionIds?.length ? [t('pwb.comms.nClasses', { n: rule.sectionIds.length })] : []),
    ...(rule.userIds?.length ? [t('pwb.comms.nPeople', { n: rule.userIds.length })] : []),
  ];
  const sectionName = (id: string) => sections.find((s) => s.value === id)?.label ?? id;
  const statusPill = (s: string) => <Pill label={t(`pwb.comms.status.${s}` as MessageKey)} warn={s === 'failed' || s === 'cancelled'} />;

  const tplFields = (x: MessageTemplate | null): Field[] => [
    ...(x ? [] : [{ name: 'key', label: t('pwb.comms.key'), required: true } satisfies Field]),
    ...(x ? [] : [{ name: 'channel', label: t('pwb.comms.channel'), kind: 'select', required: true, init: 'in_app', options: CHANNELS.map((c) => ({ value: c, label: t(`pwb.ch.${c}` as MessageKey) })) } satisfies Field]),
    ...(x ? [] : [{ name: 'locale', label: t('pwb.comms.language'), kind: 'select', init: 'en', options: LOCALES_OFFERED.map((l) => ({ value: l, label: t(`pwb.lang.${l}` as MessageKey) })) } satisfies Field]),
    { name: 'subject', label: t('pwb.comms.subject'), init: x?.subject },
    { name: 'body', label: t('pwb.comms.body'), kind: 'multiline', required: true, init: x?.body },
    { name: 'dltTemplateId', label: t('pwb.comms.dlt'), init: x?.dltTemplateId ?? '' },
    { name: 'active', label: t('pwb.comms.active'), kind: 'select', init: x && !x.active ? 'no' : 'yes', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
  ];

  const tabs = [
    {
      id: 'templates',
      label: t('pwb.comms.tab.templates', { n: templates.length }),
      node: (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>{t('pwb.comms.channelNotes')}</Alert>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setTpl('new')} data-testid="comms-new-template">{t('pwb.comms.newTemplate')}</Button>
          </Bar>
          <Grid
            testId="comms-templates"
            empty={t('pwb.comms.noTemplates')}
            rows={templates}
            cols={[
              { label: t('pwb.comms.key'), cell: (x) => x.key, sort: (x) => x.key },
              { label: t('pwb.comms.channel'), cell: (x) => t(`pwb.ch.${x.channel}` as MessageKey), sort: (x) => x.channel },
              { label: t('pwb.comms.language'), cell: (x) => t(`pwb.lang.${x.locale}` as MessageKey), sort: (x) => x.locale },
              { label: t('pwb.comms.subject'), cell: (x) => x.subject || '-' },
              { label: t('pwb.comms.placeholders'), cell: (x) => (x.placeholders.length ? x.placeholders.map((p) => `{{${p}}}`).join(' ') : '-') },
              { label: t('pwb.comms.dlt'), cell: (x) => (x.channel === 'sms' ? (x.dltTemplateId ?? <Pill warn label={t('pwb.comms.dltMissing')} />) : '-') },
              { label: t('ops.f.status'), cell: (x) => <Pill label={x.active ? t('pwb.ret.on') : t('pwb.ret.off')} warn={!x.active} /> },
              { label: '', cell: (x) => <Button size="small" onClick={() => setTpl(x)}>{t('ops.edit')}</Button> },
            ]}
          />
        </>
      ),
    },
    {
      id: 'audiences',
      label: t('pwb.comms.tab.audiences', { n: audiences.length }),
      node: (
        <>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setAud(true)} data-testid="comms-new-audience">{t('pwb.comms.newAudience')}</Button>
          </Bar>
          <Grid
            testId="comms-audiences"
            empty={t('pwb.comms.noAudiences')}
            rows={audiences}
            cols={[
              { label: t('ops.f.name'), cell: (a) => a.name, sort: (a) => a.name },
              { label: t('pwb.comms.who'), cell: (a) => [...roleLabels(a.rule), ...(a.rule.sectionIds ?? []).slice(0, 3).map(sectionName)].join(', ') },
              { label: '', cell: (a) => <ActionButton tone="error" label={t('pwb.delete')} run={() => removeAudience(a.id)} onDone={toast} /> },
            ]}
          />
        </>
      ),
    },
    {
      id: 'campaigns',
      label: t('pwb.comms.tab.campaigns', { n: campaigns.length }),
      node: (
        <>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setCamp(true)} disabled={templates.length === 0 || audiences.length === 0} data-testid="comms-new-campaign">{t('pwb.comms.newCampaign')}</Button>
            <Button
              variant="outlined"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await runDue();
                  toast(res.ok ? t('pwb.comms.ran', { campaigns: res.data.campaigns, retried: res.data.retried }) : res.error);
                })
              }
              data-testid="comms-run"
            >
              {t('pwb.comms.runDue')}
            </Button>
          </Bar>
          {(templates.length === 0 || audiences.length === 0) && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pwb.comms.needFirst')}</Typography>}
          <Grid
            testId="comms-campaigns"
            empty={t('pwb.comms.noCampaigns')}
            rows={campaigns}
            cols={[
              { label: t('ops.f.title'), cell: (c) => c.title, sort: (c) => c.title },
              { label: t('pwb.comms.channel'), cell: (c) => t(`pwb.ch.${c.channel}` as MessageKey), sort: (c) => c.channel },
              { label: t('pwb.comms.audience'), cell: (c) => c.audience },
              { label: t('pwb.comms.sendAt'), cell: (c) => fmt.dateTime(c.sendAt), sort: (c) => c.sendAt },
              { label: t('ops.f.status'), cell: (c) => statusPill(c.status), sort: (c) => c.status },
              { label: t('pwb.comms.recipients'), cell: (c) => fmt.number(c.recipients), num: true, sort: (c) => c.recipients },
              { label: t('pwb.comms.sent'), cell: (c) => fmt.number(c.sentCount), num: true, sort: (c) => c.sentCount },
              { label: t('pwb.comms.failed'), cell: (c) => fmt.number(c.failedCount), num: true, sort: (c) => c.failedCount },
              { label: '', cell: (c) => <Button size="small" onClick={() => setDetail(c)}>{t('ops.details')}</Button> },
            ]}
          />
        </>
      ),
    },
  ];

  return (
    <>
      <Tabbed label={t('nav.comms')} initial={initialTab} tabs={tabs} />
      {tpl && (
        <FormDialog
          title={tpl === 'new' ? t('pwb.comms.newTemplate') : tplName(tpl)}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.comms.templateHelp', { example: '{{name}}' })}</Typography>}
          onSubmit={(v) => saveTemplate(v, tpl === 'new' ? undefined : tpl.id)}
          onClose={done}
          fields={tplFields(tpl === 'new' ? null : tpl)}
        />
      )}
      {aud && <AudienceDialog sections={sections} onClose={done} />}
      {camp && (
        <FormDialog
          title={t('pwb.comms.newCampaign')}
          intro={
            <>
              <Typography variant="body2" color="text.secondary">{t('pwb.comms.campaignHelp')}</Typography>
              {templates.some((x) => x.placeholders.length > 0) && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {templates.filter((x) => x.placeholders.length > 0).map((x) => `${tplName(x)}: ${x.placeholders.join(', ')}`).join(' | ')}
                </Typography>
              )}
            </>
          }
          onSubmit={createCampaign}
          onClose={done}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'templateId', label: t('pwb.comms.template'), kind: 'select', required: true, options: templates.filter((x) => x.active).map((x) => ({ value: x.id, label: tplName(x) })) },
            { name: 'audienceId', label: t('pwb.comms.audience'), kind: 'select', required: true, options: audiences.map((a) => ({ value: a.id, label: a.name })) },
            { name: 'vars', label: t('pwb.comms.vars'), kind: 'multiline' },
            { name: 'sendAt', label: t('pwb.comms.sendAtOptional'), kind: 'datetime' },
          ]}
        />
      )}
      {detail && <CampaignDialog campaign={detail} onClose={() => setDetail(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

/** Roles, classes and typed ids that make an audience, with a count of the people it reaches before it is saved. */
function AudienceDialog({ sections, onClose }: { sections: Section[]; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [ids, setIds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const flip = (list: string[], set: (l: string[]) => void, v: string, on: boolean) => {
    set(on ? [...list, v] : list.filter((x) => x !== v));
    setSize(null);
  };
  const preview = () =>
    start(async () => {
      const res = await previewAudience(roles, classes, ids);
      if (res.ok) {
        setError(null);
        setSize(res.data.size);
      } else setError(res.error);
    });
  const save = () => {
    if (name.trim().length < 2) return setError(t('ops.err.field', { field: t('ops.f.name') }));
    start(async () => {
      const res = await saveAudience(name.trim(), roles, classes, ids);
      if (res.ok) onClose(t('ops.saved'));
      else setError(res.error);
    });
  };
  return (
    <Dialog
      title={t('pwb.comms.newAudience')}
      size="md"
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>{t('ops.cancel')}</Button>
          <Button onClick={preview} disabled={pending}>{t('pwb.comms.preview')}</Button>
          <Button variant="contained" onClick={save} disabled={pending} startIcon={pending ? <CircularProgress size={16} /> : undefined} data-testid="ops-submit">{t('ops.save')}</Button>
        </>
      }
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        <FormField label={t('ops.f.name')} required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} fullWidth data-testid="f-name" />
        </FormField>
        <Box>
          <Typography variant="subtitle2">{t('pwb.comms.roles')}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {AUDIENCE_ROLES.map((r) => (
              <CheckboxField key={r} label={t(`pwb.aud.${r}` as MessageKey)} checked={roles.includes(r)} onChange={(on) => flip(roles, setRoles, r, on)} />
            ))}
          </Box>
        </Box>
        {sections.length > 0 && (
          <Box>
            <Typography variant="subtitle2">{t('pwb.comms.classes')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', maxHeight: 180, overflow: 'auto' }}>
              {sections.map((s) => (
                <CheckboxField key={s.value} label={s.label} checked={classes.includes(s.value)} onChange={(on) => flip(classes, setClasses, s.value, on)} />
              ))}
            </Box>
          </Box>
        )}
        <FormField label={t('pwb.comms.userIds')}>
          <TextInput value={ids} onChange={(e) => { setIds(e.target.value); setSize(null); }} multiline minRows={2} fullWidth />
        </FormField>
        <Typography variant="caption" color="text.secondary">{t('pwb.comms.audienceHelp')}</Typography>
        {size !== null && <Alert severity="info" data-testid="comms-audience-size">{t('pwb.comms.reaches', { n: size })}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

/** Delivery counts and the failed deliveries of one campaign; a scheduled one can be cancelled. */
function CampaignDialog({ campaign, onClose, toast }: { campaign: CampaignRow; onClose: () => void; toast: (m: string) => void }) {
  const { t, fmt } = useI18n();
  const detail = useLoad<CampaignDetail>(() => campaignDetail(campaign.id));
  const d = detail.data;
  return (
    <InfoDialog title={campaign.title} onClose={onClose}>
      {detail.error && <Typography color="error">{detail.error}</Typography>}
      {d && (
        <Stack spacing={2} data-testid="comms-campaign-detail">
          <Typography variant="body2">
            {t('pwb.comms.detailLine', { channel: t(`pwb.ch.${d.channel}` as MessageKey), key: d.templateKey, audience: campaign.audience, when: fmt.dateTime(d.sendAt) })}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill label={t(`pwb.comms.status.${d.status}` as MessageKey)} warn={d.status === 'failed' || d.status === 'cancelled'} />
            <Typography variant="body2">{t('pwb.comms.counts', { recipients: d.recipients, sent: d.sentCount, failed: d.failedCount })}</Typography>
          </Stack>
          {Object.keys(d.delivery).length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {Object.entries(d.delivery).map(([k, n]) => `${t(`pwb.comms.delivery.${k}` as MessageKey)}: ${fmt.number(n)}`).join(' · ')}
            </Typography>
          )}
          <Typography variant="subtitle2">{t('pwb.comms.failures')}</Typography>
          <Grid
            testId="comms-failures"
            empty={t('pwb.comms.noFailures')}
            rows={d.failures}
            cols={[
              { label: t('ops.f.name'), cell: (f) => f.fullName, sort: (f) => f.fullName },
              { label: t('pwb.comms.error'), cell: (f) => f.error ?? '-' },
              { label: t('pwb.comms.attempts'), cell: (f) => f.attempts, num: true },
              { label: t('pwb.comms.nextTry'), cell: (f) => (f.nextAttemptAt ? fmt.dateTime(f.nextAttemptAt) : '-') },
            ]}
          />
          {d.status === 'scheduled' && (
            <Box>
              <ActionButton
                tone="error"
                label={t('pwb.comms.cancel')}
                run={() => cancelCampaign(d.id)}
                onDone={(m) => {
                  toast(m);
                  detail.reload();
                }}
              />
            </Box>
          )}
        </Stack>
      )}
    </InfoDialog>
  );
}
