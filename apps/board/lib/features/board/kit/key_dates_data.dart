import 'package:flutter/services.dart' show rootBundle;

/// The eras the key dates are grouped by.
enum HistoryEra { ancient, classical, medieval, early, modern, contemporary }

/// One dated event: a year (negative = BCE), the day and month when known (0 = not known),
/// where it belongs (india, karnataka, world), its subject (history or science) and a line.
class HistoryEvent {
  const HistoryEvent({required this.year, required this.month, required this.day, required this.region, required this.topic, required this.text});

  final int year, month, day;
  final String region, topic, text;

  static const _months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /// "15 Aug 1947", "1757" or "261 BCE".
  String get when {
    final y = year < 0 ? '${-year} BCE' : '$year';
    return month > 0 && day > 0 ? '$day ${_months[month]} $y' : y;
  }

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

/// The board's key dates: about four thousand events from the dawn of writing to today, world
/// and Indian history, science and Karnataka, with the day for most. Bundled in
/// assets/history/key_dates.tsv: events of "On this day" from Wikipedia (CC BY-SA 4.0, see
/// assets/history/CREDITS.txt) and the KINETIX curriculum list. Searchable offline.
class KeyDatesData {
  KeyDatesData(this.events);

  final List<HistoryEvent> events;

  static KeyDatesData? _loaded;

  /// Tests put a small list here.
  static void override(KeyDatesData? d) => _loaded = d;

  static Future<KeyDatesData> load() async => _loaded ??= parse(await rootBundle.loadString('assets/history/key_dates.tsv'));

  /// `year<TAB>month<TAB>day<TAB>region<TAB>topic<TAB>text` per line.
  static KeyDatesData parse(String tsv) {
    final out = <HistoryEvent>[];
    for (final line in tsv.split('\n')) {
      final p = line.split('\t');
      if (p.length < 6) continue;
      final y = int.tryParse(p[0]);
      if (y == null) continue;
      out.add(HistoryEvent(year: y, month: int.tryParse(p[1]) ?? 0, day: int.tryParse(p[2]) ?? 0, region: p[3], topic: p[4], text: p[5]));
    }
    out.sort((a, b) {
      final c = a.year.compareTo(b.year);
      return c != 0 ? c : (a.month * 40 + a.day).compareTo(b.month * 40 + b.day);
    });
    return KeyDatesData(out);
  }

  /// Events matching the filters, oldest first. [query] matches the text or the year
  /// ("1857", "BCE"); [region] is india (with Karnataka), world or null for all; [topic] is
  /// history, science or null.
  List<HistoryEvent> search({String query = '', String? region, String? topic, HistoryEra? era}) {
    final q = query.trim().toLowerCase();
    return [
      for (final e in events)
        if ((region == null || e.region == region || (region == 'india' && e.region == 'karnataka')) &&
            (topic == null || e.topic == topic) &&
            (era == null || e.era == era) &&
            (q.isEmpty || e.text.toLowerCase().contains(q) || e.when.toLowerCase().contains(q)))
          e,
    ];
  }

  /// What happened on [month]/[day] in any year, oldest first.
  List<HistoryEvent> onThisDay(int month, int day) => [
    for (final e in events)
      if (e.month == month && e.day == day) e,
  ];
}
