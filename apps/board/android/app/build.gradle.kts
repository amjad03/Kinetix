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

// Demo against a server on the local network (docs/product/demo-builds.md): with
// -Pkinetix.lanHttp=true (or KINETIX_LAN_HTTP=true) the app may also talk plain HTTP (Android
// cannot limit that to private addresses), so KINETIX_API_URL can be a laptop on the school
// Wi-Fi. Never for builds handed to schools: those use HTTPS only.
val lanHttp = ((findProperty("kinetix.lanHttp") as String?) ?: System.getenv("KINETIX_LAN_HTTP"))?.toBoolean() ?: false

// R8 (code + resource shrinking) stays off until a minified release has been smoke-tested on a
// device; turn it on with -Pkinetix.minify=true (keep rules in proguard-rules.pro).
val minifyRelease = (findProperty("kinetix.minify") as String?)?.toBoolean() ?: false

// Zynetix Board — Classroom edition (apps/board/lib/classroom_edition/README.md): the same app
// built with --dart-define=KINETIX_EDITION=classroom (or -Pkinetix.edition=classroom /
// KINETIX_EDITION=classroom) gets its own application id and name, so it installs next to the
// KINETIX Board. Flutter hands its --dart-define values to Gradle base64-encoded in "dart-defines".
val dartDefines: Map<String, String> = ((findProperty("dart-defines") as String?) ?: "")
    .split(",")
    .filter { it.isNotBlank() }
    .mapNotNull { runCatching { String(Base64.getDecoder().decode(it)) }.getOrNull() }
    .mapNotNull { d -> d.indexOf('=').takeIf { it > 0 }?.let { d.substring(0, it) to d.substring(it + 1) } }
    .toMap()
val edition = (findProperty("kinetix.edition") as String?) ?: System.getenv("KINETIX_EDITION") ?: dartDefines["KINETIX_EDITION"] ?: "board"
val classroomEdition = edition == "classroom"
// The Classroom edition's own version (x.y.z+build; bump the build for every release), apart from
// the KINETIX Board's `version:`: pubspec.yaml's `classroom_version:`, overridden by
// --dart-define=KINETIX_CLASSROOM_VERSION=1.0.1+2 or -Pkinetix.classroomVersion=1.0.1+2.
val classroomVersionText: String = if (!classroomEdition) "0.0.0+1" else (findProperty("kinetix.classroomVersion") as String?)
    ?: dartDefines["KINETIX_CLASSROOM_VERSION"]
    ?: Regex("(?m)^classroom_version:\\s*([0-9][^\\s#]*)").find(file("../../pubspec.yaml").readText())?.groupValues?.get(1)
    ?: throw GradleException("pubspec.yaml has no classroom_version: x.y.z+build")
val classroomVersion = classroomVersionText.split("+").also {
    if (it.size != 2 || it[1].toIntOrNull() == null || it[1].toInt() !in 1..999) {
        throw GradleException("classroom_version must be x.y.z+build with a build of 1 to 999 (split APKs add 1000 x the ABI): $classroomVersionText")
    }
}

android {
    namespace = "app.kinetix.board"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Permanent once published (docs/operations/mobile-release.md).
        applicationId = if (classroomEdition) "in.zynetix.classroom" else "in.kinetix.board"
        // Zynetix Classroom runs on Android 9-13 panels: Android 9 (API 28) at least, and a target
        // pinned here rather than following Flutter's default, so a Flutter upgrade cannot change
        // the app's behaviour on the panels unnoticed. The KINETIX Board follows Flutter.
        minSdk = if (classroomEdition) 28 else flutter.minSdkVersion
        targetSdk = if (classroomEdition) 36 else flutter.targetSdkVersion
        // From `version: x.y.z+build` in pubspec.yaml. With --split-per-abi Flutter adds 1000 * ABI.
        // The Classroom edition: classroomVersion above.
        versionCode = if (classroomEdition) classroomVersion[1].toInt() else flutter.versionCode
        versionName = if (classroomEdition) classroomVersion[0] else flutter.versionName
        manifestPlaceholders["appLabel"] = if (classroomEdition) "Zynetix Classroom" else "KINETIX Board"
        manifestPlaceholders["networkSecurityConfig"] = if (lanHttp) "@xml/network_security_config_lan" else "@xml/network_security_config"
    }

    signingConfigs {
        // Per-app throwaway key for test APKs (KINETIX_TEST_SIGNING=true): ~/.kinetix-test-keys/board.jks, outside the repo.
        val testKeystore = File(System.getProperty("user.home"), ".kinetix-test-keys/board.jks")
        if (useTestSigning && testKeystore.isFile) {
            create("kinetixTest") {
                storeFile = testKeystore
                storePassword = "kinetixtest"
                keyAlias = "test"
                keyPassword = "kinetixtest"
            }
        }
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
            signingConfig = if (useTestSigning) (signingConfigs.findByName("kinetixTest") ?: signingConfigs.getByName("debug")) else signingConfigs.findByName("release")
            isMinifyEnabled = minifyRelease
            isShrinkResources = minifyRelease
        }
    }

    // Zynetix Classroom: the native libraries go into the APK compressed (Android unpacks them
    // when it installs the app), which takes about a third off the download for schools that
    // copy it by USB or fetch it over a slow line. The KINETIX Board keeps them uncompressed.
    packaging {
        jniLibs {
            useLegacyPackaging = classroomEdition
        }
    }
}

