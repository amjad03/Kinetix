import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../local/classroom_store.dart';
import '../ui/ce_style.dart';
import '../ui/pdf_out.dart';
import '../l10n/ce_strings.dart';
import '../ui/ce_pdf_text.dart';

/// The school PIN typed on a big on-screen number pad (no keyboard pops up over the board):
/// dots for the digits typed, the message under them, 1–9, ⌫, 0 and OK. A keyboard's digits,
/// Backspace and Enter work too.
class CePinPad extends StatefulWidget {
  const CePinPad({super.key, required this.title, this.subtitle, required this.onSubmit, this.lockedFor, this.okLabel = 'OK', this.footer, this.initialError, this.minLength = 4, this.maxLength = 8});

  final String title;
  final String? subtitle;

  /// Checks what was typed: null when it was right (the pad's owner closes it), else the
  /// message to show. The pad clears after a wrong one.
  final Future<String?> Function(String pin) onSubmit;

  /// How long the pad stays locked (null or not positive: not locked), with a countdown.
  final Duration? Function()? lockedFor;

  /// A message to show from the start (the PIN typed twice was not the same).
  final String? initialError;
  final String okLabel;
  final Widget? footer;
  final int minLength, maxLength;

  @override
  State<CePinPad> createState() => _CePinPadState();
}

class _CePinPadState extends State<CePinPad> {
  String _pin = '';
  late String? _error = widget.initialError;
  bool _busy = false;
  Timer? _tick;

  Duration? get _left {
    final d = widget.lockedFor?.call();
    return d != null && d > Duration.zero ? d : null;
  }

  @override
  void initState() {
    super.initState();
    _watchLock();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// Ticks the countdown once a second while locked.
  void _watchLock() {
    _tick?.cancel();
    if (_left == null) return;
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (_left == null) {
        _tick?.cancel();
        _error = null;
      }
    });
  }

  void _digit(String d) {
    if (_busy || _left != null || _pin.length >= widget.maxLength) return;
    setState(() {
      _pin += d;
      _error = null;
    });
  }

  void _back() {
    if (_busy || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _ok() async {
    if (_busy || _left != null) return;
    if (_pin.length < widget.minLength) {
      setState(() => _error = context.ce('Type {min} to {max} digits.', {'min': widget.minLength, 'max': widget.maxLength}));
      return;
    }
    setState(() => _busy = true);
    final error = await widget.onSubmit(_pin);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (error != null) {
        _error = error;
        _pin = '';
      }
    });
    _watchLock();
  }

  KeyEventResult _key(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final c = e.character;
    if (c != null && RegExp(r'^[0-9]$').hasMatch(c)) {
      _digit(c);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.backspace) {
      _back();
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) {
      unawaited(_ok());
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final left = _left;
    final message = left != null
        ? context.ce('Too many wrong PINs. Try again in {time}.', {'time': '${left.inMinutes}:${(left.inSeconds % 60).toString().padLeft(2, '0')}'})
        : _error;
    Widget key(String label, {Key? k, VoidCallback? onTap, IconData? icon, bool primary = false}) => SizedBox(
      width: 104,
      height: 84,
      child: Opacity(
        opacity: left != null ? 0.4 : 1,
        child: Semantics(
        container: true,
        button: true,
        enabled: left == null && !_busy,
        label: icon != null ? ceTr('Delete the last digit') : label,
        excludeSemantics: true,
        child: Material(
        color: primary ? CeC.accent : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: primary ? CeC.accent : CeC.line, width: 2)),
        child: InkWell(
          key: k,
          borderRadius: BorderRadius.circular(22),
          onTap: left != null || _busy ? null : onTap,
          child: Center(
            child: icon != null
                ? Icon(icon, size: 32, color: primary ? Colors.white : CeC.navy)
                : Text(label, style: ceHeading(primary ? 24 : 34, w: FontWeight.w600, c: primary ? Colors.white : CeC.navy)),
          ),
        ),
      ),
      ),
      ),
    );
    Widget row(List<Widget> keys) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(mainAxisSize: MainAxisSize.min, children: [for (final (i, k) in keys.indexed) ...[if (i > 0) const SizedBox(width: 12), k]]),
    );
    return Focus(
      autofocus: true,
      onKeyEvent: _key,
      child: Column(
        key: const Key('ce-pin-pad'),
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(widget.title, textAlign: TextAlign.center, style: ceHeading(28)),
          if (widget.subtitle != null) ...[const SizedBox(height: 8), Text(widget.subtitle!, textAlign: TextAlign.center, style: ceText(16))],
          const SizedBox(height: 20),
          Semantics(
            container: true,
            liveRegion: true,
            label: ceTr('{n} digits typed', {'n': _pin.length}),
            excludeSemantics: true,
            child: SizedBox(
            key: const Key('ce-pin-dots'),
            height: 28,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < (widget.minLength > _pin.length ? widget.minLength : _pin.length); i++)
                  Container(
                    width: 22,
                    height: 22,
                    margin: const EdgeInsets.symmetric(horizontal: 7),
                    decoration: BoxDecoration(shape: BoxShape.circle, color: i < _pin.length ? CeC.navy : Colors.transparent, border: Border.all(color: CeC.navy, width: 2)),
                  ),
              ],
            ),
          ),
          ),
          SizedBox(
            height: 52,
            child: Center(
              child: message == null
                  ? null
                  : Text(message, key: const Key('ce-pin-error'), textAlign: TextAlign.center, style: ceText(16, w: FontWeight.w600, c: CeC.red)),
            ),
          ),
          for (final r in const [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ])
            row([for (final d in r) key(d, k: Key('ce-pin-key-$d'), onTap: () => _digit(d))]),
          row([
            key('', k: const Key('ce-pin-back'), icon: Icons.backspace_outlined, onTap: _back),
            key('0', k: const Key('ce-pin-key-0'), onTap: () => _digit('0')),
            key(widget.okLabel, k: const Key('ce-pin-ok'), primary: true, onTap: () => unawaited(_ok())),
          ]),
          if (widget.footer != null) ...[const SizedBox(height: 4), widget.footer!],
        ],
      ),
    );
  }
}

