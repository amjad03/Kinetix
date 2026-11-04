import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import type { Disclosure } from '@/lib/governance-pass';

/**
 * The mandatory disclosure page as people read it: the institution, typed sections (approvals, fees, infrastructure),
 * programmes, statutory committees with their members and helplines, published policies and grievance figures.
 * Used for the office's preview and the public page alike.
 */
export function DisclosureView({ d, t, date, policyHref }: { d: Disclosure; t: TFunction; date: (iso: string) => string; policyHref?: (versionId: string) => string }) {
  const i = d.institution;
  const row = (label: string, value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? null : (
      <div className="grid gap-1 border-b border-border py-2 text-[13px] last:border-0 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]" key={label}>
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="m-0 break-words">{value}</dd>
      </div>
    );
  return (
    <div className="flex flex-col gap-6" data-testid="disclosure-view">
      <section>
        <h2 className="m-0 mb-2 text-[17px] font-semibold">{t('gp.dv.about')}</h2>
        {d.intro && <p className="m-0 mb-2 text-[13px] text-muted-foreground">{d.intro}</p>}
        <dl className="m-0">
          {row(t('gp.dv.name'), i.legalName || i.name)}
          {row(t('gp.dv.address'), i.address)}
          {row(t('gp.dv.contact'), [i.phone, i.email, i.website].filter(Boolean).join(' · '))}
          {row(t('gp.dv.established'), i.established)}
          {row(t('gp.dv.affiliation'), i.affiliation)}
          {row(t('gp.dv.aishe'), i.aisheCode)}
          {row(t('gp.dv.naac'), i.naacGrade)}
        </dl>
      </section>
      {d.sections.map((s) => (
        <section key={s.section}>
          <h2 className="m-0 mb-2 text-[17px] font-semibold">{t(`rk.o.disclosure-items.section.${s.section}` as MessageKey)}</h2>
          <dl className="m-0">
            {s.items.map((it) => (
              <div className="grid gap-1 border-b border-border py-2 text-[13px] last:border-0 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]" key={it.id}>
                <dt className="text-muted-foreground">{it.label}</dt>
                <dd className="m-0 break-words">
                  {it.value}
                  {it.url && (
                    <>
                      {it.value ? ' · ' : ''}
                      <a href={it.url} rel="noopener noreferrer" target="_blank">
                        {t('gp.dv.document')}
                      </a>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section>
        <h2 className="m-0 mb-2 text-[17px] font-semibold">{t('gp.dv.programmes')}</h2>
        {d.programmes.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">-</p>
        ) : (
          <ul className="m-0 list-disc pl-5 text-[13px]">
            {d.programmes.map((p) => (
              <li key={p.name}>{t('gp.dv.programme', { name: p.name, level: p.level.toUpperCase(), terms: p.terms })}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="m-0 mb-2 text-[17px] font-semibold">{t('gp.dv.committees')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {d.committees.map((c) => (
            <div key={c.name} className="rounded-[14px] border border-border bg-card p-4">
              <h3 className="m-0 text-[14px] font-semibold">{c.name}</h3>
              {c.basis && <p className="m-0 mt-0.5 text-[12px] text-muted-foreground">{c.kind !== 'other' ? t(`gp.basis.${c.kind}` as MessageKey) : c.basis}</p>}
              {(c.helpline || c.email) && <p className="m-0 mt-1 text-[13px]">{t('gp.dv.helpline', { contact: [c.helpline, c.email].filter(Boolean).join(' · ') })}</p>}
              <ul className="m-0 mt-2 list-none p-0 text-[13px]">
                {c.members.map((m, n) => (
                  <li key={n} className="mb-0.5">
                    {m.name}
                    <span className="text-muted-foreground">
                      {' '}
                      ({t(`gp.role.${m.role}` as MessageKey)}
                      {m.designation ? `, ${m.designation}` : ''}){m.phone ? ` · ${m.phone}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="m-0 mb-2 text-[17px] font-semibold">{t('gp.dv.policies')}</h2>
        {d.policies.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">-</p>
        ) : (
          <ul className="m-0 list-disc pl-5 text-[13px]">
            {d.policies.map((p) => (
              <li key={p.versionId}>
                {policyHref ? <a href={policyHref(p.versionId)}>{p.title}</a> : p.title} <span className="text-muted-foreground">({t('gp.dv.policyLine', { code: p.code, v: p.version, from: p.effectiveFrom ? date(p.effectiveFrom) : '-' })})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="m-0 mb-2 text-[17px] font-semibold">{t('gp.dv.grievances')}</h2>
        <p className="m-0 text-[13px]">{t('gp.dv.grievanceLine', { year: d.year.label, received: d.grievances.received, resolved: d.grievances.resolved, days: d.grievances.averageDays ?? '-' })}</p>
        {d.grievances.officers.length > 0 && <p className="m-0 mt-1 text-[13px]">{t('gp.dv.officers', { names: d.grievances.officers.map((o) => [o.name, o.email].filter(Boolean).join(', ')).join('; ') })}</p>}
      </section>
    </div>
  );
}
