import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import '../college/college_builders.dart' show tableSheet;
import 'civil_strings.dart';

/// A reference table from an Indian Standard, kept offline for teaching. The first row is the
/// heading. Values are the commonly taught ones; the panel says to refer to the latest code.
class IsCodeTable {
  const IsCodeTable(this.id, this.code, this.title, this.rows, {this.note = ''});
  final String id, code, title, note;
  final List<List<String>> rows;

  bool matches(String q) {
    final words = q.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final hay = '$code $title $note ${rows.map((r) => r.join(' ')).join(' ')}'.toLowerCase();
    return words.every(hay.contains);
  }
}

const isCodeDisclaimer = 'For teaching; refer to the latest code.';

const isCodeTables = <IsCodeTable>[
  IsCodeTable('is456-grades', 'IS 456:2000', 'Grades of concrete (Table 2)', [
    ['Group', 'Grade', 'fck (N/mm²)', 'Ec = 5000√fck (N/mm²)'],
    ['Ordinary', 'M10', '10', '15 811'],
    ['Ordinary', 'M15', '15', '19 365'],
    ['Ordinary', 'M20', '20', '22 361'],
    ['Standard', 'M25', '25', '25 000'],
    ['Standard', 'M30', '30', '27 386'],
    ['Standard', 'M35', '35', '29 580'],
    ['Standard', 'M40', '40', '31 623'],
    ['Standard', 'M45', '45', '33 541'],
    ['Standard', 'M50', '50', '35 355'],
    ['Standard', 'M55', '55', '37 081'],
    ['High strength', 'M60 to M80', '60 to 80', '38 730 to 44 721'],
  ], note: 'Minimum grade for RCC: M20 (mild exposure).'),
  IsCodeTable('is456-cover', 'IS 456:2000', 'Exposure and nominal cover (Table 16)', [
    ['Exposure', 'Nominal cover (mm)', 'Example'],
    ['Mild', '20', 'Protected against weather, except coastal areas'],
    ['Moderate', '30', 'Sheltered from rain; buried in non-aggressive soil'],
    ['Severe', '45', 'Alternate wetting and drying; coastal'],
    ['Very severe', '50', 'Sea water spray; corrosive fumes'],
    ['Extreme', '75', 'Tidal zone; aggressive chemicals'],
  ], note: 'Mild: 25 mm for main bars up to 12 mm may be reduced by 5 mm. Columns: not less than 40 mm or the bar diameter.'),
  IsCodeTable('is456-durability', 'IS 456:2000', 'Minimum cement, maximum w/c and minimum grade (Table 5)', [
    ['Exposure', 'PCC min cement (kg/m³)', 'PCC max w/c', 'PCC min grade', 'RCC min cement (kg/m³)', 'RCC max w/c', 'RCC min grade'],
    ['Mild', '220', '0.60', '—', '300', '0.55', 'M20'],
    ['Moderate', '240', '0.60', 'M15', '300', '0.50', 'M25'],
    ['Severe', '250', '0.50', 'M20', '320', '0.45', 'M30'],
    ['Very severe', '260', '0.45', 'M20', '340', '0.45', 'M35'],
    ['Extreme', '280', '0.40', 'M25', '360', '0.40', 'M40'],
  ], note: 'Cement content is for 20 mm nominal maximum aggregate.'),
  IsCodeTable('is456-psf', 'IS 456:2000', 'Partial safety factors (Table 18, 36.4.2)', [
    ['Load combination', 'DL', 'LL', 'WL / EL', 'State'],
    ['DL + LL', '1.5', '1.5', '—', 'Limit state of collapse'],
    ['DL + WL', '1.5 or 0.9*', '—', '1.5', 'Limit state of collapse'],
    ['DL + LL + WL', '1.2', '1.2', '1.2', 'Limit state of collapse'],
    ['DL + LL', '1.0', '1.0', '—', 'Serviceability'],
    ['DL + WL', '1.0', '—', '1.0', 'Serviceability'],
    ['DL + LL + WL', '1.0', '0.8', '0.8', 'Serviceability'],
    ['Material γm', 'Concrete 1.5', 'Steel 1.15', '', 'Limit state of collapse'],
  ], note: '* 0.9 where dead load helps stability (overturning, stress reversal).'),
  IsCodeTable('is456-wsm', 'IS 456:2000', 'Permissible stresses in concrete and modular ratio (Annex B, Table 21)', [
    ['Grade', 'σcbc bending (N/mm²)', 'σcc direct (N/mm²)', 'm = 280 / 3σcbc'],
    ['M10', '3.0', '2.5', '31.11'],
    ['M15', '5.0', '4.0', '18.67'],
    ['M20', '7.0', '5.0', '13.33'],
    ['M25', '8.5', '6.0', '10.98'],
    ['M30', '10.0', '8.0', '9.33'],
    ['M35', '11.5', '9.0', '8.12'],
    ['M40', '13.0', '10.0', '7.18'],
    ['M45', '14.5', '11.0', '6.44'],
    ['M50', '16.0', '12.0', '5.83'],
  ], note: 'Working stress method.'),
  IsCodeTable('is456-steel-wsm', 'IS 456:2000', 'Permissible stresses in steel reinforcement (Annex B, Table 22)', [
    ['Stress', 'Fe 250 (mild steel)', 'Fe 415', 'Fe 500'],
    ['Tension σst (up to 20 mm)', '140', '230', '275'],
    ['Tension σst (over 20 mm)', '130', '230', '275'],
    ['Compression in column bars σsc', '130', '190', '190'],
  ], note: 'N/mm².'),
  IsCodeTable('is456-lsm-steel', 'IS 456:2000', 'Reinforcing steel: fy and limiting neutral axis (38.1)', [
    ['Steel', 'fy (N/mm²)', 'xu,max / d', 'Es (N/mm²)'],
    ['Fe 250', '250', '0.53', '2 × 10⁵'],
    ['Fe 415', '415', '0.48', '2 × 10⁵'],
    ['Fe 500', '500', '0.46', '2 × 10⁵'],
  ]),
  IsCodeTable('is456-span-depth', 'IS 456:2000', 'Basic span to effective depth ratios (23.2.1)', [
    ['Support', 'Basic l/d (span up to 10 m)'],
    ['Cantilever', '7'],
    ['Simply supported', '20'],
    ['Continuous', '26'],
  ], note: 'Spans over 10 m: multiply by 10/span (not cantilevers); then modify for tension and compression steel.'),
  IsCodeTable('is800-grades', 'IS 800:2007 / IS 2062', 'Structural steel grades', [
    ['Grade', 'fy (N/mm²), t < 20 mm', 'fy, 20–40 mm', 'fy, > 40 mm', 'fu (N/mm²)'],
    ['E250', '250', '240', '230', '410'],
    ['E300', '300', '290', '280', '440'],
    ['E350', '350', '330', '320', '490'],
    ['E410', '410', '390', '380', '540'],
    ['E450', '450', '430', '420', '570'],
  ], note: 'E = 2 × 10⁵ N/mm², G = 0.769 × 10⁵ N/mm², ν = 0.3, density 7850 kg/m³.'),
  IsCodeTable('is800-psf', 'IS 800:2007', 'Partial safety factors (Tables 4 and 5)', [
    ['Factor', 'Value'],
    ['γm0: resistance governed by yielding', '1.10'],
    ['γm0: buckling', '1.10'],
    ['γm1: ultimate stress', '1.25'],
    ['γmb: bolts (shop and field)', '1.25'],
    ['γmw: welds, shop / field', '1.25 / 1.50'],
    ['Load: DL + LL (collapse)', '1.5, 1.5'],
    ['Load: DL + LL + WL or EL (collapse)', '1.2, 1.2, 1.2'],
    ['Load: DL + WL or EL (collapse)', '1.5 (0.9*), 1.5'],
  ], note: '* 0.9 where dead load helps stability.'),
  IsCodeTable('is875-unit-weights', 'IS 875 (Part 1):1987', 'Unit weights of materials (typical)', [
    ['Material', 'Unit weight (kN/m³)'],
    ['Plain cement concrete', '24'],
    ['Reinforced cement concrete', '25'],
    ['Brick masonry (burnt clay)', '18.85'],
    ['Cement mortar', '20.4'],
    ['Structural steel', '78.5'],
    ['Water', '9.81'],
    ['Sand, dry', '15.7 to 16.7'],
    ['Timber, teak', '6.3'],
  ], note: 'Typical values; the code lists ranges.'),
  IsCodeTable('is875-live-loads', 'IS 875 (Part 2):1987', 'Imposed (live) floor loads by occupancy (typical)', [
    ['Occupancy', 'UDL (kN/m²)'],
    ['Residential: rooms, kitchens, toilets', '2.0'],
    ['Residential: corridors, stairs, balconies', '3.0'],
    ['Office: general, with separate storage', '2.5'],
    ['Office: without separate storage', '4.0'],
    ['Educational: classrooms', '3.0'],
    ['Hospital: wards', '2.0'],
    ['Assembly: fixed seats', '4.0'],
    ['Assembly: without fixed seats', '5.0'],
    ['Retail shops', '4.0'],
    ['Library reading rooms', '4.0'],
    ['Industrial: light / medium / heavy', '5.0 / 7.0 / 10.0'],
    ['Garages: light vehicles', '2.5'],
    ['Roofs: accessible / not accessible', '1.5 / 0.75'],
  ], note: 'Check the code for concentrated loads and reductions.'),
  IsCodeTable('is1893-zones', 'IS 1893 (Part 1):2016', 'Seismic zone factor Z (Table 3)', [
    ['Seismic zone', 'II', 'III', 'IV', 'V'],
    ['Intensity', 'Low', 'Moderate', 'Severe', 'Very severe'],
    ['Z', '0.10', '0.16', '0.24', '0.36'],
  ], note: 'Importance factor I: 1.5 important, 1.2 residential or commercial with occupancy over 200, 1.0 others. R: OMRF 3.0, SMRF 5.0. The zone map is revised from time to time.'),
  IsCodeTable('ismb', 'IS 808 / SP 6(1)', 'ISMB beams (common sizes)', [
    ['Section', 'Mass (kg/m)', 'Area (cm²)', 'Depth (mm)', 'Flange (mm)', 'tw (mm)', 'tf (mm)', 'Ixx (cm⁴)', 'Zxx (cm³)'],
    ['ISMB 100', '11.5', '14.6', '100', '75', '4.0', '7.2', '257.5', '51.5'],
    ['ISMB 150', '14.9', '19.0', '150', '80', '4.8', '7.6', '726.4', '96.9'],
    ['ISMB 200', '25.4', '32.3', '200', '100', '5.7', '10.8', '2235.4', '223.5'],
    ['ISMB 250', '37.3', '47.6', '250', '125', '6.9', '12.5', '5131.6', '410.5'],
    ['ISMB 300', '44.2', '56.3', '300', '140', '7.5', '12.4', '8603.6', '573.6'],
    ['ISMB 350', '52.4', '66.7', '350', '140', '8.1', '14.2', '13630.3', '778.9'],
    ['ISMB 400', '61.6', '78.5', '400', '140', '8.9', '16.0', '20458.4', '1022.9'],
    ['ISMB 450', '72.4', '92.3', '450', '150', '9.4', '17.4', '30390.8', '1350.7'],
    ['ISMB 500', '86.9', '110.7', '500', '180', '10.2', '17.2', '45218.3', '1808.7'],
    ['ISMB 600', '122.6', '156.2', '600', '210', '12.0', '20.8', '91813.0', '3060.4'],
  ], note: 'From the steel tables; check the current table before design.'),
  IsCodeTable('ismc', 'IS 808 / SP 6(1)', 'ISMC channels (common sizes)', [
    ['Section', 'Mass (kg/m)', 'Area (cm²)', 'Depth (mm)', 'Flange (mm)', 'tw (mm)', 'tf (mm)', 'Ixx (cm⁴)'],
    ['ISMC 75', '6.8', '8.7', '75', '40', '4.4', '7.3', '76.0'],
    ['ISMC 100', '9.2', '11.7', '100', '50', '4.7', '7.5', '186.7'],
    ['ISMC 150', '16.4', '20.9', '150', '75', '5.4', '9.0', '779.4'],
    ['ISMC 200', '22.1', '28.2', '200', '75', '6.1', '11.4', '1819.3'],
    ['ISMC 250', '30.4', '38.7', '250', '80', '7.1', '14.1', '3816.8'],
    ['ISMC 300', '35.8', '45.6', '300', '90', '7.6', '13.6', '6362.6'],
    ['ISMC 400', '49.4', '62.9', '400', '100', '8.6', '15.3', '15082.8'],
  ], note: 'From the steel tables; check the current table before design.'),
  IsCodeTable('isa', 'IS 808 / SP 6(1)', 'ISA equal angles (common sizes)', [
    ['Section', 'Mass (kg/m)', 'Area (cm²)'],
    ['ISA 50 × 50 × 6', '4.5', '5.68'],
    ['ISA 65 × 65 × 6', '5.8', '7.44'],
    ['ISA 75 × 75 × 8', '8.9', '11.38'],
    ['ISA 90 × 90 × 8', '10.8', '13.79'],
    ['ISA 100 × 100 × 10', '14.9', '19.03'],
  ], note: 'From the steel tables; check the current table before design.'),
];

