import 'package:flutter/services.dart' show rootBundle;

/// The eras the key dates are grouped by.
enum HistoryEra { ancient, classical, medieval, early, modern, contemporary }

/// One dated event: a year (negative = BCE), the day and month when known (0 = not known),
/// where it belongs (india, karnataka, world), its subject (history or science) and a line.
class HistoryEvent {
  const HistoryEvent({required this.year, required this.month, required this.day, required this.region, required this.topic, required this.text, this.hi, this.kn});

  final int year, month, day;
  final String region, topic, text;

  /// The line in Hindi and Kannada, for the most-taught events (assets/history/key_dates_hi_kn.tsv).
  final String? hi, kn;

  static const _months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  static const _monthsHi = ['', 'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  static const _monthsKn = ['', 'ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'];

  /// "15 Aug 1947", "1757" or "261 BCE".
  String get when => whenIn('en');

  /// [when] in [lang]: "15 अगस्त 1947", "261 ई.पू.", "ಕ್ರಿ.ಪೂ. 261".
  String whenIn(String lang) {
    final y = switch (lang) {
      'hi' => year < 0 ? '${-year} ई.पू.' : '$year',
      'kn' => year < 0 ? 'ಕ್ರಿ.ಪೂ. ${-year}' : '$year',
      _ => year < 0 ? '${-year} BCE' : '$year',
    };
    final months = switch (lang) {
      'hi' => _monthsHi,
      'kn' => _monthsKn,
      _ => _months,
    };
    return month > 0 && day > 0 ? '$day ${months[month]} $y' : y;
  }

  /// The line in [lang], English when it has none.
  String textIn(String lang) => switch (lang) {
    'hi' => hi ?? text,
    'kn' => kn ?? text,
    _ => text,
  };

  /// Whether the line is written in [lang] (English always is).
  bool hasLanguage(String lang) => switch (lang) {
    'hi' => hi != null,
    'kn' => kn != null,
    _ => true,
  };

  HistoryEra get era => year < -500
      ? HistoryEra.ancient
      : year < 500
      ? HistoryEra.classical
      : year < 1500
      ? HistoryEra.medieval
      : year < 1800
      ? HistoryEra.early
      : year < 1947
      ? HistoryEra.modern
      : HistoryEra.contemporary;
}

/// The board's key dates: about five thousand events from the dawn of writing to today, world
/// and Indian history, science and Karnataka, with the day for most. Bundled in
/// assets/history/key_dates.tsv: events of "On this day" from Wikipedia (CC BY-SA 4.0, see
/// assets/history/CREDITS.txt) and the KINETIX curriculum list. The 300 most-taught (the
/// curriculum list and the best-known India and world events) are also in Hindi and Kannada
/// (assets/history/key_dates_hi_kn.tsv); the rest show in English. Searchable offline.
class KeyDatesData {
  KeyDatesData(this.events);

  final List<HistoryEvent> events;

  static KeyDatesData? _loaded;

  /// Tests put a small list here.
  static void override(KeyDatesData? d) => _loaded = d;

  static Future<KeyDatesData> load() async =>
      _loaded ??= parse(await rootBundle.loadString('assets/history/key_dates.tsv'), await rootBundle.loadString('assets/history/key_dates_hi_kn.tsv'));

  /// `year<TAB>month<TAB>day<TAB>region<TAB>topic<TAB>text` per line; [translations] is
  /// `English text<TAB>Hindi<TAB>Kannada` per line for the events that have them.
  static KeyDatesData parse(String tsv, [String translations = '']) {
    final tr = <String, (String, String)>{};
    for (final line in translations.split('\n')) {
      final p = line.split('\t');
      if (p.length >= 3 && p[1].trim().isNotEmpty && p[2].trim().isNotEmpty) tr[p[0]] = (p[1].trim(), p[2].trim());
    }
    final out = <HistoryEvent>[];
    for (final line in tsv.split('\n')) {
      final p = line.split('\t');
      if (p.length < 6) continue;
      final y = int.tryParse(p[0]);
      if (y == null) continue;
      final t = tr[p[5]];
      out.add(HistoryEvent(year: y, month: int.tryParse(p[1]) ?? 0, day: int.tryParse(p[2]) ?? 0, region: p[3], topic: p[4], text: p[5], hi: t?.$1, kn: t?.$2));
    }
    out.sort((a, b) {
      final c = a.year.compareTo(b.year);
      return c != 0 ? c : (a.month * 40 + a.day).compareTo(b.month * 40 + b.day);
    });
    return KeyDatesData(out);
  }

  /// Events matching the filters, oldest first. [query] matches the text (English, Hindi or
  /// Kannada) or the date ("1857", "BCE", "ई.पू."); [region] is india (with Karnataka), world or
  /// null for all; [topic] is history, science or null.
  List<HistoryEvent> search({String query = '', String? region, String? topic, HistoryEra? era}) {
    final q = query.trim().toLowerCase();
    bool hit(HistoryEvent e) =>
        e.text.toLowerCase().contains(q) ||
        (e.hi?.contains(q) ?? false) ||
        (e.kn?.contains(q) ?? false) ||
        e.when.toLowerCase().contains(q) ||
        e.whenIn('hi').contains(q) ||
        e.whenIn('kn').contains(q);
    return [
      for (final e in events)
        if ((region == null || e.region == region || (region == 'india' && e.region == 'karnataka')) &&
            (topic == null || e.topic == topic) &&
            (era == null || e.era == era) &&
            (q.isEmpty || hit(e)))
          e,
    ];
  }

  /// What happened on [month]/[day] in any year, oldest first.
  List<HistoryEvent> onThisDay(int month, int day) => [
    for (final e in events)
      if (e.month == month && e.day == day) e,
  ];
}
