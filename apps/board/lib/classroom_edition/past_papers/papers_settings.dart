import 'dart:async';

import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'paper_import.dart';
import 'paper_library.dart';
import '../l10n/ce_strings.dart';

/// Settings → College and PIN → Past papers: Add papers (Settings has asked for the PIN
/// already). The Past papers class tool has the same button.
class PastPapersSettingsEntry extends StatefulWidget {
  const PastPapersSettingsEntry({super.key});

  @override
  State<PastPapersSettingsEntry> createState() => _PastPapersSettingsEntryState();
}

class _PastPapersSettingsEntryState extends State<PastPapersSettingsEntry> {
  PaperLibrary? lib;

  @override
  void initState() {
    super.initState();
    unawaited(
      PaperLibrary.shared().then((l) {
        if (mounted) setState(() => lib = l);
      }, onError: (Object e) => debugPrint('Past papers not opened: $e')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = lib;
    final n = l?.papers.length ?? 0;
    return Column(
      key: const Key('ce-settings-papers'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.ce('Past papers'), style: ceHeading(20)),
        const SizedBox(height: 8),
        Text(
          l == null ? ceTr('Opening the library…') : (n == 0 ? ceTr('No past papers on this board yet. Add PDFs or a paper pack from a USB stick.') : ceTr('{n} past papers on this board (Class tools → Past papers).', {'n': n})),
          style: ceText(16),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('ce-settings-add-papers'),
          style: ceSoftButton(),
          onPressed: l == null
              ? null
              : () async {
                  await openAddPapers(context, l);
                  if (mounted) setState(() {});
                },
          icon: const Icon(Icons.usb_rounded),
          label: Text(context.ce('Add papers')),
        ),
      ],
    );
  }
}