TextElement _label(String t, Offset at, Color c, {double size = 20, bool bold = false}) =>
    TextElement(id: newElementId(), position: at, text: t, color: c, fontSize: size, size: measureBoardText(t, size, bold: bold), bold: bold);

/// [t] as board elements: its title, the table as a sheet, and the teaching note.
List<BoardElement> isCodeElements(IsCodeTable t, Color accent, Color ink) {
  final title = _label('${t.code}: ${t.title}', Offset.zero, accent, size: 26, bold: true);
  final sheet = tableSheet(t.rows, accent, widths: [for (var c = 0; c < t.rows.first.length; c++) c == 0 ? 280 : 150]).translated(Offset(0, title.size.height + 14));
  final below = sheet.bounds.bottom + 12;
  return [
    title,
    sheet,
    if (t.note.isNotEmpty) _label(t.note, Offset(0, below), ink, size: 16),
    _label(isCodeDisclaimer, Offset(0, below + (t.note.isNotEmpty ? 28 : 0)), const Color(0xFFC62828), size: 16, bold: true),
  ];
}

/// The searchable list of tables; inserts the chosen one on the board.
Future<void> openIsCodes(BuildContext context, WhiteboardController wb, Color accent, Color ink) async {
  final t = await showPanelDialog<IsCodeTable>(context: context, builder: (_) => const BoardChromeTheme(child: IsCodeBrowser()));
  if (t != null) wb.insert(isCodeElements(t, accent, ink));
}

