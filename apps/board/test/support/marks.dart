import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

/// Puts a dot on the open page, so Add Page is allowed (spec 11.2: no blank page after a blank page).
void markPage(WhiteboardController wb) =>
    wb.add(Stroke(id: 'mark-${wb.pageIndex}-${wb.page.elements.length}', style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 4), points: const [InkPoint(40, 40)]));
