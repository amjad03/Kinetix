import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart' show MockClient;

import '../core/models.dart';
import '../core/realtime.dart';
import '../core/server_config.dart';

/// The demo backend for the board (`--dart-define=KINETIX_DEMO=true`): KINETIX Cloud answered in
/// memory, with KINETIX Demo College's BCom Sem 3 A · Corporate Accounting class (as
/// services/api/src/db/seed.ts seeds it). [client] goes into ApiClient and [realtime] stands in
/// for the Socket.IO connection, so nothing touches the network. Saved boards, coverage,
/// recordings and attendance last until the app is closed; AI answers are labelled previews.
class DemoBoardServer {
  DemoBoardServer({
    DateTime Function()? clock,
    this.claimDelay = const Duration(seconds: 4),
  }) : _clock = clock ?? DateTime.now;

  static const deviceName = 'Room 204 Board';
  static const deviceToken = 'demo-device-token';
  static const sessionToken = 'demo-session-token';

  final DateTime Function() _clock;

  /// How long after showing a pairing code the demo "teacher" scans it.
  final Duration claimDelay;

  /// The realtime connection the board gets ([BoardController]'s realtimeFactory).
  late final DemoRealtime realtime = DemoRealtime();

  late final http.Client client = MockClient(_handle);

  /// Requests seen, as "METHOD /path" (tests).
  final requests = <String>[];

  final _boards = <String, Map<String, dynamic>>{};
  final _recordings = <String, Map<String, dynamic>>{};
  late final Map<String, String> _taught = {
    for (final (i, t) in ['t1', 't2', 't3', 't4'].indexed)
      t: _iso(_clock().subtract(Duration(days: 14 - i * 3))),
  };
  int _sessions = 0;

  static const _names = [
    'Aarav Patel',
    'Ananya Gowda',
    'Bhavya Reddy',
    'Chetan Naik',
    'Deepika Hegde',
    'Farhan Khan', //
    'Gauri Shetty',
    'Harsh Jain',
    'Ishita Rao',
    'Karthik Murthy',
    'Lakshmi Iyer',
    'Manoj Bhat',
  ];

  static const _chapters = [
    (
      'ch1',
      'Issue of Shares',
      [
        (
          't1',
          'Kinds of shares and share capital',
          'Equity and preference shares; authorised, issued and called-up capital.',
        ),
        (
          't2',
          'Issue at par, premium and discount',
          'Journal entries for each kind of issue.',
        ),
        (
          't3',
          'Over-subscription and pro-rata allotment',
          'Refunds and adjusting excess application money.',
        ),
      ],
    ),
    (
      'ch2',
      'Forfeiture and Re-issue of Shares',
      [
        (
          't4',
          'Forfeiture of shares',
          'Cancelling shares when calls are not paid.',
        ),
        (
          't5',
          'Re-issue of forfeited shares',
          'Re-issue at a discount and the transfer to capital reserve.',
        ),
      ],
    ),
    (
      'ch3',
      'Underwriting of Shares',
      [
        (
          't6',
          'Underwriting and underwriting commission',
          'What underwriting is and the commission allowed by law.',
        ),
      ],
    ),
    (
      'ch4',
      'Valuation of Goodwill',
      [
        (
          't7',
          'Methods of valuing goodwill',
          'Average profit, super profit and capitalisation methods.',
        ),
        (
          't8',
          'Break-even and profit planning',
          'Fixed costs, contribution and the break-even point.',
        ),
      ],
    ),
  ];

