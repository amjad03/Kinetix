import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _carto = 'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';

/// Length in km of the path through [pts].
double pathKm(List<LatLng> pts) {
  const d = Distance();
  var m = 0.0;
  for (var i = 1; i < pts.length; i++) {
    m += d(pts[i - 1], pts[i]);
  }
  return m / 1000;
}

Widget _attribution() => const RichAttributionWidget(
  attributions: [TextSourceAttribution('OpenStreetMap contributors (ODbL)'), TextSourceAttribution('Labels-free basemap: CARTO')],
);

/// A small map lab in the spirit of QGIS: switch base layers, drop markers, measure a path, show
/// or hide the marker and measure layers. Tiles come from OpenStreetMap, so they need internet;
/// markers and measurements work without.
class MapLab extends StatefulWidget {
  const MapLab({super.key});
  @override
  State<MapLab> createState() => _MapLabState();
}

enum _Tool { pan, marker, measure }

class _MapLabState extends State<MapLab> {
  bool _streets = true, _showMarkers = true, _showMeasure = true;
  _Tool _tool = _Tool.pan;
  final _markers = <LatLng>[], _path = <LatLng>[];

  void _tap(TapPosition _, LatLng p) => setState(() {
    if (_tool == _Tool.marker) _markers.add(p);
    if (_tool == _Tool.measure) _path.add(p);
  });

  @override
  Widget build(BuildContext context) => Column(children: [
    Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
      SegmentedButton<_Tool>(
        segments: const [ButtonSegment(value: _Tool.pan, label: Text('Pan')), ButtonSegment(value: _Tool.marker, label: Text('Marker')), ButtonSegment(value: _Tool.measure, label: Text('Measure'))],
        selected: {_tool},
        onSelectionChanged: (s) => setState(() => _tool = s.first),
      ),
      FilterChip(key: const Key('layer-base'), label: Text(_streets ? 'Streets' : 'Plain'), selected: _streets, onSelected: (v) => setState(() => _streets = v)),
      FilterChip(key: const Key('layer-markers'), label: Text('Markers (${_markers.length})'), selected: _showMarkers, onSelected: (v) => setState(() => _showMarkers = v)),
      FilterChip(key: const Key('layer-measure'), label: Text('Distance ${pathKm(_path).toStringAsFixed(1)} km'), selected: _showMeasure, onSelected: (v) => setState(() => _showMeasure = v)),
      TextButton(key: const Key('map-clear'), onPressed: () => setState(() {
        _markers.clear();
        _path.clear();
      }), child: const Text('Clear')),
    ]),
    Expanded(
      child: FlutterMap(
        options: MapOptions(initialCenter: const LatLng(20.6, 78.9), initialZoom: 4.5, onTap: _tap),
        children: [
          TileLayer(urlTemplate: _streets ? _osm : _carto, userAgentPackageName: 'in.kinetix.board'),
          if (_showMeasure && _path.length > 1) PolylineLayer(polylines: [Polyline(points: _path, strokeWidth: 4, color: Colors.deepOrange)]),
          if (_showMeasure) MarkerLayer(markers: [for (final p in _path) Marker(point: p, width: 12, height: 12, child: const DecoratedBox(decoration: BoxDecoration(color: Colors.deepOrange, shape: BoxShape.circle)))]),
          if (_showMarkers) MarkerLayer(markers: [for (final p in _markers) Marker(point: p, width: 36, height: 36, child: const Icon(Icons.location_on, color: Colors.red, size: 36))]),
          _attribution(),
        ],
      ),
    ),
  ]);
}

/// A place to find on the map.
class GeoQuestion {
  const GeoQuestion(this.name, this.at, [this.toleranceKm = 250]);
  final String name;
  final LatLng at;
  final double toleranceKm;
}

const geoQuestions = <GeoQuestion>[
  GeoQuestion('New Delhi', LatLng(28.61, 77.21)),
  GeoQuestion('Mumbai', LatLng(19.08, 72.88)),
  GeoQuestion('Chennai', LatLng(13.08, 80.27)),
  GeoQuestion('Kolkata', LatLng(22.57, 88.36)),
  GeoQuestion('Bengaluru', LatLng(12.97, 77.59)),
  GeoQuestion('Hyderabad', LatLng(17.39, 78.49)),
  GeoQuestion('Jaipur', LatLng(26.91, 75.79)),
  GeoQuestion('Guwahati', LatLng(26.14, 91.74)),
  GeoQuestion('Thiruvananthapuram', LatLng(8.52, 76.94)),
  GeoQuestion('Srinagar', LatLng(34.08, 74.80)),
  GeoQuestion('Mount Everest', LatLng(27.99, 86.93), 150),
  GeoQuestion('Sri Lanka (Colombo)', LatLng(6.93, 79.86), 200),
];

/// Distance in km from a tap to the answer.
double geoErrorKm(GeoQuestion q, LatLng tap) => const Distance()(q.at, tap) / 1000;

/// Geography map quiz: "Find X" on a map without labels; tap where you think it is.
class GeoQuiz extends StatefulWidget {
  const GeoQuiz({super.key});
  @override
  State<GeoQuiz> createState() => _GeoQuizState();
}

class _GeoQuizState extends State<GeoQuiz> {
  int _i = 0, _score = 0;
  String? _feedback;
  LatLng? _answer;

  void _tap(TapPosition _, LatLng p) {
    if (_i >= geoQuestions.length || _answer != null) return;
    final q = geoQuestions[_i];
    final km = geoErrorKm(q, p);
    setState(() {
      _answer = q.at;
      if (km <= q.toleranceKm) {
        _score++;
        _feedback = 'Correct, ${km.round()} km away';
      } else {
        _feedback = 'Not quite, ${km.round()} km away. The red pin is ${q.name}';
      }
    });
  }

  void _next() => setState(() {
    _i++;
    _answer = null;
    _feedback = null;
  });

  @override
  Widget build(BuildContext context) {
    final done = _i >= geoQuestions.length;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(8),
        child: Row(children: [
          Expanded(child: Text(done ? 'Score: $_score of ${geoQuestions.length}' : 'Find: ${geoQuestions[_i].name}   (score $_score)', key: const Key('geo-prompt'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
          if (_feedback != null) Flexible(child: Text(_feedback!, key: const Key('geo-feedback'))),
          if (_answer != null) TextButton(key: const Key('geo-next'), onPressed: _next, child: const Text('Next')),
          if (done) TextButton(key: const Key('geo-restart'), onPressed: () => setState(() {
            _i = 0;
            _score = 0;
          }), child: const Text('Play again')),
        ]),
      ),
      Expanded(
        child: FlutterMap(
          options: MapOptions(initialCenter: const LatLng(21, 80), initialZoom: 4.3, onTap: _tap),
          children: [
            TileLayer(urlTemplate: _carto, userAgentPackageName: 'in.kinetix.board'),
            if (_answer != null) MarkerLayer(markers: [Marker(point: _answer!, width: 36, height: 36, child: const Icon(Icons.location_on, color: Colors.red, size: 36))]),
            _attribution(),
          ],
        ),
      ),
    ]);
  }
}
