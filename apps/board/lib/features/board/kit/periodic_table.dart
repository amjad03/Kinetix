import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../l10n/feature_strings.dart';
import '../../../l10n/l10n.dart';
import 'builders.dart';
import 'periodic_data.dart';
import 'subject_data.dart';

/// How the table's cells are coloured.
enum PeriodicColouring { family, block }

/// Family colours (the legend's), as in the NCERT table.
const periodicFamilyColours = {
  ElementCategory.alkali: Color(0xFFE57373),
  ElementCategory.alkaline: Color(0xFFFFB74D),
  ElementCategory.transition: Color(0xFFFFD54F),
  ElementCategory.postTransition: Color(0xFF90CAF9),
  ElementCategory.metalloid: Color(0xFF80CBC4),
  ElementCategory.nonmetal: Color(0xFFA5D6A7),
  ElementCategory.halogen: Color(0xFF4DD0E1),
  ElementCategory.noble: Color(0xFFCE93D8),
  ElementCategory.lanthanide: Color(0xFFF48FB1),
  ElementCategory.actinide: Color(0xFFBCAAA4),
  ElementCategory.unknown: Color(0xFFB0BEC5),
};

/// Block colours: s, p, d and f.
const periodicBlockColours = {
  ElementBlock.s: Color(0xFFEF9A9A),
  ElementBlock.p: Color(0xFFFFE082),
  ElementBlock.d: Color(0xFF90CAF9),
  ElementBlock.f: Color(0xFFA5D6A7),
};

FeatureStrings periodicStrings(String lang) => FeatureStrings(lang, periodicStringTable);

const periodicStringTable = <String, Map<String, String>>{
  'en': {
    'search': 'Find an element: name, symbol or number',
    'noMatch': 'No element matches',
    'colourBy': 'Colour by',
    'family': 'Family',
    'block': 'Block',
    'blockName': '{n}-block',
    'group': 'Group',
    'period': 'Period',
    'lanthanoids': 'Lanthanoids',
    'actinoids': 'Actinoids',
    'atomicNumber': 'Atomic number',
    'atomicMass': 'Atomic mass (u)',
    'groupPeriod': 'Group, period',
    'configuration': 'Electron configuration',
    'predicted': '(predicted)',
    'shells': 'Electrons in shells (K, L, M...)',
    'electronegativity': 'Electronegativity (Pauling)',
    'notKnown': 'Not known',
    'state': 'At room temperature',
    'solid': 'Solid',
    'liquid': 'Liquid',
    'gas': 'Gas',
    'discovered': 'Discovered',
    'ancient': 'Known since ancient times',
    'uses': 'Common uses',
    'factsCard': 'Facts card',
  },
  'hi': {
    'search': 'तत्व खोजें: नाम, प्रतीक या संख्या',
    'noMatch': 'कोई तत्व नहीं मिला',
    'colourBy': 'रंग किसके अनुसार',
    'family': 'परिवार',
    'block': 'ब्लॉक',
    'blockName': '{n}-ब्लॉक',
    'group': 'वर्ग',
    'period': 'आवर्त',
    'lanthanoids': 'लैन्थेनॉयड',
    'actinoids': 'ऐक्टिनॉयड',
    'atomicNumber': 'परमाणु संख्या',
    'atomicMass': 'परमाणु द्रव्यमान (u)',
    'groupPeriod': 'वर्ग, आवर्त',
    'configuration': 'इलेक्ट्रॉनिक विन्यास',
    'predicted': '(अनुमानित)',
    'shells': 'कोशों में इलेक्ट्रॉन (K, L, M...)',
    'electronegativity': 'विद्युत ऋणात्मकता (पॉलिंग)',
    'notKnown': 'ज्ञात नहीं',
    'state': 'कमरे के ताप पर',
    'solid': 'ठोस',
    'liquid': 'द्रव',
    'gas': 'गैस',
    'discovered': 'खोज',
    'ancient': 'प्राचीन काल से ज्ञात',
    'uses': 'सामान्य उपयोग',
    'factsCard': 'तथ्य कार्ड',
  },
  'kn': {
    'search': 'ಧಾತು ಹುಡುಕಿ: ಹೆಸರು, ಸಂಕೇತ ಅಥವಾ ಸಂಖ್ಯೆ',
    'noMatch': 'ಯಾವ ಧಾತುವೂ ಸಿಗಲಿಲ್ಲ',
    'colourBy': 'ಬಣ್ಣ ಯಾವುದರಂತೆ',
    'family': 'ಕುಟುಂಬ',
    'block': 'ಬ್ಲಾಕ್',
    'blockName': '{n}-ಬ್ಲಾಕ್',
    'group': 'ಗುಂಪು',
    'period': 'ಆವರ್ತ',
    'lanthanoids': 'ಲ್ಯಾಂಥನಾಯ್ಡ್‌ಗಳು',
    'actinoids': 'ಆಕ್ಟಿನಾಯ್ಡ್‌ಗಳು',
    'atomicNumber': 'ಪರಮಾಣು ಸಂಖ್ಯೆ',
    'atomicMass': 'ಪರಮಾಣು ರಾಶಿ (u)',
    'groupPeriod': 'ಗುಂಪು, ಆವರ್ತ',
    'configuration': 'ಇಲೆಕ್ಟ್ರಾನ್ ವಿನ್ಯಾಸ',
    'predicted': '(ಊಹಿತ)',
    'shells': 'ಕವಚಗಳಲ್ಲಿ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು (K, L, M...)',
    'electronegativity': 'ವಿದ್ಯುದೃಣತೆ (ಪೌಲಿಂಗ್)',
    'notKnown': 'ತಿಳಿದಿಲ್ಲ',
    'state': 'ಕೋಣೆಯ ತಾಪದಲ್ಲಿ',
    'solid': 'ಘನ',
    'liquid': 'ದ್ರವ',
    'gas': 'ಅನಿಲ',
    'discovered': 'ಆವಿಷ್ಕಾರ',
    'ancient': 'ಪ್ರಾಚೀನ ಕಾಲದಿಂದ ತಿಳಿದಿದೆ',
    'uses': 'ಸಾಮಾನ್ಯ ಉಪಯೋಗಗಳು',
    'factsCard': 'ಮಾಹಿತಿ ಕಾರ್ಡ್',
  },
};

