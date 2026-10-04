import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../board/chrome.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';
import 'homework_panel.dart';
import 'lesson_plan_panel.dart';
import 'math_panel.dart';
import 'read_board_panel.dart';
import 'quiz_panel.dart';

/// KINETIX AI: ask anything, plus the smart tools. Each tool opens as a page inside the
/// panel; the back arrow returns here.
class AiPanel extends StatelessWidget {
  const AiPanel({super.key, required this.ai});

  final AiController ai;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ai,
      builder: (context, _) {
        void home() => ai.open(AiView.home);
        return switch (ai.view) {
          AiView.home => _AiHome(ai: ai),
          AiView.quiz => QuizPanel(ai: ai, onBack: home),
          AiView.homework => HomeworkPanel(ai: ai, onBack: home),
          AiView.lessonPlan => LessonPlanPanel(ai: ai, onBack: home),
          AiView.math => MathPanel(ai: ai, onBack: home),
          AiView.readBoard => ReadBoardPanel(ai: ai, onBack: home),
        };
      },
    );
  }
}

class _AiHome extends StatefulWidget {
  const _AiHome({required this.ai});

  final AiController ai;

  @override
  State<_AiHome> createState() => _AiHomeState();
}

class _AiHomeState extends State<_AiHome> {
  late final _question = TextEditingController(text: widget.ai.question);

  AiController get ai => widget.ai;

  @override
  void dispose() {
    _question.dispose();
    super.dispose();
  }

  void _ask(String q, {bool fresh = false}) {
    if (q.trim().length < 2) return;
    if (!ai.canUseAi) {
      showBoardMessage(context, 'Sign in with the Teacher app to ask KINETIX AI.');
      return;
    }
    _question.text = q;
    FocusScope.of(context).unfocus();
    ai.ask(q, fresh: fresh);
  }

  @override
  Widget build(BuildContext context) {
    // Up to four tiles per row that fill the panel, whatever its width (the list has 24 px padding).
    return LayoutBuilder(
      builder: (context, box) {
        final available = box.maxWidth - 2 * Kx.s24;
        final columns = ((available + Kx.s12) / (96 + Kx.s12)).floor().clamp(2, 4);
        return _page(context, ((available - (columns - 1) * Kx.s12) / columns).clamp(80.0, 200.0).floorToDouble());
      },
    );
  }

  Widget _page(BuildContext context, double tileWidth) {
    final c = context.colors;
    Widget group(String title, List<Widget> tiles) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          Wrap(spacing: Kx.s12, runSpacing: Kx.s12, children: tiles),
        ],
      ),
    );
    ChromeTile soon(IconData i, String l, Color col) =>
        ChromeTile(icon: i, label: l, color: col, soon: true, width: tileWidth, onTap: () => showComingSoon(context, 'KINETIX AI $l'));
    ChromeTile tool(IconData i, String l, Color col, AiView v) =>
        ChromeTile(key: Key('ai-tool-${v.name}'), icon: i, label: l, color: col, width: tileWidth, onTap: () => ai.open(v));
    final classLabel = ai.board.session?.classLabel;

    return AiPanelPage(
      ai: ai,
      icon: Icons.auto_awesome,
      title: 'KINETIX AI',
      accent: aiAccent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
        children: [
          if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
          SearchBar(
            key: const Key('ai-ask'),
            controller: _question,
            hintText: classLabel == null ? 'Ask anything about a topic' : 'Ask anything about $classLabel',
            textStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 18)),
            leading: const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.auto_awesome_outlined)),
            trailing: [
              IconButton(tooltip: 'Speak', onPressed: () => showComingSoon(context, 'Voice questions'), icon: const Icon(Icons.mic_none)),
              IconButton(key: const Key('ai-ask-send'), tooltip: 'Ask', onPressed: () => _ask(_question.text), icon: const Icon(Icons.arrow_upward)),
            ],
            onSubmitted: _ask,
            elevation: const WidgetStatePropertyAll(0),
            backgroundColor: WidgetStatePropertyAll(c.surfaceContainerHigh),
            constraints: const BoxConstraints(minHeight: 56),
          ),
          Padding(
            padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s20),
            child: Text(
              'Answers follow your syllabus. Check before sharing with the class.',
              style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
            ),
          ),
          ListenableBuilder(
            listenable: ai.explain,
            builder: (context, _) {
              final t = ai.explain;
              if (t.loading) return AiLoading(label: 'KINETIX AI is preparing an explanation…');
              if (t.error != null) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s20),
                  child: AiError(message: t.error!, onRetry: () => _ask(ai.question)),
                );
              }
              final v = t.value;
              if (v == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: Kx.s24),
                child: _ExplanationCard(
                  question: ai.question,
                  result: v,
                  onFollowUp: _ask,
                  onRegenerate: () => _ask(ai.question, fresh: true),
                  onClose: () {
                    _question.clear();
                    t.clear();
                  },
                ),
              );
            },
          ),
          group('Teach', [
            soon(Icons.summarize_outlined, 'Summary', const Color(0xFF8AB4F8)),
            tool(Icons.quiz_outlined, 'Quick quiz', const Color(0xFF81C995), AiView.quiz),
            tool(Icons.co_present_outlined, 'Lesson plan', const Color(0xFFFDD663), AiView.lessonPlan),
            tool(Icons.assignment_outlined, 'Homework', const Color(0xFFF28B82), AiView.homework),
          ]),
          group('Maths & science', [
            tool(Icons.functions, 'Math solver', const Color(0xFF8AB4F8), AiView.math),
            soon(Icons.show_chart, 'Graph', const Color(0xFF81C995)),
            soon(Icons.grid_view, 'Periodic table', const Color(0xFFF28B82)),
            soon(Icons.science_outlined, 'Simulations', const Color(0xFFC58AF9)),
          ]),
          group('Look up', [
            soon(Icons.menu_book_outlined, 'Textbook', const Color(0xFFFDD663)),
            soon(Icons.public, 'Wikipedia', const Color(0xFFDADCE0)),
            soon(Icons.translate, 'Dictionary', const Color(0xFF78D9EC)),
            tool(Icons.document_scanner_outlined, 'Read board', const Color(0xFFFCAD70), AiView.readBoard),
          ]),
        ],
      ),
    );
  }
}

