import 'dart:async';
import 'dart:io' show SocketException;

import 'package:http/http.dart' as http;

import '../../core/api_client.dart';
import '../../core/models.dart';
import 'topics.dart';

export 'topics.dart' show Topic, topics, findTopic;

/// KINETIX AI's offline fallback: sample answers from 74 hand-written lesson notes, ported from
/// the prototype (topics.dart). Used in demo builds and when the board cannot reach the API.
///
/// Everything happens on the board; nothing is sent anywhere. Answers carry
/// [AiMeta.offline] (and [AiMeta.preview]) so the panels label them "Offline sample". When no
/// topic matches, [explain] says honestly what it knows; the other tools give nothing rather
/// than invent content.
class OfflineAi {
  const OfflineAi();

  /// The topic [text] is about, preferring the class's [subject] when two topics share a word.
  Topic? topicFor(String text, {String? subject}) => findTopic(text, subject: subject);

  static AiMeta get _meta => AiMeta(cached: false, preview: true, offline: true);

  /// The notes on [question]'s topic, or null when they do not cover it.
  AiResult<Explanation>? explain(String question, {String? subject}) {
    final t = topicFor(question, subject: subject);
    if (t == null) return null;
    return AiResult(
      Explanation(
        answer: '${t.summary}\n\nExample: ${t.example}\n\nIn real life: ${t.realLife}',
        keyPoints: t.keyPoints,
        followUps: ['Common mistakes in ${t.title.toLowerCase()}', 'A quick quiz on ${t.title.toLowerCase()}'],
      ),
      _meta,
    );
  }

  /// Up to [count] of the topic's questions (the notes have three or four each), or null.
  AiResult<Quiz>? quiz(String topic, {required int count, String? subject}) {
    final t = topicFor(topic, subject: subject);
    final qs = t?.quiz.where((q) => q.options.length >= 2).take(count).toList();
    if (t == null || qs == null || qs.isEmpty) return null;
    return AiResult(
      Quiz(topic: topic, questions: [for (final q in qs) QuizQuestion(question: q.question, options: q.options, answer: q.answer, explanation: q.why)]),
      _meta,
    );
  }

  AiResult<HomeworkDraft>? homework(String topic, {required int count, String? subject}) {
    final t = topicFor(topic, subject: subject);
    if (t == null) return null;
    final questions = <HomeworkQuestion>[
      for (final q in t.quiz) HomeworkQuestion(question: q.question, marks: 2),
      HomeworkQuestion(question: 'Explain in your own words: ${t.keyPoints.first}', marks: 3),
      HomeworkQuestion(question: 'Give one example of ${t.title.toLowerCase()} from everyday life.', marks: 3),
    ];
    return AiResult(
      HomeworkDraft(
        title: 'Homework: ${t.title}',
        instructions: 'Answer in your notebook. Show your working.',
        questions: questions.take(count.clamp(1, questions.length)).toList(),
      ),
      _meta,
    );
  }

  AiResult<LessonPlan>? lessonPlan(String topic, {required int minutes, String? subject}) {
    final t = topicFor(topic, subject: subject);
    if (t == null) return null;
    // Recap, teach, activity, check: the activity is the notes' own 5–10 minute one.
    final recap = (minutes * 0.1).round().clamp(3, 10);
    final check = (minutes * 0.15).round().clamp(3, 10);
    final activity = (minutes * 0.25).round().clamp(5, 15);
    final teach = (minutes - recap - check - activity).clamp(5, minutes);
    return AiResult(
      LessonPlan(
        objectives: [for (final p in t.keyPoints.take(3)) p],
        steps: [
          LessonStep(minutes: recap, activity: 'Hook: ${t.realLife}'),
          LessonStep(minutes: teach, activity: 'Teach: ${t.summary} Work through the example: ${t.example}'),
          LessonStep(minutes: activity, activity: t.activity),
          LessonStep(minutes: check, activity: 'Check: ask ${t.quiz.length} quick questions; watch for: ${t.mistakes.first}'),
        ],
        materials: const ['Board', 'Notebooks'],
        assessment: t.quiz.isEmpty ? 'Exit ticket: one question on ${t.title}.' : 'Exit ticket: ${t.quiz.first.question}',
      ),
      _meta,
    );
  }
}

/// Whether [e] means KINETIX AI could not be reached (no network, the server down or not
/// answering), as opposed to a refusal or a mistake in the request: then the offline notes may answer.
bool cloudUnreachable(Object e) => switch (e) {
  ApiException(:final status) => status == 503 || status == 504,
  TimeoutException() || SocketException() || http.ClientException() => true,
  _ => false,
};
