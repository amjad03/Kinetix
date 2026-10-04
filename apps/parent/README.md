# KINETIX Parent App

The parent's phone app (Flutter, Material 3). For each child it shows attendance, homework,
how the child answered when picked in class, and the class boards teachers shared after a
lesson, plus an inbox of updates (absences, homework, shared boards, messages from the college).
It looks and behaves like its sister app, [the Teacher App](../teacher).
Product spec: [docs/product/parent-app.md](../../docs/product/parent-app.md).

## Run it

Start the API first (see the [root README](../../README.md)): `pnpm db:migrate && pnpm db:seed`,
then `node --env-file=.env dist/main.js` in `services/api`.

```bash
cd apps/parent
flutter pub get
flutter run -d linux      # desktop window sized like a phone (412×892)
flutter run -d <android>  # or an iOS device / simulator
flutter test
flutter analyze
```

Sign in with institution code `demo-college`, `parent@demo.kinetix.in` (or phone `98000 00001`),
password `kinetix123`. Rajesh Patel has two children (Aarav, BCom Sem 3 A, and Diya, BCA Sem 1 A).
`sunita@demo.kinetix.in` has one child, so the child switcher is hidden.

**Server address.** The default is `http://localhost:4000`. Tap **Server** under the sign-in
button to change it. On the Android emulator, the host machine is `http://10.0.2.2:4000`.
Cleartext HTTP is allowed only for development (`usesCleartextTraffic` on Android,
`NSAllowsLocalNetworking` on iOS).

**Seeing a shared board.** The seed has no saved boards. Save one from the Board app (pair it
with the Teacher App during a timetabled period, draw, then **Save → Share with class**), or
`PUT /v1/whiteboards/<uuid>` with a board-session token and `"share": true`. Parents of that
class get a "Today's board" update and the board appears on Home.

## Screens

| Screen | What it does |
|---|---|
| Sign in | Institution code, phone or email, password. A 10-digit Indian number is sent as `+91…`. Remembers the institution, login and server. Accounts without the guardian role are refused with a polite explanation (teachers are pointed to the Teacher App). |
| Home | Greeting, child switcher (avatar chips, remembered) when there are two or more children, then cards for the selected child: header (name, class, roll no.), **Attendance**, **Homework**, **In class**, **Class boards**. Pull to refresh; loading, empty and error states on every card. |
| Attendance card | Big percentage over the last 30 days (attended = present + late + excused), "Attended 24 of 30 classes", a bar, a plain-language note (good / missed a few / below 75%), Present / Absent / Late tiles and the three latest absences ("Absent · Corporate Accounting · Tue 29 Sep, 14:00"). Tap for the history. |
| Attendance history | Every period of the last 30 days grouped by day ("Tuesday, 29 September · Attended 0 of 3") with status chips. Filter: all classes / absent or late. Opened from an absence alert, that day is outlined. |
| Homework | Upcoming homework with "Due tomorrow" / "Due Fri 9 Oct", subject and teacher; past homework collapsed. Tap for the detail: instructions, due date, who set it and when. |
| In class | Per subject, a sentence ("Answered 7 questions in **Corporate Accounting**, 5 correct, 1 partly correct and 1 not correct.") and a stacked bar with a legend. |
| Class boards | Boards shared with the child's class ("Today's board: Corporate Accounting"). Tap for the viewer: title, subject, teacher and date in the app bar; swipe or arrows between pages; pinch or double-tap to zoom (page swiping pauses while zoomed). |
| Updates | Notifications grouped **Today** / **Earlier**, an icon per kind (absence, homework, board shared, message), bold title and dot while unread, the child's name when the parent has several. Tap marks it read and opens the related screen; **Mark all as read**. The tab shows an unread badge. |
| Profile | Parent name, phone, email; the children (the one on Home is ticked; tap to switch); college and server; **Soon** entries for Fees & receipts, Message the teacher, Library books and Language (English · हिन्दी · ಕನ್ನಡ); sign out. |

## Code layout

```
lib/
  core/        api.dart (ParentApi interface + HttpParentApi), models.dart, app_state.dart (sign-in, prefs),
               family.dart (children, selected child, per-child summaries), format.dart (dates, plurals)
  features/    sign_in, shell (NavigationBar), home (cards, child switcher), attendance, homework,
               boards (viewer), updates (list, controller, message), profile
  widgets/     shared bits (ErrorBanner, Pill, SectionCard, StatusPill, Tone colours)
test/          widget tests against FakeParentApi
```

State is plain `ChangeNotifier` controllers rendered with `ListenableBuilder`. The design system
is [`packages/kinetix_ui`](../../packages/kinetix_ui) (light and dark, follows the system setting);
boards render with `WhiteboardView` from [`packages/kinetix_ink`](../../packages/kinetix_ink).

## Known gaps

- The token is in `shared_preferences`. It should move to secure storage (Keystore/Keychain), with an app lock.
- No push notifications yet: Updates refresh when the tab is opened or pulled.
- English only. The language entry is a *Soon* placeholder.
- Board list items have no thumbnail; the summary endpoint does not return a preview.
- A homework update can open its detail only while that homework is in the child's summary window
  (upcoming, or the last 10 past); older ones open as a plain message.
