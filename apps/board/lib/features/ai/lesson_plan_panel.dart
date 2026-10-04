import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../board/chrome.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';

const lessonAccent = Color(0xFFFDD663);

/// Lesson plan: objectives, timed steps, materials and how to check understanding.
class LessonPlanPanel extends StatefulWidget {
  const LessonPlanPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<LessonPlanPanel> createState() => _LessonPlanPanelState();
}

class _LessonPlanPanelState extends State<LessonPlanPanel> {
  late final _topic = TextEditingController(text: widget.ai.lessonTopic ?? widget.ai.defaultTopic);

  AiController get ai => widget.ai;

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  void _generate({bool fresh = false}) {
    if (!ai.canUseAi) {
      showBoardMessage(context, 'Sign in with the Teacher app to plan a lesson with KINETIX AI.');
      return;
    }
    if (_topic.text.trim().length < 2) {
      showBoardMessage(context, 'Type a topic for the lesson first.');
      return;
    }
    FocusScope.of(context).unfocus();
    ai.generateLessonPlan(_topic.text, fresh: fresh);
  }

  @override
  Widget build(BuildContext context) {
    return AiPanelPage(
      ai: ai,
      icon: Icons.co_present_outlined,
      title: 'Lesson plan',
      accent: lessonAccent,
      onBack: widget.onBack,
      child: ListenableBuilder(
        listenable: Listenable.merge([ai, ai.lessonPlan]),
        builder: (context, _) {
          final task = ai.lessonPlan;
          final plan = task.value;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              TextField(
                key: const Key('lesson-topic'),
                controller: _topic,
                style: const TextStyle(fontSize: 18),
                decoration: const InputDecoration(labelText: 'Topic', hintText: 'e.g. The water cycle'),
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _generate(),
              ),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s16,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  NumberPicker(
                    label: 'Length',
                    value: ai.lessonMinutes,
                    options: const [30, 40, 45, 55, 60, 90],
                    suffix: ' min',
                    onChanged: (v) => setState(() => ai.lessonMinutes = v),
                  ),
                  FilledButton.icon(
                    key: const Key('lesson-generate'),
                    onPressed: task.loading ? null : _generate,
                    icon: const Icon(Icons.auto_awesome),
                    label: Text(plan == null ? 'Plan lesson' : 'Plan again'),
                  ),
                  if (plan != null && !task.loading)
                    OutlinedButton.icon(onPressed: () => _generate(fresh: true), icon: const Icon(Icons.refresh), label: const Text('Regenerate')),
                ],
              ),
              const SizedBox(height: Kx.s16),
              if (task.loading) const AiLoading(label: 'Planning the lesson…'),
              if (task.error != null) AiError(message: task.error!, onRetry: _generate),
              if (plan != null && !task.loading) ...[
                const Divider(height: Kx.s24),
                if (plan.meta.preview) AiNotice.preview(),
                _PlanView(plan: plan.result, topic: ai.lessonTopic ?? ''),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _PlanView extends StatelessWidget {
  const _PlanView({required this.plan, required this.topic});

  final LessonPlan plan;
  final String topic;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final total = plan.steps.fold(0, (s, x) => s + x.minutes);
    const body = TextStyle(fontSize: 18, height: 1.4);
    return Column(
      key: const Key('lesson-plan'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AiSectionLabel('Objectives'),
        for (final o in plan.objectives)
          Padding(
            padding: const EdgeInsets.only(bottom: Kx.s8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(padding: const EdgeInsets.only(top: 2), child: Icon(Icons.flag_outlined, size: 20, color: c.primary)),
                const SizedBox(width: Kx.s12),
                Expanded(child: Text(o, style: body)),
              ],
            ),
          ),
        AiSectionLabel('Steps · $total min'),
        for (var i = 0; i < plan.steps.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 64,
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
                        decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: BorderRadius.circular(Kx.rSm)),
                        child: Text(
                          '${plan.steps[i].minutes} min',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.onSecondaryContainer),
                        ),
                      ),
                      if (i < plan.steps.length - 1) Expanded(child: Container(width: 2, color: c.outlineVariant)),
                    ],
                  ),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: Kx.s16, top: 2),
                    child: Text(plan.steps[i].activity, style: body),
                  ),
                ),
              ],
            ),
          ),
        if (plan.materials.isNotEmpty) ...[
          const AiSectionLabel('Materials'),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final m in plan.materials)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: 6),
                  decoration: BoxDecoration(border: Border.all(color: c.outlineVariant), borderRadius: BorderRadius.circular(Kx.rSm)),
                  child: Text(m, style: const TextStyle(fontSize: 15)),
                ),
            ],
          ),
        ],
        const AiSectionLabel('Check understanding'),
        Text(plan.assessment, style: body),
      ],
    );
  }
}
