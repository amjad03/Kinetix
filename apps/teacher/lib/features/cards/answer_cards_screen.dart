import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_cards/kinetix_cards.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// Hands the PDF to the phone's print / share sheet; tests replace it.
Future<void> Function(Uint8List pdf, String filename) shareAnswerCardsPdf = (pdf, filename) => Printing.sharePdf(bytes: pdf, filename: filename);

/// Fonts for students' names in Hindi or Kannada on the cards (bundled in kinetix_ui).
Future<pw.ThemeData> _pdfTheme() async {
  Future<pw.Font> font(String name) async => pw.Font.ttf(await rootBundle.load('packages/kinetix_ui/fonts/$name.ttf'));
  try {
    return pw.ThemeData.withFont(
      base: await font('Inter-400'),
      bold: await font('Inter-700'),
      fontFallback: [await font('NotoSansDevanagari-400'), await font('NotoSansKannada-400')],
    );
  } catch (_) {
    return pw.ThemeData();
  }
}

/// Answer cards for a class: one printed card per student, numbered by roll number. Students
/// without phones hold theirs up turned to A, B, C or D and the board reads the class from a photo.
class AnswerCardsScreen extends StatefulWidget {
  const AnswerCardsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<AnswerCardsScreen> createState() => _AnswerCardsScreenState();
}

class _AnswerCardsScreenState extends State<AnswerCardsScreen> {
  List<Ref>? _sections;
  Object? _error;
  String? _printing;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final classes = await widget.api.classes();
      final seen = <String>{};
      final sections = [for (final c in classes) if (seen.add(c.section.id)) c.section];
      if (mounted) setState(() => (_sections = sections, _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _print(Ref section) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _printing = section.id);
    try {
      final cards = await widget.api.answerCards(section.id);
      final pdf = await answerCardsPdf(
        classLabel: section.name,
        cards: [for (final c in cards) PrintableCard(number: c.cardNo, name: c.fullName, rollNo: c.rollNo)],
        theme: await _pdfTheme(),
        hint: l.answerCardsPrintHint,
      );
      await shareAnswerCardsPdf(pdf, 'answer-cards-${section.name.replaceAll(RegExp(r'\s+'), '-')}.pdf');
      messenger.showSnackBar(SnackBar(content: Text(l.answerCardsReady(cards.length, section.name))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l.answerCardsFailed)));
    } finally {
      if (mounted) setState(() => _printing = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final sections = _sections;
    return Scaffold(
      appBar: AppBar(title: Text(l.answerCards)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.answerCardsBody, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          if (_error is ApiException)
            ErrorBanner.api(_error! as ApiException, onRetry: _load)
          else if (_error != null)
            ErrorBanner(l.answerCardsFailed, onRetry: _load)
          else if (sections == null)
            const Center(child: CircularProgressIndicator())
          else
            for (final s in sections)
              Card(
                child: ListTile(
                  key: Key('cards-${s.id}'),
                  leading: const Icon(Icons.groups_outlined),
                  title: Text(s.name),
                  trailing: _printing == s.id
                      ? const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2))
                      : FilledButton.tonalIcon(onPressed: _printing == null ? () => _print(s) : null, icon: const Icon(Icons.print_outlined), label: Text(l.print)),
                ),
              ),
        ],
      ),
    );
  }
}
