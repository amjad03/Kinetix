import 'package:flutter/widgets.dart';

import 'draw.dart';

/// The languages an animation speaks.
enum AnimLang {
  en,
  hi,
  kn;

  String get nativeName => switch (this) {
        AnimLang.en => 'English',
        AnimLang.hi => 'हिन्दी',
        AnimLang.kn => 'ಕನ್ನಡ',
      };

  /// The voice to read aloud with.
  String get ttsCode => switch (this) {
        AnimLang.en => 'en-IN',
        AnimLang.hi => 'hi-IN',
        AnimLang.kn => 'kn-IN',
      };

  static AnimLang fromCode(String? code) => values.where((l) => l.name == code).firstOrNull ?? AnimLang.en;

  /// The app's language (English when there is no [Localizations]).
  static AnimLang of(BuildContext context) => fromCode(Localizations.maybeLocaleOf(context)?.languageCode);
}

/// One piece of text in English, Hindi and Kannada.
@immutable
class Tr {
  const Tr(this.en, this.hi, this.kn);
  final String en, hi, kn;

  String of(AnimLang l) => switch (l) {
        AnimLang.en => en,
        AnimLang.hi => hi,
        AnimLang.kn => kn,
      };

  List<String> get all => [en, hi, kn];
}

/// A named stage of an animation: it starts at [at] (0..1 of the timeline).
@immutable
class AnimStep {
  const AnimStep(this.at, this.name, this.caption);
  final double at;
  final Tr name, caption;
}

/// What a painter draws: the time [t] (0..1), whether labels show, and their language.
/// A [thumbnail] scales its text with the drawing (elsewhere text never gets too small to read).
@immutable
class AnimFrame {
  const AnimFrame(this.t, {this.labels = true, this.lang = AnimLang.en, this.thumbnail = false});
  final double t;
  final bool labels;
  final AnimLang lang;
  final bool thumbnail;

  @override
  bool operator ==(Object other) => other is AnimFrame && other.t == t && other.labels == labels && other.lang == lang && other.thumbnail == thumbnail;

  @override
  int get hashCode => Object.hash(t, labels, lang, thumbnail);
}

typedef AnimPainterBuilder = AnimPainter Function(AnimFrame frame);

/// One animation in the catalogue. Ids are stable: lessons may link to them.
@immutable
class KxAnimation {
  const KxAnimation({
    required this.id,
    required this.title,
    required this.subject,
    required this.topic,
    required this.levels,
    required this.keywords,
    required this.steps,
    required this.painter,
    this.seconds = 16,
    this.thumbT = 0.5,
    this.alsoSubjects = const ['Science'],
  });

  final String id;
  final Tr title;

  /// Biology, Earth Science, Physics, Chemistry, Economics or Computer Science.
  final String subject;

  /// The syllabus topic, in English (e.g. 'Life processes').
  final String topic;

  /// Classes, e.g. 'Class 10'.
  final List<String> levels;

  /// Search words (English; the titles in all three languages are searched too).
  final List<String> keywords;
  final List<AnimStep> steps;
  final AnimPainterBuilder painter;

  /// The length of one run at 1× speed.
  final int seconds;

  /// The moment shown on the thumbnail.
  final double thumbT;

  /// Other subject names a board may use for this one (e.g. 'Science', 'Geography').
  final List<String> alsoSubjects;

  bool matchesSubject(String s) {
    final q = s.trim().toLowerCase();
    return subject.toLowerCase() == q || alsoSubjects.any((a) => a.toLowerCase() == q);
  }

  /// The step showing at time [t].
  int stepAt(double t) {
    var i = 0;
    for (var k = 0; k < steps.length; k++) {
      if (t >= steps[k].at) i = k;
    }
    return i;
  }

  bool matchesQuery(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    final hay = [...title.all, subject, topic, ...keywords, ...levels].join(' ').toLowerCase();
    return q.split(RegExp(r'\s+')).every(hay.contains);
  }
}
