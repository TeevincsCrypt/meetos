// Compiles and tests the pure-Kotlin parts of apps/android (analysis + model)
// on the JVM, without the Android SDK.
plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.serialization") version "2.2.21"
}
val app = rootDir.resolve("../app/src")
sourceSets {
    main { kotlin.srcDirs(app.resolve("main/java/com/meetos/android/analysis"), app.resolve("main/java/com/meetos/android/model")) }
    test { kotlin.srcDirs(app.resolve("test/java/com/meetos/android/analysis")) }
}
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    testImplementation("junit:junit:4.13.2")
}
kotlin { jvmToolchain(21) }
tasks.test { testLogging { events("passed", "failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL } }
