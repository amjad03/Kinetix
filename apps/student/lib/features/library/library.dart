import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';

/// (background, foreground) for a book's due chip: overdue in red, due within two days in amber.
(Color, Color) _dueTone(BuildContext context, LibraryLoan l, DateTime today) {
  final c = context.colors;
  if (l.overdue) return (c.errorContainer, c.onErrorContainer);
  if (Fmt.daysBetween(today, l.dueOn) <= 2) return (Tone.warnContainer(context), Tone.warn(context));
  return (c.secondaryContainer, c.onSecondaryContainer);
}

/// Today's library card: books out, when each is due (overdue first, in red) and any fines.
class LibraryCard extends StatelessWidget {
  const LibraryCard({super.key, required this.study});

  final StudyController study;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final account = study.library;
    final today = study.today;
    void open() => LibraryScreen.open(context, study);

    if (account == null) {
      return SectionCard(
        key: const Key('libraryCard'),
        icon: Icons.local_library_outlined,
        title: context.l10n.library,
        child: study.libraryError != null ? ErrorBanner(study.libraryError!, onRetry: study.loadLibrary) : const LinearProgressIndicator(),
      );
    }
    final out = account.currentByDue;
    final overdue = account.overdue.length;
    return SectionCard(
      key: const Key('libraryCard'),
      icon: Icons.local_library_outlined,
      title: context.l10n.library,
      caption: out.isEmpty ? null : context.l10n.nOut(out.length),
      onTap: open,
      footer: account.history.isEmpty && out.isEmpty ? null : CardLink(context.l10n.seeLibraryHistory, onTap: open),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (out.isEmpty)
            Text(
              account.history.isEmpty
                  ? context.l10n.noBooksBorrowed
                  : context.l10n.noBooksOutNow,
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          if (overdue > 0) ...[
            Row(
              key: const Key('libraryOverdue'),
              children: [
                Icon(Icons.warning_amber_rounded, size: 20, color: c.error),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(
                    context.l10n.booksOverdue(overdue),
                    style: context.text.bodyMedium?.copyWith(color: c.error, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s4),
          ],
          for (final l in out.take(3)) LoanRow(loan: l, today: today),
          if (out.length > 3) Text(context.l10n.andMore(out.length - 3), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          if (account.finesPaise > 0) ...[
            const SizedBox(height: Kx.s8),
            Text(
              context.l10n.finesForLate(Fmt.rupees(account.finesPaise)),
              key: const Key('libraryFines'),
              style: context.text.bodyMedium?.copyWith(color: c.error),
            ),
          ],
        ],
      ),
    );
  }
}

/// A book: title, author, and a due chip ("Due Fri 9 Oct", "Overdue by 4 days") or when it came back.
class LoanRow extends StatelessWidget {
  const LoanRow({super.key, required this.loan, required this.today, this.onRenew});

  final LibraryLoan loan;
  final DateTime today;

  /// Shown as a Renew button on a book that is out and not yet overdue.
  final Future<void> Function()? onRenew;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = context.l10n;
    final f = context.fmt;
    final l = loan;
    final (bg, fg) = _dueTone(context, l, today);
    return Padding(
      key: Key('loan-${l.id}'),
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(
            Icons.menu_book_outlined,
            background: l.returned ? c.surfaceContainerHighest : (l.overdue ? c.errorContainer : null),
            foreground: l.returned ? c.onSurfaceVariant : (l.overdue ? c.onErrorContainer : null),
          ),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.title, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (l.author.isNotEmpty)
                  Text(
                    [l.author, ?l.callNo].join(' · '),
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                const SizedBox(height: Kx.s4),
                if (l.returned)
                  Text(
                    [
                      t.borrowedOn(f.shortDay(l.issuedAt)),
                      t.returnedOn(f.shortDay(l.returnedAt!)),
                      if (l.finePaise > 0) t.fineAmount(Fmt.rupees(l.finePaise)) else if (l.returnedLate) t.returnedLate,
                    ].join(' · '),
                    style: context.text.bodySmall?.copyWith(color: l.finePaise > 0 ? c.error : c.onSurfaceVariant),
                  )
                else
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Pill(
                        f.bookDue(l.dueOn, today),
                        icon: l.overdue ? Icons.warning_amber_rounded : Icons.event_outlined,
                        background: bg,
                        foreground: fg,
                      ),
                      // The fine if the book came back today (the server works it out).
                      if (l.overdue && l.fineSoFarPaise > 0)
                        Text(
                          t.fineSoFar(Fmt.rupees(l.fineSoFarPaise)),
                          key: Key('fineSoFar-${l.id}'),
                          style: context.text.bodySmall?.copyWith(color: c.error, fontWeight: FontWeight.w500),
                        ),
                      Text(t.borrowedOn(f.shortDay(l.issuedAt)), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                    ],
                  ),
              if (!l.returned && !l.overdue && onRenew != null) RenewButton(loanId: l.id, onRenew: onRenew!),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Books out now (overdue first), fines, and books returned.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.study});

  final StudyController study;

  static Future<void> open(BuildContext context, StudyController study) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => LibraryScreen(study: study)));

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  @override
  void initState() {
    super.initState();
    widget.study.loadLibrary();
  }

  @override
  Widget build(BuildContext context) {
    final study = widget.study;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.libraryBooks)),
      body: ListenableBuilder(
        listenable: study,
        builder: (context, _) {
          final c = context.colors;
          final account = study.library;
          final error = study.libraryError;
          if (account == null) {
            return error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner(error, onRetry: study.loadLibrary),
                  );
          }
          return RefreshIndicator(
            onRefresh: study.loadLibrary,
            child: LayoutBuilder(
              builder: (context, box) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                children: [
                  if (error != null) ...[ErrorBanner(error, onRetry: study.loadLibrary), const SizedBox(height: Kx.s12)],
                  if (account.finesPaise > 0)
                    Card(
                      color: c.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(Kx.s16),
                        child: Row(
                          children: [
                            Icon(Icons.currency_rupee, color: c.onErrorContainer),
                            const SizedBox(width: Kx.s12),
                            Expanded(
                              child: Text(
                                context.l10n.finesPayAtDesk(Fmt.rupees(account.finesPaise)),
                                style: context.text.bodyLarge?.copyWith(color: c.onErrorContainer),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  SectionTitle(context.l10n.booksOutHeading(account.current.length)),
                  if (account.current.isEmpty)
                    Text(context.l10n.noBooksOut, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant))
                  else ...[
                    for (final l in account.currentByDue) LoanRow(loan: l, today: study.today, onRenew: () async {
                      await study.api.renewLoan(l.id);
                      await study.loadLibrary();
                    }),
                    const SizedBox(height: Kx.s8),
                    Text(
                      context.l10n.fineRule,
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ],
                  SectionTitle(context.l10n.returnedHeading(account.history.length)),
                  if (account.history.isEmpty)
                    Text(context.l10n.returnedEmpty, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant))
                  else
                    for (final l in account.history) LoanRow(loan: l, today: study.today),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Renews one book: a button that asks the server for another loan period, says why when it cannot, and refreshes the list.
class RenewButton extends StatefulWidget {
  const RenewButton({super.key, required this.loanId, required this.onRenew});

  final String loanId;
  final Future<void> Function() onRenew;

  @override
  State<RenewButton> createState() => _RenewButtonState();
}

class _RenewButtonState extends State<RenewButton> {
  bool _busy = false;

  Future<void> _renew() async {
    final messenger = ScaffoldMessenger.of(context);
    final done = context.l10n.libraryRenewed;
    setState(() => _busy = true);
    try {
      await widget.onRenew();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      TextButton.icon(key: Key('renew-${widget.loanId}'), onPressed: _busy ? null : _renew, icon: const Icon(Icons.autorenew, size: 18), label: Text(context.l10n.libraryRenew));
}
