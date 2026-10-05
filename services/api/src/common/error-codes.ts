import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Stable codes for errors the apps show, so they can word them in the user's language instead
 * of showing the API's English. Every error response carries `code`: one of these for known
 * messages, otherwise a code for the HTTP status (`NOT_FOUND`, `FORBIDDEN`…). Add an entry when
 * an app starts showing a new server message; never change an existing code.
 */
export const ERROR_CODES: Record<string, string> = {
  'Wrong institution, login or password': 'AUTH_WRONG_LOGIN',
  'Your account is not active': 'AUTH_INACTIVE',
  'Invalid or expired token': 'AUTH_EXPIRED',
  'Wrong or expired code': 'OTP_INVALID',
  'Enter a valid mobile number': 'PHONE_INVALID',
  // Passwords (auth/password.controller.ts, auth/password-policy.ts).
  'Change your temporary password first': 'PASSWORD_CHANGE_REQUIRED',
  'Your current password is wrong': 'WRONG_PASSWORD',
  'Enter your current password': 'CURRENT_PASSWORD_REQUIRED',
  'Use at least 10 characters': 'PASSWORD_TOO_SHORT',
  'This password is too easy to guess': 'PASSWORD_TOO_WEAK',
  'Choose a password different from the current one': 'PASSWORD_UNCHANGED',
  'The password must not contain your email name': 'PASSWORD_CONTAINS_LOGIN',
  'You cannot reset your own password here. Use Change password.': 'PASSWORD_RESET_SELF',
  "Only the institution's administrator can reset an administrator's password": 'PASSWORD_RESET_NOT_ALLOWED',
  'This code is invalid or has expired. Use the new code on the board.': 'PAIRING_CODE_INVALID',
  'You are not a teacher at the campus this board belongs to': 'PAIRING_WRONG_CAMPUS',
  'You do not teach this class': 'NOT_YOUR_CLASS',
  'That subject is not taught in this class': 'SUBJECT_NOT_IN_CLASS',
  'Some students are not in this class': 'STUDENTS_NOT_IN_CLASS',
  'Attendance cannot be taken for a future date': 'ATTENDANCE_FUTURE_DATE',
  'The due date has already passed': 'HOMEWORK_DUE_PASSED',
  'Enter marks before publishing': 'MARKS_EMPTY',
  'The recording is still uploading': 'RECORDING_UPLOADING',
  'This recording was not made with a class, so there is no one to share it with': 'RECORDING_NO_CLASS',
  'Open a class on the board first': 'BOARD_NO_CLASS',
  'Write an answer or add a photo': 'SUBMISSION_EMPTY',
  'This homework has already been checked': 'SUBMISSION_CHECKED',
  'Nothing has been handed in yet': 'SUBMISSION_MISSING',
  "That topic is not in this subject's syllabus": 'TOPIC_NOT_IN_SYLLABUS',
  'A topic cannot be marked as taught in the future': 'COVERAGE_FUTURE_DATE',
  "In a school, the student's parent or guardian decides": 'CONSENT_GUARDIAN_DECIDES',
  'The last day must be on or after the first day': 'CALENDAR_BAD_RANGE',
  'Only school leaders and students can watch classes': 'LIVE_NOT_ALLOWED',
  'Live view is turned off for your institution': 'LIVE_VIEW_OFF',
  'Your teacher has not started a live class': 'LIVE_NOT_STARTED',
  'This board is offline': 'LIVE_BOARD_OFFLINE',
  'Unknown board': 'LIVE_UNKNOWN_BOARD',
  'This subject has no syllabus yet. Link it to a course first.': 'PLAN_NO_SYLLABUS',
  'This subject has no periods in the timetable': 'PLAN_NO_PERIODS',
  'There are no teaching days in these dates': 'PLAN_NO_TEACHING_DAYS',
  'The plan must end after it starts': 'PLAN_BAD_RANGE',
  'This period is not on that day': 'PERIOD_WRONG_DAY',
  'Only the head of department or the principal reviews lesson plans': 'PLAN_REVIEW_NOT_ALLOWED',
  'No class is being taught on this board right now': 'LIVE_NO_CLASS',
  'This is not your class': 'LIVE_NOT_YOUR_CLASS',
  'This student hands in their own homework': 'SUBMISSION_STUDENT_ONLY',
  'KINETIX AI is turned off for this student (consent was withdrawn)': 'CONSENT_WITHDRAWN',
  // Fees: online payments go to the institution's own Razorpay account (fees/).
  'Online payment is not available yet. Please pay at the fees counter.': 'PAYMENTS_NOT_CONFIGURED',
  'Enter the key secret and the webhook secret': 'PAYMENTS_KEYS_REQUIRED',
  'Enter the key secret for the new key id': 'PAYMENTS_KEY_SECRET_REQUIRED',
  'Enter a Razorpay key id (rzp_live_… or rzp_test_…)': 'PAYMENTS_BAD_KEY_ID',
  'This secret is too short': 'PAYMENTS_SECRET_TOO_SHORT',
  'Payment keys cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)': 'SECRETS_KEY_MISSING',
  // Bulk import (import/): errors for the whole file…
  'Upload a CSV file': 'IMPORT_NO_FILE',
  'The file is not UTF-8 text. Save it as "CSV UTF-8" and try again.': 'IMPORT_NOT_UTF8',
  'The file has no rows to import': 'IMPORT_EMPTY',
  'The file has too many rows. Split it into files of at most 5,000 rows.': 'IMPORT_TOO_MANY_ROWS',
  'Some required columns are missing': 'IMPORT_MISSING_COLUMNS',
  'There is no current academic year': 'IMPORT_NO_ACADEMIC_YEAR',
  // …and for one row (each row result carries `code`, and `detail` names the value).
  'This value is required': 'IMPORT_REQUIRED',
  'This value is not valid': 'IMPORT_INVALID_VALUE',
  'Unknown program level (use ug, pg or school)': 'IMPORT_BAD_LEVEL',
  'The term is outside the program': 'IMPORT_BAD_TERM',
  'A program with this name has a different level or term count in this file': 'IMPORT_PROGRAM_CONFLICT',
  'Unknown role': 'IMPORT_BAD_ROLE',
  'Unknown language (use en, hi or kn)': 'IMPORT_BAD_LANGUAGE',
  'Give an email or a phone number': 'IMPORT_NO_CONTACT',
  'Enter a valid email address': 'IMPORT_BAD_EMAIL',
  'This email and this phone number belong to two different people': 'IMPORT_CONTACT_MISMATCH',
  'This email or phone number already belongs to someone else': 'IMPORT_CONTACT_TAKEN',
  'No class with this name': 'IMPORT_UNKNOWN_CLASS',
  'Subject not found in this class': 'IMPORT_UNKNOWN_SUBJECT',
  'No member of staff with this email or phone': 'IMPORT_UNKNOWN_TEACHER',
  'Unknown day (use Mon to Sun, or 1 to 7)': 'IMPORT_BAD_DAY',
  'Enter times like 09:30, with the end after the start': 'IMPORT_BAD_TIME',
  'This roll number appears twice in the file': 'IMPORT_DUPLICATE_ROW',
  'This row repeats an earlier row': 'IMPORT_DUPLICATE_ROW',
  'Another class already has this name': 'IMPORT_DUPLICATE_CLASS',
  'This row could not be saved': 'IMPORT_ROW_FAILED',
  'A guardian needs a name and a phone number': 'IMPORT_GUARDIAN_INCOMPLETE',
  'This phone number belongs to a student, not a guardian': 'IMPORT_GUARDIAN_NOT_FAMILY',
};

