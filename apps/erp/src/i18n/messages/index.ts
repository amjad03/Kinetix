import type { Locale } from '../locales';
import common from './common';
import admin from './admin';
import syllabus from './syllabus';
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
import admissions from './admissions';
import ui from './ui';
import dashboard from './dashboard';
import exams from './exams';
import evaluation from './evaluation';
import privacy from './privacy';
import obe from './obe';
import hr from './hr';
import lms from './lms';
import finance from './finance';
import documents from './documents';
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
import paymentsDesk from './payments-desk';
import institution from './institution';

export const AREAS = { common, admin, syllabus, library, fees, boards, devices, messages, school, results, department, settings, calendar, today, plans, import: importArea, account, payments, terms, platform, ops, admissions, exams, obe, hr, documents, topicVideos, ui, dashboard, campus, insights, lms, finance, work, campusLife, skills, courseRegistration, quality, questionBank, workflows, evaluation, lifecycleDeep, schoolLife, govern, paymentsDesk, institution, privacy } as const;

// The ERP dictionary: one file per area, each with English, Hindi and Kannada.
// See docs/i18n/erp.md for how to add strings.





type Areas = typeof AREAS;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type English = UnionToIntersection<Areas[keyof Areas]['en']>;

export type MessageKey = keyof English & string;
export type Messages = Record<MessageKey, string>;
/** Keys with `_one` / `_other` forms, for `t.plural`. */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

function merge(locale: Locale): Messages {
  return Object.assign({}, ...Object.values(AREAS).map((a) => a[locale])) as Messages;
}

export const MESSAGES: Record<Locale, Messages> = { en: merge('en'), hi: merge('hi'), kn: merge('kn') };
