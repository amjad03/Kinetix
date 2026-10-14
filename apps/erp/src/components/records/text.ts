import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import type { FieldOption } from '@/lib/records';

/**
 * Words for things the API names in English (field labels, filter labels, fixed choices): the ERP's own string
 * `rk.f.<entity>.<field>`, `rk.filter.<entity>.<filter>` or `rk.o.<entity>.<key>.<value>` when it has one, or the
 * API's English. A module adding an entity adds those keys to i18n/messages/records.ts.
 */
export function tr(t: TFunction, key: string, fallback: string): string {
  const v = t(key as MessageKey);
  return v === key ? fallback : v;
}

export const fieldText = (t: TFunction, entity: string, field: { key: string; label: string }) => tr(t, `rk.f.${entity}.${field.key}`, field.label);
export const filterText = (t: TFunction, entity: string, filter: { key: string; label: string }) => tr(t, `rk.filter.${entity}.${filter.key}`, filter.label);
export const optionText = (t: TFunction, entity: string, key: string, o: FieldOption) => tr(t, `rk.o.${entity}.${key}.${o.value}`, key === 'role' ? tr(t, `role.${o.value}`, o.label) : o.label);

/** The options of a field or filter in the person's language. */
export const options = (t: TFunction, entity: string, key: string, list: FieldOption[] | null | undefined): FieldOption[] => (list ?? []).map((o) => ({ ...o, label: optionText(t, entity, key, o) }));

/** "student.updated" → the history's words for it ("Edited"). */
export function actionText(t: TFunction, action: string): string {
  const verb = action.replace(/\.v\d+$/, '').split('.').pop() ?? action;
  return tr(t, `rk.verb.${verb}`, action);
}

/** The bin's and history's name for a kind of record ("Students"). */
export const entityText = (t: TFunction, entity: string) => tr(t, `rk.entity.${entity}`, entity);
export const moduleText = (t: TFunction, module: string) => tr(t, `rk.module.${module}`, module);
