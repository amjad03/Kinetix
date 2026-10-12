'use client';
import { useState, useTransition } from 'react';
import {
  assignSubstitute,
  cancelSubstitution,
  loadSubstitutions,
  suggestSubstitutes,
  type Candidate,
  type NeededPeriod,
  type SubstitutionRow,
} from '@/app/(dashboard)/timetable/substitution-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Button, Chip } from '@/components/kx';
/** Periods of teachers on approved leave that day: pick a free teacher of the same subject or department. */
export function SubstitutionsPanel({ today }: { today: string }) {
  const { t } = useI18n();
  const [date, setDate] = useState(today);
  const [needed, setNeeded] = useState<NeededPeriod[] | null>(null);
  const [assigned, setAssigned] = useState<SubstitutionRow[]>([]);
  const [suggest, setSuggest] = useState<{ slotId: string; list: Candidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = async (d: string) => {
    const res = await loadSubstitutions(d);
    if (!res.ok) return setError(res.error);
    setNeeded(res.data.needed);
    setAssigned(res.data.assigned);
    setSuggest(null);
  };
  const go = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      await fn();
    });
  const time = (a: string, b: string) => `${a.slice(0, 5)}-${b.slice(0, 5)}`;

  return (
    <div className="rounded-[12px] border bg-card p-5 mt-6" data-testid="substitutions">
      <SectionTitle flush>{t('sub.title')}</SectionTitle>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">
        {t('sub.help')}
      </p>
      {error && (
        <Alert className="mb-3" severity="error">
          {error}
        </Alert>
      )}
      <FormRow className="gap-2 mb-4">
        <FormField label={t('sub.date')}>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <Button variant="outlined" size="small" disabled={pending || !date} onClick={() => go(() => reload(date))}>
          {t('sub.show')}
        </Button>
      </FormRow>

      {needed && (
        <div className="flex flex-col gap-3">
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('sub.needed')}</h6>
          {needed.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('sub.none')}</p>}
          {needed.map((p) => (
            <div className="border border-border rounded-[10px] p-3" key={p.slotId}>
              <div className="flex flex-row items-center gap-2 flex-wrap">
                <p className="text-[13px] leading-[19px] flex-[1_1_220px]">
                  <strong>{time(p.startsAt, p.endsAt)}</strong> · {p.section} · {p.subject} · {t('sub.away', { name: p.teacher })}
                </p>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={pending}
                  onClick={() =>
                    go(async () => {
                      const res = await suggestSubstitutes(p.slotId, date);
                      if (res.ok) setSuggest({ slotId: p.slotId, list: res.data });
                      else setError(res.error);
                    })
                  }
                >
                  {t('sub.suggest')}
                </Button>
              </div>
              {suggest?.slotId === p.slotId && (
                <div className="flex flex-row mt-3 gap-2 flex-wrap">
                  {suggest.list.length === 0 && <p className="text-[13px] leading-[19px] text-muted-foreground">{t('sub.noFree')}</p>}
                  {suggest.list.map((c) => (
                    <Chip
                      key={c.id}
                      clickable
                      color={c.match === 'subject' ? 'primary' : 'default'}
                      label={`${c.fullName} · ${t(`sub.match.${c.match}` as MessageKey)} · ${t('sub.periods', { n: c.periodsThatDay })}`}
                      onClick={() =>
                        go(async () => {
                          const res = await assignSubstitute(p.slotId, date, c.id);
                          if (res.ok) await reload(date);
                          else setError(res.error);
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          <h6 className="text-sm leading-5 font-medium tracking-[0.1px] pt-2">
            {t('sub.assigned')}
          </h6>
          {assigned.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('sub.noneAssigned')}</p>}
          {assigned.map((a) => (
            <div className="flex flex-row items-center gap-2 flex-wrap" key={a.id}>
              <p className="text-[13px] leading-[19px] flex-[1_1_220px]">
                <strong>{time(a.startsAt, a.endsAt)}</strong> · {a.section.displayName} · {a.subject.name} · {a.originalTeacher} → {a.substituteTeacher}
              </p>
              <Button
                size="small"
                color="error"
                disabled={pending}
                onClick={() =>
                  go(async () => {
                    const res = await cancelSubstitution(a.id);
                    if (res.ok) await reload(date);
                    else setError(res.error);
                  })
                }
              >
                {t('sub.cancel')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
