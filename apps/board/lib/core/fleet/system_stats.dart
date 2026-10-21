import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// Load and temperatures for the IT console (Zynetix admin → Boards/Edge devices), read on a
/// best-effort basis: whatever the platform does not let an app read stays null. Android panels
/// and Linux OPS read /proc and /sys (Android 8+ hides /proc/stat from apps, so CPU % is often
/// null there, but memory, thermal zones and the GPU/NPU devfreq loads usually read); macOS asks
/// sysctl, vm_stat and ps; Windows reports none of these yet.
@immutable
class SystemStats {
  const SystemStats({this.cpuPercent, this.gpuPercent, this.npuPercent, this.ramPercent, this.cpuTempC, this.gpuTempC});

  final int? cpuPercent;
  final int? gpuPercent;
  final int? npuPercent;
  final int? ramPercent;
  final int? cpuTempC;
  final int? gpuTempC;

  static const none = SystemStats();

  /// Reads them now (about half a second, for the CPU sample). Never throws.
  static Future<SystemStats> read() async {
    try {
      if (kIsWeb) return none;
      if (Platform.isAndroid || Platform.isLinux) return await _linux();
      if (Platform.isMacOS) return await _macos();
    } catch (e) {
      debugPrint('System stats not read: $e');
    }
    return none;
  }

  static Future<String?> _file(String path) async {
    try {
      return await File(path).readAsString();
    } catch (_) {
      return null;
    }
  }

  static Future<SystemStats> _linux() async {
    final stat1 = await _file('/proc/stat');
    int? cpu;
    if (stat1 != null) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      final stat2 = await _file('/proc/stat');
      if (stat2 != null) cpu = cpuPercentFromProcStat(stat1, stat2);
    }
    final ram = ramPercentFromMeminfo(await _file('/proc/meminfo') ?? '');
    int? cpuTemp, gpuTemp;
    try {
      final zones = Directory('/sys/class/thermal').listSync().where((e) => e.path.split('/').last.startsWith('thermal_zone'));
      for (final z in zones) {
        final type = (await _file('${z.path}/type'))?.trim().toLowerCase() ?? '';
        final t = celsius(await _file('${z.path}/temp'));
        if (t == null) continue;
        if (isGpuZone(type)) {
          gpuTemp = gpuTemp == null ? t : (t > gpuTemp ? t : gpuTemp);
        } else if (isCpuZone(type)) {
          cpuTemp = cpuTemp == null ? t : (t > cpuTemp ? t : cpuTemp);
        }
      }
    } catch (_) {}
    int? gpu = percentFromText(await _file('/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage'));
    int? npu;
    try {
      for (final d in Directory('/sys/class/devfreq').listSync()) {
        final name = d.path.split('/').last.toLowerCase();
        final load = devfreqLoad(await _file('${d.path}/load'));
        if (load == null) continue;
        if (name.contains('npu') || name.contains('rknn')) npu ??= load;
        if (name.contains('gpu') || name.contains('mali') || name.contains('kgsl')) gpu ??= load;
      }
    } catch (_) {}
    return SystemStats(cpuPercent: cpu, gpuPercent: gpu, npuPercent: npu, ramPercent: ram, cpuTempC: cpuTemp, gpuTempC: gpuTemp);
  }

  static Future<String?> _run(String exe, List<String> args) async {
    try {
      final r = await Process.run(exe, args).timeout(const Duration(seconds: 3));
      return r.exitCode == 0 ? '${r.stdout}' : null;
    } catch (_) {
      return null;
    }
  }

  static Future<SystemStats> _macos() async {
    final cores = int.tryParse((await _run('/usr/sbin/sysctl', ['-n', 'hw.ncpu']))?.trim() ?? '');
    final ps = await _run('/bin/ps', ['-A', '-o', '%cpu=']);
    final memsize = int.tryParse((await _run('/usr/sbin/sysctl', ['-n', 'hw.memsize']))?.trim() ?? '');
    final vm = await _run('/usr/bin/vm_stat', const []);
    return SystemStats(
      cpuPercent: ps == null || cores == null ? null : cpuPercentFromPs(ps, cores),
      ramPercent: vm == null || memsize == null ? null : ramPercentFromVmStat(vm, memsize),
    );
  }
}

