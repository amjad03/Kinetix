// Natural order for labels people read as numbered: Class 2 before Class 10, Sem 1…8, 7A before 7B.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compares two labels with their numbers read as numbers ("Class 2" < "Class 10"). */
export function naturalCompare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  return collator.compare(String(a ?? ''), String(b ?? ''));
}

/** A sorted copy of `list`, ordered naturally by `key`. */
export function naturalSortBy<T>(list: readonly T[], key: (x: T) => string | number | null | undefined): T[] {
  return [...list].sort((x, y) => naturalCompare(key(x), key(y)));
}
