# KINETIX Board

The classroom app. Flutter, targeting Android (tablets, IFPs) and Windows. See
[ADR 0001](../../docs/adr/0001-board-on-flutter.md) and the
[feature spec](../../docs/product/board-features.md).

```
lib/
  core/           API client, realtime socket, models, device storage, BoardController (app state)
  features/
    enrollment/   first-run registration with the ERP enrolment code
    pairing/      idle screen: QR + 6-digit code, rotates every 2 minutes
    workspace/    teaching screen: session bar, split layout, toolbar
    ink/          multi-touch ink engine (controller, models, canvas, backgrounds)
    broadcast/    principal's messages: banner / card / emergency takeover
    comfort/      eye protection (warmth, dimming, auto by time of day, high contrast)
```

## Run

```bash
flutter pub get
flutter run -d windows          # or -d linux, or an Android device
flutter test                    # unit + widget tests
../../scripts/board-it.sh       # integration test against a freshly seeded local API
```

On first run, enter the server URL and the enrolment code that `pnpm db:seed` prints in
`services/api`. Then pair from the Teacher App. Until that app exists, use the API directly:

```bash
TOKEN=$(curl -s -XPOST localhost:4000/v1/auth/login -H 'content-type: application/json' \
  -d '{"tenant":"demo-college","login":"anita@demo.kinetix.in","password":"kinetix123"}' | jq -r .accessToken)
curl -XPOST localhost:4000/v1/pairing/claim -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"code":"<code on the board>"}'
```

To try the board without a server, use **Practice board**.
