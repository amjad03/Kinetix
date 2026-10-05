import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing (docs/operations/mobile-release.md). Values come from, in order:
//   1. environment variables (CI): KINETIX_ANDROID_KEYSTORE_BASE64 (or KINETIX_ANDROID_KEYSTORE_PATH),
//      KINETIX_ANDROID_KEYSTORE_PASSWORD, KINETIX_ANDROID_KEY_ALIAS, KINETIX_ANDROID_KEY_PASSWORD;
//   2. android/key.properties (local, gitignored): storeFile (relative to android/), storePassword,
//      keyAlias, keyPassword.
// Debug and profile builds keep the debug key. A release build without a key fails.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingValue(env: String, property: String): String? =
    System.getenv(env)?.takeIf { it.isNotBlank() } ?: keyProperties.getProperty(property)?.takeIf { it.isNotBlank() }

val releaseKeystore: File? = System.getenv("KINETIX_ANDROID_KEYSTORE_BASE64")?.takeIf { it.isNotBlank() }?.let { encoded ->
    layout.buildDirectory.file("signing/upload-keystore.jks").get().asFile.apply {
        parentFile.mkdirs()
        writeBytes(Base64.getMimeDecoder().decode(encoded.trim()))
    }
} ?: signingValue("KINETIX_ANDROID_KEYSTORE_PATH", "storeFile")?.let { rootProject.file(it) }
val releaseStorePassword = signingValue("KINETIX_ANDROID_KEYSTORE_PASSWORD", "storePassword")
val releaseKeyAlias = signingValue("KINETIX_ANDROID_KEY_ALIAS", "keyAlias")
val releaseKeyPassword = signingValue("KINETIX_ANDROID_KEY_PASSWORD", "keyPassword")
val releaseSigningProblem: String? = when {
    releaseKeystore == null ->
        "no upload keystore: create android/key.properties or set KINETIX_ANDROID_KEYSTORE_BASE64"
    !releaseKeystore.isFile -> "keystore not found: $releaseKeystore"
    releaseStorePassword == null || releaseKeyAlias == null || releaseKeyPassword == null ->
        "storePassword, keyAlias and keyPassword (or the KINETIX_ANDROID_* variables) are all required"
    else -> null
}

// Throwaway test builds only (CI APKs to try on a phone, docs/product/demo-builds.md): with no
// release key and -Pkinetix.testSigning=true (or KINETIX_TEST_SIGNING=true), release builds are
// signed with the debug key instead of failing. Such an APK can never be published, and a real
// release cannot be installed over it.
val testSigning = ((findProperty("kinetix.testSigning") as String?) ?: System.getenv("KINETIX_TEST_SIGNING"))?.toBoolean() ?: false
val useTestSigning = releaseSigningProblem != null && testSigning

// R8 (code + resource shrinking) stays off until a minified release has been smoke-tested on a
// device; turn it on with -Pkinetix.minify=true (keep rules in proguard-rules.pro).
val minifyRelease = (findProperty("kinetix.minify") as String?)?.toBoolean() ?: false

android {
    namespace = "app.kinetix.parent"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Permanent once published (docs/operations/mobile-release.md).
        applicationId = "in.kinetix.parent"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // From `version: x.y.z+build` in pubspec.yaml. With --split-per-abi Flutter adds 1000 * ABI.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // AndroidManifest.xml: http:// to a dev server in debug/profile builds only.
        manifestPlaceholders["usesCleartextTraffic"] = "true"
    }

    signingConfigs {
        if (releaseSigningProblem == null) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // Never the debug key (unless test signing was asked for): without a release key the build stops (below).
            signingConfig = if (useTestSigning) signingConfigs.getByName("debug") else signingConfigs.findByName("release")
            isMinifyEnabled = minifyRelease
            isShrinkResources = minifyRelease
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }
}

// Fail a release build early and clearly instead of producing an unsigned or debug-signed app.
tasks.configureEach {
    if (name == "preReleaseBuild" && useTestSigning) {
        doFirst {
            val line = "!".repeat(78)
            logger.warn(
                "\n$line\n!! TEST SIGNING: this release build is signed with the DEBUG key ($releaseSigningProblem).\n" +
                    "!! Only for throwaway test installs. Never publish it or hand it to users.\n$line",
            )
        }
    }
    if (name == "preReleaseBuild" && releaseSigningProblem != null && !useTestSigning) {
        val problem = "Release signing is not configured ($releaseSigningProblem). See docs/operations/mobile-release.md."
        doFirst { throw GradleException(problem) }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
