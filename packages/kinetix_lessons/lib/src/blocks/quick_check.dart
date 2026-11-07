import 'package:flutter/material.dart';

import '../core/strings.dart';
import '../core/theme.dart';
import '../engine/model.dart';
import '../engine/support.dart';
import 'math_text.dart';

/// A class quiz or exam questions as a quick check the teacher runs on the board: one question
/// at a time, the class answers aloud or by hands, a tap marks the answer the class gave, and
/// Show answer reveals the right one with its explanation. Roll call asks a random present roll
/// number. Nothing is uploaded and nothing needs a phone.
class QuickCheckView extends StatefulWidget {
  const QuickCheckView({super.key, required this.questions, required this.lang, required this.room, this.mode = QuizMode.monitor, this.label, this.recorder});
  final List<Question> questions;
  final Lang lang;
  final ClassRoom room;
  final QuizMode mode;
  final String? label;
  final SessionRecorder? recorder;

  @override
  State<QuickCheckView> createState() => QuickCheckViewState();
}

class QuickCheckViewState extends State<QuickCheckView> {
  int index = 0;
  int? chosen;
  bool revealed = false;
  int? roll;

  Question get q => widget.questions[index];

  void choose(int i) {
    if (revealed) return;
    setState(() => chosen = i);
  }

  void reveal() {
    if (revealed) return;
    setState(() => revealed = true);
    widget.recorder?.answer(questionId: q.id, mode: widget.mode, roll: roll, chosen: chosen, correct: chosen != null && q.correctSet.contains(chosen), topicId: q.topicId, chapterId: q.chapterId);
  }

  void nextQuestion() {
    if (index >= widget.questions.length - 1) return;
    setState(() {
      index++;
      chosen = null;
      revealed = false;
      roll = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.lang, narrow = context.narrow;
    if (widget.questions.isEmpty) return const SizedBox.shrink();
    final body = zText(narrow ? 30 : 34, FontWeight.w400).copyWith(color: Z.ink, height: 1.45);
    final answerText = q.isNumeric ? formatNumber(q.numericAnswer ?? double.nan) + ((q.tolerance ?? 0) > 0 ? ' ± ${formatNumber(q.tolerance!)}' : '') : null;
    return Container(
      decoration: BoxDecoration(color: Z.panel, borderRadius: BorderRadius.circular(Z.panelRadius)),
      child: SingleChildScrollView(
        padding: EdgeInsets.symmetric(horizontal: narrow ? 36 : 64, vertical: narrow ? 32 : 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (widget.label != null) ZTag(widget.label!),
                const SizedBox(width: 16),
                Text('${index + 1} / ${widget.questions.length}', key: const ValueKey('qc-count'), style: zText(26, FontWeight.w500).copyWith(color: Z.muted)),
                const Spacer(),
                if (widget.mode == QuizMode.rollCall || widget.mode == QuizMode.team)
                  OutlinedButton.icon(
                    key: const ValueKey('qc-roll'),
                    onPressed: () => setState(() => roll = widget.room.nextRoll()),
                    icon: const Icon(Icons.casino_outlined, size: 32),
                    label: Text(roll == null ? (l == Lang.kn ? 'ರೋಲ್ ಸಂಖ್ಯೆ ಆರಿಸಿ' : 'Pick a roll number') : (l == Lang.kn ? 'ರೋಲ್ $roll ಉತ್ತರಿಸಲಿ' : 'Roll $roll answers'), style: zText(26)),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            if (q.passage != null) ...[
              Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(color: Z.tile, borderRadius: BorderRadius.circular(Z.radius)),
                child: MathText(q.passage!.t(l), style: body.copyWith(fontSize: narrow ? 26 : 30)),
              ),
              const SizedBox(height: 24),
            ],
            MathText(q.stem.t(l), style: zTitle(narrow ? 36 : 42, FontWeight.w500).copyWith(height: 1.4)),
            const SizedBox(height: 32),
            for (final (i, o) in q.options.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _Option(
                  key: ValueKey('qc-opt-$i'),
                  letter: 'ABCDEFGH'[i],
                  text: o.t(l),
                  style: body,
                  chosen: chosen == i,
                  right: revealed && q.correctSet.contains(i),
                  wrong: revealed && chosen == i && !q.correctSet.contains(i),
                  onTap: () => choose(i),
                ),
              ),
            if (answerText != null && revealed) Text('${tr('answer', l)}: $answerText', style: zTitle(36).copyWith(color: Z.correct)),
            if (revealed && q.explanation != null) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(color: Z.correctBg, borderRadius: BorderRadius.circular(Z.radius)),
                child: MathText(q.explanation!.t(l), style: body.copyWith(color: Z.correctLabel)),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                if (!revealed) BigButton(key: const ValueKey('qc-reveal'), icon: Icons.visibility_outlined, label: l == Lang.kn ? 'ಉತ್ತರ ತೋರಿಸಿ' : 'Show answer', onPressed: reveal),
                if (revealed && index < widget.questions.length - 1) BigButton(key: const ValueKey('qc-next'), icon: Icons.arrow_forward, label: l == Lang.kn ? 'ಮುಂದಿನ ಪ್ರಶ್ನೆ' : 'Next question', filled: false, onPressed: nextQuestion),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({super.key, required this.letter, required this.text, required this.style, required this.chosen, required this.right, required this.wrong, required this.onTap});
  final String letter, text;
  final TextStyle style;
  final bool chosen, right, wrong;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bg = right ? Z.correctBg : (wrong ? Z.wrongBg : (chosen ? Z.tagBg : Z.tile));
    final edge = right ? Z.correct : (wrong ? Z.wrong : (chosen ? Z.primary : Colors.transparent));
    return Material(
      color: bg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Z.radius), side: BorderSide(color: edge, width: 3)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Z.radius),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
          child: Row(
            children: [
              CircleAvatar(radius: 26, backgroundColor: edge == Colors.transparent ? Z.segTrack : edge, child: Text(letter, style: zText(26).copyWith(color: edge == Colors.transparent ? Z.ink2 : Colors.white))),
              const SizedBox(width: 20),
              Expanded(child: MathText(text, style: style)),
              if (right) const Icon(Icons.check_circle, color: Z.correct, size: 40),
              if (wrong) const Icon(Icons.cancel, color: Z.wrong, size: 40),
            ],
          ),
        ),
      ),
    );
  }
}