class _ExplanationCard extends StatelessWidget {
  const _ExplanationCard({required this.question, required this.result, required this.onFollowUp, required this.onRegenerate, required this.onClose});

  final String question;
  final AiResult<Explanation> result;
  final ValueChanged<String> onFollowUp;
  final VoidCallback onRegenerate;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final e = result.result;
    return Container(
      key: const Key('ai-explanation'),
      padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s12, Kx.s12, Kx.s20),
      decoration: BoxDecoration(color: c.surfaceContainer, borderRadius: BorderRadius.circular(Kx.rLg), border: Border.all(color: c.outlineVariant)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: aiAccent, size: 20),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(question, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleMedium?.copyWith(color: c.onSurfaceVariant)),
              ),
              IconButton(tooltip: 'Ask again for a new answer', onPressed: onRegenerate, icon: const Icon(Icons.refresh)),
              IconButton(key: const Key('ai-explanation-close'), tooltip: 'Clear', onPressed: onClose, icon: const Icon(Icons.close)),
            ],
          ),
          if (result.meta.preview) ...[const SizedBox(height: Kx.s8), AiNotice.preview()],
          if (result.meta.sources.isNotEmpty) ...[
            const SizedBox(height: Kx.s8),
            Row(
              key: const Key('ai-sources'),
              children: [
                Icon(Icons.menu_book_outlined, size: 16, color: c.onSurfaceVariant),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(
                    'Based on your syllabus: ${result.meta.sources.map((s) => s.title).join(', ')}',
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: Kx.s12),
          Padding(
            padding: const EdgeInsets.only(right: Kx.s8),
            child: Text(e.answer, style: TextStyle(fontSize: ClassType.lead, height: 1.45, color: c.onSurface)),
          ),
          if (e.keyPoints.isNotEmpty) ...[
            const AiSectionLabel('Key points'),
            for (final p in e.keyPoints)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s8, right: Kx.s8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: aiAccent, shape: BoxShape.circle)),
                    ),
                    const SizedBox(width: Kx.s12),
                    Expanded(child: Text(p, style: const TextStyle(fontSize: ClassType.body, height: 1.4))),
                  ],
                ),
              ),
          ],
          if (e.followUps.isNotEmpty) ...[
            const AiSectionLabel('Ask next'),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final f in e.followUps) SuggestionChip(text: f, onTap: () => onFollowUp(f)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
