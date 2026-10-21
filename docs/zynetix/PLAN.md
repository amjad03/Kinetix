# Zynetix Board — standalone edition plan (Oct 2026)

Goal: Zynetix (the smart board + teacher/student/parent apps) is sellable on its own, without the ERP.
Demo target: SDMCET, Dharwad (Engineering + MBA + MTech). Server runs on the presenter's Mac (Docker), board/IFP/phones join over Wi-Fi.

## Decisions (from the owner)
- Same backend, an institution **edition**: `full` (ERP + board) or `board` (Zynetix only). Board edition hides/blocks ERP modules; the ERP web app shows only the Zynetix admin dashboard for it.
- Videos: (1) the owner's YouTube channel (import by channel/playlist URL, auto-suggest topic mapping by title, admin confirms), (2) the board's 19 built-in concept animations (packages/kinetix_animations), (3) any YouTube/web link.
- Content per topic: videos, PDFs, books (chapter/page ranges), syllabus documents, links, animations, 3D models, sims. Domain → program → subject → unit → topic.
- Platform admin (cross-tenant global library) maps once; institution admin can add their own; teachers see both on the board.
- Same topic resources visible in teacher, student and parent apps.

## Zynetix admin dashboard (ERP web app, edition-aware nav)
Overview · Content library & video mapping (incl. YouTube channel import) · Syllabus & materials · Programs/subjects/topics · Timetable (create/manage) · Teachers & students accounts (college level) · Boards/Edge devices (status, CPU/GPU/NPU/RAM, temps, online/offline, versions) · AI usage (every AI answer logged: who, board, topic, latency, tokens, served/rejected/throttled + reason, peak-load periods) · Compute usage (per day/board/edge) · Audit.

## Demo seed: SDMCET (tenant slug `sdmcet`)
Engineering (CSE, ECE, Mech, Civil, EEE — Sem 3 & 5), MBA (Sem 1 & 3), MTech CSE (Sem 1). VTU-style syllabus units/topics, ~2 teachers per dept, sections, rooms, timetables, boards per classroom, topic-mapped videos (animations + links) and materials, sample AI logs and edge telemetry so dashboards are not empty.
Accounts: password `zynetix123`; admin `admin@sdmcet.zynetix.in`; teachers `<first>.<dept>@sdmcet.zynetix.in` (listed in docs/zynetix/DEMO.md).

## Builds
Android APK (board + teacher/student/parent) and macOS board app via GitHub Actions (this container cannot reach the Android SDK; macOS needs a mac runner). `docker compose` one-command demo server for the Mac.

## Rules for agents
Follow docs/requirements/AGENT_BUILD_CONVENTIONS.md and surrounding code style. Add tests for what you build; keep existing tests green. Commit in small, clear commits. Keep reports short.