/// The facts the element sheet and the facts card show, label and value, in [lang].
List<(String, String)> elementFacts(ChemElement e, String lang) {
  final s = periodicStrings(lang);
  final en = e.electronegativity;
  return [
    (s['atomicNumber'], '${e.z}'),
    (s['atomicMass'], e.mass),
    (s['groupPeriod'], '${e.group}, ${e.period}'),
    (s['block'], s.n('blockName', e.block.name)),
    (s['family'], e.cat.labelIn(lang)),
    (s['configuration'], e.predicted ? '${e.configuration} ${s['predicted']}' : e.configuration),
    (s['shells'], e.shells.join(', ')),
    (s['electronegativity'], en == null ? s['notKnown'] : en.toStringAsFixed(2)),
    (
      s['state'],
      switch (e.state) {
        MatterState.solid => s['solid'],
        MatterState.liquid => s['liquid'],
        MatterState.gas => s['gas'],
        MatterState.unknown => s['notKnown'],
      },
    ),
    (s['discovered'], e.discovered == 0 ? s['ancient'] : '${e.discovered}'),
    (s['uses'], e.usesIn(lang)),
  ];
}

/// The periodic table: group numbers across the top, periods down the side, the f-block below,
/// each cell coloured by family or by block with a legend; a search that finds an element by its
/// name (English, Hindi or Kannada), symbol or number; and a sheet per element with its facts
/// that puts its card, facts, Bohr model or atom ball on the board. Cells keep a finger's size on
/// a phone (the table then scrolls sideways) and grow with a panel.
class PeriodicTableView extends StatefulWidget {
  const PeriodicTableView({super.key, required this.onInsert, required this.ink, required this.accent});

  final ValueChanged<List<BoardElement>> onInsert;

  /// Ink for the Bohr model and the facts card (chalk on a dark board).
  final Color ink, accent;

  @override
  State<PeriodicTableView> createState() => _PeriodicTableViewState();
}

