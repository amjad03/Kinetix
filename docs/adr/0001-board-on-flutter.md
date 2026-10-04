# ADR 0001: Build KINETIX Board in Flutter, not native Kotlin

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

The first plan was native Android (Kotlin + Jetpack Compose) for the Board. Two
requirements changed that:

1. **The Board must also run on Windows.** Many schools already own a Windows PC, or an
   interactive flat panel (IFP) with a Windows OPS module. Native Kotlin/Compose for Android
   does not run there. Compose Multiplatform for Desktop does, but its touch, stylus and
   multi-pointer support on Windows is less mature, and we would have two UI stacks to keep
   in step anyway.
2. **There is one developer.** The Teacher, Student and Parent apps are already Flutter.
   Writing the Board in Flutter too means one language (Dart), one UI toolkit, and shared
   packages (API client, models, design system, sync engine) across four apps.

## Decision

The Board is a Flutter app with three targets:

- **Android 10+**: tablets with a projector or TV, and Android IFPs (most Indian panels ship Android 11–14)
- **Windows 10/11**: PCs, OPS modules, Windows IFPs
- **Linux**: development and CI only, for now

Native code goes behind platform channels only where Flutter has no good answer:

| Need | Android | Windows |
|---|---|---|
| Ultra-low-latency ink (later optimisation) | `androidx.graphics` front-buffered rendering | Windows Ink / DirectInk |
| Kiosk / lock-task mode | Device Owner + `startLockTask` | Assigned Access / shell launcher |
| Screen capture fallback for live view | MediaProjection | Windows.Graphics.Capture |
| Ambient light sensor (eye protection) | `SensorManager` | `Windows.Devices.Sensors` |

## Consequences

- Flutter reports every touch with its own `pointer` id on both platforms, so multi-user
  writing (several students at once) is handled in Dart, once.
- Stylus pressure, tilt and the eraser end are available through `PointerEvent`.
- The first-release ink latency is Flutter's normal frame pipeline (~1–2 frames). If teachers
  find it laggy on cheap tablets, we add the native front-buffer layer behind the same
  `InkSurface` interface.
- PPT rendering cannot happen in Flutter. Slides are converted to PDF or images (in the
  cloud, or offline by LibreOffice on Windows) and shown by the document viewer.
