/// KINETIX ink engine, shared by the Board and the apps that show saved boards, recordings and
/// the live class: the endless whiteboard and its elements, the tools that draw on it, the
/// saved-board and lesson formats, read-only viewers, and the AI pen (shapes, maths and words
/// from handwriting).
library;

export 'src/board_background.dart';
export 'src/code_highlight.dart';
export 'src/element_painting.dart';
export 'src/geometry_tools.dart';
export 'src/flow_chart.dart';
export 'src/graph_expr.dart';
export 'src/ink_canvas.dart';
export 'src/ink_controller.dart';
export 'src/ink_models.dart';
export 'src/lesson.dart';
export 'src/live_audio.dart';
export 'src/math_layer.dart';
export 'src/pen/ai_pen.dart';
export 'src/pen/gestures.dart';
export 'src/pen/handwriting.dart';
export 'src/pen/ink_parser.dart';
export 'src/pen/math_ink.dart';
export 'src/pen/shape_fit.dart' show Fit, FitKind, fitClosed, fitLine, tidyFit;
export 'src/pen/symbol_glyphs.dart' show GlyphStroke, Pt;
export 'src/pen/symbol_recognizer.dart' show SymbolGuess, SymbolRecognizer;
export 'src/render.dart';
export 'src/serialization.dart';
export 'src/sheet_formula.dart';
export 'src/sheet_painting.dart';
export 'src/tools/flow_overlay.dart';
export 'src/tools/geo_overlay.dart';
export 'src/tools/geo_tool.dart';
export 'src/tools/graph_editor.dart';
export 'src/tools/graph_templates.dart';
export 'src/tools/tool_strings.dart';
export 'src/view.dart';
export 'src/whiteboard_canvas.dart';
export 'src/whiteboard_controller.dart';
export 'src/whiteboard_view.dart';
