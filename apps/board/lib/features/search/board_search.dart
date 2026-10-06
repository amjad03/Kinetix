import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/kit/builders.dart';
import '../board/kit/subjects.dart';
import '../board/popovers.dart' show ToolEntry;
import '../board/profile_menu.dart' show BoardSettingsDialog;
import '../board/side_panel.dart' show SplitContent;
import '../concept_videos/concept_video_player.dart';
import '../concept_videos/concept_videos.dart';
import '../insert/device_files.dart';
import '../insert/insert_actions.dart';
import '../insert/picture_library.dart';
import '../sims/sims.dart';
import 'search_index.dart';
import 'search_strings.dart';
import 'universal_search.dart';

/// The board's universal search (the top bar's search button, the phone's More sheet,
/// Ctrl+K): builds the index from what the board has and opens what is picked.

AppLocalizations _l(String lang) => lookupAppLocalizations(Locale(lang));

Map<String, String> _inAll(String Function(AppLocalizations l) text) => {for (final lang in const ['en', 'hi', 'kn']) lang: text(_l(lang))};

/// The settings sections search knows, by their title in each language.
List<SearchItem> settingsSearchItems() => [
  for (final (id, icon, title) in <(String, IconData, String Function(AppLocalizations))>[
    ('language', Icons.translate, (l) => l.language),
    ('theme', Icons.palette_outlined, (l) => l.appThemeTitle),
    ('simple', Icons.child_care, (l) => l.simpleBoardTitle),
    ('input', Icons.draw_outlined, (l) => l.inputTitle),
    ('fingerTaps', Icons.touch_app_outlined, (l) => l.fingerTapsTitle),
    ('touch', Icons.touch_app_outlined, (l) => l.touchScreen),
    ('aiPen', Icons.draw_outlined, (l) => l.aiPen),
    ('projector', Icons.cast, (l) => l.projectorTitle),
    ('profiles', Icons.switch_account_outlined, (l) => l.profilesTitle),
    ('kiosk', Icons.lock_outline, (l) => l.kioskTitle),
  ])
    SearchItem(kind: SearchKind.setting, id: id, icon: icon, titles: _inAll(title), keywords: [for (final lang in const ['en', 'hi', 'kn']) SearchStrings(lang).settings], payload: id),
];

/// The simulations (payload: the [SimKind]).
List<SearchItem> simSearchItems() => [
  for (final k in SimKind.values) SearchItem(kind: SearchKind.sim, id: k.name, icon: simIcon(k), titles: _inAll((l) => simName(l, k)), keywords: [k.name], payload: k),
];

/// The subject kit's tabs (payload: the [KitTab]).
List<SearchItem> kitSearchItems(List<KitTab> tabs, Subject subject) => [
  for (final t in tabs)
    SearchItem(
      kind: SearchKind.kit,
      id: t.name,
      titles: _inAll((l) => l.kitTabName(t)),
      subtitle: _l('en').subjectKit(_l('en').subjectName(subject)),
      keywords: [for (final lang in const ['en', 'hi', 'kn']) _l(lang).subjectKit(_l(lang).subjectName(subject))],
      payload: t,
    ),
];

/// [tools] (built once per language, in the same order) as search items whose payload runs it.
List<SearchItem> toolSearchItems(List<ToolEntry> Function(AppLocalizations l) tools) {
  final byLang = {for (final lang in const ['en', 'hi', 'kn']) lang: tools(_l(lang))};
  final here = byLang['en']!;
  return [
    for (final (i, t) in here.indexed)
      SearchItem(
        kind: SearchKind.tool,
        id: 'tool-$i',
        icon: t.icon,
        titles: {for (final e in byLang.entries) if (i < e.value.length) e.key: e.value[i].label},
        payload: t.onTap,
      ),
  ];
}

Future<List<SearchItem>> _quiet(Future<List<SearchItem>> Function() load) async {
  try {
    return await load();
  } catch (e) {
    debugPrint('Search: $e');
    return const [];
  }
}

Future<List<SearchItem>> _pictures() async {
  final lib = await PictureLibrary.load();
  return [
    for (final p in lib.pictures)
      SearchItem(kind: SearchKind.picture, id: p.id, titles: {'en': p.title}, keywords: [...p.tags, ...p.shelves], subtitle: p.shelves.join(', '), payload: p),
  ];
}

