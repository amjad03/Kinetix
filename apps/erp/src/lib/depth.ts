// The shared shape of the "depth" desks (exam operations, quality, HR extras, fees extras, assets, library, hostel, canteen, retention, mentoring):
// a server page describes panels (a table, forms and row actions) and one client component draws them.

export type CellKind = 'text' | 'date' | 'datetime' | 'paise' | 'pill' | 'yes' | 'num' | 'pct' | 'list' | 'link';
export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface Col {
  key: string;
  label: string;
  kind?: CellKind;
  /** For pills: the words shown for each value, and the colour. */
  words?: Record<string, string>;
  tones?: Record<string, Tone>;
  /** For links: the address, with `{id}` and other `{key}` filled from the row; the link text is the column's label unless `words.link` is given. */
  href?: string;
}

export type FieldType = 'text' | 'number' | 'paise' | 'date' | 'datetime' | 'select' | 'textarea' | 'bool' | 'lines';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  initial?: string;
  /** Sent as null when left blank (otherwise a blank field is left out). */
  nullable?: boolean;
  /** For `lines`: one entry per line, split on commas into these keys; `numeric` keys become numbers. */
  lines?: { keys: string[]; numeric: string[] };
  hint?: string;
}

export interface FormSpec {
  id: string;
  title: string;
  submit: string;
  method?: 'POST' | 'PUT';
  /** The API path; `{key}` is replaced by the value of the form field or panel context of that name. */
  path: string;
  fields: Field[];
  /** Fixed values added to the body. */
  extra?: Record<string, unknown>;
  /** Shown after a successful send: fields of the answer, for example the preview of a normalisation. */
  result?: { key: string; label: string }[];
  /** Fields that go into the path and not the body. */
  pathFields?: string[];
}

export interface RowAction {
  label: string;
  method?: 'POST' | 'PUT' | 'DELETE';
  /** `{id}` and other `{key}` are replaced from the row. */
  path: string;
  body?: Record<string, unknown>;
  /** Body fields taken from the row: body key to row key. */
  rowBody?: Record<string, string>;
  /** Show only when the row's value at `key` is one of these. */
  show?: { key: string; is: (string | boolean | null)[] };
  /** Ask for these before sending (a reason, an amount). */
  fields?: Field[];
  confirm?: string;
}

export interface Panel {
  id: string;
  title: string;
  hint?: string;
  columns: Col[];
  rows: Record<string, unknown>[];
  empty: string;
  forms?: FormSpec[];
  actions?: RowAction[];
  downloads?: { label: string; href: string }[];
  stats?: { label: string; value: string }[];
}

/** The paths the desks may call through the server action; anything else is refused. */
export const DEPTH_PATHS = /^\/v1\/(accreditation\/((naac|nba|nirf)\/metrics\/[A-Za-z0-9.]+(\/evidence)?|dvv(\/[0-9a-f-]{36})?|iqac\/(meetings(\/[0-9a-f-]{36}(\/actions)?)?|actions\/[0-9a-f-]{36}|practices(\/[0-9a-f-]{36})?|feedback-reports(\/[0-9a-f-]{36})?)|my-evidence|faculty-evidence\/[0-9a-f-]{36}\/verify)|question-bank\/(papers\/[0-9a-f-]{36}\/release(\/cancel)?|releases)|exam-sessions\/[0-9a-f-]{36}\/(practicals|request-publish)|practicals\/[0-9a-f-]{36}\/(marks|cancel)|exam-ops\/(normalise\/[0-9a-f-]{36}|normalisations\/[0-9a-f-]{36}\/revert|class-bands)|quality\/(frameworks(\/[0-9a-f-]{36}\/(criteria|harvest|status))?|criteria\/[0-9a-f-]{36}(\/evidence)?|actions\/[0-9a-f-]{36}\/(root-cause|remeasure)|eval-questions\/[0-9a-f-]{36}\/co|exam-papers\/[0-9a-f-]{36}\/apply-outcome-map)|hr\/(qualifications(\/[0-9a-f-]{36}(\/verify)?)?|evaluations|payroll\/(adjustments(\/[0-9a-f-]{36}\/decide|\/revision-arrears)?|tax-profile|challans))|fees\/(instalment-plans(\/[0-9a-f-]{36}\/active)?|invoices\/[0-9a-f-]{36}\/(instalments|apply-credit)|late-fee-rule|late-fees\/(run|[0-9a-f-]{36}\/waive)|credits(\/refund)?)|asset-ops\/(amc(\/[0-9a-f-]{36}\/(visit|cancel))?|assets\/[0-9a-f-]{36}\/(warranty|room)|smartboards\/[0-9a-f-]{36}\/link)|library\/(loans\/[0-9a-f-]{36}\/(renew|lost|damaged)|reservations(\/[0-9a-f-]{36}\/cancel)?|books\/barcodes\/assign|eresources(\/[0-9a-f-]{36}\/(retire|open))?|topic-links(\/[0-9a-f-]{36})?)|hostel\/work-orders(\/[0-9a-f-]{36}\/(assign|start|complete|verify))?|canteen\/ops\/(stock|feedback)|retention\/sensitive\/(rules\/[a-z_]+|run)|mentoring\/(plans\/[0-9a-f-]{36}\/(support|reassess)|support\/[0-9a-f-]{36}\/done))$/;

export const isDepthPath = (path: string) => !path.includes('?') && DEPTH_PATHS.test(path);

/** Fills `{key}` placeholders from a row or form values. */
export function fillPath(path: string, values: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(values[k] ?? '')));
}

/** Turns the text of the form fields into the JSON the API expects. Returns an error word key when a value cannot be read. */
export function formBody(fields: Field[], values: Record<string, string>, extra: Record<string, unknown> = {}, skip: string[] = []): { body: Record<string, unknown> } | { error: string } {
  const body: Record<string, unknown> = { ...extra };
  for (const f of fields) {
    if (skip.includes(f.name)) continue;
    const raw = (values[f.name] ?? '').trim();
    if (raw === '') {
      if (f.type === 'bool') put(body, f.name, false);
      else if (f.nullable) put(body, f.name, null);
      continue;
    }
    switch (f.type) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) return { error: f.name };
        put(body, f.name, n);
        break;
      }
      case 'paise': {
        const n = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) return { error: f.name };
        put(body, f.name, Math.round(n * 100));
        break;
      }
      case 'bool':
        put(body, f.name, raw === 'true');
        break;
      case 'datetime': {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return { error: f.name };
        put(body, f.name, d.toISOString());
        break;
      }
      case 'lines': {
        const spec = f.lines!;
        const out: Record<string, unknown>[] = [];
        for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const parts = line.split(',').map((x) => x.trim());
          if (parts.length < spec.keys.length) return { error: f.name };
          const item: Record<string, unknown> = {};
          for (const [i, key] of spec.keys.entries()) {
            if (spec.numeric.includes(key)) {
              const n = Number(parts[i]);
              if (!Number.isFinite(n)) return { error: f.name };
              item[key] = n;
            } else item[key] = parts[i];
          }
          out.push(item);
        }
        put(body, f.name, out);
        break;
      }
      default:
        put(body, f.name, raw);
    }
  }
  return { body };
}

/** Sets `a.b` inside the body as a nested object (the API takes scores and similar groups that way). */
function put(body: Record<string, unknown>, name: string, value: unknown) {
  const parts = name.split('.');
  let at = body;
  for (const p of parts.slice(0, -1)) at = (at[p] = (at[p] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  at[parts[parts.length - 1]] = value;
}
