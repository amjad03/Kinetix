import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
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

/// Institution code + email or phone + password. The institution and server are remembered.
/// Only student accounts get in; AppState explains politely to anyone else.
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
  String? _error;

  @override
  void dispose() {
    for (final c in [_tenant, _login, _password, _server]) {
      c.dispose();
    }
    super.dispose();
  }

  static String? validateTenant(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return 'Enter your institution code';
    if (!RegExp(r'^[a-z0-9][a-z0-9-]*$').hasMatch(t.toLowerCase())) return 'Use letters, numbers and hyphens only';
    return null;
  }

  static String? validateLogin(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return 'Enter your email or phone number';
    if (t.contains('@')) {
      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t) ? null : 'Enter a valid email address';
    }
    final digits = t.replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^\+?\d{10,13}$').hasMatch(digits) ? null : 'Enter a 10-digit phone number or a valid email';
  }

  static String? validateServer(String? v) {
    final uri = Uri.tryParse(v?.trim() ?? '');
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty
        ? null
        : 'Enter a server address like https://api.kinetix.in';
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) {
      // The server field may be the invalid one while collapsed.
      if (validateServer(_server.text) != null) setState(() => _showServer = true);
      return;
    }
    setState(() => _busy = true);
    try {
      final login = _login.text.trim();
      await widget.state.signIn(
        server: _server.text.trim().replaceAll(RegExp(r'/+$'), ''),
        tenant: _tenant.text.trim().toLowerCase(),
        login: normalizeLogin(login),
        password: _password.text,
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
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
                            child: Icon(Icons.school, color: colors.onPrimary, size: 22),
                          ),
                          const SizedBox(width: Kx.s12),
                          Text('KINETIX', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                          const SizedBox(width: Kx.s8),
                          Text('Student', style: context.text.titleMedium?.copyWith(color: colors.onSurfaceVariant)),
                        ],
                      ),
                      const SizedBox(height: Kx.s32),
                      Text('Sign in', style: context.text.headlineMedium),
                      const SizedBox(height: Kx.s8),
                      Text(
                        'Use the email or phone number your college gave you',
                        style: context.text.bodyLarge?.copyWith(color: colors.onSurfaceVariant),
                      ),
                      const SizedBox(height: Kx.s32),
                      TextFormField(
                        key: const Key('tenant'),
                        controller: _tenant,
                        decoration: const InputDecoration(
                          labelText: 'Institution code',
                          hintText: 'e.g. demo-college',
                          prefixIcon: Icon(Icons.apartment_outlined),
                        ),
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        validator: validateTenant,
                      ),
                      const SizedBox(height: Kx.s16),
                      TextFormField(
                        key: const Key('login'),
                        controller: _login,
                        decoration: const InputDecoration(labelText: 'Email or phone', prefixIcon: Icon(Icons.person_outline)),
                        keyboardType: TextInputType.emailAddress,
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
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _showPassword ? 'Hide password' : 'Show password',
                            icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                            onPressed: () => setState(() => _showPassword = !_showPassword),
                          ),
                        ),
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        validator: (v) => (v ?? '').isEmpty ? 'Enter your password' : null,
                      ),
                      if (_showServer) ...[
                        const SizedBox(height: Kx.s16),
                        TextFormField(
                          key: const Key('server'),
                          controller: _server,
                          decoration: const InputDecoration(labelText: 'Server address', prefixIcon: Icon(Icons.dns_outlined)),
                          keyboardType: TextInputType.url,
                          autocorrect: false,
                          validator: validateServer,
                        ),
                      ],
                      if (_error != null) ...[const SizedBox(height: Kx.s16), ErrorBanner(_error!)],
                      const SizedBox(height: Kx.s24),
                      FilledButton(
                        key: const Key('signIn'),
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Sign in'),
                      ),
                      const SizedBox(height: Kx.s8),
                      if (!_showServer)
                        Align(
                          child: TextButton.icon(
                            onPressed: () => setState(() => _showServer = true),
                            icon: const Icon(Icons.dns_outlined, size: 18),
                            label: Text('Server: ${Uri.tryParse(_server.text)?.authority ?? _server.text}'),
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
