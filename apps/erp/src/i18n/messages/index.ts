import type { Locale } from '../locales';
import common from './common';
import affiliation from './affiliation';
import admin from './admin';
import syllabus from './syllabus';
import academics from './academics';
import library from './library';
import fees from './fees';
import boards from './boards';
import devices from './devices';
import messages from './messages';
import school from './school';
import results from './results';
import department from './department';
import settings from './settings';
import calendar from './calendar';
import today from './today';
import plans from './plans';
import importArea from './import';
import account from './account';
import terms from './terms';
import payments from './payments';
import platform from './platform';
import ops from './ops';
import campusOps from './campus-ops';
import admissions from './admissions';
import admissionsGrowth from './admissions-growth';
import admissionsDepth from './admissions-depth';
import hrLifecycle from './hr-lifecycle';
import hrFlow from './hr-flow';
import assist from './assist';
import ui from './ui';
import dashboard from './dashboard';
import exams from './exams';
import evaluation from './evaluation';
import curriculum from './curriculum';
import g1 from './g1';
import privacy from './privacy';
import obe from './obe';
import hr from './hr';
import lms from './lms';
import finance from './finance';
import documents from './documents';
import docDesigns from './doc-designs';
import docEditor from './doc-editor';
import campus from './campus';
import insights from './insights';
import work from './work';
import campusLife from './campus-life';
import quality from './quality';
import courseRegistration from './course-registration';
import skills from './skills';
import workflows from './workflows';
import schoolLife from './school-life';
import topicVideos from './topic-videos';
import questionBank from './question-bank';
import lifecycleDeep from './lifecycle-deep';
import govern from './govern';
import integrations from './integrations';
import paymentsDesk from './payments-desk';
import institution from './institution';
import depth from './depth';

import pathwaysA from './pathways-a';
import pathwaysB from './pathways-b';
import scan from './scan';
import trainings from './trainings';
import accreditation from './accreditation';
import accreditationHub from './accreditation-hub';
import gatewayBooks from './gateway-books';

import governDepth from './govern-depth';
import university from './university';
import redesign from './redesign';
import v2 from './v2';
import admissionsExamsFlow from './admissions-exams-flow';
import examOffice from './exam-office';
import examCell from './exam-cell';
import homes from './homes';
import roster from './roster';
import workspace from './workspace';
import feeDesk from './fee-desk';
import ease from './ease';
import qualityHub from './quality-hub';
import workflowBuilder from './workflow-builder';
import records from './records';
import reportStudio from './report-studio';
import communication from './communication';
import studentInfo from './student-info';
import admissionsDesk from './admissions-desk';

import researchDepth from './research-depth';
import obeDepth from './obe-depth';
import iqacDepth from './iqac-depth';
import recordsDepth from './records-depth';

import feeDepth from './fee-depth';

import attendanceDesk from './attendance-desk';
import academicPlanning from './academic-planning';

import placementsDepth from './placements-depth';
import inventoryDepth from './inventory-depth';
import recordsCampusDepth from './records-campus-depth';

import governanceAccess from './governance-access';

import lht from './lht';

import lifeDepth from './life-depth';
import welfareDepth from './welfare-depth';
import lmsDepth from './lms-depth';
import commsDepth from './comms-depth';

import hrKit from './hr-kit';

import auditVerbs from './audit-verbs';
import feeHolds from './fee-holds';
import degrees from './degrees';
import kitRegisters from './kit-registers';

export const AREAS = { common, admin, syllabus, library, fees, boards, devices, messages, school, results, department, settings, calendar, today, plans, import: importArea, account, payments, terms, platform, ops, admissions, exams, obe, hr, documents, topicVideos, ui, dashboard, campus, insights, lms, finance, work, campusLife, skills, courseRegistration, quality, questionBank, workflows, evaluation, lifecycleDeep, schoolLife, govern, paymentsDesk, institution, privacy, curriculum, admissionsGrowth, hrLifecycle, hrFlow, assist, depth, g1, pathwaysA, pathwaysB, governDepth, scan, trainings, accreditation, accreditationHub, university, gatewayBooks, integrations, admissionsDepth, redesign, admissionsExamsFlow, homes, roster, workspace, academics, examOffice, feeDesk, v2, ease, campusOps, qualityHub, workflowBuilder, affiliation, records, reportStudio, communication, docDesigns, examCell, studentInfo, admissionsDesk, researchDepth, obeDepth, iqacDepth, recordsDepth, feeDepth, docEditor, attendanceDesk, academicPlanning, recordsCampusDepth, inventoryDepth, placementsDepth, governanceAccess, lht, lifeDepth, welfareDepth, lmsDepth, commsDepth, hrKit, auditVerbs, feeHolds, degrees, kitRegisters } as const;

// The ERP dictionary: one file per area, each with English, Hindi and Kannada.
// See docs/i18n/erp.md for how to add strings.

type Areas = typeof AREAS;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type English = UnionToIntersection<Areas[keyof Areas]['en']>;

export type MessageKey = keyof English & string;
export type Messages = Record<MessageKey, string>;
type PluralOf<K> = K extends `${infer B}_one` ? B : never;
/**
 * Keys with `_one` / `_other` forms, for `t.plural`. Worked out area by area: over the whole dictionary at once the
 * key union is too large for TypeScript to match against a template, and the type silently becomes `never`.
 */
export type PluralKey = { [A in keyof Areas]: PluralOf<keyof Areas[A]['en'] & string> }[keyof Areas];

function merge(locale: Locale): Messages {
  return Object.assign({}, ...Object.values(AREAS).map((a) => a[locale])) as Messages;
}

export const MESSAGES: Record<Locale, Messages> = { en: merge('en'), hi: merge('hi'), kn: merge('kn') };