// Zynetix Classroom carries only the sims and 3D models its PUC lessons use, and no JupyterLite
// (lib/classroom_edition/classroom_assets.dart, kept up to date by
// test/classroom_edition/classroom_assets_test.dart). The rest is left out of the APK here, as
// Flutter's assets are copied in; the app hides what is not there. The KINETIX Board keeps all.
fun classroomAssetList(marker: String): Set<String> {
    val source = file("../../lib/classroom_edition/classroom_assets.dart").readText()
    val block = source.substringAfter("// classroom-assets:$marker:begin", "").substringBefore("// classroom-assets:$marker:end", "")
    val ids = Regex("^\\s*'([^']+)',", RegexOption.MULTILINE).findAll(block).map { it.groupValues[1] }.toSet()
    if (ids.isEmpty()) throw GradleException("classroom_assets.dart has no '$marker' list")
    return ids
}

val classroomAssetExcludes: List<String> = if (!classroomEdition) emptyList() else buildList {
    val phet = classroomAssetList("phet")
    val models = classroomAssetList("models")
    file("../../assets/simhub/phet").listFiles()?.filter { it.name.endsWith(".html") && it.name.removeSuffix(".html") !in phet }?.forEach {
        add("flutter_assets/assets/simhub/phet/${it.name}")
    }
    file("../../../../packages/kinetix_3d/assets/viewer3d/models").listFiles()
        ?.filter { (it.extension == "glb" || it.extension == "json") && it.nameWithoutExtension != "index" && it.nameWithoutExtension !in models }
        ?.forEach { add("flutter_assets/packages/kinetix_3d/assets/viewer3d/models/${it.name}") }
    for (dir in classroomAssetList("dropped")) add("flutter_assets/assets/simhub/$dir/**")
}

tasks.withType<Copy>().configureEach {
    if (name.startsWith("copyFlutterAssets") && classroomAssetExcludes.isNotEmpty()) exclude(classroomAssetExcludes)
}

// Zynetix Classroom has no camera, live casting, speech recognition or handwriting recognition,
// so its APK leaves out those plugins altogether (their code, native libraries and manifest
// entries): the Dart side never reaches them in this edition (Edition.onlineTools / Edition.ai),
// and where it could, a missing plugin is a MissingPluginException that is already handled.
// Flutter registers every plugin in the generated GeneratedPluginRegistrant.java, so this
// edition compiles a copy without them instead.
val classroomDroppedPlugins = setOf(
    "camera_android_camerax",
    "flutter_webrtc",
    "speech_to_text",
    "google_mlkit_digital_ink_recognition",
    "google_mlkit_commons",
)

abstract class ClassroomRegistrantTask : DefaultTask() {
    @get:InputFile
    abstract val registrant: RegularFileProperty

    @get:Input
    abstract val dropped: SetProperty<String>

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun write() {
        var source = registrant.get().asFile.readText()
        val block = Regex(
            "\\n[ \\t]*try \\{\\s*flutterEngine\\.getPlugins\\(\\)\\.add\\([^;]*\\);\\s*\\} catch \\(Exception e\\) \\{\\s*" +
                "Log\\.e\\(TAG, \"Error registering plugin ([A-Za-z0-9_]+), [^\"]*\", e\\);\\s*\\}",
        )
        source = block.replace(source) { m -> if (m.groupValues[1] in dropped.get()) "" else m.value }
        for (name in dropped.get()) {
            if (source.contains("registering plugin $name,")) throw GradleException("Could not leave $name out of GeneratedPluginRegistrant.java (its format changed?)")
        }
        val out = outputDir.get().asFile.resolve("io/flutter/plugins/GeneratedPluginRegistrant.java")
        out.parentFile.mkdirs()
        out.writeText(source)
    }
}

if (classroomEdition) {
    val classroomRegistrant = tasks.register<ClassroomRegistrantTask>("classroomPluginRegistrant") {
        registrant.set(file("src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java"))
        dropped.set(classroomDroppedPlugins)
        outputDir.set(layout.buildDirectory.dir("generated/classroom-registrant"))
    }
    // src/main/java holds only Flutter's registrant; the edition compiles the filtered copy.
    android.sourceSets.getByName("main").java.setSrcDirs(emptyList<Any>())
    androidComponents.onVariants { variant ->
        variant.sources.java?.addGeneratedSourceDirectory(classroomRegistrant, ClassroomRegistrantTask::outputDir)
    }
    // Flutter adds every plugin project as a dependency of the app (…Api configurations); the
    // classpaths leave these out.
    configurations.configureEach {
        for (plugin in classroomDroppedPlugins) exclude(mapOf("module" to plugin))
    }
}

// Zynetix Classroom has no camera, microphone or speech recognition: its overlay manifest
// (src/classroom/AndroidManifest.xml) removes CAMERA, RECORD_AUDIO, the camera features and the
// speech-recognition query, from this app's manifest and from the plugins' (camera, record).
androidComponents {
    onVariants { variant ->
        if (classroomEdition) {
            variant.sources.manifests.addStaticManifestFile(layout.projectDirectory.file("src/classroom/AndroidManifest.xml").asFile.absolutePath)
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

dependencies {
    // FileProvider for handing presentations to the presenter app (Presenter.kt).
    implementation("androidx.core:core-ktx:1.13.1")
}
