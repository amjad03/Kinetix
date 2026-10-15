"""Checks and bundles the India map paper's outline (lib/src/india_outline.g.dart).

    curl -o /tmp/india/india-composite.geojson \
      https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson
    python3 -I tool/india_outline.py /tmp/india/india-composite.geojson lib/src/india_outline.g.dart

Source: datameet/maps Country/india-composite.geojson (CC0), compiled "in accordance with the
official boundary of India as per the Survey of India" (LSIB for India and Aksai Chin, Alhasan
Systems for Pakistan-occupied Kashmir, Natural Earth for the Shaksgam valley).

The file is refused unless the outline holds all of Jammu and Kashmir and Ladakh (Gilgit,
Hunza, Skardu, Muzaffarabad, the Shaksgam valley, Siachen, Aksai Chin), Arunachal Pradesh
(Tawang, Itanagar, Kibithu), the islands, and nothing of the neighbours, and unless its
extremes are the official ones (about 6°45'N to 37°6'N, 68°7'E to 97°25'E). It is then
Douglas-Peucker simplified (0.02°), projected equirectangular with x scaled by cos 22°, fitted to
the paper's frame and packed as uint16 polygons in 1/8 board units.
"""
import base64, json, math, struct, sys

src, out = sys.argv[1], sys.argv[2]
g = json.load(open(src, encoding='utf8'))
polys = []


def add(geom):
    t = geom['type']
    if t == 'Polygon':
        polys.append(geom['coordinates'])
    elif t == 'MultiPolygon':
        polys.extend(geom['coordinates'])
    elif t == 'GeometryCollection':
        for x in geom['geometries']:
            add(x)


for f in g['features'] if g.get('type') == 'FeatureCollection' else [g]:
    add(f['geometry'] if 'geometry' in f else f)


def inside_ring(pt, ring):
    x, y = pt
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[i - 1][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def inside(pt):
    return any(inside_ring(pt, p[0]) and not any(inside_ring(pt, h) for h in p[1:]) for p in polys)


MUST_IN = {
    'Gilgit': (74.31, 35.92), 'Skardu': (75.63, 35.30), 'Muzaffarabad': (73.47, 34.37), 'Hunza': (74.66, 36.32),
    'near the Khunjerab Pass': (75.30, 36.80), 'Shaksgam valley': (76.50, 36.05), 'Aksai Chin': (79.50, 35.20), 'Siachen': (77.10, 35.40),
    'Leh': (77.58, 34.15), 'Srinagar': (74.80, 34.08), 'Tawang': (91.86, 27.59), 'Itanagar': (93.62, 27.08),
    'Kibithu': (96.98, 28.03), 'Kanyakumari': (77.54, 8.10), 'Delhi': (77.21, 28.61), 'Port Blair': (92.73, 11.62),
    'Kavaratti': (72.60, 10.56), 'Indira Point': (93.84, 6.77),
}
MUST_OUT = {
    'Lahore': (74.34, 31.55), 'Islamabad': (73.05, 33.68), 'Peshawar': (71.58, 34.01), 'Kathmandu': (85.32, 27.71),
    'Thimphu': (89.64, 27.47), 'Dhaka': (90.41, 23.81), 'Lhasa': (91.11, 29.65), 'Kashgar': (75.99, 39.47),
    'Colombo': (79.86, 6.93), 'Yangon': (96.16, 16.84), 'Kabul': (69.21, 34.56), 'Wakhan (Afghanistan)': (73.0, 36.9),
}
bad = [k for k, p in MUST_IN.items() if not inside(p)] + [k for k, p in MUST_OUT.items() if inside(p)]
xs = [c[0] for p in polys for c in p[0]]
ys = [c[1] for p in polys for c in p[0]]
WEST, EAST, SOUTH, NORTH = min(xs), max(xs), min(ys), max(ys)
for name, got, want in (('west', WEST, 68.12), ('east', EAST, 97.42), ('south', SOUTH, 6.75), ('north', NORTH, 37.10)):
    if abs(got - want) > 0.1:
        bad.append(f'{name} extreme {got:.3f} (official about {want})')
if bad:
    sys.exit('Not the Survey of India boundary: ' + ', '.join(bad))

TOL, SCALE = 0.02, 8
COS = math.cos(math.radians(22))
TOP, HEIGHT = 120.0, 840.0
K = HEIGHT / (NORTH - SOUTH)
WIDTH = (EAST - WEST) * COS * K
LEFT = 960 - WIDTH / 2


def proj(lon, lat):
    return (LEFT + (lon - WEST) * COS * K, TOP + (NORTH - lat) * K)


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / length if length else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


buf = bytearray()
total = 0
for p in polys:
    ring = [(c[0], c[1]) for c in p[0]]
    s = simplify(ring, TOL)
    if len(s) < 4:
        # A tiny island stays a small square so it still shows.
        cx, cy, r = (min(c[0] for c in ring) + max(c[0] for c in ring)) / 2, (min(c[1] for c in ring) + max(c[1] for c in ring)) / 2, 0.03
        s = [(cx - r, cy - r), (cx + r, cy - r), (cx + r, cy + r), (cx - r, cy + r)]
    buf += struct.pack('<H', len(s))
    for lon, lat in s:
        x, y = proj(lon, lat)
        buf += struct.pack('<HH', round(x * SCALE), round(y * SCALE))
    total += len(s)
b64 = base64.b64encode(bytes(buf)).decode()
lines = [b64[i:i + 110] for i in range(0, len(b64), 110)]
dart = [
    '// GENERATED by tool/india_outline.py from datameet/maps Country/india-composite.geojson',
    "// (CC0, https://github.com/datameet/maps): India's boundary as shown by the Survey of India,",
    '// with all of Jammu and Kashmir and Ladakh (Gilgit-Baltistan, Aksai Chin, the Shaksgam valley)',
    '// and Arunachal Pradesh. Douglas-Peucker simplified (0.02°), equirectangular with x scaled by',
    f'// cos 22°, fitted to the India map paper ({LEFT:.0f}, {TOP:.0f}, {WIDTH:.0f} x {HEIGHT:.0f} board units).',
    f'// Each polygon: uint16 count, then count x (uint16 x, uint16 y) in 1/{SCALE} board units, little-endian, base64.',
    f'const indiaOutlineScale = {SCALE};',
    f'const indiaOutlineFrame = (left: {LEFT:.2f}, top: {TOP:.2f}, width: {WIDTH:.2f}, height: {HEIGHT:.2f});',
    f'const indiaOutlineBounds = (west: {WEST}, east: {EAST}, south: {SOUTH}, north: {NORTH});',
    'const indiaOutlineData =',
] + [f"    '{l}'" for l in lines[:-1]] + [f"    '{lines[-1]}';", '']
open(out, 'w', encoding='utf8').write('\n'.join(dart))
print(f'{len(polys)} polygons, {total} points, {len(buf)} bytes; boundary checks passed')
