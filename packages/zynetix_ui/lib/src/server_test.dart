import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// Whether [v] is an http(s) address with a host (the server-address fields of all four apps).
bool isValidServerUrl(String? v) {
  final uri = Uri.tryParse(v?.trim() ?? '');
  return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
}

/// [url] without surrounding spaces and trailing slashes.
String normalizeServerUrl(String url) => url.trim().replaceAll(RegExp(r'/+$'), '');

/// GET `<url>/health`; true when the server answers 2xx within [timeout].
Future<bool> testServerConnection(String url, {http.Client? client, Duration timeout = const Duration(seconds: 6)}) async {
  if (!isValidServerUrl(url)) return false;
  final c = client ?? http.Client();
  try {
    final res = await c.get(Uri.parse('${normalizeServerUrl(url)}/health')).timeout(timeout);
    return res.statusCode >= 200 && res.statusCode < 300;
  } catch (_) {
    return false;
  } finally {
    if (client == null) c.close();
  }
}

/// A "Test connection" button for a server-address field: shows [okText] or [failText] beside it.
class TestConnectionButton extends StatefulWidget {
  const TestConnectionButton({super.key, required this.url, required this.label, required this.okText, required this.failText, this.client});

  final String Function() url;
  final String label, okText, failText;
  final http.Client? client;

  @override
  State<TestConnectionButton> createState() => _TestConnectionButtonState();
}

class _TestConnectionButtonState extends State<TestConnectionButton> {
  bool _busy = false;
  bool? _ok;

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _ok = null;
    });
    final ok = await testServerConnection(widget.url(), client: widget.client);
    if (mounted) {
      setState(() {
        _busy = false;
        _ok = ok;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(children: [
      TextButton.icon(
        key: const Key('testConnection'),
        onPressed: _busy ? null : _run,
        icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.wifi_find_outlined),
        label: Text(widget.label),
      ),
      if (_ok != null)
        Flexible(
          child: Text(_ok! ? widget.okText : widget.failText, key: const Key('testConnectionResult'), style: TextStyle(color: _ok! ? cs.primary : cs.error)),
        ),
    ]);
  }
}
