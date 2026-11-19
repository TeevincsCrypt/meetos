package com.meetos.android.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.navigation.NavHostController
import com.meetos.android.data.MeetosRepository
import com.meetos.android.speech.SpeechCapture
import com.meetos.android.ui.AppViewModel
import com.meetos.android.ui.Muted
import com.meetos.android.ui.SectionCard
import com.meetos.android.ui.theme.MeetosColors
import kotlinx.coroutines.launch

private data class Segment(val index: Int, val speaker: String?, val text: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveCaptureScreen(vm: AppViewModel, nav: NavHostController, id: String) {
    val context = LocalContext.current
    val ws by vm.workspace.collectAsState()
    val data by vm.data.collectAsState()
    val wid = ws?.id ?: return
    val meeting = data.meetings.firstOrNull { it.id == id }
    val scope = rememberCoroutineScope()
    var consent by remember { mutableStateOf(false) }
    var started by remember { mutableStateOf(false) }
    var speaker by remember { mutableStateOf<String?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val segments = remember { mutableStateListOf<Segment>() }
    var permissionDenied by remember { mutableStateOf(false) }

    val capture = remember {
        SpeechCapture(context) { text ->
            val seg = Segment(segments.size, speaker, text)
            segments += seg
            // Incremental save of every finalised phrase.
            scope.launch {
                runCatching { MeetosRepository.appendSegment(wid, id, seg.index, seg.speaker, seg.text) }
                    .onFailure { saveError = "Some segments couldn't be saved yet; they're kept here and included when you stop." }
            }
        }
    }
    val state by capture.state.collectAsState()
    val partial by capture.partial.collectAsState()
    val error by capture.error.collectAsState()
    DisposableEffect(Unit) { onDispose { capture.stop() } }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            started = true
            capture.start("en-US")
            scope.launch { runCatching { MeetosRepository.patchMeeting(wid, id, mapOf("status" to "live")) } }
        } else permissionDenied = true
    }

    fun begin() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            started = true
            capture.start("en-US")
            scope.launch { runCatching { MeetosRepository.patchMeeting(wid, id, mapOf("status" to "live")) } }
        } else permission.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun stopAndSave() = scope.launch {
        capture.stop()
        val m = meeting ?: return@launch
        val actor = vm.actor ?: return@launch
        saving = true
        try {
            val existing = MeetosRepository.getTranscript(wid, id)
            val captured = segments.joinToString("\n") { s -> (s.speaker?.let { "$it: " } ?: "") + s.text }
            val text = listOf(existing, captured).filter { it.isNotBlank() }.joinToString("\n")
            if (text.isBlank()) MeetosRepository.patchMeeting(wid, id, mapOf("status" to "scheduled"))
            else MeetosRepository.saveTranscript(wid, actor, m, text, "android_speech")
            nav.popBackStack()
        } catch (e: Exception) {
            saveError = e.message
        } finally { saving = false }
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text("Live capture") }, navigationIcon = { IconButton(onClick = { capture.stop(); nav.popBackStack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } })
    }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!capture.isAvailable) {
                item {
                    SectionCard(title = "Speech recognition isn't available on this device") {
                        Muted("You can still paste a transcript from your meeting tool when creating a meeting.")
                    }
                }
                return@LazyColumn
            }
            if (!started) {
                item {
                    SectionCard(title = "Before you record") {
                        Text("• Tell everyone in the meeting that it's being transcribed, and get their agreement.\n" +
                            "• MEETOS stores the text transcript in this workspace. Audio is not stored.\n" +
                            "• Transcription is done by this phone's speech recognition service, which may process audio on Google's servers depending on your device settings.\n" +
                            "• AI analysis only runs when you start it afterwards.", style = MaterialTheme.typography.bodySmall)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = consent, onCheckedChange = { consent = it })
                            Text("Everyone in this meeting knows it is being transcribed and has agreed.", style = MaterialTheme.typography.bodyMedium)
                        }
                        Button(onClick = { begin() }, enabled = consent) { Text("Start recording") }
                        if (permissionDenied) Text("Microphone permission was denied. Enable it in system settings, or paste a transcript instead.",
                            color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else {
                item {
                    // Always-visible recording state.
                    Row(
                        Modifier.fillMaxWidth().background(if (state == SpeechCapture.State.LISTENING) MeetosColors.Danger.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(10.dp).background(if (state == SpeechCapture.State.LISTENING) MeetosColors.Danger else MaterialTheme.colorScheme.onSurfaceVariant, CircleShape))
                        Text(if (state == SpeechCapture.State.LISTENING) "  Recording" else "  Paused", fontWeight = FontWeight.SemiBold,
                            color = if (state == SpeechCapture.State.LISTENING) MeetosColors.Danger else MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("   ${segments.size} segments saved", style = MaterialTheme.typography.bodySmall)
                    }
                }
                val names = meeting?.participants?.map { it.name }.orEmpty()
                if (names.isNotEmpty()) item {
                    Muted("Who is speaking? Tap the current speaker so commitments are attributed correctly.")
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = speaker == null, onClick = { speaker = null }, label = { Text("Unlabelled") })
                        names.take(4).forEach { n -> FilterChip(selected = speaker == n, onClick = { speaker = n }, label = { Text(n) }) }
                    }
                }
                items(segments) { s -> Text((s.speaker?.let { "$it: " } ?: "") + s.text, style = MaterialTheme.typography.bodyMedium) }
                if (partial.isNotBlank()) item { Muted(partial) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (state == SpeechCapture.State.LISTENING) OutlinedButton(onClick = { capture.pause() }) { Text("Pause") }
                        else OutlinedButton(onClick = { capture.start("en-US") }) { Text("Resume") }
                        Button(onClick = { stopAndSave() }, enabled = !saving) { Text(if (saving) "Saving…" else "Stop & save") }
                    }
                    Muted("Source: Android speech recognition")
                }
            }
            listOfNotNull(error, saveError).forEach { msg -> item { Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        }
    }
}
