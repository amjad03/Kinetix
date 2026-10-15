import 'package:flutter/material.dart';

import 'online_classes.dart';
import 'tokens.dart';

/// Loads the online classes once and shows [OnlineClassesCard]; a failed load shows nothing (the rest of home still works).
class OnlineClassesSection extends StatefulWidget {
  const OnlineClassesSection({super.key, required this.load, required this.onJoin, this.onCopy});

  final Future<List<OnlineClass>> Function() load;
  final void Function(OnlineClass c) onJoin;
  final void Function(OnlineClass c)? onCopy;

  @override
  State<OnlineClassesSection> createState() => _OnlineClassesSectionState();
}

class _OnlineClassesSectionState extends State<OnlineClassesSection> {
  late final Future<List<OnlineClass>> _future = widget.load().catchError((_) => <OnlineClass>[]);

  @override
  Widget build(BuildContext context) => FutureBuilder<List<OnlineClass>>(
    future: _future,
    builder: (context, snap) => OnlineClassesCard(classes: snap.data ?? const [], onJoin: widget.onJoin, onCopy: widget.onCopy),
  );
}

/// "Sign in with the institution account": opens the provider in the system browser and hands [onToken]
/// the session token once the person has finished there.
class SsoSignInButton extends StatefulWidget {
  const SsoSignInButton({super.key, required this.server, required this.tenant, required this.open, required this.onToken, this.enabled = true});

  final String server;
  /// The institution code as typed now.
  final String Function() tenant;
  final Future<bool> Function(Uri url) open;
  final Future<void> Function(String token) onToken;
  final bool enabled;

  @override
  State<SsoSignInButton> createState() => _SsoSignInButtonState();
}

class _SsoSignInButtonState extends State<SsoSignInButton> {
  bool _busy = false;
  bool _failed = false;

  Future<void> _run() async {
    final tenant = widget.tenant().trim().toLowerCase();
    if (tenant.isEmpty) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    String? token;
    try {
      token = await OnlineApi(baseUrl: widget.server).ssoSignIn(tenant: tenant, open: widget.open);
      if (token != null) await widget.onToken(token);
    } catch (_) {
      token = null;
    }
    if (mounted) {
      setState(() {
        _busy = false;
        _failed = token == null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = OnlineStrings(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(key: const Key('ssoSignIn'), onPressed: _busy || !widget.enabled ? null : _run, icon: const Icon(Icons.login), label: Text(s.sso)),
        if (_busy) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(s.ssoWaiting, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall)),
        if (_failed) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(s.ssoFailed, key: const Key('ssoFailed'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall)),
      ],
    );
  }
}
