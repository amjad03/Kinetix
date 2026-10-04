import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';

/// First run: an admin registers this board with the enrolment code from KINETIX ERP.
class EnrollScreen extends StatefulWidget {
  const EnrollScreen({super.key, required this.controller});

  final BoardController controller;

  @override
  State<EnrollScreen> createState() => _EnrollScreenState();
}

class _EnrollScreenState extends State<EnrollScreen> {
  final _server = TextEditingController(text: 'http://localhost:4000');
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.controller.enroll(_server.text, _code.text);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return Scaffold(
      backgroundColor: c.surfaceContainer,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Kx.s24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              color: c.surface,
              child: Padding(
                padding: const EdgeInsets.all(Kx.s32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(color: c.primaryContainer, borderRadius: Kx.radiusMd),
                          child: Icon(Icons.co_present_outlined, color: c.onPrimaryContainer),
                        ),
                        const SizedBox(width: Kx.s16),
                        Text(l.appTitle, style: context.text.titleLarge),
                      ],
                    ),
                    const SizedBox(height: Kx.s24),
                    Text(l.enrollTitle, style: context.text.headlineMedium),
                    const SizedBox(height: Kx.s8),
                    Text(
                      l.enrollHint,
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                    const SizedBox(height: Kx.s24),
                    TextField(
                      key: const Key('enroll-code'),
                      controller: _code,
                      textCapitalization: TextCapitalization.characters,
                      style: context.text.titleLarge?.copyWith(letterSpacing: 2),
                      decoration: InputDecoration(labelText: l.enrollCode, hintText: 'KX-XXXX-XXXX', prefixIcon: const Icon(Icons.key_outlined)),
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: Kx.s12),
                    TextField(
                      controller: _server,
                      decoration: InputDecoration(labelText: l.enrollServer, prefixIcon: const Icon(Icons.dns_outlined)),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: Kx.s12),
                        child: Text(_error!, style: TextStyle(color: c.error)),
                      ),
                    const SizedBox(height: Kx.s24),
                    FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? l.enrollRegistering : l.enrollRegister)),
                    const SizedBox(height: Kx.s8),
                    TextButton(onPressed: widget.controller.skipEnrollment, child: Text(l.enrollSkip)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
