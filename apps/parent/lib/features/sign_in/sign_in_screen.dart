import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Emails are lower-cased. The API matches phones exactly in E.164, so a 10-digit Indian
/// number ("98000 00001") becomes "+919800000001".
String normalizeLogin(String login) {
  if (login.contains('@')) return login.toLowerCase();
  final digits = login.replaceAll(RegExp(r'[\s-]'), '');
  if (RegExp(r'^\d{10}$').hasMatch(digits)) return '+91$digits';
  if (RegExp(r'^0\d{10}$').hasMatch(digits)) return '+91${digits.substring(1)}';
  if (RegExp(r'^91\d{10}$').hasMatch(digits)) return '+$digits';
  return digits;
}

/// The 10-digit Indian mobile number in [text], dropping a pasted +91 or leading 0.
String nationalMobile(String text) {
  var digits = text.replaceAll(RegExp(r'\D'), '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.substring(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.substring(1);
  return digits.length > 10 ? digits.substring(0, 10) : digits;
}

/// "+91 98000 00001" for showing a number back.
String displayMobile(String national) =>
    national.length == 10 ? '+91 ${national.substring(0, 5)} ${national.substring(5)}' : '+91 $national';

/// Keeps the phone field to the 10 national digits, whatever is typed or pasted.
class _MobileFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = nationalMobile(newValue.text);
    return TextEditingValue(text: digits, selection: TextSelection.collapsed(offset: digits.length));
  }
}

