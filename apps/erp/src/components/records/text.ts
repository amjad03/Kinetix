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

/** "offer_revoked" → "Offer revoked": the plain English for a verb the dictionary has no words for. */
export function humanVerb(verb: string): string {
  const words = verb.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : verb;
}

/**
 * "student.updated" → the history's words for it ("Edited"), from the central verb table (`rk.verb.<verb>` in
 * i18n/messages/audit-verbs.ts and records.ts). A bulk module action reads "In bulk: <its verb>"; a verb with no
 * words falls back to plain English ("Offer revoked"), never the raw action name.
 */
export function actionText(t: TFunction, action: string): string {
  const verb = action.replace(/\.v\d+$/, '').split('.').pop() || action;
  const word = (v: string) => tr(t, `rk.verb.${v}`, humanVerb(v));
  if (verb.startsWith('bulk_') && t(`rk.verb.${verb}` as MessageKey) === `rk.verb.${verb}`) return t('rk.verb.bulkAction', { action: word(verb.slice(5)) });
  return word(verb);
}

/** The bin's and history's name for a kind of record ("Students"). */
export const entityText = (t: TFunction, entity: string) => tr(t, `rk.entity.${entity}`, entity);
export const moduleText = (t: TFunction, module: string) => tr(t, `rk.module.${module}`, module);
