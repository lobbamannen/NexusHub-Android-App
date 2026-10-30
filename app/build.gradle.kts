plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// A verified native .so cache can be packaged without re-running CMake.
// On a cache miss, externalNativeBuild remains enabled as before.
val usePrebuiltNative = providers.gradleProperty("usePrebuiltNative")
    .map { it.toBoolean() }.getOrElse(false)
android {
    sourceSets["main"].java.srcDir("../shared/src/main/java")
    namespace = "se.lobbamannen.nexushub.app"
    buildFeatures { buildConfig = true }
    testOptions {unitTests.isIncludeAndroidResources = true}
    compileSdk = 35
    ndkVersion = "28.2.13676358"
    defaultConfig {
        applicationId = "se.lobbamannen.nexushub.app"
        buildConfigField("String", "POSTHOG_PROJECT_TOKEN", "\"" + (providers.environmentVariable("POSTHOG_PROJECT_TOKEN").orNull ?: "") + "\"")
        buildConfigField("String", "POSTHOG_HOST", "\"" + (providers.environmentVariable("POSTHOG_HOST").orNull ?: "") + "\"")
        ndk { abiFilters += listOf("arm64-v8a") }
        if (!usePrebuiltNative) externalNativeBuild { cmake { cppFlags += listOf("-O3", "-fPIC", "-std=c++17"); cFlags += listOf("-O3", "-fPIC"); arguments += listOf("-DANDROID_STL=c++_shared") } }
        minSdk = 26
        targetSdk = 35
        versionCode = providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.toInt() ?: 1
        versionName = providers.environmentVariable("ANDROID_VERSION_NAME").orNull ?: "1.0"
    }
    if (!usePrebuiltNative) externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.22.1" } }
    packaging { jniLibs { useLegacyPackaging = true } }
    signingConfigs {
        create("release") {
            val keyPath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
            if (keyPath != null) {
                storeFile = file(keyPath)
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
                keyAlias = "nexushub"
                keyPassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
            }
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
 testImplementation("org.robolectric:robolectric:4.14.1")
 testImplementation("androidx.work:work-testing:2.10.1")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    implementation("com.posthog:posthog-android:3.72.10")
    implementation(platform("com.squareup.okhttp3:okhttp-bom:4.12.1"))
    implementation("com.squareup.okhttp3:okhttp")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
val webInstall by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir)
    commandLine("npm", "ci")
    onlyIf { !providers.gradleProperty("skipWebBuild").map { it.toBoolean() }.getOrElse(false) }
}
val webBuild by tasks.registering(Exec::class) {
    dependsOn(webInstall)
    workingDir(rootProject.projectDir)
    commandLine("npm", "run", "build")
    onlyIf { !providers.gradleProperty("skipWebBuild").map { it.toBoolean() }.getOrElse(false) }
}
val bundleWeb by tasks.registering(Sync::class) {
    dependsOn(webBuild)
    from(rootProject.layout.projectDirectory.dir("dist"))
    into(layout.projectDirectory.dir("src/main/assets/www"))
    doFirst {
        check(rootProject.file("dist/index.html").isFile) {
            "dist/index.html is missing. Build the frontend before using -PskipWebBuild=true."
        }
    }
}
val bundleTelemetrySchema by tasks.registering(Copy::class) {
    from(rootProject.file("lib/telemetry-schema.json"))
    into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.named("preBuild") { dependsOn(bundleWeb,bundleTelemetrySchema) }
