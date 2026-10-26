plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "se.lobbamannen.nexushub.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "se.lobbamannen.nexushub.app"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.toInt() ?: 1
        versionName = providers.environmentVariable("ANDROID_VERSION_NAME").orNull ?: "1.0"
    }
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
tasks.named("preBuild") { dependsOn(bundleWeb) }
