# Keep rules for a minified (R8) release: -Pkinetix.minify=true (android/app/build.gradle.kts).
# Flutter adds its own rules and the plugins bring theirs (file_picker, jni, jni_flutter); these
# cover what is reached by name rather than by a direct reference.

# The app's own classes: method-channel handlers, receivers and the kiosk admin named in the
# manifest, the activity-alias Kiosk.kt and BoardStartup.kt switch on by name.
-keep class app.kinetix.board.** { *; }

# Pages in WebViews (PhET and the other bundled sims, the 3D viewer, the code lab) call back
# into the app through @JavascriptInterface methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins Flutter registers by name in GeneratedPluginRegistrant, and whose method-channel
# handlers it looks up at run time.
-keep class io.flutter.plugins.** { *; }
-keep class * implements io.flutter.embedding.engine.plugins.FlutterPlugin { *; }

# printing (Android's PrintManager adapters) and flutter_secure_storage (Tink, protobuf lite).
-keep class net.nfet.flutter.printing.** { *; }
-keep class com.it_nomads.fluttersecurestorage.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

# Play Core is referenced by Flutter's deferred components, which this app does not use.
-dontwarn com.google.android.play.core.**
