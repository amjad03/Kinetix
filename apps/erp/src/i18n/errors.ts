import type { MessageKey } from './messages';
import type { TFunction } from './translate';

/**
 * API error codes (services/api/src/common/error-codes.ts) the ERP words itself, in the user's
 * language. Codes the ERP can meet: login, calendar, live view, marks, attendance, and the
 * generic HTTP ones.
 */
export const ERROR_KEYS: Record<string, MessageKey> = {
  AUTH_WRONG_LOGIN: 'error.AUTH_WRONG_LOGIN',
  AUTH_INACTIVE: 'error.AUTH_INACTIVE',
  CALENDAR_BAD_RANGE: 'error.CALENDAR_BAD_RANGE',
  LIVE_NOT_ALLOWED: 'error.LIVE_NOT_ALLOWED',
  LIVE_VIEW_OFF: 'error.LIVE_VIEW_OFF',
  LIVE_BOARD_OFFLINE: 'error.LIVE_BOARD_OFFLINE',
  MARKS_EMPTY: 'error.MARKS_EMPTY',
  NOT_YOUR_CLASS: 'error.NOT_YOUR_CLASS',
  SUBJECT_NOT_IN_CLASS: 'error.SUBJECT_NOT_IN_CLASS',
  ATTENDANCE_FUTURE_DATE: 'error.ATTENDANCE_FUTURE_DATE',
  PLAN_REVIEW_NOT_ALLOWED: 'error.PLAN_REVIEW_NOT_ALLOWED',
  PLAN_NO_SYLLABUS: 'error.PLAN_NO_SYLLABUS',
  PLAN_NO_PERIODS: 'error.PLAN_NO_PERIODS',
  PLAN_NO_TEACHING_DAYS: 'error.PLAN_NO_TEACHING_DAYS',
  PLAN_BAD_RANGE: 'error.PLAN_BAD_RANGE',
  PERIOD_WRONG_DAY: 'error.PERIOD_WRONG_DAY',
  // Change password (account/password).
  WRONG_PASSWORD: 'error.WRONG_PASSWORD',
  CURRENT_PASSWORD_REQUIRED: 'error.CURRENT_PASSWORD_REQUIRED',
  PASSWORD_TOO_SHORT: 'error.PASSWORD_TOO_SHORT',
  PASSWORD_TOO_WEAK: 'error.PASSWORD_TOO_WEAK',
  PASSWORD_UNCHANGED: 'error.PASSWORD_UNCHANGED',
  PASSWORD_CONTAINS_LOGIN: 'error.PASSWORD_CONTAINS_LOGIN',
  PASSWORD_CHANGE_REQUIRED: 'error.PASSWORD_CHANGE_REQUIRED',
  FORBIDDEN: 'error.FORBIDDEN',
  NOT_FOUND: 'error.NOT_FOUND',
  RATE_LIMITED: 'error.RATE_LIMITED',
  NETWORK: 'error.NETWORK',
  SERVER_ERROR: 'error.SERVER_ERROR',
};

/** Codes whose English server message is specific (e.g. "That book is already lent"); other languages get a generic line. */
const GENERIC_FALLBACK: Record<string, MessageKey> = {
  VALIDATION: 'error.VALIDATION',
  BAD_REQUEST: 'error.BAD_REQUEST',
  CONFLICT: 'error.CONFLICT',
  TOO_LARGE: 'error.TOO_LARGE',
  UNPROCESSABLE: 'error.BAD_REQUEST',
  // Timetable clashes: the message names the class and the time.
  TIMETABLE_CLASS_CLASH: 'error.CONFLICT',
  TIMETABLE_TEACHER_CLASH: 'error.CONFLICT',
  TIMETABLE_ROOM_CLASH: 'error.CONFLICT',
};

/**
 * What to show for an API error: the ERP's own wording for a known code; otherwise the API's
 * message in English, or in Hindi and Kannada a translated general line with the server's
 * English detail after it (the detail names what was wrong).
 */
export function errorText(e: { code?: string; message: string; status: number }, t: TFunction): string {
  const key = e.code ? ERROR_KEYS[e.code] : undefined;
  if (key) return t(key);
  if (t.locale === 'en' || !e.message) return e.message || t('error.generic');
  const general = e.code ? GENERIC_FALLBACK[e.code] : undefined;
  return general ? `${t(general)} (${e.message})` : e.message;
}
