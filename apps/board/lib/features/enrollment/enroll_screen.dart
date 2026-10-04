import 'package:flutter/material.dart';

import '../../core/board_controller.dart';

/// First run: an admin types the enrolment code from the ERP to register this board.
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
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Set up this board', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text('In KINETIX ERP, go to Devices → Add board and type the code shown there.'),
              const SizedBox(height: 24),
              TextField(controller: _server, decoration: const InputDecoration(labelText: 'Server', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(
                key: const Key('enroll-code'),
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Enrolment code (KX-XXXX-XXXX)', border: OutlineInputBorder()),
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
              const SizedBox(height: 20),
              FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Connecting…' : 'Register board')),
              TextButton(onPressed: widget.controller.startPractice, child: const Text('Try the practice board')),
            ]),
          ),
        ),
      ),
    );
  }
}
