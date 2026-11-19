package com.meetos.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.meetos.android.data.MeetosRepository
import com.meetos.android.model.CommitmentStatus
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

@Composable
fun CommitmentsScreen(vm: AppViewModel, nav: NavHostController) {
    val data by vm.data.collectAsState()
    val cached by vm.cachedCommitments.collectAsState(initial = emptyList())
    var filter by remember { mutableStateOf("active") }
    val now = System.currentTimeMillis()
    val list = data.commitments.filter {
        when (filter) {
            "active" -> it.status.isActive
            "overdue" -> it.isOverdue(now)
            "done" -> it.status == CommitmentStatus.COMPLETED
            else -> true
        }
    }.sortedWith(compareBy(nullsLast()) { it.deadline })

    LazyColumn(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Commitments", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("active" to "Active", "overdue" to "Overdue", "done" to "Completed", "all" to "All").forEach { (k, l) ->
                    FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(l) })
                }
            }
        }
        if (!data.loaded && cached.isNotEmpty()) {
            item { Muted("Showing saved copy while connecting…") }
            items(cached, key = { it.id }) { c ->
                SectionCard(modifier = Modifier.clickable { nav.navigate("commitment/${c.id}") }) {
                    Strong(c.description); Muted("${c.ownerName ?: "Unassigned"} · ${Fmt.due(c.deadline)} · ${c.originMeetingTitle}")
                }
            }
        }
        if (data.loaded && list.isEmpty()) item { Muted("No commitments here. Analyse a meeting to extract them.") }
        items(list, key = { it.id }) { c ->
            SectionCard(modifier = Modifier.clickable { nav.navigate("commitment/${c.id}") }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.description, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    StatusPill(c.status)
                }
                Muted("${c.ownerName ?: "Unassigned"} · ${Fmt.due(c.deadline)} · ${c.originMeetingTitle}")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (c.isOverdue(now)) Pill("Overdue", MeetosColors.Danger, MeetosColors.Danger.copy(alpha = 0.1f))
                    if (c.meetingIds.size > 1) Pill("${c.meetingIds.size} meetings", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
                    if (c.deadlineChangeCount > 0) Pill("Deadline moved ${c.deadlineChangeCount}×", MeetosColors.Warning, MeetosColors.WarningSoft)
                    if (c.pendingCompletion != null) Pill("Reported done", MeetosColors.Device, MeetosColors.DeviceSoft)
                }
            }
        }
    }
}

private val EVENT_LABEL = mapOf(
    "created" to "Commitment made", "status_changed" to "Status changed", "deadline_changed" to "Deadline changed",
    "owner_changed" to "Owner changed", "mentioned" to "Discussed again", "progress_reported" to "Progress reported",
    "blocker_reported" to "Blocker reported", "completion_suggested" to "Reported as done", "completion_confirmed" to "Completion confirmed",
    "completion_rejected" to "Completion rejected", "note" to "Note",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommitmentDetailScreen(vm: AppViewModel, nav: NavHostController, id: String) {
    val ws by vm.workspace.collectAsState()
    val data by vm.data.collectAsState()
    val wid = ws?.id ?: return
    val c = data.commitments.firstOrNull { it.id == id }
    val events by remember(wid, id) { MeetosRepository.events(wid, id) }.collectAsState(initial = emptyList())
    val busy by vm.busy.collectAsState()

    Scaffold(topBar = {
        TopAppBar(title = { Text("Commitment") }, navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } })
    }) { pad ->
        if (c == null) {
            Column(Modifier.padding(pad).padding(16.dp)) { Muted(if (data.loaded) "This commitment no longer exists." else "Loading…") }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { StatusPill(c.status); InferencePill(c.inferenceSource) }
                Text(c.description, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp))
                Muted("${c.ownerName ?: "Unassigned"} · ${Fmt.due(c.deadline)}${c.deadlineText?.let { " (“$it”)" } ?: ""}")
                if (c.originalDeadline != null && c.originalDeadline != c.deadline) Muted("Originally due ${Fmt.fullDate(c.originalDeadline)}")
            }
            c.pendingCompletion?.let { e ->
                item {
                    SectionCard(title = "A later meeting says this is done. Confirm?") {
                        EvidenceQuote(e, showMeeting = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(enabled = !busy, onClick = { vm.launchAction { MeetosRepository.confirmCompletion(wid, vm.actor!!, c, useSuggestedEvidence = true) } }) { Text("Yes, it's done") }
                            OutlinedButton(enabled = !busy, onClick = { vm.launchAction { MeetosRepository.rejectCompletion(wid, vm.actor!!, c) } }) { Text("Not yet") }
                        }
                    }
                }
            }
            item {
                SectionCard(title = "Status") {
                    Muted("AI never marks commitments complete — a person confirms it.")
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CommitmentStatus.entries.filter { it != CommitmentStatus.CANCELLED }.forEach { s ->
                            FilterChip(selected = c.status == s, enabled = !busy, onClick = { vm.launchAction { MeetosRepository.setStatus(wid, vm.actor!!, c, s) } },
                                label = { Text(if (s == CommitmentStatus.COMPLETED && c.status != s) "Done" else s.label) })
                        }
                    }
                    if (c.status == CommitmentStatus.COMPLETED) Muted("Confirmed by ${c.completedByName ?: "a teammate"} on ${Fmt.fullDate(c.completedAt)}")
                }
            }
            item {
                SectionCard(title = "Commitment Graph · ${c.meetingIds.size} meeting${if (c.meetingIds.size == 1) "" else "s"}") {
                    val meetings = c.meetingIds.mapNotNull { mid -> data.meetings.firstOrNull { it.id == mid } }.sortedBy { it.date }
                    meetings.forEachIndexed { i, m ->
                        Row(Modifier.fillMaxWidth().clickable { nav.navigate("meeting/${m.id}") }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(if (i == 0) "Origin  " else "Follow-up $i  ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            Text(m.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            Muted(Fmt.date(m.date))
                        }
                    }
                }
            }
            item { Text("Timeline", style = MaterialTheme.typography.titleSmall) }
            items(events, key = { it.id }) { e ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Strong(EVENT_LABEL[e.type] ?: e.type)
                        if (e.origin == "ai") Text("  AI", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Muted(listOfNotNull(Fmt.fullDate(e.at), e.byName, e.meetingTitle).joinToString(" · "))
                    if (e.type == "status_changed" || e.type == "owner_changed") Muted("${e.from ?: "—"} → ${e.to ?: "—"}")
                    if (e.type == "deadline_changed") Muted("${e.from?.take(10) ?: "none"} → ${e.to?.take(10) ?: "none"}")
                    e.quote?.let { q -> EvidenceQuote(com.meetos.android.model.Evidence(e.meetingId ?: "", e.meetingTitle, q, null)) }
                    e.note?.let { Muted(it) }
                }
            }
        }
    }
}
