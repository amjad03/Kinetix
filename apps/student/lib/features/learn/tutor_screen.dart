import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import 'ask_controller.dart';

/// Chat with the AI tutor. It remembers the conversation, so the next question builds on the last, and it knows from the
/// student's own marks and attendance which subjects need the most help. The latest conversation reopens where it stopped.
class TutorScreen extends StatefulWidget {
  const TutorScreen({super.key, required this.api, required this.language});

  final StudentApi api;
  final AiLanguage language;

  static Future<void> open(BuildContext context, StudentApi api, {required AiLanguage language}) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TutorScreen(api: api, language: language)));

  @override
  State<TutorScreen> createState() => _TutorScreenState();
}

class _TutorScreenState extends State<TutorScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <TutorMessage>[];
  TutorReply? _last;
  String? _threadId;
  bool _loading = true;
  bool _busy = false;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _resume();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Reopens the latest conversation, if there is one.
  Future<void> _resume() async {
    try {
      final threads = await widget.api.tutorThreads();
      if (threads.isNotEmpty) {
        final earlier = await widget.api.tutorMessages(threads.first.id);
        if (!mounted) return;
        setState(() {
          _threadId = threads.first.id;
          _messages.addAll(earlier);
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send([String? text]) async {
    final q = (text ?? _input.text).trim();
    if (q.length < 2 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _messages.add(TutorMessage(fromStudent: true, text: q));
      _input.clear();
    });
    _toEnd();
    try {
      final r = await widget.api.tutorAsk(question: q, language: widget.language, threadId: _threadId);
      if (!mounted) return;
      setState(() {
        _threadId = r.threadId;
        _last = r;
        _messages.add(TutorMessage(fromStudent: false, text: r.answer));
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _messages.removeLast();
          _input.text = q;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      _toEnd();
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
  });

  void _fresh() => setState(() {
    _threadId = null;
    _last = null;
    _messages.clear();
    _error = null;
  });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final err = _error == null ? null : describeAiError(l, _error!);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.tutorTitle),
        actions: [IconButton(key: const Key('tutorNew'), tooltip: l.tutorNew, icon: const Icon(Icons.add_comment_outlined), onPressed: _busy || _messages.isEmpty ? null : _fresh)],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                ? Center(child: Padding(padding: const EdgeInsets.all(Kx.s24), child: Text(l.tutorEmpty, textAlign: TextAlign.center, style: context.text.bodyLarge)))
                : ListView(
                    key: const Key('tutorList'),
                    controller: _scroll,
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      for (final (i, m) in _messages.indexed)
                        Align(
                          alignment: m.fromStudent ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            key: Key('tutorMsg-$i'),
                            margin: const EdgeInsets.only(bottom: Kx.s8),
                            padding: const EdgeInsets.all(Kx.s12),
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.85),
                            decoration: BoxDecoration(color: m.fromStudent ? c.primaryContainer : c.surfaceContainerHighest, borderRadius: Kx.radiusLg),
                            child: SelectableText(m.text, style: context.text.bodyLarge),
                          ),
                        ),
                      if (_busy) const Padding(padding: EdgeInsets.all(Kx.s8), child: Align(alignment: Alignment.centerLeft, child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)))),
                      if (_last != null && !_busy) ...[
                        if (_last!.preview) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(l.tutorPreview, key: const Key('tutorPreview'), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                        if (_last!.nextSteps.isNotEmpty) ...[
                          Text(l.tutorNext, style: context.text.titleSmall),
                          for (final s in _last!.nextSteps) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('• $s', key: Key('tutorStep-$s'))),
                          const SizedBox(height: Kx.s8),
                        ],
                        Wrap(
                          spacing: Kx.s8,
                          children: [for (final (i, f) in _last!.followUps.indexed) ActionChip(key: Key('tutorFollowUp-$i'), label: Text(f), onPressed: () => _send(f))],
                        ),
                      ],
                    ],
                  ),
          ),
          if (err != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              child: Text(err.message, key: const Key('tutorError'), style: TextStyle(color: c.error)),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(Kx.s8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('tutorInput'),
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 1000,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _send,
                      decoration: InputDecoration(hintText: l.tutorHint, counterText: '', border: const OutlineInputBorder()),
                    ),
                  ),
                  const SizedBox(width: Kx.s8),
                  IconButton.filled(key: const Key('tutorSend'), tooltip: l.tutorSend, onPressed: _busy ? null : _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
