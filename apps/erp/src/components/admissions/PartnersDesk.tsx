'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createAgent, payCommission, setAgentActive } from '@/app/(dashboard)/admissions/growth-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
export interface Agent {
  id: string;
  name: string;
  kind: 'agent' | 'partner';
  phone: string | null;
  email: string | null;
  referralCode: string;
  commissionPaise: number;
  active: boolean;
  enquiries: number;
  enrolled: number;
  accruedPaise: number;
  paidPaise: number;
}
export interface Commission {
  id: string;
  agentName: string;
  applicantName: string;
  applicationNo: string;
  amountPaise: number;
  status: 'accrued' | 'paid';
  paidOn: string | null;
}

const BLANK = { name: '', kind: 'agent' as 'agent' | 'partner', phone: '', email: '', commission: '0', code: '' };

/** Agents and referral partners with their codes, the enquiries they bring, and the commission ledger. */
export function PartnersDesk({ agents, commissions, today }: { agents: Agent[]; commissions: Commission[]; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState(BLANK);
  const money = (paise: number) => new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('ag.agent.new')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(3,1fr)] gap-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => createAgent({ name: f.name, kind: f.kind, phone: f.phone, email: f.email, commissionRupees: Number(f.commission), referralCode: f.code }), () => setF(BLANK));
          }}
        >
          <FormField label={t('ag.agent.name')} required>
            <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </FormField>
          <FormField label={t('ag.agent.kind')}>
            <TextInput select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'agent' | 'partner' })}>
              <MenuItem value="agent">{t('ag.agent.kind.agent')}</MenuItem>
              <MenuItem value="partner">{t('ag.agent.kind.partner')}</MenuItem>
            </TextInput>
          </FormField>
          <FormField label={t('ag.agent.commission')}>
            <TextInput type="number" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} />
          </FormField>
          <FormField label={t('ag.agent.phone')}>
            <TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </FormField>
          <FormField label={t('ag.agent.email')}>
            <TextInput type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField label={t('ag.agent.code')} helper={t('ag.agent.codeHelp')}>
            <TextInput value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          </FormField>
          <div>
            <Button type="submit" variant="contained" disabled={pending || f.name.trim().length < 2}>
              {t('ag.agent.create')}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-[12px] border bg-card overflow-x-auto">
        <Table size="small" data-testid="agents-table">
          <TableHead>
            <TableRow>
              <TableCell>{t('ag.agent.name')}</TableCell>
              <TableCell>{t('ag.agent.code')}</TableCell>
              <TableCell align="right">{t('ag.agent.commission')}</TableCell>
              <TableCell align="right">{t('ag.agent.col.enquiries')}</TableCell>
              <TableCell align="right">{t('ag.agent.col.enrolled')}</TableCell>
              <TableCell align="right">{t('ag.agent.col.owed')}</TableCell>
              <TableCell align="right">{t('ag.agent.col.paid')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {agents.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {a.name}
                  <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {t(`ag.agent.kind.${a.kind}` as MessageKey)}
                    {a.phone ? ` · ${a.phone}` : ''}
                  </div>
                </TableCell>
                <TableCell>
                  <code>{a.referralCode}</code>
                </TableCell>
                <TableCell align="right">{money(a.commissionPaise)}</TableCell>
                <TableCell align="right">{a.enquiries}</TableCell>
                <TableCell align="right">{a.enrolled}</TableCell>
                <TableCell align="right">{money(a.accruedPaise)}</TableCell>
                <TableCell align="right">{money(a.paidPaise)}</TableCell>
                <TableCell>
                  <Button size="small" disabled={pending} onClick={() => run(() => setAgentActive(a.id, !a.active))}>
                    {a.active ? <StatusPill tone="success">{t('ag.agent.active')}</StatusPill> : <StatusPill tone="neutral">{t('ag.agent.paused')}</StatusPill>}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {agents.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('ag.agent.none')}</p>}

      <div className="rounded-[12px] border bg-card overflow-x-auto">
        <div className="p-4 pb-0">
          <SectionTitle flush>{t('ag.comm.title')}</SectionTitle>
        </div>
        {commissions.length === 0 ? (
          <p className="text-sm leading-[21px] text-muted-foreground p-4">
            {t('ag.comm.none')}
          </p>
        ) : (
          <Table size="small" data-testid="commission-ledger">
            <TableHead>
              <TableRow>
                <TableCell>{t('ag.comm.col.student')}</TableCell>
                <TableCell>{t('ag.comm.col.agent')}</TableCell>
                <TableCell align="right">{t('ag.comm.col.amount')}</TableCell>
                <TableCell>{t('ag.comm.col.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.applicantName}
                    <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {c.applicationNo}
                    </div>
                  </TableCell>
                  <TableCell>{c.agentName}</TableCell>
                  <TableCell align="right">{money(c.amountPaise)}</TableCell>
                  <TableCell>{c.status === 'paid' ? <StatusPill tone="success">{t('ag.comm.paid')}</StatusPill> : <StatusPill tone="warning">{t('ag.comm.accrued')}</StatusPill>}</TableCell>
                  <TableCell>
                    {c.status === 'accrued' && (
                      <Button size="small" disabled={pending} onClick={() => run(() => payCommission(c.id, today))}>
                        {t('ag.comm.markPaid')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
