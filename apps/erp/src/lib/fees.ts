import 'server-only';
import type { FeeClass } from '@/components/fees/IssueFeeDialog';
import { api } from './api';
import type { Structure } from './types';

/** Classes a fee can be issued to, with their active students (the accounts office can read the structure too). */
export async function feeClasses(): Promise<FeeClass[]> {
  const s = await api<Structure>('/v1/admin/structure');
  return s.sections.map((x) => ({ id: x.id, name: x.displayName, students: x.students }));
}
