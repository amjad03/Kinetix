# Map papers

| Paper | Source | Licence | How it is checked |
|---|---|---|---|
| World map | Natural Earth 1:110m land (naturalearthdata.com) | Public domain | packages/zynetix_ink/lib/src/world_land.g.dart |
| India map | datameet/maps `Country/india-composite.geojson` (https://github.com/datameet/maps, commit 5ed214bf77, 2018), compiled "in accordance with the official boundary of India as per the Survey of India" from the US Department of State LSIB (India, Aksai Chin), Alhasan Systems (Pakistan-occupied Kashmir) and Natural Earth (Shaksgam valley) | CC0 | `packages/zynetix_ink/tool/india_outline.py` refuses the file unless all of Jammu and Kashmir and Ladakh (Gilgit, Hunza, Skardu, Muzaffarabad, the Shaksgam valley, Siachen, Aksai Chin), Arunachal Pradesh (Tawang, Itanagar, Kibithu), the Andaman and Nicobar Islands and Lakshadweep are inside, Lahore, Islamabad, Kathmandu, Thimphu, Dhaka, Lhasa, Colombo and the Wakhan corridor are outside, and the extremes are the official ones (6°45'N to 37°6'N, 68°7'E to 97°25'E); `packages/zynetix_ink/test/india_map_test.dart` checks the bundled outline the same way |

The India outline is simplified (Douglas-Peucker, 0.02°, 2,573 points, 10 KB) and drawn
equirectangular with longitudes scaled by cos 22°, with lines of latitude and longitude every 5° and
the Tropic of Cancer. To rebuild it:

    curl -o /tmp/india/india-composite.geojson https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson
    cd packages/zynetix_ink && python3 -I tool/india_outline.py /tmp/india/india-composite.geojson lib/src/india_outline.g.dart
