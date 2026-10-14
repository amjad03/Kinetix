'use client';

import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ActionInput } from '@/lib/records';
import { tr } from './text';

/** Whether every required value of a module action is filled in (and numbers are numbers). */
export function inputsReady(inputs: ActionInput[] | undefined, values: Record<string, string>): boolean {
  return (inputs ?? []).every((i) => {
    const v = (values[i.key] ?? '').trim();
    if (!v) return !i.required;
    return i.type === 'number' || i.type === 'money' ? Number.isFinite(Number(v)) && Number(v) >= 0 : true;
  });
}

/** The action's `params`: numbers as numbers, money from rupees to paise, empty values left out. */
export function actionParams(inputs: ActionInput[], values: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const i of inputs) {
    const v = (values[i.key] ?? '').trim();
    if (!v) continue;
    out[i.key] = i.type === 'number' ? Number(v) : i.type === 'money' ? Math.round(Number(v) * 100) : v;
  }
  return out;
}

/**
 * The values a module action asks for before it runs (a decision note, condonation points, a receipt number), with
 * the module's own words for them (`rk.input.<entity>.<action>.<key>`) when it has them.
 */
export function ActionInputs({ entity, action, inputs, values, onChange }: { entity: string; action: string; inputs: ActionInput[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3" data-testid="action-inputs">
      {inputs.map((i) => (
        <TextInput
          key={i.key}
          label={tr(t, `rk.input.${entity}.${action}.${i.key}`, i.label)}
          required={i.required}
          value={values[i.key] ?? ''}
          onChange={(e) => onChange({ ...values, [i.key]: e.target.value })}
          type={i.type === 'number' || i.type === 'money' ? 'number' : 'text'}
          multiline={i.type === 'textarea'}
          minRows={i.type === 'textarea' ? 2 : undefined}
          helper={i.help ? tr(t, `rk.inputHelp.${entity}.${action}.${i.key}`, i.help) : undefined}
          inputProps={{ 'data-testid': `action-input-${i.key}`, ...(i.type === 'money' ? { step: '0.01', min: 0 } : i.type === 'number' ? { min: 0 } : {}) }}
          fullWidth
        />
      ))}
    </div>
  );
}
