import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_life.dart';
import '../../core/files.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The Outcome Passport: skills with level and the evidence behind each, certificates, clubs
/// and events, and the institution's verification. It downloads as a PDF with a verify QR.
class PassportScreen extends StatefulWidget {
  const PassportScreen({super.key, required this.api, required this.studentId, this.openFile = openWithSystem});

  final StudentApi api;
  final String studentId;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PassportScreen(api: api, studentId: studentId)));

  @override
  State<PassportScreen> createState() => _PassportScreenState();
}

class _PassportScreenState extends State<PassportScreen> {
  OutcomePassport? _passport;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await widget.api.passport(widget.studentId);
      if (mounted) setState(() => _passport = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _download() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.passportPdf(widget.studentId);
      final ok = await widget.openFile(bytes, 'outcome-passport.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.fileOpenFailed)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = _passport;
    final c = context.colors;
    final ok = kxTone(context, KxTone.success);
    final wait = kxTone(context, KxTone.warning);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.passportTitle),
        actions: [if (p != null) IconButton(key: const Key('downloadPassport'), tooltip: l.passportDownload, onPressed: _download, icon: const Icon(Icons.picture_as_pdf_outlined))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (p == null && _error == null) const KxLoading(),
            if (p != null) ...[
              KxCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.fullName, style: context.text.titleLarge),
                    Text([p.className, p.rollNo].where((s) => s.isNotEmpty).join(' · '), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    Pill(
                      p.verified ? l.passportVerified : l.passportNotVerified,
                      key: const Key('passportVerification'),
                      icon: p.verified ? Icons.verified_outlined : Icons.hourglass_empty,
                      background: p.verified ? ok.bg : wait.bg,
                      foreground: p.verified ? ok.fg : wait.fg,
                    ),
                  ],
                ),
              ),
              KxSectionHeader(l.passportSkills),
              if (p.skills.isEmpty) KxEmptyState(icon: Icons.psychology_outlined, message: l.passportNoSkills),
              for (final s in p.skills) ...[_SkillCard(skill: s), const SizedBox(height: Kx.s8)],
              if (p.certificates.isNotEmpty) ...[KxSectionHeader(l.passportCertificates), for (final t in p.certificates) _Line(Icons.workspace_premium_outlined, t)],
              if (p.clubs.isNotEmpty || p.events.isNotEmpty) ...[
                KxSectionHeader(l.passportActivities),
                for (final t in p.clubs) _Line(Icons.groups_outlined, t),
                for (final t in p.events) _Line(Icons.event_outlined, t),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s4),
    child: Row(
      children: [
        Icon(icon, size: 20, color: context.colors.onSurfaceVariant),
        const SizedBox(width: Kx.s12),
        Expanded(child: Text(text, style: context.text.bodyLarge)),
      ],
    ),
  );
}

/// A skill, its level out of 5, and the evidence behind it when opened.
class _SkillCard extends StatelessWidget {
  const _SkillCard({required this.skill});

  final PassportSkill skill;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final level = skill.level;
    return KxCard(
      key: Key('skill-${skill.skillId}'),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          title: Text(skill.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          subtitle: Row(
            children: [
              for (var i = 1; i <= 5; i++) Icon(i <= (level ?? 0) ? Icons.circle : Icons.circle_outlined, size: 12, color: c.primary),
              const SizedBox(width: Kx.s8),
              Flexible(child: Text(level == null ? l.passportNoEvidence : l.passportLevel('$level'), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
            ],
          ),
          children: [
            if (skill.evidence.isEmpty)
              Align(alignment: Alignment.centerLeft, child: Text(l.passportNoEvidence, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)))
            else
              for (final e in skill.evidence)
                ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(e.title), subtitle: e.detail.isEmpty ? null : Text(e.detail), leading: const Icon(Icons.check_circle_outline, size: 20)),
          ],
        ),
      ),
    );
  }
}
