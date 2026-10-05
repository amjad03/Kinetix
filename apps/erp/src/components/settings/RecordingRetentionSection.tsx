import { ErrorState } from '@/components/States';
import { api, load } from '@/lib/api';
import type { RetentionOverview } from '@/lib/retention';
import { RecordingRetention } from './RecordingRetention';

/** Settings → Class recordings: the grace period after the semester, and what is deleted soon. Loads its own data. */
export async function RecordingRetentionSection() {
  const overview = await load(() => api<RetentionOverview>('/v1/admin/recordings/retention'));
  return overview.error !== undefined ? <ErrorState message={overview.error} /> : <RecordingRetention overview={overview.data} />;
}