class _PeriodicTableViewState extends State<PeriodicTableView> {
  /// The element last tapped, marked in the table.
  int? _pickedZ;
  PeriodicColouring _colouring = PeriodicColouring.family;
  String _query = '';

  Color _colour(ChemElement e) => _colouring == PeriodicColouring.family ? periodicFamilyColours[e.cat]! : periodicBlockColours[e.block]!;

  static const _dark = Color(0xFF1B1F24);

  @override
  Widget build(BuildContext context) {
    final lang = boardLang(context);
    final s = periodicStrings(lang);
    final hits = _query.trim().isEmpty ? null : elements.where((e) => e.matches(_query)).toList();
    final hint = context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant);
    return LayoutBuilder(
      builder: (context, c) {
        final cell = math.max(34.0, (c.maxWidth - 24) / 18.6);
        final lead = cell * 0.6, head = cell * 0.5;
        final label = TextStyle(fontSize: math.max(10, cell * 0.24), color: context.colors.onSurfaceVariant, fontWeight: FontWeight.w600);
        final table = SizedBox(
          width: lead + cell * 18,
          height: head + cell * 10.4,
          child: Stack(
            children: [
              for (var g = 1; g <= 18; g++)
                Positioned(
                  left: lead + (g - 1) * cell,
                  top: g == 1 || g == 18 ? 0 : (g == 2 || g >= 13 ? cell : cell * 3),
                  width: cell,
                  height: head,
                  child: Center(child: Text('$g', key: Key('group-$g'), style: label)),
                ),
              for (var p = 1; p <= 7; p++)
                Positioned(
                  left: 0,
                  top: head + (p - 1) * cell,
                  width: lead,
                  height: cell,
                  child: Center(child: Text('$p', key: Key('period-$p'), style: label)),
                ),
              for (final (row, key) in [(9, 'lanthanoids'), (10, 'actinoids')])
                Positioned(
                  left: lead,
                  top: head + (row - 1) * cell + cell * 0.4,
                  width: cell * 3 - 4,
                  height: cell,
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(s[key], key: Key('periodic-$key'), style: label, maxLines: 2, textAlign: TextAlign.end, overflow: TextOverflow.ellipsis),
                  ),
                ),
              for (final e in elements) _cell(e, cell, lead, head, hits),
            ],
          ),
        );
        return ListView(
          padding: const EdgeInsets.all(Kx.s12),
          children: [
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: math.min(320, c.maxWidth - 24),
                  child: TextField(
                    key: const Key('periodic-search'),
                    decoration: InputDecoration(hintText: s['search'], prefixIcon: const Icon(Icons.search), isDense: true, border: const OutlineInputBorder()),
                    onChanged: (v) => setState(() => _query = v),
                    onSubmitted: (_) {
                      if (hits case [final only]) _open(only);
                    },
                  ),
                ),
                SegmentedButton<PeriodicColouring>(
                  key: const Key('periodic-colouring'),
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: PeriodicColouring.family, label: Text(s['family'], key: const Key('periodic-colour-family'))),
                    ButtonSegment(value: PeriodicColouring.block, label: Text(s['block'], key: const Key('periodic-colour-block'))),
                  ],
                  selected: {_colouring},
                  onSelectionChanged: (v) => setState(() => _colouring = v.single),
                ),
              ],
            ),
            if (hits != null)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: hits.isEmpty
                    ? Text(s['noMatch'], key: const Key('periodic-no-match'), style: hint)
                    : Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final e in hits.take(8))
                            ActionChip(
                              key: Key('periodic-hit-${e.symbol}'),
                              avatar: CircleAvatar(backgroundColor: _colour(e), child: Text(e.symbol, style: const TextStyle(fontSize: 10, color: _dark))),
                              label: Text('${e.z} · ${e.nameIn(lang)}'),
                              onPressed: () => _open(e),
                            ),
                        ],
                      ),
              ),
            const SizedBox(height: Kx.s8),
            SingleChildScrollView(key: const Key('periodic-table'), scrollDirection: Axis.horizontal, child: table),
            const SizedBox(height: Kx.s8),
            Wrap(
              key: const Key('periodic-legend'),
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final (colour, text) in _colouring == PeriodicColouring.family
                    ? [for (final e in periodicFamilyColours.entries) (e.value, e.key.labelIn(lang))]
                    : [for (final e in periodicBlockColours.entries) (e.value, s.n('blockName', e.key.name))])
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 10, height: 10, color: colour),
                      const SizedBox(width: 4),
                      Text(text, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant)),
                    ],
                  ),
              ],
            ),
            Padding(padding: const EdgeInsets.only(top: 8), child: Text(context.l10n.kitPeriodicHint, style: hint)),
          ],
        );
      },
    );
  }

  Widget _cell(ChemElement e, double cell, double lead, double head, List<ChemElement>? hits) {
    final dim = hits != null && !hits.contains(e);
    return Positioned(
      left: lead + (e.col - 1) * cell,
      top: head + (e.row - 1) * cell + (e.row >= 9 ? cell * 0.4 : 0),
      width: cell - 1,
      height: cell - 1,
      child: GestureDetector(
        key: Key('element-${e.symbol}'),
        onTap: () => _open(e),
        child: Opacity(
          opacity: dim ? 0.25 : 1,
          child: Container(
            decoration: BoxDecoration(
              color: _colour(e),
              borderRadius: BorderRadius.circular(2),
              border: _pickedZ == e.z || (hits != null && hits.length <= 8 && !dim) ? Border.all(color: _dark, width: math.max(2, cell * 0.06)) : null,
            ),
            child: Stack(
              children: [
                if (cell >= 40)
                  Positioned(
                    left: 3,
                    top: 1,
                    child: Text('${e.z}', style: TextStyle(fontSize: cell * 0.2, color: _dark)),
                  ),
                Center(
                  child: Padding(
                    padding: EdgeInsets.only(top: cell >= 40 ? cell * 0.12 : 0),
                    child: Text(e.symbol, style: TextStyle(fontSize: cell * (cell >= 40 ? 0.38 : 0.42), fontWeight: FontWeight.w600, color: _dark)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _open(ChemElement e) {
    setState(() => _pickedZ = e.z);
    final l = context.l10n;
    final lang = boardLang(context);
    final s = periodicStrings(lang);
    final facts = elementFacts(e, lang);
    void put(List<BoardElement> els, BuildContext d) {
      Navigator.pop(d);
      widget.onInsert(els);
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      builder: (d) => SafeArea(
        child: SingleChildScrollView(
          key: const Key('element-sheet'),
          padding: const EdgeInsets.all(Kx.s20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: _colour(e), borderRadius: BorderRadius.circular(6)),
                    child: Text(e.symbol, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: _dark)),
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: Text('${e.z}  ·  ${e.nameIn(lang)}', key: const Key('element-name'), style: context.text.headlineSmall)),
                ],
              ),
              const SizedBox(height: Kx.s12),
              for (final (label, value) in facts)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 170, child: Text(label, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant))),
                      Expanded(child: Text(value, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600))),
                    ],
                  ),
                ),
              const SizedBox(height: Kx.s16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    key: const Key('element-card'),
                    onPressed: () => put(elementCard(z: e.z, symbol: e.symbol, name: e.nameIn(lang), mass: e.mass, color: _colour(e), configuration: e.configuration), d),
                    icon: const Icon(Icons.crop_square),
                    label: Text(l.kitElementCard),
                  ),
                  FilledButton.tonalIcon(
                    key: const Key('element-facts'),
                    onPressed: () => put([boardLines(['${e.symbol}  ${e.nameIn(lang)}', for (final (k, v) in facts) '$k: $v'], widget.ink)], d),
                    icon: const Icon(Icons.notes),
                    label: Text(s['factsCard']),
                  ),
                  if (e.z <= 20)
                    FilledButton.tonalIcon(
                      key: const Key('element-bohr'),
                      onPressed: () => put(bohrAtom(e.z, widget.ink, widget.accent), d),
                      icon: const Icon(Icons.blur_circular),
                      label: Text(l.kitBohrModel),
                    ),
                  if (atomColors.containsKey(e.symbol))
                    FilledButton.tonalIcon(
                      key: const Key('element-ball'),
                      onPressed: () => put(atomBall(e.symbol), d),
                      icon: const Icon(Icons.circle),
                      label: Text(l.kitAtomBall),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
