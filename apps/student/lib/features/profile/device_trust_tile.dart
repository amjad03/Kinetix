import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../l10n/l10n.dart';

/// Whether this phone is one the student has trusted; a new phone offers to be trusted so a sign-in from it is not flagged.
class DeviceTrustTile extends StatefulWidget {
  const DeviceTrustTile({super.key, required this.api});

  final StudentApi api;

  @override
  State<DeviceTrustTile> createState() => _DeviceTrustTileState();
}

class _DeviceTrustTileState extends State<DeviceTrustTile> {
  String? _state;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    widget.api.deviceState().then((s) {
      if (mounted) setState(() => _state = s);
    }).catchError((Object _) {
      if (mounted) setState(() => _state = 'none');
    });
  }

  Future<void> _trust() async {
    setState(() => _busy = true);
    try {
      await widget.api.trustDevice('Student App');
      final s = await widget.api.deviceState();
      if (mounted) setState(() => _state = s);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = _state;
    if (s == null || s == 'none') return const SizedBox.shrink();
    final trusted = s == 'trusted';
    return ListTile(
      key: const Key('deviceTrust'),
      leading: Icon(trusted ? Icons.verified_user_outlined : Icons.phonelink_lock_outlined),
      title: Text(l.deviceTrustTitle),
      subtitle: Text(trusted ? l.deviceTrustTrusted : l.deviceTrustNew),
      trailing: trusted ? null : TextButton(key: const Key('deviceTrustButton'), onPressed: _busy ? null : _trust, child: Text(l.deviceTrustButton)),
    );
  }
}