/** Timetable clashes (409): the message names the class or time, so the code says which kind. */
export const TIMETABLE_CLASH_CODES = { class: 'TIMETABLE_CLASS_CLASH', teacher: 'TIMETABLE_TEACHER_CLASH', room: 'TIMETABLE_ROOM_CLASH' } as const;

const BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

export function errorCode(status: number, message: unknown): string {
  const first = firstMessage(message);
  if (first && ERROR_CODES[first]) return ERROR_CODES[first];
  if (status === 400 && message && typeof message === 'object' && 'fieldErrors' in message) return 'VALIDATION';
  return BY_STATUS[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'ERROR');
}

/** The first message of a string, a list, or a flattened zod error ({formErrors, fieldErrors}). */
function firstMessage(message: unknown): string | undefined {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return typeof message[0] === 'string' ? message[0] : undefined;
  if (message && typeof message === 'object' && 'fieldErrors' in message) {
    const m = message as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
    return m.formErrors?.[0] ?? Object.values(m.fieldErrors ?? {}).find((v) => v?.length)?.[0];
  }
  return undefined;
}

/** Adds `code` to every HTTP error body (keeping `statusCode`, `message` and `error`). */
@Catch(HttpException)
export class ErrorCodeFilter extends BaseExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    if (host.getType() !== 'http') return super.catch(exception, host);
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: Record<string, unknown> = typeof raw === 'string' ? { statusCode: status, message: raw } : { statusCode: status, ...(raw as Record<string, unknown>) };
    // ZodBody throws the flattened zod error itself ({formErrors, fieldErrors}) as the body.
    if (typeof body.code !== 'string') body.code = errorCode(status, body.message ?? raw);
    host.switchToHttp().getResponse().status(status).json(body);
  }
}
