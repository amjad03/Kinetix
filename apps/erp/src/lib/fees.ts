import 'server-only';
import type { FeeClass } from '@/components/fees/IssueFeeDialog';
import { api, ApiError } from './api';
import type { FeeSummary, Structure } from './types';

/**
 * Classes a fee can be issued to. The school structure (with student counts) is only open to
 * school leaders; the accounts office falls back to the classes that already have fees.
 */
export async function feeClasses(summary: FeeSummary | undefined): Promise<FeeClass[]> {
  try {
    const s = await api<Structure>('/v1/admin/structure');
    return s.sections.map((x) => ({ id: x.id, name: x.displayName, students: x.students }));
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 403) throw e;
    return (summary?.classes ?? []).map((c) => ({ id: c.sectionId, name: c.className, students: null }));
  }
}
