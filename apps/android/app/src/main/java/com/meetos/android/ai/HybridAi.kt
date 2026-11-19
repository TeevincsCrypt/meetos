package com.meetos.android.ai

import android.content.Context
import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.remoteconfig.remoteConfig
import com.meetos.android.model.InferenceSourceLabel
import kotlinx.coroutines.flow.Flow

/**
 * MEETOS hybrid inference on Android, using Firebase AI Logic.
 *
 * - Extraction (short transcript chunks): InferenceMode.PREFER_ON_DEVICE —
 *   Gemini Nano through ML Kit GenAI when the device supports it; the SDK
 *   falls back to the cloud model if on-device isn't available or fails.
 * - Cross-meeting reasoning (memory answers): InferenceMode.PREFER_IN_CLOUD —
 *   the SDK uses on-device only when the device is offline.
 *
 * On-device inference on Android is experimental and device-dependent; the
 * reported source always comes from `GenerateContentResponse.inferenceSource`.
 */
object HybridAi {
    enum class Preference(val wire: String, val label: String) {
        PREFER_ON_DEVICE("prefer_on_device", "Hybrid — on-device first"),
        ON_DEVICE_ONLY("on_device_only", "On-device only"),
        CLOUD_ONLY("cloud_only", "Cloud only");
        companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } ?: PREFER_ON_DEVICE }
    }

    enum class Kind { EXTRACT, REASON }

    data class Result<T>(val data: T, val source: InferenceSourceLabel, val detail: String, val model: String)

    class UnavailableException(message: String) : Exception(message)

    private const val PREFS = "meetos-ai"

    fun preference(context: Context): Preference =
        Preference.from(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("preference", null))

    fun setPreference(context: Context, p: Preference) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("preference", p.wire).apply()
    }

    private fun cloudModelName(kind: Kind) =
        Firebase.remoteConfig.getString(if (kind == Kind.REASON) "ai_reasoning_model" else "ai_cloud_model").ifBlank { "gemini-3.5-flash-lite" }

    private val cache = HashMap<String, GenerativeModel>()

    private fun model(mode: InferenceMode, kind: Kind, json: Boolean = true): GenerativeModel {
        val name = cloudModelName(kind)
        val key = "$mode:$kind:$json:$name"
        return cache.getOrPut(key) {
            Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = name,
                // Applies to the cloud model; the on-device model is constrained by the prompt and validated by MEETOS.
                generationConfig = if (json) generationConfig { responseMimeType = "application/json" } else null,
                onDeviceConfig = OnDeviceConfig(mode = mode, maxOutputTokens = 1024, temperature = 0.2f),
            )
        }
    }

    /** Status of the on-device model on this phone, or null if the SDK reports no on-device support. */
    suspend fun onDeviceStatus(): OnDeviceModelStatus? =
        runCatching { model(InferenceMode.PREFER_ON_DEVICE, Kind.EXTRACT).onDeviceExtension?.checkStatus() }.getOrNull()

    /** Starts/monitors the on-device model download (collect the flow to run it). */
    fun download(): Flow<DownloadStatus>? = model(InferenceMode.PREFER_ON_DEVICE, Kind.EXTRACT).onDeviceExtension?.download()

    fun describe(status: OnDeviceModelStatus?): String = when (status) {
        OnDeviceModelStatus.AVAILABLE -> "On-device model ready"
        OnDeviceModelStatus.DOWNLOADABLE -> "On-device model can be downloaded"
        OnDeviceModelStatus.DOWNLOADING -> "On-device model downloading"
        OnDeviceModelStatus.UNAVAILABLE -> "This device doesn't support on-device AI"
        else -> "On-device AI not available"
    }

    suspend fun <T> run(context: Context, prompt: String, kind: Kind, validate: (String) -> T): Result<T> {
        val pref = preference(context)
        val status = onDeviceStatus()
        if (pref == Preference.ON_DEVICE_ONLY && status != OnDeviceModelStatus.AVAILABLE) {
            throw UnavailableException("${describe(status)}. Cloud processing is turned off in Settings, so this can't run yet.")
        }
        val mode = when {
            pref == Preference.ON_DEVICE_ONLY -> InferenceMode.ONLY_ON_DEVICE
            pref == Preference.CLOUD_ONLY -> InferenceMode.ONLY_IN_CLOUD
            kind == Kind.REASON -> InferenceMode.PREFER_IN_CLOUD
            else -> InferenceMode.PREFER_ON_DEVICE
        }
        val response = try {
            model(mode, kind).generateContent(prompt)
        } catch (e: Exception) {
            throw Exception(friendly(e), e)
        }
        val source = if (response.inferenceSource == InferenceSource.ON_DEVICE) InferenceSourceLabel.ON_DEVICE else InferenceSourceLabel.IN_CLOUD
        val text = response.text.orEmpty()
        try {
            val data = validate(text)
            val detail = when {
                source == InferenceSourceLabel.ON_DEVICE -> "Processed on this device"
                pref == Preference.CLOUD_ONLY -> "Processed in the cloud (your preference)"
                kind == Kind.REASON -> "Processed in the cloud (cross-meeting task)"
                else -> "Processed in the cloud — ${describe(status).lowercase()}"
            }
            return Result(data, source, detail, if (source == InferenceSourceLabel.ON_DEVICE) "Gemini Nano (on-device)" else cloudModelName(kind))
        } catch (invalid: Exception) {
            // Only an on-device result that failed validation is retried in the cloud — and reported as such.
            if (source != InferenceSourceLabel.ON_DEVICE || pref == Preference.ON_DEVICE_ONLY) throw Exception("The AI response could not be validated.", invalid)
            val cloud = model(InferenceMode.ONLY_IN_CLOUD, kind).generateContent(prompt)
            return Result(validate(cloud.text.orEmpty()), InferenceSourceLabel.CLOUD_FALLBACK,
                "Cloud fallback used — the on-device output didn't pass validation", cloudModelName(kind))
        }
    }

    private fun friendly(e: Exception): String {
        val m = e.message.orEmpty()
        return when {
            m.contains("App Check", true) || m.contains("appcheck", true) -> "Firebase AI Logic rejected the request (App Check). Register this device's debug token or use a Play-installed build."
            m.contains("not been used", true) || m.contains("disabled", true) || m.contains("API_NOT", true) -> "Firebase AI Logic is not enabled for this Firebase project. See docs/SETUP.md."
            m.contains("quota", true) -> "The AI quota for this project was exceeded. Try again shortly."
            m.contains("not available", true) -> "On-device AI is not available on this device."
            else -> m.ifBlank { "AI request failed." }
        }
    }
}
