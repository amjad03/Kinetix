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
  'No class is being taught on this board right now': 'LIVE_NO_CLASS',
  'This is not your class': 'LIVE_NOT_YOUR_CLASS',
  'This student hands in their own homework': 'SUBMISSION_STUDENT_ONLY',
  'KINETIX AI is turned off for this student (consent was withdrawn)': 'CONSENT_WITHDRAWN',
};

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
