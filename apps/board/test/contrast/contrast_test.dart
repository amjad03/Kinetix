import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/calculator.dart';
import 'package:kinetix_board/features/board/editors.dart';
import 'package:kinetix_board/features/board/kit/kit_panel.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// WCAG contrast of every Text and Icon against its effective background, in both themes, for a
/// representative set of panels and dialogs plus a gallery of every themed control. Golden
/// images of the same scenes are in test/contrast/goldens.
const _min = 4.5;

double _ratio(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

/// The nearest opaque fill behind [e] (Material, DecoratedBox, ColoredBox, PhysicalModel).
Color _backgroundOf(Element e, Color fallback) {
  Color? found;
  e.visitAncestorElements((a) {
    final w = a.widget;
    Color? c;
    if (w is Material && w.type != MaterialType.transparency) {
      c = w.color ?? Theme.of(a).colorScheme.surface;
    } else if (w is DecoratedBox && w.decoration is BoxDecoration) {
      c = (w.decoration as BoxDecoration).color;
    } else if (w is ColoredBox) {
      c = w.color;
    } else if (w is PhysicalModel) {
      c = w.color;
    }
    if (c != null && c.a > 0.9) {
      found = c;
      return false;
    }
    return true;
  });
  return found ?? fallback;
}

/// Every Text/Icon whose contrast is below [_min], as "text ratio".
List<String> lowContrast() {
  final bad = <String>[];
  for (final el in find.byType(RichText).evaluate()) {
    final rt = el.widget as RichText;
    final bg = _backgroundOf(el, Theme.of(el).colorScheme.surface);
    void check(TextSpan span, TextStyle? inherited) {
      final style = inherited?.merge(span.style) ?? span.style;
      final t = (span.text ?? '').trim();
      final c = style?.color;
      // Disabled and decorative (translucent) content is exempt.
      if (t.isNotEmpty && c != null && c.a >= 0.6) {
        final r = _ratio(Color.alphaBlend(c, bg), bg);
        if (r < _min) bad.add('"$t" ${t.runes.first.toRadixString(16)} ${c.toARGB32().toRadixString(16)} on ${bg.toARGB32().toRadixString(16)} ${r.toStringAsFixed(2)}');
      }
      for (final ch in span.children ?? const <InlineSpan>[]) {
        if (ch is TextSpan) check(ch, style);
      }
    }

    final root = rt.text;
    if (root is TextSpan) check(root, null);
  }
  return bad;
}

Widget _gallery(BuildContext context) {
  final l = Theme.of(context).colorScheme;
  return ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton(onPressed: () {}, child: const Text('Filled')),
          FilledButton.tonal(onPressed: () {}, child: const Text('Tonal')),
          OutlinedButton(onPressed: () {}, child: const Text('Outlined')),
          TextButton(onPressed: () {}, child: const Text('Text')),
          IconButton(onPressed: () {}, icon: const Icon(Icons.edit)),
          IconButton.filled(onPressed: () {}, icon: const Icon(Icons.edit)),
          IconButton.filledTonal(onPressed: () {}, icon: const Icon(Icons.edit)),
          const Chip(label: Text('Chip')),
          const ChoiceChip(label: Text('Selected'), selected: true),
          const ChoiceChip(label: Text('Unselected'), selected: false),
          ActionChip(label: const Text('Action'), onPressed: () {}),
          FilterChip(label: const Text('Filter'), selected: true, onSelected: (_) {}),
        ],
      ),
      SegmentedButton<int>(
        segments: const [ButtonSegment(value: 1, label: Text('One')), ButtonSegment(value: 2, label: Text('Two'))],
        selected: const {1},
        onSelectionChanged: (_) {},
      ),
      const TextField(decoration: InputDecoration(labelText: 'Input', hintText: 'Hint')),
      DropdownButton<int>(value: 1, items: const [DropdownMenuItem(value: 1, child: Text('Dropdown'))], onChanged: (_) {}),
      const Card(child: Padding(padding: EdgeInsets.all(12), child: Text('Card'))),
      const ListTile(leading: Icon(Icons.map), title: Text('List tile'), subtitle: Text('Sub')),
      AlertDialog(title: const Text('Dialog'), content: const Text('Body'), actions: [TextButton(onPressed: () {}, child: const Text('Cancel'))]),
      Container(color: l.surfaceContainerHigh, padding: const EdgeInsets.all(8), child: const Text('Sheet')),
    ],
  );
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final scenes = <String, Widget Function(BuildContext)>{
    'gallery': _gallery,
    'math-editor': (_) => const MathEditorDialog(),
    'vocab-card': (c) => VocabCardBuilder(onBoard: (_) {}),
    'calculator': (_) => const BoardCalculator(scientific: true),
    'kit-maths': (c) => SubjectKitPanel(
      board: BoardController()..skipEnrollment(),
      wb: WhiteboardController(),
      style: subjectStyles[Subject.maths]!,
      primary: false,
      onAi: (_) {},
      onPanel: (_) {},
      onSplit: (_) {},
    ),
  };

  for (final dark in [false, true]) {
    for (final e in scenes.entries) {
      final name = '${e.key}-${dark ? 'dark' : 'light'}';
      testWidgets('contrast and golden: $name', (tester) async {
        tester.view.physicalSize = const Size(900, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          RepaintBoundary(
            key: const Key('shot'),
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: dark ? KinetixTheme.boardChrome() : KinetixTheme.board(),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: Scaffold(body: Builder(builder: e.value)),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));
        expect(lowContrast(), isEmpty, reason: name);
        await expectLater(find.byKey(const Key('shot')), matchesGoldenFile('goldens/$name.png'));
      });
    }
  }
}
