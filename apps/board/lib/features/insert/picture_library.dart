import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';

/// Where a library picture came from and under which licence (shown in the library and put
/// under the picture on the board).
class PictureCredit {
  const PictureCredit(this.title, this.page, this.licence, this.author);

  factory PictureCredit.fromJson(Map<String, dynamic> j) =>
      PictureCredit(j['title'] as String? ?? '', j['page'] as String? ?? '', j['licence'] as String? ?? '', j['author'] as String? ?? '');

  final String title, page, licence, author;

  /// "Animal cell structure en.svg, LadyofHats (Mariana Ruiz), Public domain, Wikimedia Commons".
  String get line {
    final source = page.contains('wikimedia') ? 'Wikimedia Commons' : (page.contains('fluentui-emoji') ? 'Microsoft Fluent Emoji' : '');
    final name = title.replaceFirst('File:', '').replaceFirst('Fluent Emoji: ', '');
    return [name, if (author.isNotEmpty) author, licence, if (source.isNotEmpty) source].join(', ');
  }
}

/// A picture in the bundled library (assets/library, from the KINETIX prototype).
class LibraryPicture {
  const LibraryPicture(this.id, this.title, this.shelves, this.tags, this.size, this.credit);

  factory LibraryPicture.fromJson(Map<String, dynamic> j) => LibraryPicture(
    j['id'] as String,
    j['title'] as String,
    (j['subjects'] as List).cast<String>(),
    (j['tags'] as List).cast<String>(),
    Size((j['w'] as num).toDouble(), (j['h'] as num).toDouble()),
    PictureCredit.fromJson((j['credit'] as Map).cast<String, dynamic>()),
  );

  final String id, title;
  final List<String> shelves, tags;
  final Size size;
  final PictureCredit credit;

  String get asset => 'assets/library/$id.webp';
  String get thumb => 'assets/library/thumbs/$id.webp';

  /// Fluent Emoji (MIT) stickers for primary classes; their credit is in the licences, not
  /// under each sticker.
  bool get isSticker => credit.licence == 'MIT';
}

/// The library's shelves, in order.
const pictureShelves = ['biology', 'chemistry', 'physics', 'maths', 'geography', 'history', 'english', 'computer', 'evs', 'general'];

String shelfName(AppLocalizations l, String shelf) => switch (shelf) {
  'biology' => l.libBiology,
  'chemistry' => l.libChemistry,
  'physics' => l.libPhysics,
  'maths' => l.libMaths,
  'geography' => l.libGeography,
  'history' => l.libHistory,
  'english' => l.libEnglish,
  'computer' => l.libComputers,
  'evs' => l.libEvs,
  _ => l.libStickers,
};

/// The bundled, openly licensed picture library (assets/library/catalog.json; credits in
/// assets/library/CREDITS.txt).
class PictureLibrary {
  const PictureLibrary(this.pictures);
  final List<LibraryPicture> pictures;

  static PictureLibrary? _loaded;

  static Future<PictureLibrary> load([AssetBundle? bundle]) async {
    if (bundle == null && _loaded != null) return _loaded!;
    try {
      final raw = await (bundle ?? rootBundle).loadString('assets/library/catalog.json');
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final lib = PictureLibrary([for (final a in j['assets'] as List) LibraryPicture.fromJson((a as Map).cast<String, dynamic>())]);
      if (bundle == null) _loaded = lib;
      return lib;
    } catch (e) {
      debugPrint('Picture library: $e');
      return const PictureLibrary([]);
    }
  }

  List<String> get shelves => [
    for (final s in pictureShelves)
      if (pictures.any((p) => p.shelves.contains(s))) s,
  ];

  List<LibraryPicture> shelf(String s) => pictures.where((p) => p.shelves.contains(s)).toList();

  /// Pictures whose title or tags match [query], best first; the [prefer] shelves (the class's
  /// subject) break ties.
  List<LibraryPicture> search(String query, {List<String> prefer = const []}) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return pictures;
    int score(LibraryPicture p) {
      var s = 0;
      final t = p.title.toLowerCase();
      if (t == q) s += 100;
      if (t.startsWith(q)) s += 40;
      if (t.contains(q)) s += 20;
      for (final tag in p.tags) {
        if (tag == q) s += 30;
        if (tag.contains(q) || q.contains(tag)) s += 10;
      }
      if (s > 0 && p.shelves.any(prefer.contains)) s += 5;
      // Diagrams before stickers of the same thing.
      if (s > 0 && !p.isSticker) s += 3;
      return s;
    }

