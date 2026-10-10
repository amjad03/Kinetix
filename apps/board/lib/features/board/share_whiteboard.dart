import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/board_controller.dart';
import 'chrome.dart';
import 'layout/page_overview.dart' show PdfBranding, boardPdf, sharePdf;
import 'panel/panel_host.dart';
import 'sb_strings.dart';

/// Opens WhatsApp or the mail app. Tests replace it.
Future<bool> Function(Uri) openExternal = (u) => launchUrl(u, mode: LaunchMode.externalApplication);

/// The teacher's branding for shared and exported PDFs (Theme → Custom): brand name (default:
/// the institution), watermark and logo.
Future<PdfBranding> boardBranding(BoardController board, {String? title}) async {
  ui.Image? logo;
  final path = board.sbPref('logoPath');
  if (path != null) {
    try {
      final codec = await ui.instantiateImageCodec(await File(path).readAsBytes(), targetHeight: 160);
      logo = (await codec.getNextFrame()).image;
    } catch (_) {
      // A moved or deleted logo file: export without it.
    }
  }
  return PdfBranding(brand: board.sbPref('brand') ?? board.session?.institutionName, watermark: board.sbPref('watermark'), title: title, logo: logo);
}

/// Share whiteboard (spec §62): prepares a branded PDF of every page, uploads it for a link and
/// offers WhatsApp, Email, QR and the device's other apps. A guest (no account) or an offline
/// board can still send the PDF through other apps.
Future<void> showShareWhiteboard(
  BuildContext context, {
  required BoardController board,
  required WhiteboardController wb,
  required Size canvas,
  required String title,

  /// Saves the board first (the link is for a saved board); false when it could not be saved.
  required Future<bool> Function() ensureSaved,
}) async {
  await showPanelDialog<void>(
    context: context,
    builder: (_) => _ShareDialog(board: board, wb: wb, canvas: canvas, title: title, ensureSaved: ensureSaved),
  );
}

class _ShareDialog extends StatefulWidget {
  const _ShareDialog({required this.board, required this.wb, required this.canvas, required this.title, required this.ensureSaved});

  final BoardController board;
  final WhiteboardController wb;
  final Size canvas;
  final String title;
  final Future<bool> Function() ensureSaved;

  @override
  State<_ShareDialog> createState() => _ShareDialogState();
}

class _ShareDialogState extends State<_ShareDialog> {
  Uint8List? _pdf;
  Uri? _link;
  String? _note;
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    unawaited(_prepare());
  }

  Future<void> _prepare() async {
    final s = SbStrings('en');
    try {
      final branding = await boardBranding(widget.board, title: widget.title);
      final pdf = await boardPdf(widget.wb, widget.canvas, branding: branding);
      branding.logo?.dispose();
      if (!mounted) return;
      setState(() => _pdf = pdf);
      final api = widget.board.api;
      if (api == null || !widget.board.isSignedIn) {
        setState(() => _note = 'shareNeedsSignIn');
      } else if (await widget.ensureSaved()) {
        final link = await api.exportWhiteboard(widget.board.whiteboardId, [], pdf: pdf);
        if (mounted) setState(() => _link = link);
      } else {
        setState(() => _note = 'shareFailed');
      }
    } catch (e) {
      debugPrint('${s('shareFailed')} $e');
      if (mounted) setState(() => _note = 'shareFailed');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _fileName => 'KINETIX ${widget.title} ${DateFormat('yyyy-MM-dd').format(DateTime.now())}.pdf';

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final link = _link;
    Widget action(Key key, IconData icon, String label, VoidCallback? onTap) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: OutlinedButton.icon(
        key: key,
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56), alignment: Alignment.centerLeft),
        icon: Icon(icon),
        label: Text(label),
        onPressed: onTap,
      ),
    );
    return AlertDialog(
      key: const Key('share-whiteboard'),
      title: Text(s('shareTitle')),
      content: SizedBox(
        width: 560,
        child: _busy
            ? Padding(
                padding: const EdgeInsets.all(Kx.s24),
                child: Row(children: [const CircularProgressIndicator(), const SizedBox(width: Kx.s16), Text(s('preparing', {'n': widget.wb.pageCount}))]),
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        action(const Key('share-whatsapp'), Icons.chat_outlined, s('whatsapp'), link == null && _pdf == null ? null : () => unawaited(_whatsapp(link))),
                        action(
                          const Key('share-email'),
                          Icons.mail_outline,
                          s('email'),
                          link == null ? null : () => _open(Uri(scheme: 'mailto', query: _query({'subject': s('emailSubject', {'t': widget.title}), 'body': s('emailBody', {'u': link})}))),
                        ),
                        action(const Key('share-copy'), Icons.link, s('copyLink'), link == null ? null : () => _copy(link)),
                        action(const Key('share-other'), Icons.ios_share, s('moreApps'), _pdf == null ? null : () => unawaited(sharePdf(_fileName, _pdf!))),
                        if (_note != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(s(_note!), key: const Key('share-note'))),
                      ],
                    ),
                  ),
                  if (link != null) ...[
                    const SizedBox(width: Kx.s16),
                    Column(
                      children: [
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.all(8),
                          child: QrImageView(key: const Key('share-qr'), data: '$link', size: 200),
                        ),
                        const SizedBox(height: Kx.s8),
                        Text(s('shareScan'), style: context.text.labelMedium),
                        Text(s('linkExpires'), style: context.text.labelSmall),
                      ],
                    ),
                  ],
                ],
              ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(MaterialLocalizations.of(context).closeButtonLabel))],
    );
  }

  static String _query(Map<String, String> q) => q.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');

  /// WhatsApp: with a link, WhatsApp opens with the message; where it cannot be opened (no
  /// WhatsApp, or a board with no link) the Android share sheet takes the PDF, and the QR code
  /// beside the buttons still opens the board on a phone.
  Future<void> _whatsapp(Uri? link) async {
    final s = SbStrings.of(context);
    if (link != null) {
      try {
        if (await openExternal(Uri.https('wa.me', '/', {'text': s('waText', {'t': widget.title, 'u': link})}))) return;
      } catch (_) {
        // Falls through to the share sheet.
      }
    }
    final pdf = _pdf;
    if (pdf != null) await sharePdf(_fileName, pdf);
  }

  Future<void> _open(Uri u) async {
    try {
      if (!await openExternal(u) && mounted) showBoardMessage(context, '$u');
    } catch (_) {
      if (mounted) showBoardMessage(context, '$u');
    }
  }

  Future<void> _copy(Uri link) async {
    await Clipboard.setData(ClipboardData(text: '$link'));
    if (mounted) showBoardMessage(context, SbStrings.of(context)('copied'));
  }
}
