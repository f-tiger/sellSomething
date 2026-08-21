import java.time.LocalDate
import java.time.format.DateTimeFormatter
import org.gradle.jvm.toolchain.JavaLanguageVersion
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

plugins {
    id("java")
    kotlin("jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion").get())
        pluginVerifier()
        zipSigner()
        instrumentationTools()
    }
}

intellijPlatform {
    // Skips launching an IDE to index setting names; keeps CI fast and headless-safe.
    buildSearchableOptions = false

    pluginConfiguration {
        id = "com.agiscorecard.llmstxt"
        name = "LLMs.txt & Agents.md Support"
        version = providers.gradleProperty("pluginVersion").get()

        ideaVersion {
            sinceBuild = "242"
            // Open-ended compatibility: no until-build.
            untilBuild = provider { null }
        }

        // Paid plugin (JetBrains Marketplace handles licensing + the free trial).
        // These values replace the __RELEASE_DATE__ placeholder in plugin.xml at build time.
        productDescriptor {
            code = "PLLMSTXT"
            releaseDate = providers.gradleProperty("pluginReleaseDate")
                .orElse(LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE))
            releaseVersion = providers.gradleProperty("pluginReleaseVersion").orElse("20261")
        }
    }

    pluginVerification {
        ides {
            // One deterministic IDE keeps verifyPlugin bounded in CI; widen before a release.
            ide(IntelliJPlatformType.IntellijIdeaCommunity, providers.gradleProperty("platformVersion").get())
        }
    }
}
