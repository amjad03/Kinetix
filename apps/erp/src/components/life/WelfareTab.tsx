'use client';

import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { AccommodationsList, DisciplineRegister, GrievanceRegister, RoutesList, UndertakingsList, WelfareRequestsList } from './WelfareLists';

/** The grievance and welfare list for a tab (the page loads its records on the server). */
export function WelfareTab({ tab, ...props }: { tab: string; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; sections: { id: string; name: string }[]; year: string }) {
  const p = { ...props, tab };
  switch (tab) {
    case 'routes':
      return <RoutesList {...p} />;
    case 'undertakings':
      return <UndertakingsList {...p} />;
    case 'accommodations':
      return <AccommodationsList {...p} />;
    case 'welfare':
      return <WelfareRequestsList {...p} />;
    case 'discipline':
      return <DisciplineRegister {...p} />;
    default:
      return <GrievanceRegister {...p} />;
  }
}