/// CPU busy % between two reads of /proc/stat (the aggregate `cpu` line).
int? cpuPercentFromProcStat(String a, String b) {
  List<int>? fields(String s) {
    final line = s.split('\n').where((l) => l.startsWith('cpu ')).firstOrNull;
    if (line == null) return null;
    return line.split(RegExp(r'\s+')).skip(1).where((x) => x.isNotEmpty).map(int.parse).toList();
  }

  final x = fields(a), y = fields(b);
  if (x == null || y == null || x.length < 4 || y.length < 4) return null;
  int idle(List<int> f) => f[3] + (f.length > 4 ? f[4] : 0);
  int total(List<int> f) => f.take(8).fold(0, (s, v) => s + v);
  final dt = total(y) - total(x), di = idle(y) - idle(x);
  if (dt <= 0) return null;
  return ((dt - di) * 100 / dt).round().clamp(0, 100);
}

/// Memory in use, from /proc/meminfo (MemTotal less MemAvailable).
int? ramPercentFromMeminfo(String s) {
  int? kb(String key) => int.tryParse(RegExp('^$key:\\s+(\\d+)', multiLine: true).firstMatch(s)?[1] ?? '');
  final total = kb('MemTotal'), avail = kb('MemAvailable');
  if (total == null || avail == null || total <= 0) return null;
  return ((total - avail) * 100 / total).round().clamp(0, 100);
}

/// Memory in use on macOS: everything but free, inactive and speculative pages.
int? ramPercentFromVmStat(String s, int memBytes) {
  final page = int.tryParse(RegExp(r'page size of (\d+) bytes').firstMatch(s)?[1] ?? '') ?? 4096;
  int pages(String key) => int.tryParse(RegExp('$key:\\s+(\\d+)').firstMatch(s)?[1] ?? '') ?? 0;
  if (memBytes <= 0) return null;
  final free = (pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')) * page;
  return ((memBytes - free) * 100 / memBytes).round().clamp(0, 100);
}

/// The sum of `ps -A -o %cpu=` over [cores].
int? cpuPercentFromPs(String s, int cores) {
  if (cores <= 0) return null;
  final sum = s.split('\n').map((l) => double.tryParse(l.trim()) ?? 0).fold<double>(0, (a, b) => a + b);
  return (sum / cores).round().clamp(0, 100);
}

/// A thermal zone's temp (millidegrees on most kernels, degrees on some) in °C.
int? celsius(String? raw) {
  final v = int.tryParse(raw?.trim() ?? '');
  if (v == null) return null;
  final c = v.abs() >= 1000 ? v ~/ 1000 : v;
  return c > 0 && c < 150 ? c : null;
}

bool isGpuZone(String type) => type.contains('gpu') || type.contains('mali') || type.contains('kgsl');

bool isCpuZone(String type) =>
    type.contains('cpu') || type.contains('soc') || type.contains('x86_pkg') || type.contains('tsens') || type.contains('package') || type.contains('mtktscpu') || type == 'acpitz';

/// "45 %" or "45".
int? percentFromText(String? raw) {
  final v = int.tryParse(RegExp(r'\d+').firstMatch(raw ?? '')?[0] ?? '');
  return v?.clamp(0, 100);
}

/// A devfreq `load` file: "45@800000000Hz" (or just "45").
int? devfreqLoad(String? raw) {
  final m = RegExp(r'^\s*(\d+)').firstMatch(raw ?? '');
  final v = int.tryParse(m?[1] ?? '');
  return v?.clamp(0, 100);
}

/// The AI answers this board asked for since the last health report, and how long they took.
class AiUsageMeter {
  AiUsageMeter._();

  static final instance = AiUsageMeter._();

  int _count = 0;
  int _ms = 0;

  void record(Duration took) {
    _count++;
    _ms += took.inMilliseconds;
  }

  /// The totals not reported yet.
  ({int inferences, int ms}) peek() => (inferences: _count, ms: _ms);

  /// [reported] reached the server: count from what came after.
  void consume(({int inferences, int ms}) reported) {
    _count = (_count - reported.inferences).clamp(0, 1 << 31);
    _ms = (_ms - reported.ms).clamp(0, 1 << 52);
  }

  @visibleForTesting
  void reset() => consume(peek());
}
