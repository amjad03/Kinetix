import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'strings.dart';
import 'tokens.dart';
import 'home_widgets.dart';

/// An online class (Zoom, Google Meet or Teams meeting) from `/v1/connectors/video/mine` or `/board`.
class OnlineClass {
  const OnlineClass({required this.id, required this.topic, required this.provider, required this.startsAt, required this.durationMin, required this.joinUrl});

  factory OnlineClass.fromJson(Map<String, dynamic> j) => OnlineClass(
    id: j['id'] as String,
    topic: j['topic'] as String? ?? '',
    provider: j['provider'] as String? ?? '',
    startsAt: DateTime.parse(j['startsAt'] as String).toLocal(),
    durationMin: (j['durationMin'] as num?)?.toInt() ?? 0,
    joinUrl: j['joinUrl'] as String,
  );

  final String id;
  final String topic;
  final String provider;
  final DateTime startsAt;
  final int durationMin;
  final String joinUrl;

  /// True from five minutes before the start until the class ends.
  bool isOpen(DateTime now) => now.isAfter(startsAt.subtract(const Duration(minutes: 5))) && now.isBefore(startsAt.add(Duration(minutes: durationMin)));
}

/// Calls the cloud for online classes and single sign-on, with the app's own server address and token.
class OnlineApi {
  OnlineApi({required this.baseUrl, this.token, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final String? token;
  final http.Client _http;

  Future<List<OnlineClass>> classes({bool board = false}) async {
    final res = await _http.get(Uri.parse('$baseUrl/v1/connectors/video/${board ? 'board' : 'mine'}'), headers: {'authorization': 'Bearer $token', 'accept': 'application/json'}).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) return const [];
    return [for (final m in jsonDecode(res.body) as List) OnlineClass.fromJson(m as Map<String, dynamic>)];
  }

  /// Signs in through the institution's identity provider in the system browser: [open] shows the
  /// provider's page; the finished sign-in is collected by polling with a random id only this app knows.
  /// Returns the access token, or null when nobody finished in time or the browser could not open.
  Future<String?> ssoSignIn({required String tenant, required Future<bool> Function(Uri url) open, Duration every = const Duration(seconds: 2), int tries = 60}) async {
    final pollId = newPollId();
    final start = await _http.post(Uri.parse('$baseUrl/v1/auth/sso/start'), headers: {'content-type': 'application/json'}, body: jsonEncode({'tenant': tenant, 'pollId': pollId})).timeout(const Duration(seconds: 15));
    if (start.statusCode != 201) return null;
    if (!await open(Uri.parse((jsonDecode(start.body) as Map<String, dynamic>)['authorizationUrl'] as String))) return null;
    for (var i = 0; i < tries; i++) {
      await Future<void>.delayed(every);
      final res = await _http.post(Uri.parse('$baseUrl/v1/auth/sso/exchange'), headers: {'content-type': 'application/json'}, body: jsonEncode({'tenant': tenant, 'ticket': pollId})).timeout(const Duration(seconds: 15));
      if (res.statusCode == 201) {
        final j = jsonDecode(res.body) as Map<String, dynamic>;
        return j['accessToken'] as String?; // a two-step verification challenge has no token: the app asks for the password instead
      }
    }
    return null;
  }
}

/// A random UUID v4 for one sign-in attempt.
String newPollId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// The words of the online-class card and the single-sign-on button.
class OnlineStrings {
  OnlineStrings(BuildContext context) : _lang = KxStrings.of(context).language;

  final String _lang;

  String _t(String en, String hi, String kn) => switch (_lang) {
    'hi' => hi,
    'kn' => kn,
    _ => en,
  };

  String get title => _t('Online classes', 'ऑनलाइन कक्षाएँ', 'ಆನ್‌ಲೈನ್ ತರಗತಿಗಳು');
  String get join => _t('Join', 'जुड़ें', 'ಸೇರಿ');
  String get copyLink => _t('Copy link', 'लिंक कॉपी करें', 'ಲಿಂಕ್ ನಕಲಿಸಿ');
  String get copied => _t('Link copied', 'लिंक कॉपी हुआ', 'ಲಿಂಕ್ ನಕಲಾಗಿದೆ');
  String get liveNow => _t('Live now', 'अभी चालू', 'ಈಗ ನಡೆಯುತ್ತಿದೆ');
  String minutes(int n) => _t('$n min', '$n मिनट', '$n ನಿಮಿಷ');
  String get sso => _t('Sign in with the institution account', 'संस्था के खाते से साइन-इन करें', 'ಸಂಸ್ಥೆಯ ಖಾತೆಯಿಂದ ಸೈನ್-ಇನ್ ಮಾಡಿ');
  String get ssoWaiting => _t('Finish signing in in your browser, then come back.', 'अपने ब्राउज़र में साइन-इन पूरा करके वापस आएँ।', 'ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಸೈನ್-ಇನ್ ಮುಗಿಸಿ ಹಿಂದಿರುಗಿ.');
  String get ssoFailed => _t('Single sign-on did not finish. Try again or use your password.', 'एकल साइन-इन पूरा नहीं हुआ। फिर कोशिश करें या पासवर्ड से साइन-इन करें।', 'ಒಂದೇ ಸೈನ್-ಇನ್ ಪೂರ್ಣವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ಬಳಸಿ.');
}

String _time(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

/// The online classes coming up, each with a Join button (opens the meeting link in the meeting app or browser).
/// Shows nothing when there are none.
class OnlineClassesCard extends StatelessWidget {
  const OnlineClassesCard({super.key, required this.classes, required this.onJoin, this.onCopy, this.now});

  final List<OnlineClass> classes;
  final void Function(OnlineClass c) onJoin;

  /// Copies the link; when null no copy button is shown.
  final void Function(OnlineClass c)? onCopy;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    if (classes.isEmpty) return const SizedBox.shrink();
    final s = OnlineStrings(context);
    final clock = now ?? DateTime.now();
    return KxCard(
      key: const Key('onlineClassesCard'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Kx.s8),
          for (final c in classes)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.topic, style: Theme.of(context).textTheme.bodyLarge),
                        Text('${c.isOpen(clock) ? '${s.liveNow} · ' : ''}${_time(c.startsAt)} · ${s.minutes(c.durationMin)}', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  if (onCopy != null) IconButton(key: Key('copy-${c.id}'), tooltip: s.copyLink, icon: const Icon(Icons.link), onPressed: () => onCopy!(c)),
                  FilledButton(key: Key('join-${c.id}'), onPressed: () => onJoin(c), child: Text(s.join)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