Future<List<SearchItem>> _books(BoardController board) async {
  final api = board.api;
  if (api == null || board.session == null) return const [];
  final s = await api.syllabus().timeout(const Duration(seconds: 6));
  if (s == null) return const [];
  return [
    for (final ch in s.chapters) ...[
      SearchItem(kind: SearchKind.book, id: 'chapter-${ch.id}', icon: Icons.menu_book_outlined, titles: {'en': ch.title}, subtitle: s.title, payload: null),
      for (final t in ch.topics) SearchItem(kind: SearchKind.book, id: t.id, icon: Icons.article_outlined, titles: {'en': t.title}, subtitle: ch.title, keywords: [t.summary], payload: t.id),
    ],
  ];
}

Future<List<SearchItem>> _videos(BoardController board) async {
  final api = board.api;
  if (api == null) return const [];
  final v = PeriodVideos.fromJson(await api.conceptVideosNow().timeout(const Duration(seconds: 6)));
  return [
    for (final x in v.videos) SearchItem(kind: SearchKind.video, id: x.id, titles: {'en': x.title}, subtitle: x.topicTitle ?? '', keywords: [?x.topicTitle], payload: x),
  ];
}

/// Opens the board's search over [context].
Future<void> openBoardSearch(
  BuildContext context, {
  required BoardController board,
  required WhiteboardController wb,
  required List<ToolEntry> Function(AppLocalizations l) tools,
  required List<KitTab> kitTabs,
  required Subject subject,
  required Color accent,
  required ValueChanged<KitTab> onKit,
  required void Function(SplitContent content, String id) onSplit,
  required ValueChanged<SimKind> onSim,
  required ValueChanged<String> onTopic,
  required VoidCallback onBooks,
}) {
  final index = SearchIndex([
    ...toolSearchItems(tools),
    ...catalogueSearchItems(),
    ...formulaSearchItems(),
    ...kitSearchItems(kitTabs, subject),
    ...simSearchItems(),
    ...settingsSearchItems(),
  ]);
  void open(SearchItem item) {
    if (!context.mounted) return;
    final s = SearchStrings.of(context);
    switch (item.kind) {
      case SearchKind.tool:
        (item.payload as VoidCallback?)?.call();
      case SearchKind.model3d:
        onSplit(SplitContent.model3d, item.id);
      case SearchKind.lab:
        onSplit(SplitContent.lab, item.id);
      case SearchKind.formula:
        wb.insert([boardMath(item.payload as String, accent)]);
        showBoardMessage(context, s.addedFormula);
      case SearchKind.kit:
        onKit(item.payload as KitTab);
      case SearchKind.sim:
        onSim(item.payload as SimKind);
      case SearchKind.picture:
        unawaited(_placePicture(context, wb, item.payload as LibraryPicture));
      case SearchKind.book:
        final topic = item.payload as String?;
        topic == null ? onBooks() : onTopic(topic);
      case SearchKind.video:
        unawaited(ConceptVideoPlayer.open(context, item.payload as ConceptVideo));
      case SearchKind.setting:
        unawaited(
          showDialog<void>(
            context: context,
            builder: (_) => BoardChromeTheme(child: BoardSettingsDialog(board: board, initialQuery: item.titleIn(s.lang))),
          ),
        );
    }
  }

  return UniversalSearch.open(
    context,
    index: index,
    // Offline, or not signed in, these add nothing; search works without them.
    more: [_quiet(_pictures), _quiet(() => _books(board)), _quiet(() => _videos(board))],
    onOpen: open,
    wrap: (child) => BoardChromeTheme(child: child),
  );
}

Future<void> _placePicture(BuildContext context, WhiteboardController wb, LibraryPicture p) async {
  final lib = await PictureLibrary.load();
  final picture = await boardPicture(await lib.bytes(p));
  if (picture == null || !context.mounted) return;
  placePicture(wb, picture.$1, picture.$2, credit: p.isSticker ? null : p.credit.line, maxWidth: p.isSticker ? 240 : 560);
}