Widget _padDialog(BuildContext ctx, {required Key key, required Widget pad}) => Dialog(
  key: key,
  backgroundColor: CeC.page,
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
  child: Stack(
    children: [
      Padding(padding: const EdgeInsets.fromLTRB(40, 36, 40, 28), child: SizedBox(width: 560, child: pad)),
      Positioned(
        right: 8,
        top: 8,
        child: IconButton(key: Key('ce-pin-cancel'), tooltip: ceTr('Cancel'), onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close, color: CeC.muted)),
      ),
    ],
  ),
);

String _lockMessage(ClassroomStore store) {
  final until = store.pinLockedUntil;
  if (until == null) return ceTr('Too many wrong PINs.');
  final m = (until.difference(store.now()).inSeconds / 60).ceil();
  return m == 1 ? ceTr('Too many wrong PINs. Try again in 1 minute.') : ceTr('Too many wrong PINs. Try again in {n} minutes.', {'n': m});
}

Duration? Function() _lockedFor(ClassroomStore store) => () => store.pinLocked ? store.pinLockedUntil!.difference(store.now()) : null;

/// Asks for the school PIN on the number pad. True when it was right. While the PIN is still
/// 1234 the college must choose its own before going on (and gets a recovery code); "Forgot
/// the PIN?" takes the recovery code instead.
Future<bool> askSchoolPin(BuildContext context, ClassroomStore store, {String? reason, String okLabel = 'OK'}) async {
  var wasDefault = false;
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => _padDialog(
      ctx,
      key: const Key('ce-pin-dialog'),
      pad: CePinPad(
        title: context.ce('School PIN'),
        subtitle: reason ?? context.ce('Settings change the timetable, teachers and classes for everyone who uses this board.'),
        okLabel: okLabel,
        lockedFor: _lockedFor(store),
        onSubmit: (pin) async {
          wasDefault = store.pinIsDefault;
          final r = await store.verifyPin(pin);
          switch (r.check) {
            case PinCheck.ok:
              if (ctx.mounted) Navigator.pop(ctx, 'ok');
              return null;
            case PinCheck.lockedOut:
              return _lockMessage(store);
            case PinCheck.wrong:
              return r.attemptsLeft == 1 ? ceTr('That is not the school PIN. 1 try left.') : ceTr('That is not the school PIN. {n} tries left.', {'n': r.attemptsLeft});
          }
        },
        footer: store.hasRecoveryCode
            ? TextButton(key: Key('ce-pin-forgot'), onPressed: () => Navigator.pop(ctx, 'forgot'), child: Text(context.ce('Forgot the PIN?'), style: ceText(16, w: FontWeight.w600, c: CeC.accent)))
            : null,
      ),
    ),
  );
  if (!context.mounted) return false;
  if (result == 'forgot') return _forgotPin(context, store);
  if (result != 'ok') return false;
  // First set-up: 1234 opens Settings only to choose the college's own PIN.
  if (wasDefault) return chooseNewPin(context, store, forced: true);
  return true;
}

