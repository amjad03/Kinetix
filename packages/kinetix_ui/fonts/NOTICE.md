# Fonts bundled with KINETIX

Every font here is under the SIL Open Font License 1.1 (OFL), which allows bundling them in
apps, free or paid, as long as the fonts are not sold by themselves and each keeps its licence
text. The licence texts sit next to the fonts (`LICENSE-*-OFL.txt`). They are declared in
`../pubspec.yaml`, so every Flutter app that uses `kinetix_ui` ships them; the ERP copies the
ones it needs into `apps/erp/src/fonts`.

| Family in the app | Font | Files | Copyright | Licence | Used for |
|---|---|---|---|---|---|
| `SansFlex` | Google Sans Flex, static instances 400–700 | `SansFlex-*.ttf` | 2015 The Google Sans Flex Authors | OFL 1.1, no Reserved Font Name. "Google", "Google Sans" and "Google Sans Flex" are trademarks of Google LLC (`TRADEMARKS-GoogleSansFlex.md`); the instances are cut from the variable font, so they carry our own family name and never the trademark | Interface text in every app |
| `SansFlexDisplay` | Google Sans Flex, display-optical-size instances 400–500 | `SansFlexDisplay-*.ttf` | as above | as above | Headlines |
| `Inter` | Inter 4 | `Inter-*.ttf` | 2020 The Inter Project Authors | OFL 1.1 | Text written on the board; Greek and symbols |
| `Andika` | Andika 6 (unmodified) | `Andika-*.ttf` | 2004–2022 SIL International | OFL 1.1, Reserved Font Names "Andika" and "SIL" (we ship the original files, so the name stays) | Board text for LKG–Class 5: single-storey a and g, as children learn to write them |
| `JetBrainsMono` | JetBrains Mono 2.304, NL cut | `JetBrainsMono-*.ttf` | 2020 The JetBrains Mono Project Authors | OFL 1.1 | Code blocks on the board |
| `NotoSansDevanagari` | Noto Sans Devanagari | `NotoSansDevanagari-*.ttf` | 2022 The Noto Project Authors | OFL 1.1 (`LICENSE-Noto-OFL.txt`) | Hindi |
| `NotoSansKannada` | Noto Sans Kannada | `NotoSansKannada-*.ttf` | 2022 The Noto Project Authors | OFL 1.1 (`LICENSE-Noto-OFL.txt`) | Kannada |
| `Kalam` | Kalam | `Kalam-400.ttf` | 2014 Indian Type Foundry | OFL 1.1 (`LICENSE-Kalam-OFL.txt`) | Text AI handwriting font |
| `NotoSansMath` | Noto Sans Math, subset to the signs Inter lacks (∠ ⊥ ∥ ≅ ∝ ∴ …) | `NotoSansMath-400.ttf` | 2022 The Noto Project Authors | OFL 1.1 | Geometry signs |

Equations are typeset by `flutter_math_fork` (MIT), which brings its own KaTeX fonts (OFL).
