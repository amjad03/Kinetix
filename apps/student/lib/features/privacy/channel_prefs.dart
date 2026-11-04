import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../l10n/l10n.dart';

/// One channel the person can switch on or off (`GET /v1/comms/preferences`).
class ChannelPref {
  const ChannelPref({required this.channel, required this.granted, required this.reachable});

  factory ChannelPref.fromJson(Map<String, dynamic> j) => ChannelPref(channel: j['channel'] as String, granted: j['granted'] as bool? ?? false, reachable: j['reachable'] as bool? ?? true);

  final String channel;
  final bool granted;

  /// The school has the number or address this channel needs.
  final bool reachable;
}

/// Reads and changes the person's own choices per channel.
abstract class ChannelPrefSource {
  Future<List<ChannelPref>> channelPrefs();
  Future<List<ChannelPref>> setChannelPref(String channel, bool granted);
}

/// "Messages from the school": SMS, WhatsApp, email and phone alerts, each on or off (DPDP Act). App notices and
/// emergency alerts always arrive.
class ChannelPrefsScreen extends StatefulWidget {
  const ChannelPrefsScreen({super.key, required this.api});

  final ChannelPrefSource api;

  static Future<void> open(BuildContext context, ChannelPrefSource api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChannelPrefsScreen(api: api)));

  @override
  State<ChannelPrefsScreen> createState() => _ChannelPrefsScreenState();
}

class _ChannelPrefsScreenState extends State<ChannelPrefsScreen> {
  List<ChannelPref>? _prefs;
  ApiException? _error;
  String? _saving;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await widget.api.channelPrefs();
      if (mounted) setState(() => _prefs = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _set(String channel, bool on) async {
    setState(() => _saving = channel);
    try {
      final p = await widget.api.setChannelPref(channel, on);
      if (mounted) setState(() => _prefs = p);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  String _label(String ch) => switch (ch) {
    'sms' => context.l10n.prefSms,
    'whatsapp' => context.l10n.prefWhatsapp,
    'email' => context.l10n.prefEmail,
    _ => context.l10n.prefPush,
  };

  String _help(String ch) => switch (ch) {
    'sms' => context.l10n.prefSmsHelp,
    'whatsapp' => context.l10n.prefWhatsappHelp,
    'email' => context.l10n.prefEmailHelp,
    _ => context.l10n.prefPushHelp,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final prefs = _prefs;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.prefTitle)),
      body: _error != null && prefs == null
          ? Center(child: TextButton(onPressed: _load, child: Text(context.errorText(_error!))))
          : prefs == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              key: const Key('channelPrefs'),
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
              children: [
                Text(context.l10n.prefIntro, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s16),
                for (final p in prefs)
                  Card(
                    margin: const EdgeInsets.only(bottom: Kx.s8),
                    child: SwitchListTile(
                      key: Key('pref-${p.channel}'),
                      title: Text(_label(p.channel)),
                      subtitle: Text(p.reachable ? _help(p.channel) : context.l10n.prefNoAddress),
                      value: p.granted,
                      onChanged: _saving != null || !p.reachable ? null : (v) => _set(p.channel, v),
                    ),
                  ),
                const SizedBox(height: Kx.s8),
                Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: c.onSurfaceVariant),
                    const SizedBox(width: Kx.s8),
                    Expanded(child: Text(context.l10n.prefAlwaysOn, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                  ],
                ),
              ],
            ),
    );
  }
}
