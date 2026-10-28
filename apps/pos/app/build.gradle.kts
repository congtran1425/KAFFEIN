import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val posEnvironment = providers.gradleProperty("posEnvironment").orElse("aws").get()
require(posEnvironment in listOf("aws", "local")) { "posEnvironment must be aws or local" }
val awsApiBaseUrl = "https://api-aws.congtc145.id.vn/api/v1/"
val posApiBaseUrl = providers.gradleProperty("posApiBaseUrl")
    .orElse(if (posEnvironment == "aws") awsApiBaseUrl else "http://10.0.2.2:3000/api/v1/").get()
val posApiUri = URI(posApiBaseUrl)
require(posApiUri.scheme in listOf("https", "http") && posApiUri.host != null &&
    posApiUri.userInfo == null && posApiUri.query == null && posApiUri.fragment == null &&
    posApiBaseUrl.endsWith("/api/v1/")) { "posApiBaseUrl must be an HTTP(S) API URL ending in /api/v1/" }
require(posEnvironment != "aws" || posApiBaseUrl == awsApiBaseUrl) {
    "The AWS package is bound to the AWS backend; use -PposEnvironment=local for local testing"
}
require(posEnvironment != "local" || posApiUri.host != URI(awsApiBaseUrl).host) {
    "Use the separate AWS package for AWS; never redirect the existing local enrollment"
}

android {
    namespace = "vn.id.congtc145.coffeepos"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = if (posEnvironment == "aws") "vn.id.congtc145.coffeepos.aws" else "vn.id.congtc145.coffeepos"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"$posApiBaseUrl\"")
        manifestPlaceholders["posAppName"] = if (posEnvironment == "aws") "KAFFEIN AWS" else "KAFFEIN"
        manifestPlaceholders["posCleartextTraffic"] = (posEnvironment == "local").toString()
        // Real enrollment is the default even for debug builds. Enable only for
        // a deliberately isolated UI-design build; never infer preview from missing credentials.
        buildConfigField("boolean", "ENABLE_DESIGN_PREVIEW",
            (providers.gradleProperty("posDesignPreview").orNull == "true").toString())
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation("com.google.zxing:core:3.5.3")
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
