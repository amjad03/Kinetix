import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../l10n/feature_strings.dart';
import 'key_dates_data.dart';

FeatureStrings keyDatesStrings(BuildContext context) => FeatureStrings(boardLang(context), keyDatesStringTable);

const keyDatesStringTable = <String, Map<String, String>>{
  'en': {
    'search': 'Search events or a year (1857, BCE, Panipat)',
    'all': 'All',
    'india': 'India',
    'world': 'World',
    'history': 'History',
    'science': 'Science',
    'today': 'On this day',
    'todayNone': 'No event for today in the list.',
    'anyDay': 'Any day',
    'count': '{n} events',
    'none': 'No event matches.',
    'pick': 'Pick events for a timeline',
    'draw': 'Draw timeline ({n})',
    'ancient': 'Before 500 BCE',
    'classical': '500 BCE to 500 CE',
    'medieval': '500 to 1500',
    'early': '1500 to 1800',
    'modern': '1800 to 1947',
    'contemporary': 'After 1947',
  },
  'hi': {
    'search': 'घटना या वर्ष खोजें (1857, BCE, पानीपत)',
    'all': 'सभी',
    'india': 'भारत',
    'world': 'विश्व',
    'history': 'इतिहास',
    'science': 'विज्ञान',
    'today': 'आज के दिन',
    'todayNone': 'सूची में आज की कोई घटना नहीं है।',
    'anyDay': 'कोई भी दिन',
    'count': '{n} घटनाएँ',
    'none': 'कोई घटना नहीं मिली।',
    'pick': 'समयरेखा के लिए घटनाएँ चुनें',
    'draw': 'समयरेखा बनाएँ ({n})',
    'ancient': '500 ई.पू. से पहले',
    'classical': '500 ई.पू. से 500 ई.',
    'medieval': '500 से 1500',
    'early': '1500 से 1800',
    'modern': '1800 से 1947',
    'contemporary': '1947 के बाद',
  },
  'kn': {
    'search': 'ಘಟನೆ ಅಥವಾ ವರ್ಷ ಹುಡುಕಿ (1857, BCE, ಪಾಣಿಪತ್)',
    'all': 'ಎಲ್ಲ',
    'india': 'ಭಾರತ',
    'world': 'ವಿಶ್ವ',
    'history': 'ಇತಿಹಾಸ',
    'science': 'ವಿಜ್ಞಾನ',
    'today': 'ಈ ದಿನ',
    'todayNone': 'ಪಟ್ಟಿಯಲ್ಲಿ ಇಂದಿನ ಘಟನೆ ಇಲ್ಲ.',
    'anyDay': 'ಯಾವುದೇ ದಿನ',
    'count': '{n} ಘಟನೆಗಳು',
    'none': 'ಯಾವ ಘಟನೆಯೂ ಹೊಂದುತ್ತಿಲ್ಲ.',
    'pick': 'ಕಾಲರೇಖೆಗೆ ಘಟನೆಗಳನ್ನು ಆರಿಸಿ',
    'draw': 'ಕಾಲರೇಖೆ ಬರೆಯಿರಿ ({n})',
    'ancient': 'ಕ್ರಿ.ಪೂ. 500ಕ್ಕೆ ಮೊದಲು',
    'classical': 'ಕ್ರಿ.ಪೂ. 500 ರಿಂದ ಕ್ರಿ.ಶ. 500',
    'medieval': '500 ರಿಂದ 1500',
    'early': '1500 ರಿಂದ 1800',
    'modern': '1800 ರಿಂದ 1947',
    'contemporary': '1947ರ ನಂತರ',
  },
};

/// Key dates: the whole bundled history (world and India, science, Karnataka) searched by
/// words or year, filtered by place, subject and era, with "On this day"; any events can be
/// drawn as a timeline on the board.
class KeyDatesPanel extends StatefulWidget {
  const KeyDatesPanel({super.key, required this.onDraw, this.today, this.focus = ''});

  /// What the class is about (the subject profile's key dates focus): `science`, `history`, `world`, `politics` or empty.
  final String focus;

  final void Function(List<(String, String)>) onDraw;

  /// Today for "On this day" (tests fix it).
  final DateTime? today;

  @override
  State<KeyDatesPanel> createState() => _KeyDatesPanelState();
}

class _KeyDatesPanelState extends State<KeyDatesPanel> {
  final _q = TextEditingController();
  KeyDatesData? _data;
  String? _region = 'india', _topic;
  HistoryEra? _era;
  bool _onThisDay = false;
  final _picked = <HistoryEvent>{};

