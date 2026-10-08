import 'dart:async';

import 'package:flutter/material.dart';

import 'cast_link.dart';
import 'cast_models.dart';
import 'cast_peer.dart';
import 'cast_sender.dart';
import 'cast_strings.dart';

/// "Share screen to the board": the boards with a class this person may cast to, and the cast's
/// progress. The apps open it from their menus with their own [sender] and board loader.
class CastPage extends StatefulWidget {
  const CastPage({super.key, required this.sender, required this.loadBoards});

  final CastSender sender;
  final Future<List<CastBoard>> Function() loadBoards;

  @override
  State<CastPage> createState() => _CastPageState();
}

class _CastPageState extends State<CastPage> {
  List<CastBoard>? _boards;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    widget.sender.addListener(_changed);
    unawaited(_load());
  }

  @override
  void dispose() {
    widget.sender.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final b = await widget.loadBoards();
      if (mounted) setState(() => _boards = b);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  String _status(CastStrings s) {
    final c = widget.sender;
    switch (c.phase) {
      case CastPhase.capturing:
        return s['capturing'];
      case CastPhase.requesting:
        return s['requesting'];
      case CastPhase.waiting:
        return s['waiting'];
      case CastPhase.connecting:
        return s['connecting'];
      case CastPhase.live:
        return s['live'];
      case CastPhase.idle:
        if (c.error != null) return c.error!;
        if (c.declinedCapture) return s['declinedCapture'];
        return switch (c.ended) {
          CastEndReason.declined => s['declined'],
          CastEndReason.classEnded => s['classEnded'],
          CastEndReason.boardLeft => s['boardLeft'],
          CastEndReason.stopped || CastEndReason.senderLeft => s['stopped'],
          null => '',
        };
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = CastStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');
    final c = widget.sender;
    final status = _status(s);
    return Scaffold(
      appBar: AppBar(title: Text(s.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(s['lead']),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: Text(s['boards'], style: Theme.of(context).textTheme.titleMedium)),
              TextButton(key: const Key('cast-refresh'), onPressed: c.active ? null : _load, child: Text(s['refresh'])),
            ],
          ),
          if (_failed) Text(s['loadFailed']) else if (_boards == null) const Center(child: CircularProgressIndicator()) else if (_boards!.isEmpty) Text(s['none'], key: const Key('cast-none')),
          for (final b in _boards ?? const <CastBoard>[])
            Card(
              key: Key('cast-board-${b.deviceId}'),
              child: ListTile(
                leading: const Icon(Icons.cast_for_education_outlined),
                title: Text(b.name),
                subtitle: Text([b.classLabel, b.teacher, b.needsApproval ? s['approval'] : s['auto']].where((x) => x.isNotEmpty).join(' · ')),
                trailing: c.board?.deviceId == b.deviceId && c.active
                    ? OutlinedButton.icon(key: const Key('cast-stop'), onPressed: c.stop, icon: const Icon(Icons.stop_screen_share_outlined), label: Text(s['stop']))
                    : FilledButton(key: const Key('cast-start'), onPressed: c.active ? null : () => unawaited(c.start(b)), child: Text(s['start'])),
              ),
            ),
          const SizedBox(height: 16),
          if (status.isNotEmpty) Text(status, key: const Key('cast-status'), style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}

/// Opens the cast screen for the signed-in person of [baseUrl] and [token], and ends any cast
/// when they leave it. [sender] is for tests.
Future<void> openCastPage(BuildContext context, {required String baseUrl, required String token, CastSender? sender}) async {
  final s = sender ?? CastSender(link: SocketCastLink(baseUrl: baseUrl, token: token), peerFactory: WebRtcCastPeer.new);
  await Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => CastPage(sender: s, loadBoards: () => fetchCastBoards(baseUrl: baseUrl, token: token))),
  );
  s.dispose();
}
