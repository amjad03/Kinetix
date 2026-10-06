import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// Graph templates by subject and topic. The period's subject and topic preselect the list and
/// the best-matching graph; "Add to board" places it as an editable graph (double-tap it to
/// change its letters, labels, shading and points).
class GraphTemplatesPanel extends StatefulWidget {
  const GraphTemplatesPanel({super.key, required this.controller, this.subject, this.topic});

  final WhiteboardController controller;
  final String? subject;
  final String? topic;

  @override
  State<GraphTemplatesPanel> createState() => _GraphTemplatesPanelState();
}

class _GraphTemplatesPanelState extends State<GraphTemplatesPanel> {
  late GraphSubject? _subject = subjectsFor(widget.subject).firstOrNull;
  late String? _topic = (widget.topic ?? '').trim().isEmpty ? null : widget.topic!.trim();
  String _query = '';
  late GraphTemplate? _picked = preselectGraphTemplate(subject: widget.subject, topic: widget.topic);

  List<GraphTemplate> get _list => matchGraphTemplates(subject: _subject?.name, topic: _topic, query: _query);

  /// Topics offered: the period's own, then each template of the subject.
  List<String> _topics(ToolStrings s) => {
    if (widget.topic != null && widget.topic!.trim().isNotEmpty) widget.topic!.trim(),
    for (final t in graphTemplates)
      if (_subject == null || t.subject == _subject) s.template(t),
  }.toList();

  void _add(ToolStrings s) {
    final t = _picked ?? _list.firstOrNull;
    if (t == null) return;
    widget.controller.insert([t.build(color: const Color(0xFF1F5FBF), title: s.template(t))]);
  }

  @override
  Widget build(BuildContext context) {
    final s = ToolStrings.of(context);
    final list = _list;
    final topics = _topics(s);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<GraphSubject?>(
                  key: const Key('graph-subject'),
                  initialValue: _subject,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: s.t('subject'), isDense: true, border: const OutlineInputBorder()),
                  items: [
                    DropdownMenuItem(value: null, child: Text(s.t('allSubjects'))),
                    for (final g in GraphSubject.values)
                      DropdownMenuItem(
                        value: g,
                        child: Text(s.subject(g), overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() {
                    _subject = v;
                    _picked = null;
                  }),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String?>(
                  key: ValueKey('graph-topic-${_subject?.name}'),
                  initialValue: topics.contains(_topic) ? _topic : null,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: s.t('topic'), isDense: true, border: const OutlineInputBorder()),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('—')),
                    for (final t in topics)
                      DropdownMenuItem(
                        value: t,
                        child: Text(t, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() {
                    _topic = v;
                    // A template's own title picks it; the period topic picks its best match.
                    _picked = graphTemplates.where((t) => s.template(t) == v).firstOrNull ?? preselectGraphTemplate(subject: _subject?.name, topic: v);
                  }),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: TextField(
            key: const Key('graph-search'),
            decoration: InputDecoration(hintText: s.t('search'), prefixIcon: const Icon(Icons.search), isDense: true, border: const OutlineInputBorder()),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? Center(child: Text(s.t('noMatches')))
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 200,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.05,
                  ),
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final t = list[i];
                    final on = t == _picked;
                    return InkWell(
                      key: Key('graph-template-${t.id}'),
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => setState(() => _picked = t),
                      onDoubleTap: () {
                        setState(() => _picked = t);
                        _add(s);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: on ? Theme.of(context).colorScheme.primary : const Color(0x22000000), width: on ? 2.5 : 1),
                        ),
                        child: Column(
                          children: [
                            Expanded(
                              child: CustomPaint(painter: _ThumbPainter(t), size: Size.infinite),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              s.template(t),
                              maxLines: 2,
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            key: const Key('graph-add'),
            onPressed: list.isEmpty && _picked == null ? null : () => _add(s),
            icon: const Icon(Icons.add_chart),
            label: Text(s.t('addToBoard')),
          ),
        ),
      ],
    );
  }
}

class _ThumbPainter extends CustomPainter {
  _ThumbPainter(this.t);

  final GraphTemplate t;

  @override
  void paint(Canvas canvas, Size size) {
    final g = t.build(color: const Color(0xFF1F5FBF), width: size.width, title: '');
    final k = size.height / g.rect.height;
    canvas.save();
    if (k < 1) {
      canvas
        ..translate((size.width - size.width * k) / 2, 0)
        ..scale(k);
    }
    paintGraph(canvas, g.copyWith(xLabel: '', yLabel: '', expression: g.expression));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ThumbPainter old) => old.t != t;
}