/// Chooses a new school PIN on the number pad (typed twice), then shows its recovery code
/// once. [forced]: the PIN is still 1234 (or was forgotten), so there is no going on without a
/// new one. True when a new PIN was set.
Future<bool> chooseNewPin(BuildContext context, ClassroomStore store, {bool forced = false}) async {
  String? first, mismatch;
  final pin = await showDialog<String>(
    context: context,
    barrierDismissible: !forced,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => _padDialog(
        ctx,
        key: const Key('ce-new-pin-dialog'),
        pad: CePinPad(
          key: ValueKey('${first == null}$mismatch'),
          initialError: first == null ? mismatch : null,
          title: first == null ? (forced ? context.ce('Choose the college’s own PIN') : context.ce('New school PIN')) : context.ce('Type the new PIN again'),
          subtitle: first == null
              ? (forced ? context.ce('The PIN is still 1234, which everyone knows. Choose 4 to 8 digits that only staff will know.') : context.ce('4 to 8 digits that only staff will know.'))
              : context.ce('To be sure it is right.'),
          onSubmit: (p) async {
            if (first == null) {
              mismatch = null;
              if (p == ClassroomStore.defaultPin) return context.ce('Choose a PIN other than 1234.');
              if (RegExp(r'^(\d)\1+$').hasMatch(p)) return context.ce('Choose a PIN that is not one digit repeated.');
              if ('0123456789'.contains(p) || '9876543210'.contains(p)) return context.ce('Choose a PIN that is not a run of digits.');
              set(() => first = p);
              return null;
            }
            if (p != first) {
              set(() {
                first = null;
                mismatch = context.ce('The two PINs were not the same. Choose the PIN again.');
              });
              return null;
            }
            if (ctx.mounted) Navigator.pop(ctx, p);
            return null;
          },
        ),
      ),
    ),
  );
  if (pin == null) return false;
  final code = await store.setPin(pin);
  if (!context.mounted) return true;
  await showRecoveryCode(context, code, college: store.college);
  return true;
}

/// "Forgot the PIN?": the recovery code shown when the PIN was set opens a new PIN.
Future<bool> _forgotPin(BuildContext context, ClassroomStore store) async {
  final code = TextEditingController();
  String? error;
  var busy = false;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) {
        Future<void> check() async {
          if (busy) return;
          set(() => busy = true);
          final r = await store.verifyRecoveryCode(code.text);
          if (!ctx.mounted) return;
          if (r.ok) return Navigator.pop(ctx, true);
          set(() {
            busy = false;
            error = r.check == PinCheck.lockedOut ? _lockMessage(store) : (r.attemptsLeft == 1 ? context.ce('That is not the recovery code. 1 try left.') : context.ce('That is not the recovery code. {n} tries left.', {'n': r.attemptsLeft}));
          });
        }

        return AlertDialog(
          key: const Key('ce-forgot-dialog'),
          title: Text(context.ce('Forgot the school PIN?')),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.ce('Type the recovery code that was printed or saved when the PIN was chosen (like K7QF-2MXD-9RTA).'), style: ceText(17, c: CeC.navy)),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('ce-forgot-code'),
                  controller: code,
                  autofocus: true,
                  textCapitalization: TextCapitalization.characters,
                  style: ceHeading(26, w: FontWeight.w600),
                  decoration: InputDecoration(labelText: context.ce('Recovery code'), errorText: error),
                  onSubmitted: (_) => unawaited(check()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.ce('Cancel'))),
            FilledButton(key: Key('ce-forgot-ok'), onPressed: busy ? null : () => unawaited(check()), child: Text(context.ce('Choose a new PIN'))),
          ],
        );
      },
    ),
  );
  if (ok != true || !context.mounted) return false;
  return chooseNewPin(context, store, forced: true);
}

