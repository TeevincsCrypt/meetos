package com.meetos.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.meetos.android.ai.AnalysisPipeline
import com.meetos.android.ai.HybridAi
import com.meetos.android.analysis.Transcript
import com.meetos.android.data.MeetosRepository
import com.meetos.android.data.Samples
import com.meetos.android.model.Participant
import com.meetos.android.ui.AppViewModel
import com.meetos.android.ui.EvidenceQuote
import com.meetos.android.ui.Fmt
import com.meetos.android.ui.InferencePill
import com.meetos.android.ui.Muted
import com.meetos.android.ui.Pill
import com.meetos.android.ui.SectionCard
import com.meetos.android.ui.StatusPill
import com.meetos.android.ui.Strong
import com.meetos.android.ui.theme.MeetosColors
import kotlinx.coroutines.launch

@Composable
fun MeetingsScreen(vm: AppViewModel, nav: NavHostController) {
    val data by vm.data.collectAsState()
    val cached by vm.cachedMeetings.collectAsState(initial = emptyList())
    var query by remember { mutableStateOf("") }
    Scaffold(floatingActionButton = {
        FloatingActionButton(onClick = { nav.navigate("meetings/new") }) { Icon(Icons.Outlined.Add, "New meeting") }
    }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text("Meetings", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
                OutlinedTextField(query, { query = it }, label = { Text("Search meetings") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            if (!data.loaded && cached.isNotEmpty()) {
                item { Muted("Showing saved copy while connecting…") }
                items(cached.filter { it.title.contains(query, true) }, key = { it.id }) { m ->
                    MeetingRow(m.title, m.summary, Fmt.date(m.date), m.status, m.isSample) { nav.navigate("meeting/${m.id}") }
                }
            } else {
                val list = data.meetings.filter { !it.archived && (query.isBlank() || "${it.title} ${it.summary} ${it.participants.joinToString { p -> p.name }}".contains(query, true)) }
                if (data.loaded && list.isEmpty()) item { Muted(if (query.isBlank()) "No meetings yet. Tap + to add one." else "No meetings match.") }
                items(list, key = { it.id }) { m ->
                    MeetingRow(m.title, m.summary, Fmt.date(m.date), m.status, m.isSample) { nav.navigate("meeting/${m.id}") }
                }
            }
        }
    }
}

@Composable
private fun MeetingRow(title: String, summary: String, date: String, status: String, sample: Boolean, onClick: () -> Unit) {
    SectionCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Muted(date)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Pill(status.replace('_', ' '), MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
            if (sample) Pill("Sample data", MeetosColors.Accent, MeetosColors.WarningSoft)
        }
        if (summary.isNotBlank()) Muted(summary)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewMeetingScreen(vm: AppViewModel, nav: NavHostController) {
    val ws by vm.workspace.collectAsState()
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var people by remember { mutableStateOf("") }
    var transcript by remember { mutableStateOf("") }
    var source by remember { mutableStateOf("paste") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val speakers = remember(transcript) { Transcript.speakers(transcript) }

    fun create(live: Boolean) = scope.launch {
        val wid = ws?.id ?: return@launch
        val actor = vm.actor ?: return@launch
        busy = true; error = null
        try {
            val names = (people.split(',').map { it.trim() } + speakers).filter { it.isNotBlank() }.distinctBy { it.lowercase() }
            val id = MeetosRepository.createMeeting(wid, actor, title, names.map { Participant(it) }, System.currentTimeMillis(), isSample = source == "sample")
            if (!live && transcript.isNotBlank()) {
                val m = vm.data.value.meetings.firstOrNull { it.id == id }
                    ?: com.meetos.android.model.Meeting(id, wid, title, "", null, emptyList(), null, null, "scheduled", false, null, 0, "", emptyList(),
                        emptyList(), emptyList(), emptyList(), null, source == "sample", System.currentTimeMillis(), actor.uid)
                MeetosRepository.saveTranscript(wid, actor, m, transcript, source)
            }
            nav.popBackStack()
            nav.navigate(if (live) "meeting/$id/live" else "meeting/$id")
        } catch (e: Exception) {
            error = e.message
        } finally { busy = false }
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text("New meeting") }, navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } })
    }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(people, { people = it }, label = { Text("Participants (comma-separated)") }, modifier = Modifier.fillMaxWidth()) }
            item {
                Button(onClick = { create(live = true) }, enabled = title.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Mic, null); Text("  Record live (with consent)")
                }
            }
            item { Muted("…or paste a transcript (\"Name: what they said\" lines work best):") }
            item {
                OutlinedTextField(transcript, { transcript = it; if (source == "sample") source = "paste" }, label = { Text("Transcript") },
                    textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp))
                if (speakers.isNotEmpty()) Muted("Speakers found: ${speakers.joinToString()}")
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Samples.ALL.forEachIndexed { i, s ->
                        TextButton(onClick = { transcript = s.transcript; title = s.title; people = s.participants.joinToString(); source = "sample" }) {
                            Text("Sample ${i + 1}${if (i == 1) " (follow-up)" else ""}")
                        }
                    }
                }
                Muted("Samples are fictional and labelled as sample data.")
            }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            item {
                OutlinedButton(onClick = { create(live = false) }, enabled = title.isNotBlank() && transcript.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) {
                    Text("Save meeting")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeetingDetailScreen(vm: AppViewModel, nav: NavHostController, id: String) {
    val ws by vm.workspace.collectAsState()
    val data by vm.data.collectAsState()
    val wid = ws?.id ?: return
    val meeting by remember(wid, id) { MeetosRepository.meeting(wid, id) }.collectAsState(initial = null)
    val transcript by remember(wid, id) { MeetosRepository.transcript(wid, id) }.collectAsState(initial = "")
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var progress by remember { mutableStateOf<List<AnalysisPipeline.ChunkState>>(emptyList()) }
    var running by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var showTranscript by remember { mutableStateOf(false) }
    var plan by remember { mutableStateOf("Checking on-device AI…") }

    LaunchedEffect(Unit) {
        val pref = HybridAi.preference(context)
        val status = HybridAi.onDeviceStatus()
        plan = when (pref) {
            HybridAi.Preference.CLOUD_ONLY -> "Cloud only (your preference)"
            HybridAi.Preference.ON_DEVICE_ONLY -> "On-device only · ${HybridAi.describe(status)}"
            else -> "Hybrid · ${HybridAi.describe(status)}"
        }
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text(meeting?.title ?: "Meeting", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } })
    }) { pad ->
        val m = meeting
        if (m == null) {
            Column(Modifier.padding(pad).padding(24.dp)) { CircularProgressIndicator() }
            return@Scaffold
        }
        val created = data.commitments.filter { it.originMeetingId == id }
        val discussed = data.commitments.filter { it.originMeetingId != id && id in it.relatedMeetingIds }
        val decisions = data.decisions.filter { it.meetingId == id }
        val questions = data.questions.filter { it.meetingId == id }

        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                    Pill(m.status.replace('_', ' '), MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
                    if (m.isSample) Pill("Sample data", MeetosColors.Accent, MeetosColors.WarningSoft)
                }
                Muted("${Fmt.fullDate(m.date)} · ${m.participants.joinToString { it.name }.ifBlank { "No participants listed" }}")
            }
            item {
                SectionCard(title = if (m.analysis != null) "Re-analyse this meeting" else "Analyse this meeting") {
                    Muted("Extracts decisions, commitments with owners and deadlines, questions and blockers, and links this meeting to earlier commitments.")
                    Muted(plan)
                    if (transcript.isBlank()) {
                        Muted("No transcript yet — record live or add one.")
                        OutlinedButton(onClick = { nav.navigate("meeting/$id/live") }) { Icon(Icons.Outlined.Mic, null); Text("  Record live") }
                    } else {
                        Button(enabled = !running, onClick = {
                            scope.launch {
                                running = true; error = null; result = null
                                try {
                                    val actor = vm.actor ?: throw IllegalStateException("Not signed in")
                                    val o = AnalysisPipeline.run(context, wid, actor, m, transcript, data.commitments, data.decisions) { progress = it }
                                    result = "${o.commitments} new commitments, ${o.decisions} decisions, ${o.questions} questions, ${o.linked} updates to earlier commitments." +
                                        if (o.discarded > 0) " ${o.discarded} item(s) discarded: evidence not found in the transcript." else ""
                                } catch (e: Exception) { error = e.message } finally { running = false }
                            }
                        }) { Icon(Icons.Outlined.AutoAwesome, null); Text(if (running) "  Analysing…" else "  Analyse") }
                    }
                    if (progress.isNotEmpty()) {
                        val done = progress.count { it.state == "done" }
                        LinearProgressIndicator(progress = { done.toFloat() / progress.size }, modifier = Modifier.fillMaxWidth())
                        progress.forEach { c ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                when (c.state) {
                                    "done" -> Icon(Icons.Outlined.CheckCircle, null, tint = MeetosColors.Success)
                                    "failed" -> Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error)
                                    else -> CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp)
                                }
                                Muted("Part ${c.index + 1} · ${c.chars} chars")
                                InferencePill(c.source)
                            }
                            if (c.state == "failed") Muted(c.detail)
                        }
                    }
                    result?.let { Text("Done. $it", style = MaterialTheme.typography.bodySmall) }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    m.analysis?.let { a ->
                        Muted("Last run: ${a.chunkCount} part(s) · on device ${a.chunksOnDevice} · cloud ${a.chunksInCloud} · fallback ${a.chunksCloudFallback}" +
                            if (a.discardedUngrounded > 0) " · ${a.discardedUngrounded} discarded (ungrounded)" else "")
                    }
                }
            }
            if (m.summary.isNotBlank()) item { SectionCard(title = "Summary") { Text(m.summary, style = MaterialTheme.typography.bodyMedium) } }
            if (decisions.isNotEmpty()) item {
                SectionCard(title = "Decisions") {
                    decisions.forEach { d ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Strong(d.title); InferencePill(d.inferenceSource)
                        }
                        Muted(if (d.participants.isEmpty()) "Who agreed is not stated in the transcript" else "Agreed by ${d.participants.joinToString()}")
                        d.evidence.firstOrNull()?.let { EvidenceQuote(it) }
                    }
                }
            }
            if (created.isNotEmpty() || discussed.isNotEmpty()) item {
                SectionCard(title = "Commitments") {
                    (created + discussed).forEach { c ->
                        Column(Modifier.fillMaxWidth().clickable { nav.navigate("commitment/${c.id}") }.padding(vertical = 4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(c.description, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                StatusPill(c.status)
                            }
                            Muted("${c.ownerName ?: "Unassigned"} · ${Fmt.due(c.deadline)}${if (c.originMeetingId != id) " · from ${c.originMeetingTitle}" else ""}")
                            if (c.pendingCompletion != null) Pill("Reported done · confirm", MeetosColors.Device, MeetosColors.DeviceSoft)
                        }
                    }
                }
            }
            if (questions.isNotEmpty()) item {
                SectionCard(title = "Open questions") { questions.forEach { q -> Text("• ${q.text}", style = MaterialTheme.typography.bodyMedium) } }
            }
            if (m.risks.isNotEmpty()) item {
                SectionCard(title = "Risks & blockers") {
                    m.risks.forEach { r -> Strong("${if (r.kind == "blocker") "Blocker" else "Risk"}: ${r.description}"); EvidenceQuote(r.evidence) }
                }
            }
            if (transcript.isNotBlank()) item {
                SectionCard(title = "Transcript") {
                    TextButton(onClick = { showTranscript = !showTranscript }) { Text(if (showTranscript) "Hide" else "Show (${transcript.length} characters)") }
                    if (showTranscript) Text(transcript, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
