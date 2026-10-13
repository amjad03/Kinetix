import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/panel/panel_host.dart';
import 'catalogue_facets.dart';
import 'search_strings.dart';

/// What the teacher filled in on "Request a 3D model".
typedef ModelRequestDraft = ({String name, String? subject, String? classLevel, String? note});

/// "Request a 3D model" in the 3D library: a short form, then the request goes to the API
/// (PUT /v1/model-requests/:id). Offline it waits in the board's outbox and goes when the board
/// is back; the board picks the id, so it is kept once however often it is sent.
Future<void> requestModel3d(BuildContext context, BoardController board, {String? subject, String? classLevel, String? name}) async {
  final l = context.l10n;
  final api = board.api;
  if (!board.isSignedIn || api == null) {
    showBoardMessage(context, l.model3dRequestNeedsSignIn);
    return;
  }
  final draft = await showPanelDialog<ModelRequestDraft>(
    context: context,
    builder: (_) => BoardChromeTheme(child: ModelRequestForm(subject: subject, classLevel: classLevel, name: name)),
  );
  if (draft == null || !context.mounted) return;
  try {
    await api.requestModel(board.newId(), name: draft.name, subject: draft.subject, classLevel: draft.classLevel, note: draft.note);
    if (context.mounted) showBoardMessage(context, l.model3dRequestSent);
  } on ApiException catch (e) {
    if (context.mounted) showBoardMessage(context, apiErrorText(l, e));
  } catch (_) {
    if (context.mounted) showBoardMessage(context, l.model3dRequestFailed);
  }
}

/// The request form: model name (needed), subject, class and a note. Pops a [ModelRequestDraft].
class ModelRequestForm extends StatefulWidget {
  const ModelRequestForm({super.key, this.subject, this.classLevel, this.name});

  /// The class's subject and level, filled in to start with.
  final String? subject, classLevel;

  /// The model's name, filled in when a kit asks for a model it knows (the civil kit's bridges).
  final String? name;

  @override
  State<ModelRequestForm> createState() => _ModelRequestFormState();
}

class _ModelRequestFormState extends State<ModelRequestForm> {
  late final _name = TextEditingController(text: widget.name ?? '');
  final _note = TextEditingController();
  late final _subjects = subjectsIn(modelItems);
  late final _levels = levelsIn(modelItems);
  late String? _subject = _subjects.contains(widget.subject) ? widget.subject : null;
  late String? _level = _levels.contains(widget.classLevel) ? widget.classLevel : null;
  bool _tried = false;

  @override
  void dispose() {
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  void _send() {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _tried = true);
      return;
    }
    final note = _note.text.trim();
    Navigator.of(context).pop<ModelRequestDraft>((name: name, subject: _subject, classLevel: _level, note: note.isEmpty ? null : note));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = SearchStrings.of(context);
    final missing = _tried && _name.text.trim().isEmpty;
    return AlertDialog(
      key: const Key('model-request-form'),
      icon: const Icon(Icons.view_in_ar_outlined),
      title: Text(l.model3dRequest),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l.model3dRequestHint, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Kx.s16),
              TextField(
                key: const Key('model-request-name'),
                controller: _name,
                autofocus: true,
                maxLength: 120,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l.model3dRequestName, hintText: l.model3dRequestNameHint, errorText: missing ? l.model3dRequestNameNeeded : null, border: const OutlineInputBorder()),
                onChanged: (_) {
                  if (missing) setState(() {});
                },
              ),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String?>(
                      key: const Key('model-request-subject'),
                      initialValue: _subject,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: l.model3dRequestSubject, border: const OutlineInputBorder()),
                      items: [
                        DropdownMenuItem(value: null, child: Text(l.model3dRequestAny)),
                        for (final k in _subjects) DropdownMenuItem(value: k, child: Text(s.subjectName(k), overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) => setState(() => _subject = v),
                    ),
                  ),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: DropdownButtonFormField<String?>(
                      key: const Key('model-request-class'),
                      initialValue: _level,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: l.model3dRequestClass, border: const OutlineInputBorder()),
                      items: [
                        DropdownMenuItem(value: null, child: Text(l.model3dRequestAny)),
                        for (final k in _levels) DropdownMenuItem(value: k, child: Text(s.levelName(k), overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) => setState(() => _level = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s16),
              TextField(
                key: const Key('model-request-note'),
                controller: _note,
                maxLines: 3,
                maxLength: 1000,
                decoration: InputDecoration(labelText: l.model3dRequestNote, border: const OutlineInputBorder()),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(key: const Key('model-request-cancel'), onPressed: () => Navigator.of(context).pop(), child: Text(l.cancel)),
        FilledButton(key: const Key('model-request-send'), onPressed: _send, child: Text(l.model3dRequestSend)),
      ],
    );
  }
}
