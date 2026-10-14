/**
 * The document layout contract, straight from packages/shared/src/doc-layout.ts (types and Zod
 * schemas), so the editor validates exactly what the API will accept.
 */
export * from '../../../../../packages/shared/src/doc-layout';

/** A document's data: nested values and lists, read by `{{path}}` bindings and table sources. */
export type DocData = { [key: string]: DocValue };
export type DocValue = string | number | boolean | null | DocData | DocData[];

/** One binding a template can use (GET /v1/documents/designs/bindings/:docType). */
export interface DocBinding {
  key: string;
  label: string;
  kind: 'value' | 'list';
  sample: string;
  itemKeys?: string[];
}

/** Points per millimetre. */
export const MM = 72 / 25.4;
