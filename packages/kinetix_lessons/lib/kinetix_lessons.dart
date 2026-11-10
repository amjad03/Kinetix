/// The Zynetix lesson player's blocks, ported for the Classroom edition's Lessons tab.
library;

export 'src/blocks/block_view.dart' show LessonBlockView, ExampleView;
export 'src/blocks/embeds.dart';
export 'src/blocks/math_text.dart' show MathText, Formula;
export 'src/blocks/quick_check.dart';
export 'src/blocks/whiteboard_view.dart' show WhiteboardView, WhiteboardViewState, WhiteboardItems, BoardPainter, inkColor, paperInkColor, paperInk;
export 'src/core/strings.dart' show blockName, blockLabel;
export 'src/core/theme.dart' show zynetixTheme, Z, zText, zTitle;
export 'src/core/ui_scale.dart' show ZCanvas;
export 'src/engine/lesson_controller.dart';
export 'src/engine/model.dart';
export 'src/engine/narrator.dart' show Narrator, TimedNarrator;
export 'src/engine/support.dart';
export 'src/instruments/instruments.dart' show buildInstrument, instrumentIds, InstrumentBlockView, InstrumentBoardScope, BoardSnapshot;