/// The recovery code, shown once: printed or saved, it is the only way back in if the PIN is
/// forgotten. It is never shown again (a new PIN makes a new code).
Future<void> showRecoveryCode(BuildContext context, String code, {String college = ''}) => showDialog<void>(
  context: context,
  barrierDismissible: false,
  builder: (ctx) => AlertDialog(
    key: const Key('ce-recovery-dialog'),
    icon: const Icon(Icons.key_outlined, size: 40),
    title: Text(context.ce('Keep this recovery code safe')),
    content: SizedBox(
      width: 620,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(context.ce('If the school PIN is ever forgotten, this code lets the principal choose a new one. It is shown only now.'), textAlign: TextAlign.center, style: ceText(17, c: CeC.navy)),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
            decoration: ceCard(color: CeC.butter, shadow: false),
            child: SelectableText(code, key: const Key('ce-recovery-code'), style: ceHeading(44, w: FontWeight.w700).copyWith(letterSpacing: 4)),
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              // No print service on this board: the PDF to a USB drive or Downloads comes first.
              if (CePdfOut.leadWithSave) OutlinedButton.icon(key: Key('ce-recovery-save-pdf'), style: ceSoftButton(), onPressed: () => unawaited(_print(ctx, code, college, save: true)), icon: Icon(Icons.picture_as_pdf_outlined), label: Text(cePdfSaveLabel(context))),
              OutlinedButton.icon(key: Key('ce-recovery-print'), style: ceSoftButton(), onPressed: () => unawaited(_print(ctx, code, college)), icon: Icon(Icons.print_outlined), label: Text(context.ce('Print'))),
              if (!CePdfOut.leadWithSave) OutlinedButton.icon(key: Key('ce-recovery-save-pdf'), style: ceSoftButton(), onPressed: () => unawaited(_print(ctx, code, college, save: true)), icon: Icon(Icons.picture_as_pdf_outlined), label: Text(cePdfSaveLabel(context))),
              OutlinedButton.icon(key: Key('ce-recovery-save'), style: ceSoftButton(), onPressed: () => unawaited(_saveCode(ctx, code, college)), icon: Icon(Icons.save_alt), label: Text(context.ce('Save as a file'))),
            ],
          ),
        ],
      ),
    ),
    actions: [FilledButton(key: Key('ce-recovery-done'), onPressed: () => Navigator.pop(ctx), child: Text(context.ce('I have kept it safe')))],
  ),
);

String _codeText(String code, String college) =>
    'Zynetix Classroom: school PIN recovery code\n${college.isEmpty ? '' : '$college\n'}\n$code\n\nIf the school PIN is forgotten, tap "Forgot the PIN?" and type this code.\nKeep it locked away, not on the board.\n';

/// The recovery code's page to the printer, or [save] to a USB drive or Downloads.
Future<void> _print(BuildContext context, String code, String college, {bool save = false}) async {
  try {
    final doc = await recoveryCodePdf(code, college, lang: context.ceLang);
    if (!context.mounted) return;
    if (save) {
      await ceSavePdf(context, doc, 'zynetix-pin-recovery-code.pdf');
    } else {
      await cePrintOrSave(context, doc, 'zynetix-pin-recovery-code.pdf', (b, _) => Printing.layoutPdf(name: ceTr('School PIN recovery code'), onLayout: (_) async => b));
    }
  } catch (e) {
    if (context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(context.ce('Could not print: {error}', {'error': e}))));
  }
}

/// The recovery code on an A4 page, in [lang] (Kannada through [CePdfText]).
Future<Uint8List> recoveryCodePdf(String code, String college, {String lang = 'en', CePdfText? pdfText}) async {
  final px = pdfText ?? CePdfText();
  final title = ceIn(lang, 'School PIN recovery code');
  final how = ceIn(lang, 'If the school PIN is forgotten, tap "Forgot the PIN?" on the PIN pad and type this code.');
  final keep = ceIn(lang, 'Keep this page locked away, not near the board.');
  await px.prepare([title], size: 26, bold: true);
  await px.prepare([college], size: 16);
  await px.prepare([how, keep], size: 14, maxWidth: 500);
    final doc = pw.Document(title: title);
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (_) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text('Zynetix Classroom', style: pw.TextStyle(fontSize: 14, color: PdfColors.grey700)),
            pw.SizedBox(height: 6),
            px.text(title, size: 26, bold: true),
            if (college.isNotEmpty) px.text(college, size: 16),
            pw.SizedBox(height: 28),
            pw.Container(
              padding: const pw.EdgeInsets.all(18),
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 2)),
              child: pw.Text(code, style: pw.TextStyle(fontSize: 40, fontWeight: pw.FontWeight.bold, letterSpacing: 4)),
            ),
            pw.SizedBox(height: 28),
            px.text(how, size: 14, maxWidth: 500),
            pw.SizedBox(height: 6),
            px.text(keep, size: 14, maxWidth: 500),
          ],
        ),
      ),
    );
  return doc.save();
}

Future<void> _saveCode(BuildContext context, String code, String college) async {
  try {
    final saved = await FilePicker.saveFile(fileName: 'zynetix-pin-recovery-code.txt', bytes: utf8.encode(_codeText(code, college)), type: FileType.custom, allowedExtensions: const ['txt']);
    if (saved != null && context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(context.ce('Recovery code saved.'))));
  } catch (e) {
    if (context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(context.ce('Could not save: {error}', {'error': e}))));
  }
}