/// Sign in with a code texted to the phone (the default), or with a phone or email and a
/// password. The institution and server are remembered. Only guardian accounts get in;
/// AppState explains politely to anyone else.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.state});

  final AppState state;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  late final _tenant = TextEditingController(text: widget.state.rememberedTenant);
  late final _login = TextEditingController(text: widget.state.rememberedLogin);
  final _password = TextEditingController();
  late final _server = TextEditingController(text: widget.state.serverUrl);
  late final _phone = TextEditingController(
    text: widget.state.rememberedLogin.startsWith('+91') ? nationalMobile(widget.state.rememberedLogin) : '',
  );
  final _code = TextEditingController();
  bool _showPassword = false;
  bool _showServer = false;
  bool _busy = false;

  /// Password sign-in instead of a texted code.
  bool _usePassword = false;

  /// The number a code was sent to (E.164); null while asking for the number.
  String? _sentTo;
  int _resendIn = 0;
  Timer? _countdown;

  /// An [ApiException] (worded in the app's language) or text.
  Object? _error;

  @override
  void dispose() {
    _countdown?.cancel();
    for (final c in [_tenant, _login, _password, _server, _phone, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  AppLocalizations get _l => context.l10n;

  String? validateTenant(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return _l.enterInstitutionCode;
    if (!RegExp(r'^[a-z0-9][a-z0-9-]*$').hasMatch(t.toLowerCase())) return _l.institutionCodeChars;
    return null;
  }

  String? validateLogin(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return _l.enterPhoneOrEmail;
    if (t.contains('@')) {
      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t) ? null : _l.enterValidEmail;
    }
    final digits = t.replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^\+?\d{10,13}$').hasMatch(digits) ? null : _l.enterValidPhone;
  }

  String? validateMobile(String? v) {
    final t = v ?? '';
    if (t.isEmpty) return _l.enterPhone;
    return RegExp(r'^[6-9]\d{9}$').hasMatch(t) ? null : _l.enterValidMobile;
  }

  String? validateCode(String? v) => RegExp(r'^\d{6}$').hasMatch(v ?? '') ? null : _l.enterOtp;

  String? validateServer(String? v) {
    final uri = Uri.tryParse(v?.trim() ?? '');
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty
        ? null
        : _l.enterServer;
  }

  String get _serverUrl => _server.text.trim().replaceAll(RegExp(r'/+$'), '');
  String get _tenantCode => _tenant.text.trim().toLowerCase();

  bool _validate() {
    setState(() => _error = null);
    if (_form.currentState!.validate()) return true;
    // The server field may be the invalid one while collapsed.
    if (validateServer(_server.text) != null) setState(() => _showServer = true);
    return false;
  }

  /// Runs [action] with the button busy, showing what went wrong inline.
  Future<void> _run(Future<void> Function() action, {bool requestingCode = false}) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) {
        final limited = e.code == 'RATE_LIMITED' || e.status == 429;
        setState(() => _error = requestingCode && limited ? _l.errOtpTooMany : e);
        // Resend only once the server will take another request.
        final wait = e.retryAfterSeconds;
        if (limited && requestingCode && _sentTo != null && wait != null) _startCountdown(wait);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitPassword() async {
    if (!_validate()) return;
    await _run(
      () => widget.state.signIn(
        server: _serverUrl,
        tenant: _tenantCode,
        login: normalizeLogin(_login.text.trim()),
        password: _password.text,
      ),
    );
  }

  Future<void> _sendCode() async {
    if (_sentTo == null && !_validate()) return;
    if (_sentTo != null) setState(() => _error = null);
    final phone = '+91${_phone.text}';
    await _run(() async {
      final challenge = await widget.state.requestOtp(server: _serverUrl, tenant: _tenantCode, phone: phone);
      if (!mounted) return;
      _code.clear();
      setState(() => _sentTo = phone);
      _startCountdown(challenge.retryAfterSeconds);
    }, requestingCode: true);
  }

  void _startCountdown(int seconds) {
    _countdown?.cancel();
    setState(() => _resendIn = seconds);
    _countdown = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) t.cancel();
    });
  }

  Future<void> _verify() async {
    final phone = _sentTo;
    if (phone == null || _busy || !_validate()) return;
    await _run(() => widget.state.signInWithOtp(server: _serverUrl, tenant: _tenantCode, phone: phone, code: _code.text));
  }

  void _changeNumber() {
    _countdown?.cancel();
    setState(() {
      _sentTo = null;
      _error = null;
      _resendIn = 0;
      _code.clear();
    });
  }

  void _switchMethod() {
    _countdown?.cancel();
    setState(() {
      _usePassword = !_usePassword;
      _sentTo = null;
      _error = null;
      _resendIn = 0;
    });
  }

  static String _clock(int seconds) => '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

  Widget _busyOr(String label) =>
      _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(label);

  List<Widget> _passwordFields(AppLocalizations l) => [
    TextFormField(
      key: const Key('login'),
      controller: _login,
      decoration: InputDecoration(labelText: l.phoneOrEmail, prefixIcon: const Icon(Icons.person_outline)),
      keyboardType: TextInputType.emailAddress,
      // Parents usually sign in with the phone number the college has on file.
      textInputAction: TextInputAction.next,
      autocorrect: false,
      autofillHints: const [AutofillHints.username, AutofillHints.email],
      validator: validateLogin,
    ),
    const SizedBox(height: Kx.s16),
    TextFormField(
      key: const Key('password'),
      controller: _password,
      obscureText: !_showPassword,
      decoration: InputDecoration(
        labelText: l.password,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          tooltip: _showPassword ? l.hidePassword : l.showPassword,
          icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
          onPressed: () => setState(() => _showPassword = !_showPassword),
        ),
      ),
      autofillHints: const [AutofillHints.password],
      onFieldSubmitted: (_) => _submitPassword(),
      validator: (v) => (v ?? '').isEmpty ? l.enterPassword : null,
    ),
  ];

  Widget _phoneField(AppLocalizations l) => TextFormField(
    key: const Key('phone'),
    controller: _phone,
    decoration: InputDecoration(labelText: l.phoneNumber, prefixText: '+91 ', prefixIcon: const Icon(Icons.phone_iphone)),
    keyboardType: TextInputType.phone,
    textInputAction: TextInputAction.done,
    autofillHints: const [AutofillHints.telephoneNumberNational],
    inputFormatters: [_MobileFormatter()],
    onFieldSubmitted: (_) => _sendCode(),
    validator: validateMobile,
  );

  List<Widget> _codeFields(AppLocalizations l) => [
    Text(
      l.otpSentTo(displayMobile(nationalMobile(_sentTo!))),
      key: const Key('otpSentTo'),
      style: context.text.bodyLarge,
    ),
    const SizedBox(height: Kx.s16),
    TextFormField(
      key: const Key('otpCode'),
      controller: _code,
      autofocus: true,
      decoration: InputDecoration(labelText: l.otpCode, prefixIcon: const Icon(Icons.sms_outlined), counterText: ''),
      keyboardType: TextInputType.number,
      textInputAction: TextInputAction.done,
      // The SMS's code is offered above the keyboard (Android autofill, iOS QuickType); no SMS permission.
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      maxLength: 6,
      style: context.text.titleLarge?.copyWith(letterSpacing: 6),
      onChanged: (v) {
        if (v.length == 6) _verify();
      },
      onFieldSubmitted: (_) => _verify(),
      validator: validateCode,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l = context.l10n;
    final codeStep = !_usePassword && _sentTo != null;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s32, Kx.s24, Kx.s24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(color: colors.primary, borderRadius: Kx.radiusMd),
                            child: Icon(Icons.family_restroom, color: colors.onPrimary, size: 22),
                          ),
                          const SizedBox(width: Kx.s12),
                          // Wraps under very large text instead of overflowing.
                          Expanded(
                            child: Wrap(
                              spacing: Kx.s8,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text('KINETIX', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                                Text('Parent', style: context.text.titleMedium?.copyWith(color: colors.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: Kx.s32),
                      Text(l.signIn, style: context.text.headlineMedium),
                      const SizedBox(height: Kx.s8),
                      Text(
                        _usePassword ? l.signInHint : l.otpHint,
                        style: context.text.bodyLarge?.copyWith(color: colors.onSurfaceVariant),
                      ),
                      const SizedBox(height: Kx.s32),
                      if (codeStep)
                        ..._codeFields(l)
                      else ...[
                        TextFormField(
                          key: const Key('tenant'),
                          controller: _tenant,
                          decoration: InputDecoration(
                            labelText: l.institutionCode,
                            hintText: l.institutionCodeHint,
                            prefixIcon: const Icon(Icons.apartment_outlined),
                          ),
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          validator: validateTenant,
                        ),
                        const SizedBox(height: Kx.s16),
                        if (_usePassword) ..._passwordFields(l) else _phoneField(l),
                      ],
                      if (_showServer && !codeStep) ...[
                        const SizedBox(height: Kx.s16),
                        TextFormField(
                          key: const Key('server'),
                          controller: _server,
                          decoration: InputDecoration(labelText: l.serverAddress, prefixIcon: const Icon(Icons.dns_outlined)),
                          keyboardType: TextInputType.url,
                          autocorrect: false,
                          validator: validateServer,
                        ),
                      ],
                      if (_error != null) ...[const SizedBox(height: Kx.s16), ErrorBanner(_error!)],
                      const SizedBox(height: Kx.s24),
                      if (_usePassword)
                        FilledButton(key: const Key('signIn'), onPressed: _busy ? null : _submitPassword, child: _busyOr(l.signIn))
                      else if (codeStep) ...[
                        FilledButton(key: const Key('verifyCode'), onPressed: _busy ? null : _verify, child: _busyOr(l.signIn)),
                        const SizedBox(height: Kx.s8),
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            TextButton(
                              key: const Key('resendCode'),
                              onPressed: _busy || _resendIn > 0 ? null : _sendCode,
                              child: Text(_resendIn > 0 ? l.resendIn(_clock(_resendIn)) : l.resendCode),
                            ),
                            TextButton(key: const Key('changeNumber'), onPressed: _busy ? null : _changeNumber, child: Text(l.changeNumber)),
                          ],
                        ),
                      ] else
                        FilledButton(key: const Key('sendCode'), onPressed: _busy ? null : _sendCode, child: _busyOr(l.sendCode)),
                      const SizedBox(height: Kx.s8),
                      Align(
                        child: TextButton(
                          key: Key(_usePassword ? 'usePhoneCode' : 'usePassword'),
                          onPressed: _busy ? null : _switchMethod,
                          child: Text(_usePassword ? l.usePhoneCode : l.usePassword, textAlign: TextAlign.center),
                        ),
                      ),
                      if (!_showServer && !codeStep)
                        Align(
                          child: TextButton.icon(
                            onPressed: () => setState(() => _showServer = true),
                            icon: const Icon(Icons.dns_outlined, size: 18),
                            label: Text(l.serverLabel(Uri.tryParse(_server.text)?.authority ?? _server.text)),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
