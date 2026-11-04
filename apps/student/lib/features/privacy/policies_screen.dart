import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/policies.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The institution's policies that apply to me (code of conduct, anti-ragging, prevention of sexual harassment) and
/// the public ones: read each and acknowledge the ones I must.
class PoliciesScreen extends StatefulWidget {
  const PoliciesScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PoliciesScreen(api: api)));

  @override
  State<PoliciesScreen> createState() => _PoliciesScreenState();
}

class _PoliciesScreenState extends State<PoliciesScreen> {
  List<MyPolicy>? _policies;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await widget.api.myPolicies();
      if (mounted) setState(() => _policies = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final day = DateFormat('d MMM yyyy', Localizations.localeOf(context).languageCode);
    final p = _policies;
    return Scaffold(
      appBar: AppBar(title: Text(l.govPoliciesTab)),
      body: _error != null
          ? ErrorBanner(_error!, onRetry: _load)
          : p == null
          ? const Center(child: CircularProgressIndicator())
          : p.isEmpty
          ? Center(child: Padding(padding: const EdgeInsets.all(Kx.s24), child: Text(l.govNoPolicies, key: const Key('noPolicies'), textAlign: TextAlign.center)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(Kx.s16),
                children: [
                  for (final x in p)
                    Card(
                      key: Key('policy-${x.versionId}'),
                      child: ListTile(
                        title: Text(x.title),
                        subtitle: Text(x.pending ? l.govToAcknowledge(x.version) : x.mustAcknowledge && x.acknowledgedAt != null ? l.govAcknowledgedOn(day.format(x.acknowledgedAt!.toLocal())) : l.govForInfo(x.version)),
                        trailing: Icon(x.pending ? Icons.pending_actions_outlined : Icons.check_circle_outline, color: x.pending ? context.colors.error : null),
                        onTap: () async {
                          final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _Reader(api: widget.api, versionId: x.versionId)));
                          if (done == true) await _load();
                        },
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _Reader extends StatefulWidget {
  const _Reader({required this.api, required this.versionId});

  final StudentApi api;
  final String versionId;

  @override
  State<_Reader> createState() => _ReaderState();
}

class _ReaderState extends State<_Reader> {
  PolicyText? _text;
  ApiException? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final t = await widget.api.policyText(widget.versionId);
      if (mounted) setState(() => _text = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _ack() async {
    setState(() => _busy = true);
    try {
      await widget.api.acknowledgePolicy(widget.versionId);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final t = _text;
    return Scaffold(
      appBar: AppBar(title: Text(l.govPolicyTitle)),
      body: t == null
          ? (_error != null ? ErrorBanner(_error!, onRetry: _load) : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_error != null) ErrorBanner(_error!, onRetry: _load),
                Text(t.title, style: context.text.titleMedium),
                Text(l.govVersion(t.version), style: context.text.bodySmall),
                const SizedBox(height: Kx.s12),
                Text(t.body, key: const Key('policy-body')),
                const SizedBox(height: Kx.s16),
                if (t.mustAcknowledge && t.acknowledgedAt == null) FilledButton(key: const Key('acknowledge'), onPressed: _busy ? null : _ack, child: Text(l.govAcknowledge)),
              ],
            ),
    );
  }
}
