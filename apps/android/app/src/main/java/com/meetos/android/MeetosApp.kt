package com.meetos.android

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.appCheck
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import com.meetos.android.data.local.CacheDatabase

class MeetosApp : Application() {
    lateinit var cache: CacheDatabase
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        cache = CacheDatabase.create(this)
        // Returns null when google-services.json is missing; the UI then shows setup steps.
        firebaseReady = FirebaseApp.initializeApp(this) != null
        if (!firebaseReady) return
        // App Check must be installed before Firebase AI Logic makes requests.
        Firebase.appCheck.installAppCheckProviderFactory(AppCheckSetup.factory())
        Firebase.remoteConfig.apply {
            setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 3600 })
            setDefaultsAsync(REMOTE_CONFIG_DEFAULTS)
            fetchAndActivate()
        }
    }

    companion object {
        lateinit var instance: MeetosApp
            private set
        var firebaseReady = false
            private set
        val REMOTE_CONFIG_DEFAULTS = mapOf<String, Any>(
            // Same keys and defaults as the web app (apps/web/src/lib/firebase.ts).
            "ai_cloud_model" to "gemini-3.5-flash-lite",
            "ai_reasoning_model" to "gemini-3.5-flash-lite",
            "ai_chunk_chars" to 2400L,
            // ML Kit model selection: "preview" = Gemini Nano 4 where available, "preview_fast", or "stable".
            "ai_android_on_device_model" to "preview",
        )
    }
}
