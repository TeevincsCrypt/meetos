package com.meetos.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.meetos.android.model.DecisionStatus
import com.meetos.android.ui.AppViewModel
import com.meetos.android.ui.Fmt
import com.meetos.android.ui.Muted
import com.meetos.android.ui.Pill
import com.meetos.android.ui.SectionCard
import com.meetos.android.ui.theme.MeetosColors
import java.util.Calendar

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    val ws by vm.workspace.collectAsState()
    val data by vm.data.collectAsState()
    val now = System.currentTimeMillis()
    val active = data.commitments.filter { it.status.isActive }
    val overdue = active.filter { it.isOverdue(now) }.sortedBy { it.deadline }
    val pending = active.filter { it.pendingCompletion != null }
    val toConfirm = data.decisions.filter { it.status == DecisionStatus.NEEDS_CONFIRMATION }
    val recentDecisions = data.decisions.filter { it.decidedAt > now - 7 * 86_400_000L && it.status != DecisionStatus.SUPERSEDED }
    val openQuestions = data.questions.filter { it.status == "open" }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val greeting = if (hour < 12) "Good morning" else if (hour < 18) "Good afternoon" else "Good evening"
    val first = vm.actor?.name?.substringBefore(' ').orEmpty()

    LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Muted(ws?.name ?: "")
                    Text("$greeting${if (first.isNotEmpty()) ", $first" else ""}", style = MaterialTheme.typography.headlineSmall)
                }
                IconButton(onClick = { nav.navigate("settings") }) { Icon(Icons.Outlined.Settings, "Settings") }
            }
            if (ws?.isDemo == true) Pill("Demo workspace · sample data", MeetosColors.Accent, MeetosColors.WarningSoft)
        }
        if (!data.loaded) {
            item { CircularProgressIndicator(Modifier.padding(24.dp)) }
            return@LazyColumn
        }
        item {
            SectionCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Meetings", data.meetings.count { !it.archived }.toString())
                    Stat("Open", active.size.toString())
                    Stat("Overdue", overdue.size.toString(), danger = overdue.isNotEmpty())
                    Stat("Decisions", data.decisions.count { it.status != DecisionStatus.SUPERSEDED }.toString())
                }
            }
        }
        item {
            Button(onClick = { nav.navigate("meetings/new") }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Add, null); Text("  New meeting")
            }
        }
        item {
            SectionCard(title = "MEETOS Daily Brief") {
                Muted("Built from your workspace data.")
                if (overdue.isEmpty() && pending.isEmpty() && toConfirm.isEmpty() && recentDecisions.isEmpty() && openQuestions.isEmpty()) {
                    Muted(if (data.meetings.isEmpty()) "Add your first meeting to get started." else "Nothing needs attention right now.")
                }
                if (overdue.isNotEmpty()) BriefHeader("Needs attention", MeetosColors.Danger)
                overdue.take(5).forEach { c ->
                    BriefLine(c.description, "${c.ownerName ?: "Unassigned"} · ${Fmt.due(c.deadline)}") { nav.navigate("commitment/${c.id}") }
                }
                pending.take(3).forEach { c -> BriefLine(c.description, "Reported done — confirm?") { nav.navigate("commitment/${c.id}") } }
                if (recentDecisions.isNotEmpty()) BriefHeader("Agreed recently", MaterialTheme.colorScheme.primary)
                recentDecisions.take(3).forEach { d -> BriefLine(d.title, Fmt.date(d.decidedAt)) { nav.navigate("decisions") } }
                if (toConfirm.isNotEmpty()) BriefHeader("Decisions to confirm", MeetosColors.Warning)
                toConfirm.take(3).forEach { d -> BriefLine(d.title, d.meetingTitle) { nav.navigate("decisions") } }
                if (openQuestions.isNotEmpty()) BriefHeader("For the next meeting", MeetosColors.Cloud)
                openQuestions.take(3).forEach { q -> BriefLine(q.text, q.meetingTitle) { nav.navigate("meeting/${q.meetingId}") } }
            }
        }
        item {
            SectionCard(title = "Recent meetings") {
                val recent = data.meetings.filter { !it.archived }.take(5)
                if (recent.isEmpty()) Muted("No meetings yet.")
                recent.forEach { m -> BriefLine(m.title, m.summary.ifBlank { Fmt.date(m.date) }) { nav.navigate("meeting/${m.id}") } }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, danger: Boolean = false) {
    Column {
        Muted(label)
        Text(value, style = MaterialTheme.typography.headlineSmall, color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun BriefHeader(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = color, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun BriefLine(title: String, sub: String, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 4.dp)) {
        Text(title, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Muted(sub)
    }
}
