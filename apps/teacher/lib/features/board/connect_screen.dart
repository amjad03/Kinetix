import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/offline_key.dart';
import '../../core/offline_pairing.dart';
import 'qr_scanner_view.dart';

/// Phones and tablets can scan; desktop builds (Linux) only offer the typed code.
bool get platformCanScan => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

enum _Mode { scan, code, connected }

/// "Connect to board": scan the board's QR code (or type its 6-digit code), then show the result.
/// Pops with the [BoardConnection] when done, or null if cancelled or the class was ended.
class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key, required this.api, this.canScan});

  final TeacherApi api;

  /// Overrides platform detection (tests).
  final bool? canScan;

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  late final bool _canScan = widget.canScan ?? platformCanScan;
  late _Mode _mode = _canScan ? _Mode.scan : _Mode.code;
  BoardConnection? _connection;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _keepKey();
  }

  /// While online, keep the institution's public key so a board's offline code can be checked later with no network.
  Future<void> _keepKey() async {
    try {
      await (await widget.api.offlineSigningKey()).save();
    } catch (_) {
      // Best effort: the scan still works with the key from an earlier visit.
    }
  }

  /// A board's signed offline code: checked here, with no network. Says what it found; signing in to the board still needs the cloud.
  Future<void> _checkOffline(String token) async {
    final l = context.l10n;
    final times = MaterialLocalizations.of(context);
    final key = await OfflineKey.load();
    final String text;
    if (key == null) {
      text = l.offlineNeedKey;
    } else {
      final r = verifyOfflineCode(token: token, publicKeyRaw: key.publicKeyRaw, tenantId: key.tenantId, now: DateTime.now());
      text = switch (r) {
        OfflineOk(:final code) => l.offlineVerified(code.deviceId.length > 4 ? code.deviceId.substring(code.deviceId.length - 4) : code.deviceId, times.formatTimeOfDay(TimeOfDay.fromDateTime(code.validUntil))),
        OfflineBad(reason: OfflineFailure.expired) => l.offlineExpired,
        OfflineBad(reason: OfflineFailure.notYetValid) => l.offlineNotYet,
        OfflineBad(reason: OfflineFailure.wrongInstitution) => l.offlineWrongInstitution,
        OfflineBad() => l.offlineBad,
      };
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        key: const Key('offlineResult'),
        title: Text(l.offlineTitle),
        content: Text(text),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.done))],
      ),
    );
  }

  /// From the server, or [_localError] for a short code.
  ApiException? _error;
  bool _localError = false;

  String? _errorText(BuildContext context) =>
      _localError ? context.l10n.enterAllDigits : (_error == null ? null : context.l10n.errorText(_error!));

  /// Returns whether the board was claimed.
  Future<bool> _claim({String? code, String? qr}) async {
    if (_busy) return false;
    setState(() {
      _busy = true;
      _error = null;
      _localError = false;
    });
    try {
      final c = await widget.api.claimBoard(code: code, qr: qr);
      HapticFeedback.mediumImpact();
      if (mounted) setState(() => (_connection = c, _mode = _Mode.connected));
      return true;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _endClass() async {
    setState(() => _busy = true);
    try {
      await widget.api.endSession(_connection!.sessionId);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorText(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return switch (_mode) {
      _Mode.scan => QrScannerView(
        busy: _busy,
        error: _errorText(context),
        onScanned: (raw) => raw.startsWith(offlinePrefix) ? _checkOffline(raw) : _claim(qr: raw),
        onEnterCode: () => setState(() => (_mode = _Mode.code, _error = null, _localError = false)),
      ),
      _Mode.code => CodeEntryView(
        busy: _busy,
        error: _errorText(context),
        onSubmit: (code) => _claim(code: code),
        onScanInstead: _canScan ? () => setState(() => (_mode = _Mode.scan, _error = null, _localError = false)) : null,
        onLocalError: (short) => setState(() => (_error = null, _localError = short)),
      ),
      _Mode.connected => ConnectedView(
        connection: _connection!,
        busy: _busy,
        onDone: () => Navigator.of(context).pop(_connection),
        onEndClass: _endClass,
      ),
    };
  }
}

/// OTP-style entry of the 6-digit code shown on the board.
class CodeEntryView extends StatefulWidget {
  const CodeEntryView({
    super.key,
    required this.busy,
    required this.error,
    required this.onSubmit,
    required this.onLocalError,
    this.onScanInstead,
  });

  final bool busy;
  final String? error;

  /// Claims the code; resolves to whether it worked.
  final Future<bool> Function(String code) onSubmit;

  /// True when fewer than 6 digits were submitted; false clears the error.
  final ValueChanged<bool> onLocalError;
  final VoidCallback? onScanInstead;

  @override
  State<CodeEntryView> createState() => _CodeEntryViewState();
}

class _CodeEntryViewState extends State<CodeEntryView> {
  final _text = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _text.text;
    if (code.length != 6) {
      widget.onLocalError(true);
      return;
    }
    // Rejected: clear the boxes so the new code on the board can be typed straight away.
    if (!await widget.onSubmit(code) && mounted) _text.clear();
  }

  void _changed(String value) {
    if (widget.error != null) widget.onLocalError(false);
    if (value.length == 6) _submit();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final code = _text.text;
    return Scaffold(
      appBar: AppBar(leading: const CloseButton(), title: Text(l.connectToBoard)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s16, Kx.s24, Kx.s24),
          children: [
            Text(l.enterCodeTitle, key: const Key('enterCodeTitle'), style: context.text.headlineSmall),
            const SizedBox(height: Kx.s8),
            Text(l.enterCodeBody, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s32),
            Stack(
              children: [
                // Scales down on narrow phones (six 46 px boxes need 324 px).
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (var i = 0; i < 6; i++) ...[
                        if (i == 3) const SizedBox(width: Kx.s16) else if (i > 0) const SizedBox(width: Kx.s8),
                        _DigitBox(
                          digit: i < code.length ? code[i] : '',
                          active: _focus.hasFocus && (i == code.length || (i == 5 && code.length == 6)),
                          error: widget.error != null,
                        ),
                      ],
                    ],
                  ),
                ),
                // The real input sits invisibly on top of the boxes so taps focus it.
                Positioned.fill(
                  child: TextField(
                    key: const Key('codeField'),
                    controller: _text,
                    focusNode: _focus,
                    autofocus: true,
                    // readOnly (not disabled) while connecting, so the field keeps focus for a retry.
                    readOnly: widget.busy,
                    showCursor: false,
                    enableInteractiveSelection: false,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                    style: const TextStyle(color: Colors.transparent, fontSize: 1),
                    decoration: const InputDecoration(
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      counterText: '',
                    ),
                    onChanged: _changed,
                    onSubmitted: (_) => _submit(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s16),
            AnimatedSize(
              duration: const Duration(milliseconds: 150),
              child: widget.error == null
                  ? const SizedBox(width: double.infinity)
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.error_outline, size: 20, color: c.error),
                        const SizedBox(width: Kx.s8),
                        Expanded(
                          child: Text(
                            widget.error!,
                            key: const Key('codeError'),
                            style: context.text.bodyMedium?.copyWith(color: c.error),
                          ),
                        ),
                      ],
                    ),
            ),
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('connectWithCode'),
              onPressed: widget.busy ? null : _submit,
              child: widget.busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l.connect),
            ),
            if (widget.onScanInstead != null) ...[
              const SizedBox(height: Kx.s8),
              TextButton.icon(
                key: const Key('scanInstead'),
                onPressed: widget.onScanInstead,
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(l.scanInstead),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DigitBox extends StatelessWidget {
  const _DigitBox({required this.digit, required this.active, required this.error});

  final String digit;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: 46,
      height: 58,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.surfaceContainerHighest,
        borderRadius: Kx.radiusMd,
        border: Border.all(color: error ? c.error : (active ? c.primary : Colors.transparent), width: 2),
      ),
      child: Text(digit, style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w500)),
    );
  }
}

