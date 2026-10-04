import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../board/side_panel.dart';
import 'ai_controller.dart';

/// KINETIX AI's accent (the AI toolbar group).
const aiAccent = Color(0xFFA142F4);

/// Shown with every placeholder result, so nobody mistakes it for a real answer.
const previewLabel = 'Preview — connect the KINETIX AI server for real answers';

/// Text sizes for reading from the back of a classroom.
abstract final class ClassType {
  static const double body = 20;
  static const double lead = 22;
  static const double small = 16;
}

/// The language used for every AI task, as a compact menu for page headers.
class AiLanguageMenu extends StatelessWidget {
  const AiLanguageMenu({super.key, required this.ai, this.compact = false});

  final AiController ai;

  /// Short label (EN, हि, ಕ) for narrow panels.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ai,
      builder: (context, _) => PopupMenuButton<AiLanguage>(
        key: const Key('ai-language'),
        tooltip: 'Language for KINETIX AI',
        initialValue: ai.language,
        onSelected: ai.setLanguage,
        position: PopupMenuPosition.under,
        itemBuilder: (context) => [
          for (final l in AiLanguage.values)
            PopupMenuItem(key: Key('ai-language-${l.name}'), value: l, child: Text(l.label, style: const TextStyle(fontSize: 18))),
        ],
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          decoration: BoxDecoration(
            border: Border.all(color: context.colors.outlineVariant),
            borderRadius: BorderRadius.circular(Kx.rSm),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.translate, size: 18, color: context.colors.onSurfaceVariant),
              const SizedBox(width: Kx.s8),
              Text(compact ? ai.language.short : ai.language.label, style: context.text.labelLarge),
              Icon(Icons.arrow_drop_down, color: context.colors.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// A panel page for an AI tool, with the language menu in the title row.
class AiPanelPage extends StatelessWidget {
  const AiPanelPage({super.key, required this.ai, required this.icon, required this.title, required this.child, this.accent, this.onBack});

  final AiController ai;
  final IconData icon;
  final String title;
  final Widget child;
  final Color? accent;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) => PanelPage(
      icon: icon,
      title: title,
      accent: accent,
      onBack: onBack,
      trailing: AiLanguageMenu(ai: ai, compact: box.maxWidth < 480),
      child: child,
    ),
  );
}

/// A tinted message strip: preview label, errors, sign-in hints.
class AiNotice extends StatelessWidget {
  const AiNotice({super.key, required this.icon, required this.message, this.tone = AiNoticeTone.info, this.action});

  factory AiNotice.preview({Key? key}) => AiNotice(key: key ?? const Key('ai-preview'), icon: Icons.science_outlined, message: previewLabel, tone: AiNoticeTone.preview);

  final IconData icon;
  final String message;
  final AiNoticeTone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (tone) {
      AiNoticeTone.info => (c.surfaceContainerHigh, c.onSurface),
      AiNoticeTone.preview => (c.tertiaryContainer, c.onTertiaryContainer),
      AiNoticeTone.error => (c.errorContainer, c.onErrorContainer),
    };
    return Container(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s12, Kx.s12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Kx.rMd)),
      child: Row(
        children: [
          Icon(icon, color: fg, size: 22),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(message, style: TextStyle(color: fg, fontSize: 15, height: 1.35)),
          ),
          if (action != null) ...[const SizedBox(width: Kx.s8), action!],
        ],
      ),
    );
  }
}

enum AiNoticeTone { info, preview, error }

/// Error strip with Try again.
class AiError extends StatelessWidget {
  const AiError({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => AiNotice(
    key: const Key('ai-error'),
    icon: Icons.error_outline,
    message: message,
    tone: AiNoticeTone.error,
    action: onRetry == null
        ? null
        : TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(foregroundColor: context.colors.onErrorContainer),
            child: const Text('Try again'),
          ),
  );
}

/// Shown on AI pages when no teacher is signed in.
class AiSignInNotice extends StatelessWidget {
  const AiSignInNotice({super.key});

