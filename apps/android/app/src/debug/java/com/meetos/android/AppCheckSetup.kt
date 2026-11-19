package com.meetos.android

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/**
 * Debug builds use the App Check debug provider. On first run it logs a debug
 * token (logcat tag "DebugAppCheckProvider") that you register in
 * Firebase Console > App Check > Apps > Manage debug tokens. Never commit it.
 */
object AppCheckSetup {
    fun factory(): AppCheckProviderFactory = DebugAppCheckProviderFactory.getInstance()
    const val LABEL = "Debug provider (development build)"
}