/// "You're connected": what the board is now showing, with Done and End class.
class ConnectedView extends StatelessWidget {
  const ConnectedView({super.key, required this.connection, required this.busy, required this.onDone, required this.onEndClass});

  final BoardConnection connection;
  final bool busy;
  final VoidCallback onDone;
  final VoidCallback onEndClass;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final period = Fmt.of(context).period(connection);
    Widget row(IconData icon, String label, String value) => ListTile(
      leading: Icon(icon, color: c.onSurfaceVariant),
      title: Text(label, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
      subtitle: Text(value, style: context.text.titleMedium),
    );
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false, actions: [CloseButton(onPressed: onDone)]),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s24),
                children: [
                  const SizedBox(height: Kx.s16),
                  Center(
                    child: CircleAvatar(
                      radius: 40,
                      backgroundColor: c.primaryContainer,
                      child: Icon(Icons.cast_connected, size: 40, color: c.onPrimaryContainer),
                    ),
                  ),
                  const SizedBox(height: Kx.s24),
                  Text(l.youreConnected, key: const Key('youreConnected'), textAlign: TextAlign.center, style: context.text.headlineSmall),
                  const SizedBox(height: Kx.s8),
                  Text(
                    connection.sectionName == null ? l.boardReady(connection.boardName) : l.boardShowingClass(connection.boardName),
                    textAlign: TextAlign.center,
                    style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                  ),
                  const SizedBox(height: Kx.s32),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
                      child: Column(
                        children: [
                          row(Icons.co_present_outlined, l.labelBoard, connection.boardName),
                          if (connection.sectionName != null) ...[
                            row(Icons.groups_outlined, l.labelClass, connection.sectionName!),
                            if (connection.subjectName != null) row(Icons.menu_book_outlined, l.labelSubject, connection.subjectName!),
                            if (period != null) row(Icons.schedule, l.labelPeriod, period),
                          ] else
                            ListTile(
                              leading: Icon(Icons.info_outline, color: c.onSurfaceVariant),
                              title: Text(l.freeSession, style: context.text.titleMedium),
                              subtitle: Text(l.freeSessionBody),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('endClass'),
                      onPressed: busy ? null : onEndClass,
                      icon: const Icon(Icons.stop_circle_outlined),
                      label: Text(l.endClass),
                    ),
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: FilledButton(key: const Key('connectDone'), onPressed: busy ? null : onDone, child: Text(l.done)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
