'use client';

import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { AchievementsList, ClaimsList, ClubsList, CommitteesList, ElectionsList, EventsList, OutreachList, UnitsList } from './CampusLists';

/** The campus life list for a tab (the page loads its records on the server). */
export function CampusLifeTab({ tab, ...props }: { tab: string; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; sections: { id: string; name: string }[] }) {
  const p = { ...props, tab };
  switch (tab) {
    case 'committees':
      return <CommitteesList {...p} />;
    case 'events':
      return <EventsList {...p} />;
    case 'units':
      return <UnitsList {...p} />;
    case 'achievements':
      return <AchievementsList {...p} />;
    case 'outreach':
      return <OutreachList {...p} />;
    case 'claims':
      return <ClaimsList {...p} />;
    case 'elections':
      return <ElectionsList {...p} />;
    default:
      return <ClubsList {...p} />;
  }
}
