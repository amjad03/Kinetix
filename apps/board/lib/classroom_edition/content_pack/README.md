# Content pack (`zynetix-content-pack`)

Classroom boards are offline and never stream: concept videos, PhET sims, labs and interactive
assets come in a **content pack**, installed from a USB stick or downloaded over Wi-Fi from a
configurable address. Patterns follow `past_papers/paper_pack.dart` (manifest + `safePackPath`,
plain-words `FormatException`s, broken items left out and named).

## Layout

A zip, or a folder with the same contents:

```
manifest.json
videos/phy1-ch03-ohm.mp4
phet/ohms-law.zip
...
```

`manifest.json`:

```json
{
  "format": "zynetix-content-pack",
  "formatVersion": 1,
  "id": "puc-physics",
  "title": "PUC Physics videos",
  "publisher": "Zynetix",
  "revision": "2026.11",
  "items": [
    {
      "id": "phy1-ch03-ohm",
      "kind": "video",                 // video | phet | lab | interactive-asset
      "title": "Ohm's law",
      "file": "videos/phy1-ch03-ohm.mp4",
      "sha256": "<64 hex>",
      "size": 18234567,
      "version": 2,
      "topic": {
        "chapter": "phy1-ch03",        // lessons catalogue chapter id
        "topics": ["phy1-ch03.t01"],   // catalogue topic ids
        "steps": ["phy1-ch03.t01#2"]   // optional: <topic>#<step index> shows it in that step
      },
      "markers": [{"t": 0, "title": "Intro"}, {"t": 30, "title": "The circuit"}],
      "language": "en"
    }
  ]
}
```

Rules: `id` is `[A-Za-z0-9._-]`, `file` is relative with no `..`; a newer `formatVersion` is
refused; an item with a bad field is skipped and reported, the rest install.

## Install and update (`content_library.dart`)

* **USB**: Settings → This board → Content → *Install from USB*. A pack folder copied to
  `Documents/Zynetix/Content` is used directly; otherwise the system picker asks for a zip or a
  folder. (Big packs: prefer the folder; a zip is read into memory.)
* **URL**: *Content address* sets the base URL (saved in `settings.json`); *Update over Wi-Fi*
  fetches `<base>/manifest.json` and then `<base>/<file>` for each changed item. Wi-Fi/Ethernet
  only (`contentOnWifi`). Downloads go to `<file>.part`; a cut-off download is kept and resumed
  next time with an HTTP `Range` request.
* **Only changed items**: an item is fetched/copied when it is not installed, its `version` is
  higher, or its `sha256` differs.
* **Checks**: every file's size and sha256 are checked before it replaces the installed copy; a
  damaged file never replaces a good one.

Storage: `<app support>/content_pack/` — `installed.json` (merged manifest), `settings.json`,
`items/<id>/<file name>`. Removing one item or everything needs the school PIN.

## PhET sims (`zynetix-content-phet-1.zip`)

The Classroom APK ships only the 16 PhET sims its lessons use (`classroom_assets.dart`); the
PUC PhET pack carries 47 more, one `phet` item each: id `phet-<sim id>`, file
`phet/<sim id>.html` (PhET's English HTML5 page, unchanged), topics from
`packages/kinetix_lessons/tool/phet_pack.json`. `build_phet_pack.py` builds it; it is published
with Git LFS on the `apk-builds` branch of amjad03/zynetix-smart-classroom, and
`defaultContentUrl` points at it until the school sets its own address. A content address that
ends in `.zip` is a whole pack: Update over Wi-Fi downloads it (resuming when the server allows
`Range`), installs it item by item from the file (`installZipFile`, never all in memory) and
deletes the download.

PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0: the credit is shown
under every PhET sim in a lesson and beside each PhET item in Settings, and the zip carries
`PHET-LICENSE.txt`.

## In the lessons

* `ContentLibrary.videoFor(topicId, step:)` finds a topic's video; `search()` matches titles,
  chapter/topic ids and marker titles.
* A lesson's concept-video step (`ConceptVideoCard`) plays the pack video, or says "Not in this
  board's content pack". YouTube/online playback is off in Classroom.
* The Lessons panel's topic rows show a play button (`TopicVideoButton`) when the pack has one.
* A topic whose lesson has no step for a pack PhET sim gets one before its closing quiz and
  recap (`withPackPhet`); a lesson's own PhET step runs from the pack when the APK lacks the sim
  (`SimAssetServer` serves `pack/phet/<id>.html` from the installed file).

## Player (`pack_video_player.dart`)

`video_player` on local MP4s, behind `PackPlayer` (tests use a fake): big controls, chapter
markers on the timeline and as chips, ±10 s, speed 0.5–1.5×, *Pause & draw* (ink over the paused
frame) and *Put frame on board* (`ClassroomHost.putImage` with the frame and the ink).
