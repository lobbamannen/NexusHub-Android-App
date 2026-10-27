plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
}
android {
 namespace="se.lobbamannen.nexushub.wear"
 compileSdk=35
 sourceSets["main"].java.srcDir("../shared/src/main/java")
 defaultConfig {
  applicationId="se.lobbamannen.nexushub.app"
  minSdk=30
  targetSdk=35
  versionCode=providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.toInt() ?: 1
  versionName=providers.environmentVariable("ANDROID_VERSION_NAME").orNull ?: "1.0"
 }
 signingConfigs {
  create("release") {
   val keyPath=providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
   if(keyPath!=null){storeFile=file(keyPath);storePassword=providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull;keyAlias="nexushub";keyPassword=providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull}
  }
 }
 buildTypes {getByName("release"){signingConfig=signingConfigs.getByName("release");isMinifyEnabled=false}}
 compileOptions {sourceCompatibility=JavaVersion.VERSION_17;targetCompatibility=JavaVersion.VERSION_17}
 kotlinOptions {jvmTarget="17"}
}
dependencies {
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.work:work-runtime-ktx:2.10.1")
 implementation("com.google.android.gms:play-services-wearable:20.0.1")
 testImplementation("junit:junit:4.13.2")
 testImplementation("org.json:json:20240303")
}