class IsCodeBrowser extends StatefulWidget {
  const IsCodeBrowser({super.key});

  @override
  State<IsCodeBrowser> createState() => _IsCodeBrowserState();
}

class _IsCodeBrowserState extends State<IsCodeBrowser> {
  String _q = '';
  IsCodeTable? _open;

  @override
  Widget build(BuildContext context) {
    final s = civilStrings(context);
    final l = context.l10n;
    final hits = [for (final t in isCodeTables) if (t.matches(_q)) t];
    final open = _open != null && hits.contains(_open) ? _open : hits.firstOrNull;
    return AlertDialog(
      key: const Key('is-codes'),
      title: Text(s['codes']),
      content: SizedBox(
        width: 900,
        height: 560,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s['codesHint'], style: context.text.bodySmall?.copyWith(color: const Color(0xFFC62828), fontWeight: FontWeight.w600)),
            const SizedBox(height: Kx.s8),
            TextField(
              key: const Key('is-codes-search'),
              decoration: InputDecoration(isDense: true, prefixIcon: const Icon(Icons.search), labelText: s['search']),
              onChanged: (v) => setState(() => _q = v),
            ),
            const SizedBox(height: Kx.s8),
            Expanded(
              child: hits.isEmpty
                  ? Center(child: Text(s['noMatch']))
                  // On a phone the list takes 40% of the width, so the table keeps room.
                  : LayoutBuilder(builder: (context, box) => Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          width: box.maxWidth < 760 ? box.maxWidth * 0.4 : 300,
                          child: ListView(
                            children: [
                              for (final t in hits)
                                ListTile(
                                  key: Key('is-code-${t.id}'),
                                  dense: true,
                                  selected: t == open,
                                  title: Text(t.title),
                                  subtitle: Text(t.code),
                                  onTap: () => setState(() => _open = t),
                                ),
                            ],
                          ),
                        ),
                        const VerticalDivider(),
                        if (open != null)
                          Expanded(
                            child: SingleChildScrollView(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${open.code}: ${open.title}', style: context.text.titleSmall),
                                  const SizedBox(height: Kx.s8),
                                  SingleChildScrollView(
                                    scrollDirection: Axis.horizontal,
                                    child: DataTable(
                                      headingRowHeight: 36,
                                      dataRowMinHeight: 28,
                                      dataRowMaxHeight: 40,
                                      columns: [for (final h in open.rows.first) DataColumn(label: Text(h))],
                                      rows: [for (final r in open.rows.skip(1)) DataRow(cells: [for (var c = 0; c < open.rows.first.length; c++) DataCell(Text(c < r.length ? r[c] : ''))])],
                                    ),
                                  ),
                                  if (open.note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(open.note, style: context.text.bodySmall)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    )),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton.icon(
          key: const Key('is-codes-insert'),
          onPressed: open == null ? null : () => Navigator.pop(context, open),
          icon: const Icon(Icons.add),
          label: Text(s['insert']),
        ),
      ],
    );
  }
}
