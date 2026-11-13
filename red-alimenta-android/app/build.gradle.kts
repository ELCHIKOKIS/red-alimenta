import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun normalizeApiBaseUrl(value: String, allowLocalHttp: Boolean): String {
    val normalized = value.trim().let { if (it.endsWith("/")) it else "$it/" }
    val uri = URI(normalized)
    val isHttps = uri.scheme.equals("https", ignoreCase = true)
    val isLocalHttp = allowLocalHttp
        && uri.scheme.equals("http", ignoreCase = true)
        && uri.host in setOf("10.0.2.2", "localhost", "127.0.0.1")

    require(
        uri.isAbsolute
            && uri.host != null
            && uri.rawUserInfo == null
            && uri.rawQuery == null
            && uri.rawFragment == null
            && (isHttps || isLocalHttp),
    ) {
        "API base URL must use HTTPS${if (allowLocalHttp) " (HTTP is allowed only for localhost)" else ""}"
    }

    return normalized
}

val defaultApiBaseUrl = "https://red-alimenta-api.onrender.com/"

val debugApiBaseUrl = normalizeApiBaseUrl(
    providers.gradleProperty("debugApiBaseUrl")
        .orElse(providers.gradleProperty("apiBaseUrl"))
        .orElse(defaultApiBaseUrl)
        .get(),
    allowLocalHttp = true,
)
val releaseApiBaseUrl = normalizeApiBaseUrl(
    providers.gradleProperty("releaseApiBaseUrl")
        .orElse(providers.gradleProperty("apiBaseUrl"))
        .orElse(defaultApiBaseUrl)
        .get(),
    allowLocalHttp = false,
)

android {
    namespace = "com.redalimenta.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.redalimenta.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
            isMinifyEnabled = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.socket:socket.io-client:2.1.1") {
        exclude(group = "org.json", module = "json")
    }

    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
