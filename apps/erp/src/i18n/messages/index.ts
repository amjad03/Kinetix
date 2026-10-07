// The ERP dictionary: one file per area, each with English, Hindi and Kannada.
// See docs/i18n/erp.md for how to add strings.
import type { Locale } from '../locales';
import common from './common';
import admin from './admin';
import syllabus from './syllabus';
import library from './library';
import fees from './fees';
import boards from './boards';
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

import exams from './exams';
import obe from './obe';

import hr from './hr';
import documents from './documents';

export const AREAS = { common, admin, syllabus, library, fees, boards, messages, school, results, department, settings, calendar, today, plans, import: importArea, account, payments, terms, platform, ops, admissions, exams, obe, hr, documents, topicVideos } as const;
import topicVideos from './topic-videos';


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
