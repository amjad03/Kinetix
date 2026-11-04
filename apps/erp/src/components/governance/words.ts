import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import type { Issue } from '@/lib/governance-pass';

/** A composition issue in the reader's language. */
export function issueWords(t: TFunction, i: Issue): string {
  switch (i.code) {
    case 'too_few_members':
      return t('gp.issue.too_few_members', { min: i.min ?? 0, actual: i.actual ?? 0 });
    case 'women_below':
      return t('gp.issue.women_below', { min: i.min ?? 0, actual: i.actual ?? 0 });
    case 'missing_category':
      return t('gp.issue.missing_category', { categories: (i.categories ?? []).map((c) => t(`gp.cat.${c}` as MessageKey)).join(' / ') });
    case 'tenure_too_long':
      return t('gp.issue.tenure_too_long', { member: i.member ?? '', years: i.years ?? 0, max: i.max ?? 0 });
    case 'gender_unknown':
      return t('gp.issue.gender_unknown', { n: i.count ?? 0 });
    default:
      return t(`gp.issue.${i.code}` as MessageKey);
  }
}
