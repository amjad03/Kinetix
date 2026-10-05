import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/reader/read_aloud.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A voice that records what it is asked to say; it has only the [languages] given.
class FakeVoice implements ReaderVoice {
  FakeVoice({this.languages = const {'en', 'hi', 'kn'}});
  final Set<String> languages;
  final spoken = <(String, String)>[];
  int stops = 0;

  @override
  void Function(int start, int end)? onWord;
  @override
  VoidCallback? onDone;

  @override
  Future<bool> speak(String text, String lang, double rate) async {
    if (!languages.contains(lang.split('-').first)) return false;
    spoken.add((text, lang));
    return true;
  }

  @override
  Future<void> stop() async => stops++;
  @override
  void dispose() {}
}

TextElement _text(String s, double x, double y) => TextElement(id: newElementId(), position: Offset(x, y), text: s, color: const Color(0xFF000000), fontSize: 20, size: const Size(200, 24));

void main() {
  test('the page reads top to bottom, then left to right; covered answers and code stay quiet', () {
    final els = [
      _text('Second line', 40, 200),
      _text('right', 400, 102),
      _text('First', 40, 100),
      NoteElement(id: 'a', rect: const Rect.fromLTWH(0, 300, 200, 100), text: 'The answer', color: const Color(0xFFFFE58A), fontSize: 20, kind: NoteKind.answer),
      NoteElement(id: 'c', rect: const Rect.fromLTWH(0, 400, 200, 100), text: 'print(1)', color: const Color(0xFFFFE58A), fontSize: 20, kind: NoteKind.code),
      NoteElement(id: 'n', rect: const Rect.fromLTWH(0, 500, 200, 100), text: 'A note', color: const Color(0xFFFFE58A), fontSize: 20, kind: NoteKind.note),
    ];
    expect(readableElements(els), ['First', 'right', 'Second line', 'A note']);
  });

  test('the voice follows the script', () {
    expect(readerLang('Photosynthesis'), 'en-IN');
    expect(readerLang('प्रकाश संश्लेषण'), 'hi-IN');
    expect(readerLang('ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ'), 'kn-IN');
  });

  test('the reader goes on to the next paragraph and stops at the end', () async {
    final voice = FakeVoice();
    final r = ReaderController(['One', 'दो', 'ಮೂರು'], voice: voice);
    await r.play();
    expect(voice.spoken.last, ('One', 'en-IN'));
    voice.onWord!(0, 3);
    expect(r.word, (0, 3));
    voice.onDone!();
    await pumpEventQueue();
    expect(r.index, 1);
    expect(voice.spoken.last, ('दो', 'hi-IN'));
    voice.onDone!();
    await pumpEventQueue();
    voice.onDone!();
    await pumpEventQueue();
    expect(r.index, 2);
    expect(r.playing, isFalse);
    await r.jump(0);
    expect(r.index, 0);
    r.setSize(200);
    expect(r.size, 72);
    r.dispose();
  });

  test('a language without a voice is reported, not read', () async {
    final r = ReaderController(['ಕನ್ನಡ ಪಠ್ಯ'], voice: FakeVoice(languages: {'en'}));
    await r.play();
    expect(r.playing, isFalse);
    expect(r.missingVoice, 'kn-IN');
  });

  testWidgets('the immersive reader shows the text large and reads it', (tester) async {
    final voice = FakeVoice(languages: {'en'});
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: ImmersiveReader(title: 'Page 1', paragraphs: const ['Hello class', 'ನಮಸ್ಕಾರ'], voice: voice),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Page 1'), findsOneWidget);
    expect(voice.spoken.single.$1, 'Hello class');
    expect(find.text('Pause'), findsOneWidget);
    // The Kannada paragraph: this board has no Kannada voice.
    await tester.tap(find.byKey(const Key('reader-p-1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reader-no-voice')), findsOneWidget);
    expect(find.textContaining('ಕನ್ನಡ voice'), findsOneWidget);
    await tester.tap(find.byKey(const Key('reader-focus')));
    await tester.tap(find.byKey(const Key('reader-slow')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('selected text on the board opens the reader', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final voice = FakeVoice();
    ReaderVoice.make = () => voice;
    addTearDown(() => ReaderVoice.make = TtsReaderVoice.new);
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
    await tester.pump();
    final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
    final t = _text('The Sun is a star', 500, 400);
    wb.add(t);
    wb.tool = BoardTool.select;
    wb.select({t.id});
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('sel-read-aloud')));
    await tester.pumpAndSettle();
    expect(find.byType(ImmersiveReader), findsOneWidget);
    expect(voice.spoken.single.$1, 'The Sun is a star');
    await tester.tap(find.byKey(const Key('reader-close')));
    await tester.pumpAndSettle();
    expect(find.byType(ImmersiveReader), findsNothing);
  });

  testWidgets('Tools → Immersive reader reads the page', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final voice = FakeVoice();
    ReaderVoice.make = () => voice;
    addTearDown(() => ReaderVoice.make = TtsReaderVoice.new);
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
    await tester.pump();
    final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
    wb.add(_text('Line two', 500, 500));
    wb.add(_text('Line one', 500, 400));
    await tester.tap(find.byKey(const Key('tool-tools')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Immersive reader'));
    await tester.pumpAndSettle();
    expect(find.text('Line one'), findsWidgets);
    expect(voice.spoken.first.$1, 'Line one');
  });
}