  @override
  void initState() {
    super.initState();
    switch (widget.focus) {
      case 'science':
        _topic = 'science';
      case 'history' || 'politics':
        _topic = 'history';
      case 'world':
        _region = 'world';
    }
    unawaited(
      KeyDatesData.load().then((d) {
        if (mounted) setState(() => _data = d);
      }),
    );
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  List<HistoryEvent> _list() {
    final d = _data;
    if (d == null) return const [];
    if (_onThisDay) {
      final t = widget.today ?? DateTime.now();
      return d.onThisDay(t.month, t.day).where((e) => (_region == null || e.region == _region || (_region == 'india' && e.region == 'karnataka')) && (_topic == null || e.topic == _topic)).toList();
    }
    return d.search(query: _q.text, region: _region, topic: _topic, era: _era);
  }

  @override
  Widget build(BuildContext context) {
    final s = keyDatesStrings(context);
    final list = _list();
    Widget chip(String key, String label, bool selected, VoidCallback onTap) =>
        ChoiceChip(key: Key(key), label: Text(label), selected: selected, onSelected: (_) => setState(onTap), visualDensity: VisualDensity.compact);
    return Column(
      key: const Key('key-dates'),
      children: [
        // The search and filters scroll away when the panel is short (a phone), so nothing overflows.
        Flexible(
          flex: 2,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, 0),
                  child: TextField(
                    key: const Key('dates-search'),
                    controller: _q,
                    decoration: InputDecoration(hintText: s['search'], prefixIcon: const Icon(Icons.search), isDense: true, border: const OutlineInputBorder()),
                    onChanged: (_) => setState(() => _onThisDay = false),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(Kx.s8),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 2,
                    children: [
                      chip('dates-region-india', s['india'], _region == 'india', () => _region = 'india'),
                      chip('dates-region-world', s['world'], _region == 'world', () => _region = 'world'),
                      chip('dates-region-all', s['all'], _region == null, () => _region = null),
                      chip('dates-topic-history', s['history'], _topic == 'history', () => _topic = _topic == 'history' ? null : 'history'),
                      chip('dates-topic-science', s['science'], _topic == 'science', () => _topic = _topic == 'science' ? null : 'science'),
                      FilterChip(
                        key: const Key('dates-today'),
                        avatar: const Icon(Icons.today, size: 16),
                        label: Text(s['today']),
                        selected: _onThisDay,
                        visualDensity: VisualDensity.compact,
                        onSelected: (v) => setState(() {
                          _onThisDay = v;
                          if (v) _era = null;
                        }),
                      ),
                    ],
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
                  child: Row(
                    children: [
                      for (final e in HistoryEra.values)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: FilterChip(
                            key: Key('dates-era-${e.name}'),
                            label: Text(s[e.name]),
                            selected: _era == e && !_onThisDay,
                            visualDensity: VisualDensity.compact,
                            onSelected: (v) => setState(() {
                              _era = v ? e : null;
                              _onThisDay = false;
                            }),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: 4),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(s.n('count', list.length), key: const Key('dates-count'), style: context.text.labelMedium),
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          flex: 3,
          child: _data == null
              ? const Center(child: CircularProgressIndicator())
              : list.isEmpty
              ? Center(child: Text(_onThisDay ? s['todayNone'] : s['none'], key: const Key('dates-none')))
              : ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final d = list[i];
                    return CheckboxListTile(
                      key: ValueKey('${d.year}-${d.month}-${d.day}-${d.text.hashCode}'),
                      dense: true,
                      value: _picked.contains(d),
                      onChanged: (v) => setState(() => v == true ? _picked.add(d) : _picked.remove(d)),
                      title: Text(d.text),
                      subtitle: Text(d.when, style: const TextStyle(fontWeight: FontWeight.w700)),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(Kx.s12),
          child: FilledButton.icon(
            key: const Key('kit-timeline'),
            onPressed: _picked.isEmpty
                ? null
                : () {
                    final ev = [for (final d in _picked.toList()..sort((a, b) => a.year.compareTo(b.year))) (d.when, d.text)];
                    widget.onDraw(ev);
                    setState(_picked.clear);
                  },
            icon: const Icon(Icons.timeline),
            label: Text(_picked.isEmpty ? s['pick'] : s.n('draw', _picked.length)),
          ),
        ),
      ],
    );
  }
}
