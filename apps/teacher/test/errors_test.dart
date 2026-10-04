// Errors are worded by the server's `code`, with the English message as a fallback for older
// servers; and the HTTP client reads the code and sends coverage and review requests correctly.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/l10n.dart';
import 'package:kinetix_teacher/core/models.dart';

import 'helpers.dart';

void main() {
  final en = strings('en');

  group('errorText', () {
    test('the code decides, whatever the message says', () {
      expect(en.errorText(ApiException(403, 'Some new wording', code: 'NOT_YOUR_CLASS')), en.errorNotYourClass);
      expect(en.errorText(ApiException(401, 'x', code: 'AUTH_WRONG_LOGIN')), en.errorWrongLogin);
      expect(en.errorText(ApiException(401, 'x', code: 'AUTH_EXPIRED')), en.errorSessionExpired);
      expect(en.errorText(ApiException(401, 'x', code: 'UNAUTHORIZED')), en.errorSessionExpired);
      expect(en.errorText(ApiException(404, 'x', code: 'PAIRING_CODE_INVALID')), en.errorCodeExpired);
      expect(en.errorText(ApiException(403, 'x', code: 'PAIRING_WRONG_CAMPUS')), en.errorOtherCampus);
      expect(en.errorText(ApiException(403, 'x', code: 'AUTH_INACTIVE')), en.errorAccountInactive);
      expect(en.errorText(ApiException(400, 'x', code: 'SUBJECT_NOT_IN_CLASS')), en.errorSubjectNotInClass);
      expect(en.errorText(ApiException(400, 'x', code: 'STUDENTS_NOT_IN_CLASS')), en.errorStudentsNotInClass);
      expect(en.errorText(ApiException(400, 'x', code: 'ATTENDANCE_FUTURE_DATE')), en.errorFutureAttendance);
      expect(en.errorText(ApiException(400, 'x', code: 'HOMEWORK_DUE_PASSED')), en.errorDueDatePassed);
      expect(en.errorText(ApiException(400, 'x', code: 'MARKS_EMPTY')), en.errorEnterMarksFirst);
      expect(en.errorText(ApiException(409, 'x', code: 'RECORDING_UPLOADING')), en.errorRecordingUploading);
      expect(en.errorText(ApiException(400, 'x', code: 'RECORDING_NO_CLASS')), en.errorRecordingNoClass);
      expect(en.errorText(ApiException(404, 'x', code: 'SUBMISSION_MISSING')), en.errorNothingHandedIn);
      expect(en.errorText(ApiException(400, 'x', code: 'TOPIC_NOT_IN_SYLLABUS')), en.errorTopicNotInSyllabus);
      expect(en.errorText(ApiException(400, 'x', code: 'COVERAGE_FUTURE_DATE')), en.errorFutureCoverage);
    });

    test('status codes: words a teacher can act on', () {
      expect(en.errorText(ApiException(403, 'Only admins', code: 'FORBIDDEN')), en.errorForbidden);
      expect(en.errorText(ApiException(404, 'Homework not found', code: 'NOT_FOUND')), en.errorNotFound);
      expect(en.errorText(ApiException(429, 'ThrottlerException', code: 'RATE_LIMITED')), en.errorTooManyAttempts);
      expect(en.errorText(ApiException(400, 'title: Too small', code: 'VALIDATION')), en.errorValidation);
      expect(en.errorText(ApiException(500, 'Internal server error', code: 'SERVER_ERROR')), en.errorGeneric(500));
    });

    test('a generic code falls back to the known message, then the message itself', () {
      expect(en.errorText(ApiException(400, 'Not a KINETIX pairing QR code', code: 'BAD_REQUEST')), en.errorNotPairingQr);
      expect(en.errorText(ApiException(400, 'Marks cannot be more than 25', code: 'BAD_REQUEST')), 'Marks cannot be more than 25');
    });

    test('older servers without codes: the English message is matched', () {
      expect(en.errorText(ApiException(403, 'You do not teach this class')), en.errorNotYourClass);
      expect(en.errorText(ApiException(400, "That topic is not in this subject's syllabus")), en.errorTopicNotInSyllabus);
      expect(en.errorText(ApiException(404, 'HTTP 404', kind: ApiErrorKind.http)), en.errorNotFound);
      expect(en.errorText(ApiException(0, 'x', kind: ApiErrorKind.offline)), en.errorOffline);
    });

    test('in Hindi and Kannada', () {
      for (final lang in ['hi', 'kn']) {
        final s = strings(lang);
        expect(s.errorText(ApiException(403, 'You do not teach this class', code: 'NOT_YOUR_CLASS')), s.errorNotYourClass);
        expect(s.errorText(ApiException(404, 'Homework not found', code: 'NOT_FOUND')), s.errorNotFound);
        expect(s.errorNotYourClass, isNot(en.errorNotYourClass));
        expect(s.errorValidation, isNot(en.errorValidation));
      }
    });
  });

  group('HttpTeacherApi', () {
    late List<http.Request> requests;
    late http.Response Function(http.Request) respond;

    HttpTeacherApi client() {
      requests = [];
      return HttpTeacherApi(
        baseUrl: 'http://api',
        client: MockClient((req) async {
          requests.add(req);
          return respond(req);
        }),
      )..token = 'tok';
    }

    test('reads the error code', () async {
      respond = (_) =>
          http.Response(jsonEncode({'statusCode': 403, 'message': 'You do not teach this class', 'code': 'NOT_YOUR_CLASS'}), 403);
      final api = client();
      final e = await api.submissions('h1').then<ApiException?>((_) => null, onError: (Object e) => e as ApiException);
      expect(e!.code, 'NOT_YOUR_CLASS');
      expect(e.status, 403);
      expect(e.message, 'You do not teach this class');

      // Zod validation errors have no message string, but still a code.
      respond = (_) => http.Response(
        jsonEncode({
          'formErrors': [],
          'fieldErrors': {
            'status': ['Invalid option'],
          },
          'code': 'VALIDATION',
        }),
        400,
      );
      final v = await api.submissions('h1').then<ApiException?>((_) => null, onError: (Object e) => e as ApiException);
      expect(v!.code, 'VALIDATION');
    });

    test('coverage, marking and unmarking send the class, subject and topic', () async {
      respond = (req) => req.method == 'GET'
          ? http.Response(
              jsonEncode({
                'sectionId': 'sec1',
                'subjectId': 'sub1',
                'covered': 1,
                'total': 4,
                'percent': 25,
                'topics': [
                  {'topicId': 't1', 'coveredOn': '2026-10-01', 'coveredBy': 'Anita Sharma'},
                ],
              }),
              200,
            )
          : http.Response(req.method == 'DELETE' ? '' : '{}', req.method == 'DELETE' ? 204 : 200);
      final api = client();
      final c = await api.coverage(sectionId: 'sec1', subjectId: 'sub1');
      expect(requests.last.url.toString(), 'http://api/v1/coverage?sectionId=sec1&subjectId=sub1');
      expect(c.covered, 1);
      expect(c.total, 4);
      expect(c.topics['t1']!.coveredBy, 'Anita Sharma');

      await api.markTopic(sectionId: 'sec1', subjectId: 'sub1', topicId: 't2', coveredOn: '2026-10-02');
      expect(requests.last.method, 'POST');
      expect(jsonDecode(requests.last.body), {'sectionId': 'sec1', 'subjectId': 'sub1', 'topicId': 't2', 'coveredOn': '2026-10-02'});
      await api.markTopic(sectionId: 'sec1', subjectId: 'sub1', topicId: 't2');
      expect(jsonDecode(requests.last.body), isNot(contains('coveredOn')));

      await api.unmarkTopic(sectionId: 'sec1', subjectId: 'sub1', topicId: 't2');
      expect(requests.last.method, 'DELETE');
      expect(jsonDecode(requests.last.body), {'sectionId': 'sec1', 'subjectId': 'sub1', 'topicId': 't2'});
    });

    test('timetable holiday, calendar, syllabus, submissions, a file and a review', () async {
      respond = (req) => switch (req.url.path) {
        '/v1/teacher/timetable' => http.Response(
          jsonEncode({
            'date': '2026-10-02',
            'today': '2026-10-02',
            'periods': [],
            'nextTeachingDate': '2026-10-05',
            'holiday': {'title': 'Gandhi Jayanti'},
          }),
          200,
        ),
        '/v1/calendar' => http.Response.bytes(
          utf8.encode(
            jsonEncode({
              'from': '2026-10-01',
              'to': '2026-12-30',
              'today': '2026-10-01',
              'events': [
                {
                  'id': 'e1',
                  'kind': 'holiday',
                  'title': 'Gandhi Jayanti',
                  'startsOn': '2026-10-02',
                  'endsOn': '2026-10-02',
                  'programIds': null,
                  'programs': null,
                },
                {
                  'id': 'e2',
                  'kind': 'exam',
                  'title': 'Mid-sems',
                  'startsOn': '2026-10-12',
                  'endsOn': '2026-10-16',
                  'programIds': ['p1'],
                  'programs': ['BCom'],
                },
              ],
            }),
          ),
          200,
        ),
        '/v1/content/syllabus' => http.Response('', 200),
        '/v1/homework/h1/submissions' => http.Response(
          jsonEncode({
            'homeworkId': 'h1',
            'dueOn': '2026-10-05',
            'counts': {'students': 2, 'submitted': 1, 'checked': 0, 'returned': 0, 'missing': 1},
            'students': [
              {
                'studentId': 's1',
                'fullName': 'Aarav Patel',
                'rollNo': '001',
                'status': 'submitted',
                'submittedAt': '2026-10-06T04:00:00.000Z',
                'text': 'Done',
                'files': [
                  {'index': 0, 'name': 'p.jpg', 'mime': 'image/jpeg', 'bytes': 10},
                ],
                'remark': null,
                'late': true,
              },
              {
                'studentId': 's2',
                'fullName': 'Ananya',
                'rollNo': '002',
                'status': null,
                'submittedAt': null,
                'text': null,
                'files': [],
                'remark': null,
                'late': false,
              },
            ],
          }),
          200,
        ),
        '/v1/homework/h1/submissions/s1/files/0' => http.Response.bytes([1, 2, 3], 200, headers: {'content-type': 'image/jpeg'}),
        '/v1/homework/h1/submissions/s1/review' => http.Response(
          jsonEncode({
            'homeworkId': 'h1',
            'studentId': 's1',
            'status': 'returned',
            'text': 'Done',
            'files': [],
            'submittedAt': '2026-10-06T04:00:00.000Z',
            'late': true,
            'remark': 'Redo',
            'checkedBy': 'Anita Sharma',
            'checkedAt': '2026-10-06T05:00:00.000Z',
          }),
          200,
        ),
        _ => http.Response('{}', 404),
      };
      final api = client();
      final day = await api.timetable(date: '2026-10-02');
      expect(day.holiday, 'Gandhi Jayanti');
      expect(day.periods, isEmpty);

      final events = await api.calendar(to: '2026-12-30');
      expect(requests.last.url.query, 'to=2026-12-30');
      expect(events.map((e) => e.kind), [CalendarKind.holiday, CalendarKind.exam]);
      expect(events[0].programs, isNull);
      expect(events[1].programs, ['BCom']);

      expect(await api.syllabus('sub1'), isNull);
      expect(requests.last.url.query, 'subjectId=sub1');

      final list = await api.submissions('h1');
      expect(list.counts.missing, 1);
      expect(list.students[0].late, isTrue);
      expect(list.students[0].files.single.isImage, isTrue);
      expect(list.students[1].status, isNull);

      expect(await api.submissionFile('h1', 's1', 0), [1, 2, 3]);

      final done = await api.reviewSubmission('h1', list.students[0], status: SubmissionStatus.returned, remark: 'Redo');
      expect(jsonDecode(requests.last.body), {'status': 'returned', 'remark': 'Redo'});
      expect(done.fullName, 'Aarav Patel');
      expect(done.status, SubmissionStatus.returned);
      expect(done.remark, 'Redo');
    });
  });
}
