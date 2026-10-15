'use client';

import { BookOpenCheck, ClipboardList, Lightbulb, Users } from 'lucide-react';
import { useState } from 'react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { ProgramOutcome } from '@/lib/obe';
import { RatingsDialog } from './ObeDesks';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState };

const CO_COLUMNS: ColSpec[] = [
  { key: 'course', header: 'of.col.course', sortKey: false },
  { key: 'code', header: 'of.col.co', kind: 'strong' },
  { key: 'statement', header: 'of.col.statement', kind: 'wrap', sortKey: false },
  { key: 'bloomLevel', header: 'of.col.bloom', kind: 'choice', hideBelow: 'sm' },
  { key: 'version', header: 'of.col.version', kind: 'number', sortKey: false, hideBelow: 'md' },
  { key: 'status', header: 'of.col.status', kind: 'choice', sortKey: false, tone: (v) => (v === 'active' ? 'success' : v === 'draft' ? 'warning' : 'neutral') },
  { key: 'reviewStage', header: 'of.col.stage', kind: 'choice', sortKey: false, hideBelow: 'md' },
  { key: 'mapped', header: 'of.col.mappings', kind: 'number', sortKey: false, hideBelow: 'lg' },
  { key: 'program', header: 'of.col.programme', sortKey: false, defaultHidden: true },
];

/** Every course outcome of every course, with its Bloom level, version and approval state (edits only in drafts). */
export function CoRegister(p: Props) {
  return <KitList {...p} label="of.reg.title" columns={CO_COLUMNS} rowHref={(r) => `/obe/courses/${String(r.subjectId)}?tab=cos`} empty={{ icon: <BookOpenCheck />, title: 'of.reg.none', body: 'of.reg.noneBody' }} testId="of-co-register" />;
}

const GAP_COLUMNS: ColSpec[] = [
  { key: 'title', header: 'of.col.gap', kind: 'wrap' },
  { key: 'kind', header: 'of.col.kind', kind: 'choice', tone: (v) => (v === 'gap' ? 'warning' : 'info') },
  { key: 'program', header: 'of.col.programme', sortKey: false, hideBelow: 'md' },
  { key: 'course', header: 'of.col.course', sortKey: false, hideBelow: 'lg' },
  { key: 'method', header: 'of.col.method', kind: 'choice', hideBelow: 'md' },
  { key: 'heldOn', header: 'of.col.heldOn', kind: 'date' },
  { key: 'resourcePerson', header: 'of.col.resource', hideBelow: 'lg' },
  { key: 'beneficiaries', header: 'of.col.students', kind: 'number', hideBelow: 'lg' },
  { key: 'outcomeCodes', header: 'of.col.outcomes', kind: 'list', sortKey: false, hideBelow: 'sm' },
  { key: 'status', header: 'of.col.status', kind: 'choice', tone: (v) => (v === 'done' ? 'success' : 'warning') },
  { key: 'year', header: 'of.col.year', sortKey: false, defaultHidden: true },
  { key: 'description', header: 'of.col.description', kind: 'wrap', sortKey: false, defaultHidden: true },
];

/** Curricular gaps against the POs and content delivered beyond the syllabus (NBA criterion 2.1). */
export function GapsList(p: Props) {
  return <KitList {...p} label="of.gaps.title" columns={GAP_COLUMNS} empty={{ icon: <Lightbulb />, title: 'of.gaps.none', body: 'of.gaps.noneBody' }} testId="of-gaps" />;
}

const COORD_COLUMNS: ColSpec[] = [
  { key: 'userId', from: 'userIdName', header: 'of.col.person', kind: 'strong' },
  { key: 'role', header: 'of.col.role', kind: 'choice', tone: (v) => (v === 'coordinator' ? 'info' : 'neutral') },
  { key: 'program', header: 'of.col.programme', sortKey: false },
  { key: 'course', header: 'of.col.course', sortKey: false, hideBelow: 'sm' },
  { key: 'note', header: 'of.col.note', kind: 'wrap', sortKey: false, hideBelow: 'md' },
];

/** OBE coordinators of programmes and course coordinators of courses. */
export function CoordinatorsList(p: Props) {
  return <KitList {...p} label="of.coord.title" columns={COORD_COLUMNS} empty={{ icon: <Users />, title: 'of.coord.none', body: 'of.coord.noneBody' }} testId="of-coordinators" />;
}

const INSTRUMENT_COLUMNS: ColSpec[] = [
  { key: 'title', header: 'of.col.survey', kind: 'strong' },
  { key: 'kind', header: 'of.col.kind', kind: 'choice' },
  { key: 'program', header: 'of.col.programme', sortKey: false, hideBelow: 'sm' },
  { key: 'year', header: 'of.col.year', sortKey: false, hideBelow: 'md' },
  { key: 'ratings', header: 'of.col.ratings', kind: 'number', sortKey: false },
  { key: 'mean', header: 'of.col.mean', kind: 'number', sortKey: false },
  { key: 'scaleMax', header: 'of.col.scale', kind: 'number', hideBelow: 'lg' },
  { key: 'minResponses', header: 'of.col.minResponses', kind: 'number', hideBelow: 'lg' },
  { key: 'weight', header: 'of.col.weight', kind: 'number', defaultHidden: true },
];

/** The instruments list with "Enter ratings" on each row (pasted from a sheet, one line per respondent). */
export function InstrumentsWithRatings(p: Props & { outcomes: ProgramOutcome[] }) {
  const [rating, setRating] = useState<Row | null>(null);
  return (
    <>
      <InstrumentsList meta={p.meta} page={p.page} state={p.state} onRate={setRating} />
      <RatingsDialog open={!!rating} onClose={() => setRating(null)} survey={rating} outcomes={p.outcomes} />
    </>
  );
}

/** Indirect instruments entered as ratings: graduate exit, alumni and employer surveys, and paper course exit surveys. */
export function InstrumentsList(p: Props & { onRate?: (r: Row) => void }) {
  const { t } = useI18n();
  return (
    <KitList
      meta={p.meta}
      page={p.page}
      state={p.state}
      label="of.inst.title"
      columns={INSTRUMENT_COLUMNS}
      empty={{ icon: <ClipboardList />, title: 'of.inst.none', body: 'of.inst.noneBody' }}
      testId="of-instruments"
      rowActions={p.onRate ? (r) => [{ id: 'rate', label: t('of.inst.rate'), onSelect: () => p.onRate!(r) }] : undefined}
    />
  );
}
