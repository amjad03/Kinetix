import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/models.dart';

/// What the map shows: the route's stops, the child's stop and the bus (if it is running).
class BusMapData {
  const BusMapData({required this.stops, this.myStopId, this.bus});

  final List<BusStop> stops;
  final String? myStopId;
  final BusPosition? bus;
}

/// Builds the map; tests swap in a plain widget so no tiles are fetched.
typedef BusMapBuilder = Widget Function(BuildContext context, BusMapData data);

/// OpenStreetMap tiles with a marker per stop (the child's stop highlighted) and the bus.
class OsmBusMap extends StatelessWidget {
  const OsmBusMap(this.data, {super.key});

  final BusMapData data;

  static Widget builder(BuildContext context, BusMapData data) => OsmBusMap(data);

  static const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  static const userAgentPackageName = 'in.kinetix.parent';

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final points = [for (final s in data.stops) LatLng(s.lat, s.lng), if (data.bus != null) LatLng(data.bus!.lat, data.bus!.lng)];
    final options = points.length >= 2
        ? MapOptions(
            initialCameraFit: CameraFit.bounds(bounds: LatLngBounds.fromPoints(points), padding: const EdgeInsets.all(40), maxZoom: 16))
        : MapOptions(initialCenter: points.isEmpty ? const LatLng(12.9716, 77.5946) : points.first, initialZoom: 14);
    return FlutterMap(
      key: const Key('busMap'),
      options: options,
      children: [
        TileLayer(urlTemplate: tileUrl, userAgentPackageName: userAgentPackageName),
        MarkerLayer(
          markers: [
            for (final s in data.stops)
              Marker(
                point: LatLng(s.lat, s.lng),
                width: 32,
                height: 32,
                child: Icon(s.id == data.myStopId ? Icons.location_on : Icons.circle,
                    size: s.id == data.myStopId ? 32 : 12, color: s.id == data.myStopId ? c.error : c.primary),
              ),
            if (data.bus != null)
              Marker(
                point: LatLng(data.bus!.lat, data.bus!.lng),
                width: 40,
                height: 40,
                child: CircleAvatar(backgroundColor: c.primary, child: Icon(Icons.directions_bus, color: c.onPrimary, size: 22)),
              ),
          ],
        ),
        const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap contributors')]),
      ],
    );
  }
}
