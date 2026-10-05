import 'package:flutter/material.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

import '../../core/api.dart';

/// The code lab for practice, as on the board: Python, JavaScript and SQL run on the phone
/// with no data used; C, C++ and Java run on the college's server in India (signed in).
class CodeLabView extends StatefulWidget {
  const CodeLabView({super.key, required this.api, this.webRunner});

  final StudentApi api;

  /// Tests pass a WebRunner with a fake page.
  final WebRunner? webRunner;

  @override
  State<CodeLabView> createState() => _CodeLabViewState();
}

class _CodeLabViewState extends State<CodeLabView> with AutomaticKeepAliveClientMixin {
  late final _server = ServerRunner(
    endpoint: () => widget.api.token == null ? null : Uri.parse('${widget.api.baseUrl}/v1/code/run'),
    headers: () async => {if (widget.api.token case final t?) 'authorization': 'Bearer $t'},
  );

  // Keeps the program and its output while the student looks at another tab.
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Padding(
      padding: const EdgeInsets.all(12),
      child: CodeLab(key: const Key('codeLab'), server: _server, webRunner: widget.webRunner),
    );
  }
}