    final hits = [for (final p in pictures) (p, score(p))].where((e) => e.$2 > 0).toList()..sort((a, b) => b.$2.compareTo(a.$2));
    return [for (final h in hits) h.$1];
  }

  /// The picture's bytes (WebP).
  Future<Uint8List> bytes(LibraryPicture p, [AssetBundle? bundle]) async => (await (bundle ?? rootBundle).load(p.asset)).buffer.asUint8List();
}

/// The shelf a class's subject starts on.
String? shelfForSubject(String? subject) {
  final s = subject?.toLowerCase() ?? '';
  for (final (words, shelf) in const [
    (['biology', 'botany', 'zoology', 'life'], 'biology'),
    (['chemistry'], 'chemistry'),
    (['physics'], 'physics'),
    (['math', 'algebra', 'geometry', 'statistics'], 'maths'),
    (['geography'], 'geography'),
    (['history', 'social', 'civics', 'political'], 'history'),
    (['english', 'hindi', 'kannada', 'language'], 'english'),
    (['computer', 'informatics', 'coding'], 'computer'),
    (['evs', 'environment', 'science'], 'evs'),
  ]) {
    if (words.any(s.contains)) return shelf;
  }
  return null;
}

/// The picture library: shelves by subject, search, and each picture's credit. Returns the
/// picture to put on the board.
class PictureLibraryDialog extends StatefulWidget {
  const PictureLibraryDialog({super.key, required this.library, this.subject});

  final PictureLibrary library;

  /// The class's subject, to open on its shelf.
  final String? subject;

  @override
  State<PictureLibraryDialog> createState() => _PictureLibraryDialogState();
}

class _PictureLibraryDialogState extends State<PictureLibraryDialog> {
  late String? _shelf = widget.library.shelves.contains(shelfForSubject(widget.subject)) ? shelfForSubject(widget.subject) : null;
  String _query = '';
  LibraryPicture? _info;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final lib = widget.library;
    final shown = _query.trim().isNotEmpty
        ? lib.search(_query, prefer: [?shelfForSubject(widget.subject)])
        : (_shelf == null ? lib.pictures : lib.shelf(_shelf!));
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      child: SizedBox(
        width: math.min(980, size.width - 48),
        height: math.min(720, size.height - 48),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s16, Kx.s16, Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.photo_library_outlined, color: c.primary),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: Text(l.libTitle, style: context.text.titleLarge)),
                  IconButton(tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: Kx.s8),
              TextField(
                key: const Key('library-search'),
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.libSearch, border: const OutlineInputBorder(), isDense: true),
              ),
              const SizedBox(height: Kx.s8),
              if (_query.trim().isEmpty)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      ChoiceChip(label: Text(l.libAll), selected: _shelf == null, onSelected: (_) => setState(() => _shelf = null)),
                      for (final s in lib.shelves)
                        Padding(
                          padding: const EdgeInsets.only(left: Kx.s8),
                          child: ChoiceChip(key: Key('shelf-$s'), label: Text(shelfName(l, s)), selected: _shelf == s, onSelected: (_) => setState(() => _shelf = s)),
                        ),
                    ],
                  ),
                ),
              const SizedBox(height: Kx.s12),
              Expanded(
                child: shown.isEmpty
                    ? Center(child: Text(l.libNothingFound, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)))
                    : GridView.extent(
                        maxCrossAxisExtent: 168,
                        mainAxisSpacing: Kx.s8,
                        crossAxisSpacing: Kx.s8,
                        childAspectRatio: 0.85,
                        children: [for (final p in shown) _tile(p)],
                      ),
              ),
              if (_info case final p?)
                Container(
                  key: const Key('library-credit'),
                  margin: const EdgeInsets.only(top: Kx.s8),
                  padding: const EdgeInsets.all(Kx.s12),
                  decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(Kx.rMd)),
                  child: Text('${p.title}: ${p.credit.line}', style: context.text.bodySmall),
                ),
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Text(l.libCredits, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(LibraryPicture p) {
    final c = context.colors;
    return Material(
      color: c.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rMd),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('picture-${p.id}'),
        onTap: () => Navigator.pop(context, p),
        onLongPress: () => setState(() => _info = p),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(Kx.s8),
                child: Image.asset(p.thumb, fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(Icons.image_outlined)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s8, 0, Kx.s4, Kx.s4),
              child: Row(
                children: [
                  Expanded(child: Text(p.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.labelMedium)),
                  InkResponse(
                    key: Key('credit-${p.id}'),
                    radius: 18,
                    onTap: () => setState(() => _info = p),
                    child: Icon(Icons.info_outline, size: 18, color: c.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Registers the library's credits with the app's licence page.
void registerPictureLibraryLicence() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(['KINETIX picture library', 'Microsoft Fluent Emoji', 'Wikimedia Commons'], await rootBundle.loadString('assets/library/CREDITS.txt'));
  });
}
