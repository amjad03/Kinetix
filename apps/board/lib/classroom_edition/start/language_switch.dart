import 'package:flutter/material.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart' show BoardLanguage;
import '../l10n/ce_strings.dart';
import '../ui/ce_style.dart';

/// The big ಕನ್ನಡ / English switch on the start screen (and in Settings → This board): sets the
/// board's own language, which every screen, the board's buttons and the PDFs then use. Each
/// half is labelled in its own language so a teacher can always find theirs.
class CeLanguageSwitch extends StatelessWidget {
  const CeLanguageSwitch({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final kn = board.language == BoardLanguage.kn;
    Widget half(String label, bool on, BoardLanguage lang, String keyName) => Semantics(
      button: true,
      selected: on,
      label: label,
      excludeSemantics: true,
      child: Material(
        key: Key(keyName),
        color: on ? CeC.navy : Colors.transparent,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: on ? null : () => board.setBoardLanguage(lang),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 112, minHeight: 64),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 22),
                child: Text(label, style: ceText(21, w: FontWeight.w700, c: on ? Colors.white : CeC.navy)),
              ),
            ),
          ),
        ),
      ),
    );
    return Tooltip(
      message: context.ce('Language'),
      child: Container(
        key: const Key('ce-language'),
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: CeC.line, width: 1.5)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [half('ಕನ್ನಡ', kn, BoardLanguage.kn, 'ce-lang-kn'), const SizedBox(width: 4), half('English', !kn, BoardLanguage.en, 'ce-lang-en')],
        ),
      ),
    );
  }
}