  @override
  Widget build(BuildContext context) => const AiNotice(
    key: Key('ai-signin'),
    icon: Icons.lock_outline,
    message: 'KINETIX AI needs a teacher signed in and the board online. Sign in with the Teacher app from the profile button. The maths solver works without signing in.',
  );
}

/// A spinner with a line of text, while KINETIX AI works.
class AiLoading extends StatelessWidget {
  const AiLoading({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s24),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3)),
        const SizedBox(width: Kx.s16),
        Flexible(child: Text(label, style: context.text.titleMedium?.copyWith(color: context.colors.onSurfaceVariant))),
      ],
    ),
  );
}

/// A section label inside a result card.
class AiSectionLabel extends StatelessWidget {
  const AiSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Kx.s20, bottom: Kx.s8),
    child: Text(text.toUpperCase(), style: context.text.labelLarge?.copyWith(color: context.colors.primary, letterSpacing: 0.8)),
  );
}

/// Difficulty as a segmented button.
class DifficultyPicker extends StatelessWidget {
  const DifficultyPicker({super.key, required this.value, required this.onChanged});

  final AiDifficulty value;
  final ValueChanged<AiDifficulty> onChanged;

  @override
  Widget build(BuildContext context) => SegmentedButton<AiDifficulty>(
    showSelectedIcon: false,
    segments: [for (final d in AiDifficulty.values) ButtonSegment(value: d, label: Text(d.label))],
    selected: {value},
    onSelectionChanged: (s) => onChanged(s.single),
  );
}

/// A labelled dropdown of whole numbers (question count, minutes).
class NumberPicker extends StatelessWidget {
  const NumberPicker({super.key, required this.label, required this.value, required this.options, required this.onChanged, this.suffix = ''});

  final String label;
  final int value;
  final List<int> options;
  final ValueChanged<int> onChanged;
  final String suffix;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(label, style: context.text.titleSmall?.copyWith(color: context.colors.onSurfaceVariant)),
      const SizedBox(width: Kx.s8),
      DropdownButton<int>(
        value: options.contains(value) ? value : options.first,
        borderRadius: BorderRadius.circular(Kx.rMd),
        underline: const SizedBox.shrink(),
        items: [for (final o in options) DropdownMenuItem(value: o, child: Text('$o$suffix'))],
        onChanged: (v) => v == null ? null : onChanged(v),
      ),
    ],
  );
}

/// "Thu 8 Oct", or "Today" / "Tomorrow".
String friendlyDate(DateTime d, {DateTime? now}) {
  final today = DateUtils.dateOnly(now ?? DateTime.now());
  final day = DateUtils.dateOnly(d);
  final diff = day.difference(today).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Tomorrow';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
}

/// A chip that opens a date picker for the due date.
class DueDateChip extends StatelessWidget {
  const DueDateChip({super.key, required this.value, required this.onChanged});

  final DateTime value;
  final ValueChanged<DateTime> onChanged;

  @override
  Widget build(BuildContext context) => ActionChip(
    key: const Key('due-date'),
    avatar: const Icon(Icons.event_outlined, size: 20),
    label: Text('Due ${friendlyDate(value)}'),
    onPressed: () async {
      final today = DateUtils.dateOnly(DateTime.now());
      final picked = await showDatePicker(
        context: context,
        initialDate: value,
        firstDate: today,
        lastDate: today.add(const Duration(days: 180)),
        helpText: 'Due date',
      );
      if (picked != null) onChanged(picked);
    },
  );
}

/// A rounded suggestion that wraps long text (Material chips do not).
class SuggestionChip extends StatelessWidget {
  const SuggestionChip({super.key, required this.text, required this.onTap, this.icon = Icons.subdirectory_arrow_right});

  final String text;
  final VoidCallback onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rSm), side: BorderSide(color: c.outlineVariant)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Kx.rSm),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: c.primary),
              const SizedBox(width: Kx.s8),
              Flexible(child: Text(text, style: TextStyle(fontSize: 16, color: c.onSurface))),
            ],
          ),
        ),
      ),
    );
  }
}
