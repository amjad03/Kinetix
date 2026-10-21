import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Where the last resource list of each topic is kept.
abstract class ResourceStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class MemoryResourceStore implements ResourceStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

/// SharedPreferences (all four apps already use it). Failures read as "nothing kept".
class PrefsResourceStore implements ResourceStore {
  const PrefsResourceStore();

  @override
  Future<String?> read(String key) async {
    try {
      return (await SharedPreferences.getInstance()).getString(key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await (await SharedPreferences.getInstance()).setString(key, value);
    } catch (_) {}
  }
}

/// A topic's resources and whether they came from the copy kept on this device.
@immutable
class LoadedResources {
  const LoadedResources(this.resources, {this.offline = false, this.savedAt});

  final TopicResources resources;

  /// The server could not be reached: [resources] is the last list kept on this device.
  final bool offline;
  final DateTime? savedAt;
}

/// Fetches `GET /v1/topics/:id/resources` (through [fetch], the app's own API client) and keeps
/// the answer per topic, so the list is there when the board or phone is offline.
class TopicResourcesRepository {
  TopicResourcesRepository({required this.fetch, ResourceStore? store, DateTime Function()? now})
    : store = store ?? const PrefsResourceStore(),
      _now = now ?? DateTime.now;

  final Future<Object?> Function(String topicId) fetch;
  final ResourceStore store;
  final DateTime Function() _now;

  static String keyFor(String topicId) => 'kx.topicResources.$topicId';

  /// The server's list (and keeps it), or the kept one when the server cannot be reached.
  /// Throws only when there is neither.
  Future<LoadedResources> load(String topicId) async {
    try {
      final j = await fetch(topicId);
      final r = TopicResources.fromJson(j);
      final at = _now();
      unawaited(store.write(keyFor(topicId), jsonEncode({'savedAt': at.toIso8601String(), 'resources': r.toJson()})));
      return LoadedResources(r, savedAt: at);
    } catch (e) {
      final kept = await cached(topicId);
      if (kept != null) return kept;
      rethrow;
    }
  }

  /// The copy kept on this device, or null.
  Future<LoadedResources?> cached(String topicId) async {
    final raw = await store.read(keyFor(topicId));
    if (raw == null) return null;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      return LoadedResources(TopicResources.fromJson(j['resources']), offline: true, savedAt: DateTime.tryParse(j['savedAt'] as String? ?? ''));
    } catch (_) {
      return null;
    }
  }
}
