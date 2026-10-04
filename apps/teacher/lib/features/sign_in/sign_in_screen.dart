import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// Institution code + email or phone + password. The institution and server are remembered.
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
  bool _showPassword = false;
  bool _showServer = false;
  bool _busy = false;
  ApiException? _error;

  @override
  void dispose() {
    for (final c in [_tenant, _login, _password, _server]) {
      c.dispose();
    }
    super.dispose();
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

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) {
      // The server field may be the invalid one while collapsed.
      if (validateServer(context.l10n, _server.text) != null) setState(() => _showServer = true);
      return;
    }
    setState(() => _busy = true);
    try {
      final login = _login.text.trim();
      await widget.state.signIn(
        server: _server.text.trim().replaceAll(RegExp(r'/+$'), ''),
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
                      Text(l.signInTitle, style: context.text.headlineMedium),
                      const SizedBox(height: Kx.s8),
                      Text(l.signInSubtitle, style: context.text.bodyLarge?.copyWith(color: colors.onSurfaceVariant)),
                      const SizedBox(height: Kx.s32),
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
                      if (_error != null) ...[const SizedBox(height: Kx.s16), ErrorBanner.api(_error!, key: const Key('signInError'))],
                      const SizedBox(height: Kx.s24),
                      FilledButton(
                        key: const Key('signIn'),
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(l.signInButton),
                      ),
                      const SizedBox(height: Kx.s8),
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
