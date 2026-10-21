import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../l10n/feature_strings.dart';

/// The institution code in a Zynetix address: `anita.cse@sdmcet.zynetix.in` → `sdmcet`. Null for
/// an address with no sub-domain (gmail.com), where the teacher types it.
String? tenantFromEmail(String email) {
  final at = email.lastIndexOf('@');
  if (at < 0) return null;
  final labels = email.substring(at + 1).trim().toLowerCase().split('.').where((s) => s.isNotEmpty).toList();
  return labels.length >= 3 ? labels.first : null;
}

const _lastTenantKey = 'board.lastTenant';

/// "Sign in with email and password", inside the board's sign-in dialog: for a teacher with no
/// phone at hand (a demo, a new teacher). The password is sent to the server only, never kept.
class PasswordSignInForm extends StatefulWidget {
  const PasswordSignInForm({super.key, required this.api, required this.onSignedIn});

  final ApiClient api;
  final void Function(String sessionToken, SessionContext session) onSignedIn;

  @override
  State<PasswordSignInForm> createState() => _PasswordSignInFormState();
}

class _PasswordSignInFormState extends State<PasswordSignInForm> {
  final _tenant = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _tenantTyped = false;
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_loadTenant());
  }

  Future<void> _loadTenant() async {
    try {
      final last = (await SharedPreferences.getInstance()).getString(_lastTenantKey);
      if (last != null && mounted && _tenant.text.isEmpty) setState(() => _tenant.text = last);
    } catch (_) {}
  }

  @override
  void dispose() {
    _tenant.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _ready => !_busy && _tenant.text.trim().isNotEmpty && _email.text.trim().length >= 3 && _password.text.isNotEmpty;

  Future<void> _submit() async {
    if (!_ready) return;
    final s = FeatureStrings(boardLang(context), _strings);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await widget.api.signInWithPassword(tenant: _tenant.text, login: _email.text, password: _password.text);
      try {
        await (await SharedPreferences.getInstance()).setString(_lastTenantKey, _tenant.text.trim());
      } catch (_) {}
      _password.clear();
      widget.onSignedIn(r.sessionToken, r.session);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.status == 401 ? s['wrong'] : e.message);
    } catch (_) {
      if (mounted) setState(() => _error = s['offline']);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = FeatureStrings(boardLang(context), _strings);
    final c = context.colors;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: AutofillGroup(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const Key('pw-email'),
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: s['email'], prefixIcon: const Icon(Icons.alternate_email)),
              onChanged: (v) => setState(() {
                final t = tenantFromEmail(v);
                if (!_tenantTyped && t != null) _tenant.text = t;
              }),
            ),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('pw-password'),
              controller: _password,
              obscureText: _hide,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                labelText: s['password'],
                prefixIcon: const Icon(Icons.password),
                suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _hide = !_hide)),
              ),
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('pw-tenant'),
              controller: _tenant,
              autocorrect: false,
              decoration: InputDecoration(labelText: s['tenant'], helperText: s['tenantHelp'], prefixIcon: const Icon(Icons.apartment_outlined)),
              onChanged: (_) => setState(() => _tenantTyped = true),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s12),
                child: Text(_error!, key: const Key('pw-error'), style: TextStyle(color: c.error)),
              ),
            const SizedBox(height: Kx.s16),
            FilledButton.icon(
              key: const Key('pw-submit'),
              onPressed: _ready ? _submit : null,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
              label: Text(s['signIn']),
            ),
            const SizedBox(height: Kx.s8),
            Text(s['note'], style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

const passwordSignInStrings = _strings;

const _strings = {
  'en': {
    'switch': 'Sign in with email and password',
    'switchBack': 'Use the Teacher app instead',
    'email': 'Email or phone',
    'password': 'Password',
    'tenant': 'Institution code',
    'tenantHelp': 'e.g. sdmcet (filled in from a college email address)',
    'signIn': 'Sign in',
    'wrong': 'Wrong institution, email or password.',
    'offline': 'Cannot reach the server. Check the board\'s network and server address.',
    'note': 'Others can see this screen: type the password where only you can see it, and sign out when the class ends.',
  },
  'hi': {
    'switch': 'ईमेल और पासवर्ड से साइन इन करें',
    'switchBack': 'इसके बजाय टीचर ऐप का उपयोग करें',
    'email': 'ईमेल या फ़ोन',
    'password': 'पासवर्ड',
    'tenant': 'संस्थान कोड',
    'tenantHelp': 'जैसे sdmcet (कॉलेज ईमेल से अपने आप भरता है)',
    'signIn': 'साइन इन करें',
    'wrong': 'संस्थान, ईमेल या पासवर्ड गलत है।',
    'offline': 'सर्वर से संपर्क नहीं हो पा रहा। बोर्ड का नेटवर्क और सर्वर पता जाँचें।',
    'note': 'यह स्क्रीन दूसरों को दिखती है: पासवर्ड ध्यान से टाइप करें और कक्षा के बाद साइन आउट करें।',
  },
  'kn': {
    'switch': 'ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್‌ನಿಂದ ಸೈನ್ ಇನ್',
    'switchBack': 'ಬದಲಿಗೆ ಶಿಕ್ಷಕರ ಆ್ಯಪ್ ಬಳಸಿ',
    'email': 'ಇಮೇಲ್ ಅಥವಾ ಫೋನ್',
    'password': 'ಪಾಸ್‌ವರ್ಡ್',
    'tenant': 'ಸಂಸ್ಥೆಯ ಕೋಡ್',
    'tenantHelp': 'ಉದಾ. sdmcet (ಕಾಲೇಜು ಇಮೇಲ್‌ನಿಂದ ತುಂಬುತ್ತದೆ)',
    'signIn': 'ಸೈನ್ ಇನ್',
    'wrong': 'ಸಂಸ್ಥೆ, ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ.',
    'offline': 'ಸರ್ವರ್ ತಲುಪಲಾಗುತ್ತಿಲ್ಲ. ಬೋರ್ಡ್‌ನ ನೆಟ್‌ವರ್ಕ್ ಮತ್ತು ಸರ್ವರ್ ವಿಳಾಸ ಪರಿಶೀಲಿಸಿ.',
    'note': 'ಈ ಪರದೆ ಇತರರಿಗೆ ಕಾಣುತ್ತದೆ: ಪಾಸ್‌ವರ್ಡ್ ಎಚ್ಚರಿಕೆಯಿಂದ ಟೈಪ್ ಮಾಡಿ, ತರಗತಿ ಮುಗಿದಾಗ ಸೈನ್ ಔಟ್ ಮಾಡಿ.',
  },
};
