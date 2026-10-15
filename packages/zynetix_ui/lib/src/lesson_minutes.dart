/// Lesson-plan step minutes scaled to add up to exactly [total] (as the API does): whole minutes,
/// at least 2 a step (fewer only when the lesson is too short), the rounding remainder added to
/// (or taken from) the longest step.
List<int> kxFitMinutes(List<int> minutes, int total) {
  final n = minutes.length;
  if (n == 0 || total <= 0) return [...minutes];
  final floor = (total ~/ n).clamp(1, 2);
  final sum = minutes.fold<int>(0, (s, m) => s + (m < 0 ? 0 : m));
  final out = [
    for (final m in minutes) (sum > 0 ? (m < 0 ? 0 : m) * total / sum : total / n).round().clamp(floor, total),
  ];
  var diff = total - out.fold<int>(0, (s, m) => s + m);
  // Longest first (the earlier one on a tie), so the main part of the lesson absorbs the change.
  final order = [for (var i = 0; i < n; i++) i]..sort((a, b) => out[b] != out[a] ? out[b] - out[a] : a - b);
  if (diff > 0) out[order.first] += diff;
  for (final i in order) {
    if (diff >= 0) break;
    final take = (-diff).clamp(0, out[i] - floor);
    out[i] -= take;
    diff += take;
  }
  return out;
}
