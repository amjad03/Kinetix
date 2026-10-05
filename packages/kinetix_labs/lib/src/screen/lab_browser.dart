import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../benches/registry.dart';
import '../catalogue.dart';
import '../core/bench.dart';
import '../core/i18n.dart';
import '../core/lab.dart';

IconData labDomainIcon(LabDomain d) => switch (d) {
      LabDomain.physics => Icons.bolt_outlined,
      LabDomain.chemistry => Icons.science_outlined,
      LabDomain.biology => Icons.biotech_outlined,
      LabDomain.electronics => Icons.memory_outlined,
      LabDomain.forensics => Icons.fingerprint,
      LabDomain.maths => Icons.functions,
    };

/// Browse the virtual labs: search, filter by domain and level, and open one.
/// For the Student App (students do the labs themselves) and the board.
class LabBrowser extends StatefulWidget {
  const LabBrowser({super.key, this.initialLevels = const {}, this.lang, this.onOpen});

  /// Levels selected at the start (e.g. the student's class).
  final Set<LabLevel> initialLevels;
  final LabLang? lang;

  /// Opens a lab (default: [LabCatalogue.open]).
  final void Function(BuildContext context, LabEntry entry)? onOpen;

  @override
  State<LabBrowser> createState() => _LabBrowserState();
}

class _LabBrowserState extends State<LabBrowser> {
  final _query = TextEditingController();
  LabDomain? _domain;
  late final Set<LabLevel> _levels = {...widget.initialLevels};

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = widget.lang ?? LabLang.of(context);
    currentLabLang = lang;
    final c = context.colors;
    final labs = LabCatalogue.filter(domains: {?_domain}, levels: _levels, query: _query.text);
    final domains = {for (final e in LabCatalogue.entries) e.domain};
    final levels = {for (final e in LabCatalogue.entries) ...e.labLevels}.toList()..sort((a, b) => a.index.compareTo(b.index));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s4),
        child: TextField(
          key: const ValueKey('lab-search'),
          controller: _query,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: tr('Search labs'),
            border: const OutlineInputBorder(borderRadius: Kx.radiusXl),
            isDense: true,
            suffixIcon: _query.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () => setState(_query.clear),
                  ),
          ),
        ),
      ),
      SizedBox(
        height: 48,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          children: [
            for (final d in [null, ...LabDomain.values.where(domains.contains)])
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s4),
                child: ChoiceChip(
                  key: ValueKey('lab-domain-${d?.name ?? 'all'}'),
                  avatar: d == null ? null : Icon(labDomainIcon(d), size: 18),
                  label: Text(d?.label ?? tr('All')),
                  selected: _domain == d,
                  onSelected: (_) => setState(() => _domain = d),
                ),
              ),
          ],
        ),
      ),
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          children: [
            for (final l in levels)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s4),
                child: FilterChip(
                  key: ValueKey('lab-level-${l.code}'),
                  label: Text(l.label),
                  selected: _levels.contains(l),
                  visualDensity: VisualDensity.compact,
                  onSelected: (on) => setState(() => on ? _levels.add(l) : _levels.remove(l)),
                ),
              ),
          ],
        ),
      ),
      Expanded(
        child: labs.isEmpty
            ? KxEmptyState(icon: Icons.science_outlined, message: tr('No labs match.'))
            : ListView.separated(
                key: const ValueKey('lab-list'),
                padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s24),
                itemCount: labs.length,
                separatorBuilder: (_, _) => const SizedBox(height: Kx.s8),
                itemBuilder: (context, i) {
                  final e = labs[i];
                  return Material(
                    color: c.surfaceContainerLow,
                    borderRadius: Kx.radiusLg,
                    child: InkWell(
                      key: ValueKey('lab-open-${e.id}'),
                      borderRadius: Kx.radiusLg,
                      onTap: () => (widget.onOpen ?? (context, e) => LabCatalogue.open(context, e.id, lang: lang))(context, e),
                      child: Padding(
                        padding: const EdgeInsets.all(Kx.s8),
                        child: Row(children: [
                          LabThumb(e, width: 96),
                          const SizedBox(width: Kx.s12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(e.titleIn(lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                              if (e.lab != null)
                                Text(e.lab!.summary.of(lang),
                                    maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                              const SizedBox(height: Kx.s4),
                              Text(
                                [e.domain.label, ...e.labLevels.map((l) => l.label)].join(' · '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.labelSmall?.copyWith(color: c.primary),
                              ),
                            ]),
                          ),
                        ]),
                      ),
                    ),
                  );
                },
              ),
      ),
    ]);
  }
}

/// A lab's picture: its bench drawn at its preview settings.
class LabThumb extends StatelessWidget {
  final LabEntry entry;
  final double width;
  const LabThumb(this.entry, {super.key, this.width = 112});

  @override
  Widget build(BuildContext context) {
    final l = entry.lab;
    final bench = l == null ? null : labBenches[l.bench];
    return ClipRRect(
      borderRadius: Kx.radiusMd,
      child: SizedBox(
        width: width,
        height: width * 3 / 4,
        child: bench == null
            ? ColoredBox(color: context.colors.secondaryContainer, child: Icon(labDomainIcon(entry.domain), color: context.colors.onSecondaryContainer, size: width * 0.4))
            // Drawn at a normal size, then scaled down, so text and lines keep their proportions.
            : FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: 640,
                  height: 480,
                  child: ColoredBox(color: LabInk.paper, child: CustomPaint(painter: _ThumbPainter(bench, {...bench.preview, ...l!.setup}))),
                ),
              ),
      ),
    );
  }
}

class _ThumbPainter extends CustomPainter {
  final LabBench bench;
  final LabParams params;
  _ThumbPainter(this.bench, this.params);

  @override
  void paint(Canvas canvas, Size size) => bench.paint(canvas, size, params, 0.6);

  @override
  bool shouldRepaint(_ThumbPainter old) => old.bench != bench;
}
