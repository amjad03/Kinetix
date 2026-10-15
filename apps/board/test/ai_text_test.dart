import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/core/api_client.dart';
import 'package:zynetix_board/features/ai/ai_controller.dart';
import 'package:zynetix_board/features/ai/ai_widgets.dart';
import 'package:zynetix_board/l10n/l10n.dart';
import 'package:zynetix_ink/zynetix_ink.dart' show TexView;

void main() {
  group('maths in AI answers', () {
    test('splits LaTeX from text, and leaves prices alone', () {
      expect(splitMath(r'Area is $a^2$ and \(\frac{1}{2}bh\) here'), [
        (text: 'Area is ', math: false),
        (text: 'a^2', math: true),
        (text: ' and ', math: false),
        (text: r'\frac{1}{2}bh', math: true),
        (text: ' here', math: false),
      ]);
      expect(splitMath(r'$$x = \frac{-b}{2a}$$'), [(text: r'x = \frac{-b}{2a}', math: true)]);
      expect(splitMath(r'It costs $5 and $6.'), [(text: r'It costs $5 and $6.', math: false)]);
      expect(splitMath('x² + 2x + 1 = 0'), [(text: 'x² + 2x + 1 = 0', math: false)]);
    });

    testWidgets('typesets LaTeX left in an answer and keeps plain text plain', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Column(children: [AiText(r'The root is $\sqrt{16} = 4$.'), AiText('Plain x² answer')]))));
      expect(tester.widget<TexView>(find.byType(TexView)).tex, r'\sqrt{16} = 4');
      expect(find.text('Plain x² answer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows the LaTeX source when it cannot be typeset', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: TexView(r'\notacommand{x'))));
      expect(find.text(r'\notacommand{x'), findsOneWidget);
    });
  });

  group('AI error messages', () {
    test('busy model, empty scan, offline and timeout each have their own words in every language', () {
      for (final code in ['en', 'hi', 'kn']) {
        final l = l10nFor(Locale(code));
        expect(aiErrorMessage(l, ApiException(503, 'ZYNETIX AI is busy right now. Try again in a minute.', code: 'AI_BUSY')), l.aiErrBusy);
        expect(aiErrorMessage(l, ApiException(503, 'ZYNETIX AI is not reachable right now. Try again in a minute.', code: 'SERVICE_UNAVAILABLE')), l.aiErrUnreachable);
        expect(aiErrorMessage(l, const NothingOnBoard()), l.aiErrNothingOnPages);
        expect(aiErrorMessage(l, TimeoutException('slow')), l.aiErrTimeout);
        expect(aiErrorMessage(l, Exception('no network')), l.aiErrOffline);
      }
      expect(l10nFor(const Locale('hi')).aiErrBusy, isNot(l10nFor(const Locale('en')).aiErrBusy));
    });
  });
}
