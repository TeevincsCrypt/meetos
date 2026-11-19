package com.meetos.android.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Live transcription with Android's SpeechRecognizer. Recognition is provided
 * by the device's speech service (often Google's), and can run on-device when
 * the service supports it. Only started after explicit consent; never
 * automatically. Must be used from the main thread.
 */
class SpeechCapture(private val context: Context, private val onFinal: (String) -> Unit) {
    enum class State { IDLE, LISTENING, PAUSED, ERROR }

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state
    private val _partial = MutableStateFlow("")
    val partial: StateFlow<String> = _partial
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private var recognizer: SpeechRecognizer? = null
    private var language = "en-US"

    val isAvailable: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)

    private val intent get() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { _error.value = null }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onPartialResults(partialResults: Bundle?) {
            _partial.value = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
        }
        override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
            _partial.value = ""
            if (text.isNotEmpty()) onFinal(text.replaceFirstChar { it.uppercase() })
            restartIfListening()
        }
        override fun onError(error: Int) {
            when (error) {
                // Silence / no match: keep listening.
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> restartIfListening()
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> fail("Microphone permission was denied.")
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> fail("The speech service couldn't be reached. Recording is paused.")
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> restartIfListening()
                else -> fail("Speech recognition error ($error). Recording is paused.")
            }
        }
    }

    private fun fail(message: String) {
        _error.value = message
        _state.value = State.PAUSED
        recognizer?.cancel()
    }

    private fun restartIfListening() {
        if (_state.value == State.LISTENING) recognizer?.startListening(intent)
    }

    fun start(lang: String) {
        language = lang
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { it.setRecognitionListener(listener) }
        }
        _state.value = State.LISTENING
        recognizer?.startListening(intent)
    }

    fun pause() {
        _state.value = State.PAUSED
        recognizer?.stopListening()
        _partial.value = ""
    }

    fun stop() {
        _state.value = State.IDLE
        recognizer?.destroy()
        recognizer = null
        _partial.value = ""
    }
}