  static String _iso(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// The class the demo board opens in: Anita Sharma teaching BCom Sem 3 A · Corporate Accounting.
  Map<String, dynamic> sessionJson() {
    final now = _clock();
    return {
      'sessionId': 'demo-session-${++_sessions}',
      'expiresAt': now.add(const Duration(hours: 8)).toUtc().toIso8601String(),
      'teacher': {
        'id': 'u1',
        'fullName': 'Anita Sharma',
        'preferredLanguage': 'en',
      },
      'section': {'id': 'sec1', 'displayName': 'BCom Sem 3 A'},
      'subject': {'id': 'sub1', 'name': 'Corporate Accounting'},
      'period': {'startsAt': '10:00:00', 'endsAt': '10:55:00'},
    };
  }

  SessionContext session() => SessionContext.fromJson(sessionJson());

  Map<String, dynamic> get _syllabus => {
    'id': 'co1',
    'title': 'Corporate Accounting, BCom Semester 3',
    'reviewed': true,
    'chapters': [
      for (final (id, title, topics) in _chapters)
        {
          'id': id,
          'title': title,
          'own': false,
          'topics': [
            for (final (tid, t, s) in topics)
              {'id': tid, 'title': t, 'summary': s, 'own': false},
          ],
        },
    ],
  };

  Map<String, dynamic>? _topic(String id) {
    for (final (cid, chapter, topics) in _chapters) {
      for (final (tid, t, s) in topics) {
        if (tid != id) continue;
        return {
          'id': tid,
          'title': t,
          'summary': s,
          'notes': [
            s,
            'Sample notes (demo): work one example on the board, then let the class try the next one.',
          ],
          'outcomes': ['Explain $t', 'Solve a textbook problem on $t'],
          'chapter': {'id': cid, 'title': chapter},
          'course': {
            'id': 'co1',
            'title': 'Corporate Accounting',
            'reviewed': true,
          },
          'resources': [
            if (tid == 't8')
              {
                'kind': 'lab',
                'id': 'lab.break-even',
                'title': 'Break-even chart',
              },
            if (tid == 't7' || tid == 't8')
              {
                'kind': 'lab',
                'id': 'lab.graph-plotter',
                'title': 'Graph plotter',
              },
          ],
        };
      }
    }
    return null;
  }

  Map<String, dynamic> get _coverage => {
    'covered': _taught.length,
    'total': 8,
    'percent': (_taught.length * 100 / 8).round(),
    'topics': [
      for (final e in _taught.entries)
        {'topicId': e.key, 'coveredOn': e.value, 'coveredBy': 'Anita Sharma'},
    ],
  };

  Map<String, dynamic> get _currentPlan => {
    'slot': {
      'id': 'slot1',
      'startsAt': '10:00:00',
      'endsAt': '10:55:00',
      'sectionId': 'sec1',
      'section': 'BCom Sem 3 A',
      'subjectId': 'sub1',
    },
    'subject': {'id': 'sub1', 'name': 'Corporate Accounting'},
    'date': _iso(_clock()),
    'suggestedTopicIds': ['t5'],
    'plan': {
      'id': 'lp1',
      'date': _iso(_clock()),
      'topicIds': ['t5'],
      'topics': [
        {'id': 't5', 'title': 'Re-issue of forfeited shares'},
      ],
      'content': {
        'objectives': [
          'Pass journal entries for re-issue of forfeited shares',
          'Transfer the gain to capital reserve',
        ],
        'steps': [
          {
            'minutes': 5,
            'activity': 'Recap: forfeiture entries from the last class',
          },
          {
            'minutes': 20,
            'activity':
                'Worked example: 500 shares re-issued at ₹8 paid up as ₹10',
          },
          {'minutes': 20, 'activity': 'Pairs solve Exercise 4.3, Q1–2'},
          {'minutes': 10, 'activity': 'Exit ticket: one re-issue entry each'},
        ],
        'materials': ['Textbook ch. 4.3', 'Calculator'],
        'assessment':
            'Exit ticket: the re-issue entry and the capital reserve transfer.',
        'homework': 'Exercise 4.3, Q3–5.',
      },
      'aiDrafted': true,
      'teacher': 'Anita Sharma',
      'reviewedAt': null,
      'reviewRemark': null,
    },
  };

  static Map<String, dynamic> _ai(String task, Map<String, dynamic> result) => {
    'task': task,
    'result': result,
    'meta': {
      'provider': 'preview',
      'model': 'preview',
      'cached': false,
      'preview': true,
      'sources': [],
    },
  };

  Map<String, dynamic> _summary(String id) {
    final b = _boards[id]!;
    return {
      'id': id,
      'title': b['title'],
      'pageCount': (b['pages'] as List?)?.length ?? 1,
      'updatedAt': b['updatedAt'],
      'sectionName': 'BCom Sem 3 A',
      'subjectName': 'Corporate Accounting',
      'sharedAt': b['sharedAt'],
    };
  }

  Future<http.Response> _handle(http.Request req) async {
    final path = req.url.path, method = req.method;
    requests.add('$method $path');
    final body = req.body.isEmpty
        ? const <String, dynamic>{}
        : (jsonDecode(req.body) as Map).cast<String, dynamic>();
    final now = _clock();
    http.Response json(Object? j, [int status = 200]) => http.Response.bytes(
      utf8.encode(jsonEncode(j)),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
    http.Response notInDemo() =>
        json({'message': 'Not available in the demo.', 'code': 'DEMO'}, 400);

    if (path == '/v1/devices/enroll') {
      return json({
        'deviceToken': deviceToken,
        'device': {'name': deviceName},
      }, 201);
    }
    if (path == '/v1/devices/me/pairing-codes') {
      // The demo teacher "scans" the code a few seconds later.
      Timer(
        claimDelay,
        () => realtime.fire(RealtimeEvents.pairingClaimed, {
          'sessionToken': sessionToken,
          'session': sessionJson(),
        }),
      );
      return json({
        'code': '246810',
        'qrPayload': 'kinetix://pair/246810',
        'expiresAt': now
            .add(const Duration(minutes: 2))
            .toUtc()
            .toIso8601String(),
      });
    }
    if (path == '/v1/sessions/current') {
      return json({
        'roster': [
          for (final (i, n) in _names.indexed)
            {
              'id': 's${i + 1}',
              'rollNo': 'U03BC${(i + 1).toString().padLeft(3, '0')}',
              'fullName': n,
            },
        ],
      });
    }
    if (path == '/v1/sessions/current/end') return json({'ended': true}, 201);
    if (path == '/v1/sessions/current/live') return notInDemo();
    if (path == '/v1/sync/push') {
      return json({
        'results': [
          for (final op in (body['ops'] as List? ?? const []))
            {'opId': (op as Map)['opId'], 'status': 'applied'},
        ],
      });
    }
    if (path == '/v1/broadcasts/pending') return json([]);
    if (path.startsWith('/v1/broadcasts/')) return json({'ok': true});

    // Whiteboards.
    if (path == '/v1/whiteboards') {
      return json([
        for (final id in _boards.keys.toList().reversed) _summary(id),
      ]);
    }
    final wb = RegExp(r'^/v1/whiteboards/([^/]+)(/share)?$').firstMatch(path);
    if (wb != null) {
      final id = wb[1]!;
      if (wb[2] != null) {
        if (!_boards.containsKey(id)) {
          return json({'message': 'Board not found'}, 404);
        }
        _boards[id]!['sharedAt'] = now.toUtc().toIso8601String();
        return json(_summary(id));
      }
      if (method == 'PUT') {
        final content = Map<String, dynamic>.of(body)
          ..remove('title')
          ..remove('share');
        _boards[id] = {
          ...content,
          'content': content,
          'title': body['title'],
          'updatedAt': now.toUtc().toIso8601String(),
          'sharedAt': body['share'] == true
              ? now.toUtc().toIso8601String()
              : _boards[id]?['sharedAt'],
        };
        return json(_summary(id));
      }
      final b = _boards[id];
      return b == null
          ? json({'message': 'Board not found'}, 404)
          : json({..._summary(id), 'content': b['content']});
    }

    // Lesson recordings: kept in memory (the audio is not stored).
    if (path == '/v1/recordings') {
      return json(_recordings.values.toList().reversed.toList());
    }
    final rec = RegExp(
      r'^/v1/recordings/([^/]+)(?:/(events|audio|finish|share))?$',
    ).firstMatch(path);
    if (rec != null) {
      final id = rec[1]!;
      switch (rec[2]) {
        case null:
          _recordings[id] = {
            ...?_recordings[id],
            'id': id,
            'title': body['title'] ?? _recordings[id]?['title'] ?? 'Lesson',
            'startedAt': body['startedAt'] ?? now.toUtc().toIso8601String(),
            'hasAudio': false,
            'sectionId': 'sec1',
            'sectionName': 'BCom Sem 3 A',
            'subjectName': 'Corporate Accounting',
          };
          return json(_recordings[id]);
        case 'events' || 'audio':
          if (rec[2] == 'audio') _recordings[id]?['hasAudio'] = true;
          return json({'ok': true});
        case 'finish':
          _recordings[id]?.addAll({
            'durationMs': body['durationMs'],
            'finishedAt': now.toUtc().toIso8601String(),
            if (body['share'] == true)
              'sharedAt': now.toUtc().toIso8601String(),
          });
          return json(_recordings[id]);
        case 'share':
          _recordings[id]?['sharedAt'] = now.toUtc().toIso8601String();
          return json(_recordings[id]);
      }
    }

    // Content library, coverage and today's plan.
    if (path == '/v1/content/syllabus') return json(_syllabus);
    final topic = RegExp(r'^/v1/content/topics/([^/]+)$').firstMatch(path);
    if (topic != null) {
      final t = _topic(topic[1]!);
      return t == null ? json({'message': 'Topic not found'}, 404) : json(t);
    }
    if (path == '/v1/coverage') {
      if (method == 'POST') {
        final id = body['topicId'] as String;
        _taught[id] = _iso(now);
        return json({'topicId': id, 'coveredOn': _taught[id]});
      }
      if (method == 'DELETE') {
        _taught.remove(body['topicId']);
        return http.Response('', 204);
      }
      return json(_coverage);
    }
    if (path == '/v1/lesson-plans/current') return json(_currentPlan);
    if (path == '/v1/homework/from-board') {
      return json({
        'id': 'hw-${now.millisecondsSinceEpoch}',
        'title': body['title'],
      }, 201);
    }

    // KINETIX AI: sample answers, marked as previews so the board labels them.
    final topicName = (body['topic'] ?? body['question'] ?? 'the topic')
        .toString();
    switch (path) {
      case '/v1/ai/explain':
        return json(
          _ai('explain', {
            'answer':
                'Sample answer (demo): with a KINETIX AI server this would explain "$topicName" for BCom Sem 3 A, '
                'using the Corporate Accounting syllabus notes.',
            'keyPoints': [
              'Start from the journal entry',
              'Show the effect on share capital',
              'Check that both sides agree',
            ],
            'followUps': [
              'Can you show a worked example?',
              'What mistakes do students make here?',
            ],
          }),
        );
      case '/v1/ai/quiz':
        return json(
          _ai('quiz', {
            'questions': [
              for (var n = 0; n < ((body['count'] as num?)?.toInt() ?? 5); n++)
                {
                  'question': 'Sample question ${n + 1} (demo) on $topicName',
                  'options': [
                    'Share capital',
                    'Share forfeiture',
                    'Capital reserve',
                    'Calls in arrears',
                  ],
                  'answer': n % 4,
                  'explanation': 'A sample explanation for the demo.',
                },
            ],
          }),
        );
      case '/v1/ai/homework':
        return json(
          _ai('homework', {
            'title': 'Homework: $topicName',
            'instructions': 'Sample homework (demo). Answer in your notebook and show journal entries.',
            'questions': [
              for (var n = 0; n < ((body['count'] as num?)?.toInt() ?? 3); n++)
                {
                  'question': 'Sample exercise ${n + 1} on $topicName',
                  'marks': n.isEven ? 2 : 5,
                },
            ],
          }),
        );
      case '/v1/ai/lesson-plan':
        return json(
          _ai('lessonPlan', {
            'objectives': [
              'Explain $topicName',
              'Solve one textbook problem on it',
            ],
            'steps': [
              {'minutes': 10, 'activity': 'Recap the last class'},
              {'minutes': 25, 'activity': 'Worked example on the board'},
              {'minutes': 10, 'activity': 'Pairs practice and exit ticket'},
            ],
            'materials': ['Textbook', 'Calculator'],
            'assessment': 'Exit ticket with two questions (sample, demo).',
          }),
        );
      case '/v1/ai/read-board':
        return json(
          _ai('readBoard', {
            'text': 'Sample reading (demo): Goodwill = Super profit × 3',
            'math': ['G = SP \\times 3'],
          }),
        );
    }
    return json({'message': 'Not available in the demo.'}, 404);
  }
}

/// The board's realtime connection in the demo: "connects" at once and delivers what the demo
/// server fires (a teacher scanning the pairing code). Live view and class audio are not
/// available: requests are refused.
class DemoRealtime extends Realtime {
  DemoRealtime() : super(demoServerUrl);

  final _handlers = <String, void Function(Map<String, dynamic>)>{};
  bool _disposed = false;

  @override
  void on(String event, void Function(Map<String, dynamic>) handler) =>
      _handlers[event] = handler;

  @override
  void connect(String token) {
    _disposed = false;
    scheduleMicrotask(() {
      if (!_disposed) onReady?.call();
    });
  }

  /// Delivers [event] as if the server sent it.
  void fire(String event, Map<String, dynamic> data) {
    if (!_disposed) _handlers[event]?.call(data);
  }

  @override
  void emit(String event, Object data) {}

  @override
  Future<Object?> request(
    String event,
    Object data, {
    Duration timeout = const Duration(seconds: 5),
  }) async => {'ok': false, 'error': 'Not available in the demo.'};

  @override
  void dispose() => _disposed = true;
}
