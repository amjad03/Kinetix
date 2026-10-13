import { asc, sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * ORDER BY terms that read a label's first number as a number: "Class 2" before "Class 10", "Sem 2"
 * before "Sem 10", 7A before 10A. Spread into orderBy: `.orderBy(...naturalAsc(sections.displayName))`.
 */
export function naturalAsc(col: AnyColumn | SQL): SQL[] {
  return [sql`substring(${col} from '^\\D*')`, sql`nullif(substring(${col} from '\\d+'), '')::numeric nulls first`, asc(col)];
}

/** The same order for rows already in memory. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a: string | null | undefined, b: string | null | undefined) => collator.compare(a ?? '', b ?? '');
