import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/board_controller.dart';
import '../../core/cloud/cloud_service.dart';
import '../../l10n/l10n.dart';
import '../cloud/cloud_sheet.dart' show cloudError, cloudName;
import 'chrome.dart';
import 'layout/page_overview.dart' show PdfBranding, boardPdf, sharePdf;
import 'panel/panel_host.dart';
import 'pptx_export.dart';
import 'sb_strings.dart';

/// Opens WhatsApp or the mail app. Tests replace it.
Future<bool> Function(Uri) openExternal = (u) => launchUrl(u, mode: LaunchMode.externalApplication);

/// Opens the share sheet with any file (the board's slides). Tests replace it.
Future<void> Function(String name, Uint8List bytes, String mimeType) shareFile = (name, bytes, mime) =>
    SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, name: name, mimeType: mime)], fileNameOverrides: [name]));

/// The format sent to drives, Classroom, Moodle and other apps.
enum ShareFormat { pdf, pptx }

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
/// offers WhatsApp, Email, QR (for students without an LMS) and the device's other apps; and, as
/// PDF or PowerPoint slides, Google Drive, OneDrive, Google Classroom and Moodle (set up in the
/// Zynetix dashboard → Integrations). A guest (no account) or an offline board can still send
/// the PDF through other apps.
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
  String? _message;
  bool _busy = true;
  bool _sending = false;
  ShareFormat _format = ShareFormat.pdf;
  Uint8List? _pptx;
  CloudStatus? _cloud;

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
      final cloud = widget.board.cloud;
      if (cloud != null && widget.board.isSignedIn) {
        unawaited(cloud.status().then((c) => mounted ? setState(() => _cloud = c) : null, onError: (Object e) => debugPrint('Cloud status: $e')));
      }
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

  String get _fileName => 'Zynetix ${widget.title} ${DateFormat('yyyy-MM-dd').format(DateTime.now())}.pdf';

  String get _pptxName => _fileName.replaceFirst(RegExp(r'\.pdf$'), '.pptx');

  /// The file in the chosen format: the PDF made on opening, or the slides (made once, on first use).
  Future<({String name, String mime, Uint8List bytes})?> _file() async {
    if (_format == ShareFormat.pdf) {
      final pdf = _pdf;
      return pdf == null ? null : (name: _fileName, mime: 'application/pdf', bytes: pdf);
    }
    _pptx ??= await boardPptx(widget.wb, widget.canvas, title: widget.title);
    return (name: _pptxName, mime: pptxMime, bytes: _pptx!);
  }

  /// Runs one send (drive, Classroom, Moodle), with the result or a clear error under the buttons.
  Future<void> _send(String service, Future<String> Function(CloudService cloud, ({String name, String mime, Uint8List bytes}) file) send) async {
    final l = context.l10n;
    final cloud = widget.board.cloud;
    if (cloud == null || !widget.board.isSignedIn) {
      setState(() => _note = 'shareNeedsSignIn');
      return;
    }
    setState(() {
      _sending = true;
      _message = null;
    });
    try {
      final file = await _file();
      if (file == null) return;
      final done = await send(cloud, file);
      if (mounted) setState(() => _message = done);
    } catch (e) {
      if (mounted) setState(() => _message = cloudError(l, e, service));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _saveTo(CloudProvider p) {
    final l = context.l10n;
    final name = cloudName(l, p);
    return _send(name, (cloud, f) async {
      await cloud.save(p, f.name, f.mime, f.bytes);
      return l.shareSavedTo(name);
    });
  }

  Future<void> _post({required bool moodle}) async {
    final l = context.l10n;
    final service = moodle ? l.shareMoodle : l.shareClassroom;
    final cloud = widget.board.cloud;
    if (moodle && _cloud != null && !_cloud!.moodle) {
      // No web service token: the link (and LTI) still work in Moodle.
      setState(() => _message = l.shareMoodleLink);
      return;
    }
    if (cloud == null) return;
    List<ShareCourse> courses;
    try {
      courses = moodle ? await cloud.moodleCourses() : await cloud.classroomCourses();
    } catch (e) {
      if (mounted) setState(() => _message = cloudError(l, e, moodle ? service : l.cloudGoogle));
      return;
    }
    if (!mounted) return;
    final course = await showDialog<ShareCourse>(context: context, builder: (_) => _CoursePicker(courses: courses, l: l));
    if (course == null || !mounted) return;
    await _send(service, (c, f) async {
      final r = moodle ? await c.postToMoodle(course.id, widget.title, f.name, f.mime, f.bytes) : await c.postToClassroom(course.id, widget.title, f.name, f.mime, f.bytes);
      if (r.link != null) _link ??= Uri.tryParse(r.link!);
      return l.sharePosted(course.name);
    });
  }

  Future<void> _shareOther() async {
    final file = await _file();
    if (file == null) return;
    if (_format == ShareFormat.pdf) return _sharePdf(file.bytes);
    try {
      await shareFile(file.name, file.bytes, file.mime);
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotShare('$e'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final l = context.l10n;
    final link = _link;
    final signedIn = widget.board.isSignedIn && widget.board.cloud != null;
    final ready = !_sending && _pdf != null;
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
                    child: SingleChildScrollView(
                     child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SegmentedButton<ShareFormat>(
                          key: const Key('share-format'),
                          segments: [
                            ButtonSegment(value: ShareFormat.pdf, label: Text(l.shareAsPdf), icon: const Icon(Icons.picture_as_pdf_outlined)),
                            ButtonSegment(value: ShareFormat.pptx, label: Text(l.shareSlides), icon: const Icon(Icons.slideshow_outlined)),
                          ],
                          selected: {_format},
                          onSelectionChanged: (v) => setState(() => _format = v.first),
                        ),
                        const SizedBox(height: Kx.s8),
                        action(const Key('share-whatsapp'), Icons.chat_outlined, s('whatsapp'), link == null && _pdf == null ? null : () => unawaited(_whatsapp(link))),
                        action(
                          const Key('share-email'),
                          Icons.mail_outline,
                          s('email'),
                          link == null ? null : () => _open(Uri(scheme: 'mailto', query: _query({'subject': s('emailSubject', {'t': widget.title}), 'body': s('emailBody', {'u': link})}))),
                        ),
                        action(const Key('share-copy'), Icons.link, s('copyLink'), link == null ? null : () => _copy(link)),
                        action(const Key('share-other'), Icons.ios_share, s('moreApps'), ready ? () => unawaited(_shareOther()) : null),
                        if (signedIn) ...[
                          action(const Key('share-drive-google'), Icons.add_to_drive_outlined, l.shareSaveTo(l.cloudGoogle), ready ? () => unawaited(_saveTo(CloudProvider.google)) : null),
                          action(const Key('share-drive-microsoft'), Icons.cloud_upload_outlined, l.shareSaveTo(l.cloudMicrosoft), ready ? () => unawaited(_saveTo(CloudProvider.microsoft)) : null),
                          action(const Key('share-classroom'), Icons.school_outlined, l.shareClassroom, ready ? () => unawaited(_post(moodle: false)) : null),
                          action(const Key('share-moodle'), Icons.menu_book_outlined, l.shareMoodle, ready ? () => unawaited(_post(moodle: true)) : null),
                        ],
                        if (_sending) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Row(children: [const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: Kx.s8), Text(l.shareWorking)])),
                        if (_message != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_message!, key: const Key('share-message'))),
                        if (_note != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(s(_note!), key: const Key('share-note'))),
                      ],
                     ),
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
    if (pdf != null) await _sharePdf(pdf);
  }

  /// The share sheet with the PDF; a device that cannot share says so.
  Future<void> _sharePdf(Uint8List pdf) async {
    try {
      await sharePdf(_fileName, pdf);
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotShare('$e'));
    }
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

/// Which Google Classroom or Moodle course gets the notes.
class _CoursePicker extends StatelessWidget {
  const _CoursePicker({required this.courses, required this.l});
  final List<ShareCourse> courses;
  final AppLocalizations l;

  @override
  Widget build(BuildContext context) => SimpleDialog(
    key: const Key('share-courses'),
    title: Text(l.shareChooseCourse),
    children: [
      if (courses.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.shareNoCourses)),
      for (final c in courses)
        SimpleDialogOption(
          key: Key('share-course-${c.id}'),
          onPressed: () => Navigator.of(context).pop(c),
          child: ListTile(title: Text(c.name), subtitle: c.detail == null ? null : Text(c.detail!)),
        ),
    ],
  );
}
