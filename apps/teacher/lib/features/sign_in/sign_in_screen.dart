import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/l10n.dart';
import '../../demo/demo.dart';
import '../../demo/demo_api.dart';
import '../../widgets/common.dart';

/// How the teacher is signing in: with a password, or with a code texted to their phone (first
/// the number, then the code).
enum SignInMode { password, phone, code }

/// Institution code + email or phone + password, or institution code + mobile number + a 6-digit
/// code sent by SMS. The institution, number and server are remembered.
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
  late final _phone = TextEditingController(text: widget.state.rememberedPhone);
  final _code = TextEditingController();
  SignInMode _mode = SignInMode.password;
  bool _showPassword = false;
  bool _showServer = false;
  bool _busy = false;
  ApiException? _error;

  /// The number the code was sent to (E.164), and the countdown until another may be sent.
  String? _sentTo;
  int _resendIn = 0;
  Timer? _countdown;

  @override
  void dispose() {
    _countdown?.cancel();
    for (final c in [_tenant, _login, _password, _server, _phone, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  /// A 10-digit Indian mobile number (the +91 is shown in front of the field).
  static String? validatePhone(AppLocalizations l, String? v) {
    final t = (v ?? '').replaceAll(RegExp(r'[\s-]'), '');
    if (t.isEmpty) return l.enterMobileNumber;
    return RegExp(r'^[6-9]\d{9}$').hasMatch(t) ? null : l.invalidMobileNumber;
  }

  static String? validateCode(AppLocalizations l, String? v) => RegExp(r'^\d{6}$').hasMatch(v ?? '') ? null : l.enterOtp;

  /// "+91 98450 12345".
  static String displayPhone(String e164) =>
      e164.length == 13 ? '${e164.substring(0, 3)} ${e164.substring(3, 8)} ${e164.substring(8)}' : e164;

  String get _serverUrl => _server.text.trim().replaceAll(RegExp(r'/+$'), '');

  void _setMode(SignInMode mode) {
    _countdown?.cancel();
    setState(() {
      _mode = mode;
      _error = null;
      _code.clear();
      if (mode != SignInMode.code) _resendIn = 0;
    });
  }

  /// Validates the form; opens the server field when that is the invalid one.
  bool _validate() {
    setState(() => _error = null);
    if (_form.currentState!.validate()) return true;
    // The server field may be the invalid one while collapsed.
    if (validateServer(context.l10n, _server.text) != null) setState(() => _showServer = true);
    return false;
  }

  void _startCountdown(Duration wait) {
    _countdown?.cancel();
    setState(() => _resendIn = wait.inSeconds);
    _countdown = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
      if (_resendIn == 0) t.cancel();
    });
  }

  /// Sends the code (first time, or again with [resend]).
  Future<void> _sendCode({bool resend = false}) async {
    if (!resend && !_validate()) return;
    final phone = resend ? _sentTo! : '+91${_phone.text.replaceAll(RegExp(r'[\s-]'), '')}';
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await widget.state.requestOtp(server: _serverUrl, tenant: _tenant.text.trim().toLowerCase(), phone: phone);
      if (!mounted) return;
      _sentTo = phone;
      if (!resend) _setMode(SignInMode.code);
      _code.clear();
      _startCountdown(challenge.retryAfter);
      if (resend) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.codeResent)));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_busy || !_validate()) return;
    setState(() => _busy = true);
    try {
      await widget.state.signInWithOtp(server: _serverUrl, tenant: _tenant.text.trim().toLowerCase(), phone: _sentTo!, code: _code.text);
    } on ApiException catch (e) {
      // Wrong or expired: clear it so the right code can be typed straight away.
      if (mounted) {
        setState(() => _error = e);
        _code.clear();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String? validateTenant(AppLocalizations l, String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return l.enterInstitutionCode;
    if (!RegExp(r'^[a-z0-9][a-z0-9-]*$').hasMatch(t.toLowerCase())) return l.institutionCodeChars;
    return null;
  }

  static String? validateLogin(AppLocalizations l, String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return l.enterEmailOrPhone;
    if (t.contains('@')) {
      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t) ? null : l.invalidEmail;
    }
    final digits = t.replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^\+?\d{10,13}$').hasMatch(digits) ? null : l.invalidEmailOrPhone;
  }

  static String? validateServer(AppLocalizations l, String? v) {
    final uri = Uri.tryParse(v?.trim() ?? '');
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty ? null : l.invalidServer;
  }

  /// Demo builds: signs in as Anita in one tap.
  Future<void> _demoSignIn() async {
    _tenant.text = DemoTeacherApi.demoTenant;
    _login.text = DemoTeacherApi.demoLogin;
    _password.text = 'demo';
    setState(() {
      _mode = SignInMode.password;
      _busy = true;
      _error = null;
    });
    try {
      await widget.state.signIn(server: _serverUrl, tenant: DemoTeacherApi.demoTenant, login: DemoTeacherApi.demoLogin, password: 'demo');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => _busy = true);
    try {
      final login = _login.text.trim();
      await widget.state.signIn(
        server: _serverUrl,
        tenant: _tenant.text.trim().toLowerCase(),
        login: login.contains('@') ? login.toLowerCase() : login.replaceAll(RegExp(r'[\s-]'), ''),
        password: _password.text,
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Widget> _passwordFields(AppLocalizations l) => [
    TextFormField(
      key: const Key('login'),
      controller: _login,
      decoration: InputDecoration(labelText: l.emailOrPhone, prefixIcon: const Icon(Icons.person_outline)),
      keyboardType: TextInputType.emailAddress,
      textInputAction: TextInputAction.next,
      autocorrect: false,
      autofillHints: const [AutofillHints.username, AutofillHints.email],
      validator: (v) => validateLogin(l, v),
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
      onFieldSubmitted: (_) => _submit(),
      validator: (v) => (v ?? '').isEmpty ? l.enterPassword : null,
    ),
  ];

  List<Widget> _phoneFields(AppLocalizations l) => [
    TextFormField(
      key: const Key('phone'),
      controller: _phone,
      decoration: InputDecoration(labelText: l.mobileNumber, prefixIcon: const Icon(Icons.smartphone_outlined), prefixText: '+91 '),
      keyboardType: TextInputType.phone,
      textInputAction: TextInputAction.done,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
      onFieldSubmitted: (_) => _sendCode(),
      validator: (v) => validatePhone(l, v),
    ),
  ];

  List<Widget> _codeFields(AppLocalizations l) => [
    Text(l.otpSentTo(displayPhone(_sentTo ?? '')), key: const Key('otpSentTo'), style: context.text.bodyLarge),
    const SizedBox(height: Kx.s16),
    TextFormField(
      key: const Key('otpCode'),
      controller: _code,
      autofocus: true,
      decoration: InputDecoration(labelText: l.otpCode, prefixIcon: const Icon(Icons.pin_outlined), counterText: ''),
      keyboardType: TextInputType.number,
      textInputAction: TextInputAction.done,
      // Lets the keyboard (iOS, Gboard) offer the code from the SMS.
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      style: context.text.titleLarge?.copyWith(letterSpacing: 6, fontFeatures: const [FontFeature.tabularFigures()]),
      onChanged: (v) {
        if (_error != null) setState(() => _error = null);
        if (v.length == 6) _verify();
      },
      onFieldSubmitted: (_) => _verify(),
      validator: (v) => validateCode(l, v),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l = context.l10n;
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
                            child: Icon(Icons.school_outlined, color: colors.onPrimary, size: 22),
                          ),
                          const SizedBox(width: Kx.s12),
                          Text('KINETIX', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                        ],
                      ),
                      const SizedBox(height: Kx.s32),
                      if (Demo.enabled) ...[
                        DemoSignInPanel(busy: _busy, accounts: [('Anita Sharma', _demoSignIn)]),
                        const SizedBox(height: Kx.s24),
                      ],
                      Text(l.signInTitle, style: context.text.headlineMedium),
                      const SizedBox(height: Kx.s8),
                      Text(
                        _mode == SignInMode.password ? l.signInSubtitle : l.phoneSignInSubtitle,
                        style: context.text.bodyLarge?.copyWith(color: colors.onSurfaceVariant),
                      ),
                      const SizedBox(height: Kx.s32),
                      if (_mode != SignInMode.code) ...[
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
                          validator: (v) => validateTenant(l, v),
                        ),
                        const SizedBox(height: Kx.s16),
                      ],
                      ...switch (_mode) {
                        SignInMode.password => _passwordFields(l),
                        SignInMode.phone => _phoneFields(l),
                        SignInMode.code => _codeFields(l),
                      },
                      if (_showServer) ...[
                        const SizedBox(height: Kx.s16),
                        TextFormField(
                          key: const Key('server'),
                          controller: _server,
                          decoration: InputDecoration(labelText: l.serverAddress, prefixIcon: const Icon(Icons.dns_outlined)),
                          keyboardType: TextInputType.url,
                          autocorrect: false,
                          validator: (v) => validateServer(l, v),
                        ),
                      ],
                      if (Demo.enabled && _mode != SignInMode.password) ...[
                        const SizedBox(height: Kx.s8),
                        Text(l.demoOtpHint, key: const Key('demoOtpHint'), style: context.text.bodySmall),
                      ],
                      if (_error != null) ...[const SizedBox(height: Kx.s16), ErrorBanner.api(_error!, key: const Key('signInError'))],
                      const SizedBox(height: Kx.s24),
                      FilledButton(
                        key: Key(switch (_mode) {
                          SignInMode.password => 'signIn',
                          SignInMode.phone => 'sendCode',
                          SignInMode.code => 'verifyCode',
                        }),
                        onPressed: _busy
                            ? null
                            : switch (_mode) {
                                SignInMode.password => _submit,
                                SignInMode.phone => _sendCode,
                                SignInMode.code => _verify,
                              },
                        child: _busy
                            ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(_mode == SignInMode.phone ? l.sendCode : l.signInButton),
                      ),
                      const SizedBox(height: Kx.s8),
                      if (_mode != SignInMode.code) ...[
                        SsoSignInButton(
                          server: _serverUrl,
                          tenant: () => _tenant.text.trim().toLowerCase(),
                          enabled: !_busy,
                          open: (u) => launchUrl(u, mode: LaunchMode.externalApplication),
                          onToken: (t) async {
                            try {
                              await widget.state.signInWithToken(server: _serverUrl, tenant: _tenant.text.trim().toLowerCase(), token: t);
                            } on ApiException catch (e) {
                              if (mounted) setState(() => _error = e);
                            }
                          },
                        ),
                        const SizedBox(height: Kx.s8),
                      ],
                      if (_mode == SignInMode.code)
                        Wrap(
                          alignment: WrapAlignment.center,
                          children: [
                            TextButton(
                              key: const Key('resendCode'),
                              onPressed: _busy || _resendIn > 0 ? null : () => _sendCode(resend: true),
                              child: Text(
                                _resendIn > 0
                                    ? l.resendCodeIn('${_resendIn ~/ 60}:${(_resendIn % 60).toString().padLeft(2, '0')}')
                                    : l.resendCode,
                              ),
                            ),
                            TextButton(
                              key: const Key('changeNumber'),
                              onPressed: _busy ? null : () => _setMode(SignInMode.phone),
                              child: Text(l.changeNumber),
                            ),
                          ],
                        )
                      else
                        Align(
                          child: TextButton.icon(
                            key: Key(_mode == SignInMode.password ? 'signInWithPhone' : 'signInWithPassword'),
                            onPressed: _busy ? null : () => _setMode(_mode == SignInMode.password ? SignInMode.phone : SignInMode.password),
                            icon: Icon(_mode == SignInMode.password ? Icons.sms_outlined : Icons.password_outlined, size: 18),
                            label: Text(_mode == SignInMode.password ? l.signInWithPhone : l.signInWithPassword),
                          ),
                        ),
                      if (!_showServer)
                        Align(
                          child: TextButton.icon(
                            key: const Key('showServer'),
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
