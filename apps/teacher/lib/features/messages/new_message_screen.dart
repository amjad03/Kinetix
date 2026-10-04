import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// "New message": pick a class, find a student by name or roll number, then the parent or
/// guardian to write to. Pops with the opened (or existing) thread.
class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen> {
  final _search = TextEditingController();
  List<StudentContacts>? _all;
  String? _class;
  String? _error;

  /// The student whose thread is being opened.
  String? _opening;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final all = await widget.api.familyContacts();
      setState(() {
        _all = all;
        _class ??= _classes.firstOrNull;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  List<String> get _classes => {for (final s in _all ?? const <StudentContacts>[]) s.className}.toList();

  List<StudentContacts> get _shown {
    final q = _search.text.trim().toLowerCase();
    return [
      for (final s in _all ?? const <StudentContacts>[])
        if (s.className == _class &&
            (q.isEmpty || s.student.fullName.toLowerCase().contains(q) || s.student.rollNo.toLowerCase().contains(q)))
          s,
    ];
  }

  Future<void> _pick(StudentContacts s) async {
    final Guardian? g = await showModalBottomSheet<Guardian>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s4),
              child: Text('Write to ${s.student.fullName}’s family', style: ctx.text.titleMedium),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s8),
              child: Text(
                'The thread is between you and the person you choose. School leaders can review it.',
                style: ctx.text.bodyMedium?.copyWith(color: ctx.colors.onSurfaceVariant),
              ),
            ),
            for (final g in s.guardians)
              ListTile(
                key: Key('guardian-${g.id}'),
                contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s24),
                leading: KxAvatar(name: g.fullName),
                title: Text(g.fullName),
                subtitle: Text(g.relationLabel),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.pop(ctx, g),
              ),
            const SizedBox(height: Kx.s8),
          ],
        ),
      ),
    );
    if (g == null || !mounted) return;
    setState(() => _opening = s.student.id);
    try {
      final c = await widget.api.startConversation(studentId: s.student.id, guardianId: g.id);
      if (mounted) Navigator.of(context).pop(c);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _opening = null);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final shown = _shown;
    final classes = _classes;
    return Scaffold(
      appBar: AppBar(leading: const CloseButton(), title: const Text('New message')),
      body: _all == null && _error == null
          ? const Center(child: CircularProgressIndicator())
          : _all == null
          ? Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load))
          : _all!.isEmpty
          ? const KxEmptyState(icon: Icons.groups_outlined, message: 'No students in the classes you teach yet')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (classes.length > 1)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                    child: Row(
                      children: [
                        for (final name in classes)
                          Padding(
                            padding: const EdgeInsets.only(right: Kx.s8),
                            child: ChoiceChip(label: Text(name), selected: name == _class, onSelected: (_) => setState(() => _class = name)),
                          ),
                      ],
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                  child: TextField(
                    key: const Key('studentSearch'),
                    controller: _search,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search by name or roll number',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(tooltip: 'Clear', onPressed: _search.clear, icon: const Icon(Icons.close)),
                    ),
                  ),
                ),
                Expanded(
                  child: shown.isEmpty
                      ? KxEmptyState(icon: Icons.person_search_outlined, message: 'No student matches “${_search.text.trim()}”')
                      : ListView.builder(
                          padding: const EdgeInsets.only(bottom: Kx.s24),
                          itemCount: shown.length,
                          itemBuilder: (context, i) {
                            final s = shown[i];
                            final none = s.guardians.isEmpty;
                            final family = s.guardians.map((g) => '${g.fullName} (${g.relation})').join(', ');
                            return ListTile(
                              key: Key('contact-${s.student.id}'),
                              contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                              enabled: !none && _opening == null,
                              leading: KxAvatar(name: s.student.fullName),
                              title: Text(s.student.fullName),
                              subtitle: Text(
                                none ? '${s.student.rollNo} · No parent or guardian on record' : '${s.student.rollNo} · $family',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: none ? context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant, fontStyle: FontStyle.italic) : null,
                              ),
                              trailing: _opening == s.student.id
                                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                  : null,
                              onTap: () => _pick(s),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
