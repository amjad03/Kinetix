# PhET Interactive Simulations

The board's **Sims** tab (split panel, and *PhET simulations* in the tools drawer) offers PhET's
HTML5 simulations: **PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0**
(<https://phet.colorado.edu>). That attribution is shown under the catalogue, under every open sim,
under "Related PhET sims" and on every picture of a sim put on the board. Keep it.

## How it works

| Piece | Where |
|---|---|
| Catalogue (124 sims: titles en/hi/kn, subject, topics, classes 6–12/UG, keywords, locales, size, thumbnail) | `apps/board/assets/phet/catalogue.json`, `apps/board/assets/phet/thumbs/` |
| Catalogue build | `tools/phet/build-catalogue.mjs` + `tools/phet/classification.json` |
| Mirror upload | `tools/phet/mirror.mjs` → `s3://<phet bucket>/phet/<id>/<id>_all.html` |
| Mirror infrastructure | `infra/terraform/phet.tf` (S3 in ap-south-1, CloudFront with origin access control, served to India) |
| Download link | `GET /v1/content/sims/phet/:id?locale=hi` (API, public): 302 to the file, or `?format=json` for `{ url, mirror, attribution }` |
| Board | `apps/board/lib/features/phet/` |

1. The board browses the bundled catalogue offline (Subject → Topic → Class, search).
2. **Download** asks the API for the link, then fetches the sim's all-locales file
   (`<id>_all.html`, every translation in one self-contained file) into app support storage
   (`<support>/phet/`). Progress shows on the card; **Cancel** keeps the part already fetched and the
   next download resumes it (HTTP Range). A sim already on the board is never fetched again.
   The storage view (the size button) lists downloaded sims, the space they use, and deletes them.
3. **Open** serves the file from the board's own loopback server (`127.0.0.1`, the same pattern as
   the 3D viewer) into a WebView (Android System WebView, WebView2 on Windows) with
   `?locale=<board language>` — Hindi or Kannada where PhET has the translation, else English.
   No internet is needed after the download.
4. **Add to board** pictures the sim (PhET's own screenshot generator in the page, else the panel)
   and puts it on the page with the attribution line. **Write on the panel** (✎) lets the pen and the
   laser work over the sim.
5. A syllabus topic in Books shows **Related PhET sims** when the sims' keywords
   (`classification.json`) appear in its title, chapter or summary.

## Where the files come from: our mirror in India

`PHET_MIRROR_URL` tells the API where the mirror is (Terraform sets it to
`https://<distribution>.cloudfront.net/phet`). Files are stored in `ap-south-1`; CloudFront is
restricted to viewers in India (`phet_mirror_countries`) and price class 200 (which includes the Indian
edge locations). The bucket holds only PhET's public, openly licensed files: no school or personal
data ever goes there.

**Without `PHET_MIRROR_URL`** (local development, the demo, a deployment with
`phet_mirror_enabled = false`) the API — and the board's demo server — send boards to
`https://phet.colorado.edu/sims/html/<id>/latest/<id>_all.html`. That works, but the download then
comes from the United States; set up the mirror for production. If the board cannot reach the API
it also falls back to phet.colorado.edu.

## Filling or refreshing the mirror

After `terraform apply` (output `phet_mirror_bucket`), with credentials that may write the bucket:

```sh
NODE_USE_ENV_PROXY=1 node tools/phet/mirror.mjs --bucket "$(terraform -chdir=infra/terraform output -raw phet_mirror_bucket)"
# a few sims, or per-locale files too:
node tools/phet/mirror.mjs --bucket <bucket> --only ohms-law,pendulum-lab --locales en,hi,kn
node tools/phet/mirror.mjs --dry-run           # download only, print the uploads
```

Uploads use `Content-Type: text/html; charset=utf-8` and
`Cache-Control: public, max-age=86400, stale-while-revalidate=604800` (PhET's "latest" moves with
new versions; boards keep what they downloaded until a teacher deletes it). The script also uploads
`phet/LICENSE.txt` (the CC BY 4.0 notice) and `phet/catalogue.json`, and records each file's real
size in `tools/phet/sizes.json`. Rebuild the catalogue afterwards so the board shows real sizes
instead of "about 6.0 MB" estimates, and commit both files. Refresh quarterly, or when PhET
publishes a sim our teachers want.

## Regenerating the catalogue

```sh
NODE_USE_ENV_PROXY=1 node tools/phet/build-catalogue.mjs
```

- It first tries PhET's metadata service
  (`https://phet.colorado.edu/services/metadata/1.3/simulations?format=json&type=html`). From the
  build environment used for the first catalogue (October 2026) phet.colorado.edu was **not
  reachable** through the egress proxy, so the catalogue was built from PhET's open-source
  repositories on GitHub instead: `phetsims/perennial/data/active-sims` ∩ sims with translations in
  `phetsims/babel` (i.e. published), English titles from each sim's strings file, Hindi/Kannada
  titles and the locale list from babel, thumbnails from each repository's
  `assets/<id>-screenshot.png` (resized to 160 × 105 JPEG with ImageMagick).
- Subjects, topics, class levels and keywords always come from `tools/phet/classification.json`,
  our mapping to the Indian syllabus (PhET's grade bands are American). A new PhET sim makes the
  build stop and name it: classify it there (or mark it `"exclude": true`) and run again. Topic keys
  are labelled in en/hi/kn in `lib/features/phet/phet_strings.dart`; a new key needs its three
  names there (the board's tests check this).
- Downloads are cached under `tools/phet/.cache/` (ignored by git); delete it for a clean build.
- Then run the board's tests (`flutter test test/phet_test.dart` checks the catalogue's integrity).

## Licence

PhET's simulations are © University of Colorado Boulder, licensed CC BY 4.0
(<https://creativecommons.org/licenses/by/4.0/>). We redistribute them unmodified and credit
"PhET Interactive Simulations, University of Colorado Boulder" with the licence wherever they appear
(catalogue, open sim, related sims, pictures on the board, `phet/LICENSE.txt` in the mirror). The
thumbnails are reduced screenshots from PhET's repositories under the same licence. PhET and its
logo are trademarks of the University of Colorado Boulder: do not use them to suggest endorsement.
