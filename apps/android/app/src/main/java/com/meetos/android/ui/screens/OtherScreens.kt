package com.meetos.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.OnDeviceModelStatus
import com.meetos.android.AppCheckSetup
import com.meetos.android.ai.HybridAi
import com.meetos.android.analysis.Extraction
import com.meetos.android.analysis.Text
import com.meetos.android.data.MeetosRepository
import com.meetos.android.model.DecisionStatus
import com.meetos.android.model.InferenceSourceLabel
import com.meetos.android.ui.AppViewModel
import com.meetos.android.ui.EvidenceQuote
import com.meetos.android.ui.Fmt
import com.meetos.android.ui.InferencePill
import com.meetos.android.ui.Muted
import com.meetos.android.ui.Pill
import com.meetos.android.ui.SectionCard
import com.meetos.android.ui.Strong
import com.meetos.android.ui.theme.MeetosColors
import kotlinx.coroutines.launch

@Composable
fun DecisionsScreen(vm: AppViewModel) {
    val ws by vm.workspace.collectAsState()
    val data by vm.data.collectAsState()
    var query by remember { mutableStateOf("") }
    val list = data.decisions.filter { query.isBlank() || "${it.title} ${it.description} ${it.participants.joinToString()}".contains(query, true) }
    LazyColumn(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            androidx.compose.material3.Text("Decisions", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            OutlinedTextField(query, { query = it }, label = { androidx.compose.material3.Text("Search decisions") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        if (data.loaded && list.isEmpty()) item { Muted("No decisions yet. They appear when you analyse meetings.") }
        items(list, key = { it.id }) { d ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill(d.status.label, if (d.status == DecisionStatus.NEEDS_CONFIRMATION) MeetosColors.Warning else MeetosColors.Success,
                        if (d.status == DecisionStatus.NEEDS_CONFIRMATION) MeetosColors.WarningSoft else MeetosColors.Success.copy(alpha = 0.1f))
                    InferencePill(d.inferenceSource)
                }
                Strong(d.title)
                if (d.description != d.title) Muted(d.description)
                Muted("${Fmt.fullDate(d.decidedAt)} · ${d.meetingTitle} · ${if (d.participants.isEmpty()) "who agreed isn't stated" else "agreed by ${d.participants.joinToString()}"}")
                d.evidence.firstOrNull()?.let { EvidenceQuote(it) }
                if (d.alternatives.isNotEmpty()) Muted("Alternatives discussed: ${d.alternatives.joinToString(" · ")}")
                if (d.status == DecisionStatus.NEEDS_CONFIRMATION) {
                    OutlinedButton(onClick = { val wid = ws?.id ?: return@OutlinedButton; vm.launchAction { MeetosRepository.confirmDecision(wid, vm.actor!!, d) } }) {
                        androidx.compose.material3.Text("Confirm decision")
                    }
                }
            }
        }
    }
}

/** Memory: local retrieval over workspace records, then a cited AI answer (cloud preferred, on-device when offline). */
@Composable
fun MemoryScreen(vm: AppViewModel) {
    val data by vm.data.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var question by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var answer by remember { mutableStateOf<Triple<String, InferenceSourceLabel?, List<Pair<String, String>>>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun ask() = scope.launch {
        busy = true; error = null; answer = null
        try {
            val docs = buildList {
                data.meetings.forEach { add("Meeting \"${it.title}\" (${Fmt.fullDate(it.date)})" to "${it.title}. ${it.summary}") }
                data.decisions.forEach { add("Decision from \"${it.meetingTitle}\"" to "Decision (${it.status.label}): ${it.title}. ${it.description}. ${it.evidence.firstOrNull()?.quote ?: ""}") }
                data.commitments.forEach { add("Commitment from \"${it.originMeetingTitle}\"" to "Commitment (${it.status.label}): ${it.description}. Owner: ${it.ownerName ?: "unassigned"}. ${Fmt.due(it.deadline)}.") }
                data.questions.forEach { add("Question from \"${it.meetingTitle}\"" to "Open question (${it.status}): ${it.text}") }
            }
            val terms = Text.tokenSet(question)
            val hits = docs.map { it to Text.tokenSet(it.second).count { t -> t in terms } }.filter { it.second > 0 }.sortedByDescending { it.second }.take(8).map { it.first }
            if (hits.isEmpty()) {
                answer = Triple("I couldn't find anything about this in your workspace. (No AI was used.)", null, emptyList())
                return@launch
            }
            val sources = hits.mapIndexed { i, h -> "S${i + 1}" to "(${h.first}) ${h.second.take(500)}" }
            val prompt = "You are MEETOS, a team's meeting memory. Answer using ONLY these sources and cite them like [S1]. " +
                "If they don't answer the question, set found to false. Never invent anything.\n\nSOURCES:\n" +
                sources.joinToString("\n") { "[${it.first}] ${it.second}" } +
                "\n\nQUESTION: $question\nReturn ONLY JSON: {\"found\":true,\"answer\":\"\",\"citations\":[\"S1\"]}"
            val r = HybridAi.run(context, prompt, HybridAi.Kind.REASON) { Extraction.validateMemoryAnswer(it) }
            val valid = sources.map { it.first }.toSet()
            val cited = (r.data.citations + Regex("\\[(S\\d+)]").findAll(r.data.answer).map { it.groupValues[1] }).filter { it in valid }.toSet()
            val found = r.data.found && cited.isNotEmpty()
            answer = Triple(if (found) r.data.answer else "Not found in your workspace. ${r.data.answer}", r.source, sources.filter { it.first in cited })
        } catch (e: Exception) { error = e.message } finally { busy = false }
    }

    LazyColumn(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            androidx.compose.material3.Text("Memory", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Muted("Ask about past meetings. Answers come only from your workspace, with sources.")
        }
        item {
            OutlinedTextField(question, { question = it }, label = { androidx.compose.material3.Text("What happened to the landing page?") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { ask() }, enabled = question.isNotBlank() && !busy, modifier = Modifier.padding(top = 8.dp)) {
                androidx.compose.material3.Text(if (busy) "Searching…" else "Ask")
            }
            Muted("Only the most relevant excerpts are sent to the AI model, never whole transcripts.")
        }
        answer?.let { (text, source, cited) ->
            item {
                SectionCard {
                    androidx.compose.material3.Text(text, style = MaterialTheme.typography.bodyMedium)
                    InferencePill(source)
                    cited.forEach { (id, s) -> Muted("[$id] $s") }
                }
            }
        }
        error?.let { item { androidx.compose.material3.Text(it, color = MaterialTheme.colorScheme.error) } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(vm: AppViewModel, nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val ws by vm.workspace.collectAsState()
    val workspaces by vm.workspaces.collectAsState()
    var pref by remember { mutableStateOf(HybridAi.preference(context)) }
    var status by remember { mutableStateOf<OnDeviceModelStatus?>(null) }
    var checked by remember { mutableStateOf(false) }
    var download by remember { mutableStateOf<String?>(null) }
    var modelName by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        status = HybridAi.onDeviceStatus(); checked = true
        if (status == OnDeviceModelStatus.AVAILABLE) modelName = HybridAi.onDeviceModelName()
    }

    Scaffold(topBar = {
        TopAppBar(title = { androidx.compose.material3.Text("Settings") }, navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } })
    }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                SectionCard(title = "Where AI runs") {
                    HybridAi.Preference.entries.forEach { p ->
                        Row(Modifier.fillMaxWidth().clickable { pref = p; HybridAi.setPreference(context, p) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = pref == p, onClick = { pref = p; HybridAi.setPreference(context, p) })
                            androidx.compose.material3.Text(p.label, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Muted("On-device only: nothing is sent to a cloud AI model. Cloud only: always use Gemini via Firebase AI Logic.")
                }
            }
            item {
                SectionCard(title = "This device") {
                    androidx.compose.material3.Text(if (checked) HybridAi.describe(status) else "Checking…", style = MaterialTheme.typography.bodyMedium)
                    modelName?.let { Muted("Model reported by this device: $it") }
                    Muted("On-device inference requests Gemini Nano 4 (ML Kit Prompt API, preview model) through Firebase AI Logic. It's only available on supported devices; elsewhere MEETOS uses the cloud and labels results accordingly.")
                    if (status == OnDeviceModelStatus.DOWNLOADABLE || status == OnDeviceModelStatus.DOWNLOADING) {
                        OutlinedButton(enabled = download == null, onClick = {
                            scope.launch {
                                download = "Starting…"
                                HybridAi.download()?.collect { s ->
                                    download = when (s) {
                                        is DownloadStatus.DownloadStarted -> "Downloading ${s.bytesToDownload / 1_000_000} MB…"
                                        is DownloadStatus.DownloadInProgress -> "Downloaded ${s.totalBytesDownloaded / 1_000_000} MB…"
                                        is DownloadStatus.DownloadFailed -> "Download failed: ${s.exception.message}"
                                        else -> "Download complete"
                                    }
                                }
                                status = HybridAi.onDeviceStatus()
                            }
                        }) { androidx.compose.material3.Text("Download on-device model") }
                        download?.let { Muted(it); if (it.startsWith("Downloading") || it.startsWith("Downloaded")) LinearProgressIndicator(Modifier.fillMaxWidth()) }
                    }
                }
            }
            item {
                SectionCard(title = "What happens to your transcripts") {
                    Muted("• Stored in your workspace in Cloud Firestore, readable only by its members (security rules). Audio is never stored.\n" +
                        "• Processed on this device when the on-device model is available.\n" +
                        "• Otherwise, short transcript chunks are sent to Gemini through Firebase AI Logic.\n" +
                        "• Memory sends only retrieved excerpts.\n" +
                        "• App Check: ${AppCheckSetup.LABEL}.")
                }
            }
            item {
                SectionCard(title = "Workspace") {
                    Muted("Current: ${ws?.name ?: "—"}")
                    workspaces.orEmpty().filter { it.id != ws?.id }.forEach { w ->
                        OutlinedButton(onClick = { vm.select(w.id) }) { androidx.compose.material3.Text("Switch to ${w.name}") }
                    }
                    Muted("Invite teammates and manage roles from the web app.")
                }
            }
            item { Button(onClick = { vm.signOut() }) { androidx.compose.material3.Text("Sign out") } }
        }
    }
}
