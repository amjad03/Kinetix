import 'server-only';
import type { Lookups, Opt, TabData } from '@/components/g1/ConfigDesk';
import { api, load } from '@/lib/api';
import { fillPath, getPath, type DeskSpec } from '@/lib/g1-desk';
import type { Structure } from '@/lib/types';

type Row = Record<string, unknown>;
type Answer = unknown;

/** Reshapes answers that are not a plain list. */
function shape(kind: string | undefined, answer: Answer): Row[] {
  const a = answer as Row;
  if (kind === 'single') return a && typeof a === 'object' ? [a] : [];
  if (kind === 'setup') {
    const rules = (a.governanceRules ?? {}) as Row;
    const policy = (a.aiPolicy ?? {}) as Row;
    const comms = Object.entries((a.commsChannels ?? {}) as Record<string, boolean>).filter(([, on]) => on).map(([k]) => k);
    const rows: [string, unknown][] = [
      ['institutionType', a.institutionType],
      ['structureModel', a.structureModel],
      ['governanceModel', a.governanceModel],
      ['syllabusAuthority', rules.syllabusAuthority],
      ['ownExams', rules.ownExams === undefined ? null : rules.ownExams ? 'yes' : 'no'],
      ['ownDegree', rules.ownDegree === undefined ? null : rules.ownDegree ? 'yes' : 'no'],
      ['feeModel', a.feeModel],
      ['qualityFramework', a.qualityFramework],
      ['languages', Array.isArray(a.languages) ? (a.languages as string[]).join(', ') : null],
      ['presetKey', a.presetKey],
      ['aiPolicy', policy.enabled === undefined ? null : policy.enabled ? 'yes' : 'no'],
      ['channels', comms.join(', ')],
      ['terminology', Object.keys((a.terminology ?? {}) as object).length || null],
    ];
    return rows.map(([item, value]) => ({ item, value: value === null || value === undefined || value === '' ? '-' : String(value) }));
  }
  if (kind === 'hierarchy') {
    const out: Row[] = [];
    type Fac = { id: string; code: string; name: string; kind: string; dean: string | null; departments: { name: string }[] };
    const push = (institution: string, f: Fac) => out.push({ id: f.id, institution, code: f.code, name: f.name, kind: f.kind, dean: f.dean, departments: f.departments.map((d) => d.name) });
    for (const i of (a.institutions ?? []) as { name: string; faculties: Fac[] }[]) for (const f of i.faculties) push(i.name, f);
    for (const f of (a.central ?? []) as Fac[]) push('-', f);
    return out;
  }
  return [];
}

/** The rows of every tab of a desk, loaded together; a tab that waits for a filter says which. */
export async function loadDesk(spec: DeskSpec, filters: Record<string, string>): Promise<TabData[]> {
  return Promise.all(
    spec.tabs.map(async (tab): Promise<TabData> => {
      const missing = (tab.needs ?? []).filter((k) => !filters[k]);
      if (missing.length) return { id: tab.id, rows: [], missing };
      if (!tab.load) return { id: tab.id, rows: [] };
      const path = fillPath(tab.load, null, filters);
      if (path.includes('{')) return { id: tab.id, rows: [], missing: ['filter'] };
      const res = await load(() => api<Answer>(path));
      if (res.error !== undefined) return { id: tab.id, rows: [], error: res.error };
      if (tab.shape) return { id: tab.id, rows: shape(tab.shape, res.data) };
      const picked = tab.rows ? getPath(res.data, tab.rows) : res.data;
      return { id: tab.id, rows: Array.isArray(picked) ? (picked as Row[]) : [] };
    }),
  );
}

export interface DeskLookups {
  lookups: Lookups;
  filterOptions: Record<string, Opt[]>;
  /** Filters filled in: the URL's value, else the first option when the filter asks for it. */
  filters: Record<string, string>;
}

/** Class, programme, campus, year, department, cycle and course pickers for forms and filters. */
export async function loadLookups(spec: DeskSpec, search: Record<string, string | undefined>): Promise<DeskLookups> {
  const wantsDepartments = spec.tabs.some((t) => t.actions.some((a) => a.fields.some((f) => f.optionsFrom === 'departments')));
  const [structure, cycles, courses, departments] = await Promise.all([
    load(() => api<Structure>('/v1/admin/structure')),
    spec.filters.some((f) => f.from === 'cycles') ? load(() => api<{ id: string; name: string; programName: string }[]>('/v1/admissions/cycles')) : Promise.resolve(null),
    spec.filters.some((f) => f.from === 'courses') ? load(() => api<{ id: string; title: string; section: string; subject: string }[]>('/v1/lms/courses')) : Promise.resolve(null),
    wantsDepartments ? load(() => api<{ id: string; name: string }[]>('/v1/admin/departments')) : Promise.resolve(null),
  ]);
  const s = structure.data;
  const sections: Opt[] = (s?.sections ?? []).map((x) => ({ value: x.id, label: x.displayName }));
  const years: Opt[] = (s?.academicYears ?? []).map((x) => ({ value: x.id, label: x.label }));
  const lookups: Lookups = {
    sections,
    years,
    programs: (s?.programs ?? []).map((x) => ({ value: x.id, label: x.name })),
    campuses: (s?.campuses ?? []).map((x) => ({ value: x.id, label: x.name })),
    departments: (departments?.data ?? []).map((x) => ({ value: x.id, label: x.name })),
  };
  const filterOptions: Record<string, Opt[]> = {};
  const filters: Record<string, string> = {};
  for (const f of spec.filters) {
    const opts: Opt[] =
      f.from === 'sections' ? sections : f.from === 'years' ? years : f.from === 'cycles' ? (cycles?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.programName})` })) : f.from === 'courses' ? (courses?.data ?? []).map((c) => ({ value: c.id, label: `${c.section} · ${c.subject}` })) : [];
    filterOptions[f.param] = opts;
    const chosen = search[f.param];
    filters[f.param] = chosen !== undefined ? chosen : f.first ? (f.from === 'static' ? (f.options?.[0]?.value ?? '') : f.from === 'years' ? (s?.academicYears.find((y) => y.isCurrent)?.id ?? years[0]?.value ?? '') : (opts[0]?.value ?? '')) : '';
  }
  return { lookups, filterOptions, filters };
}
