package com.meetos.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.FormatQuote
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.meetos.android.model.CommitmentStatus
import com.meetos.android.model.Evidence
import com.meetos.android.model.InferenceSourceLabel
import com.meetos.android.ui.theme.MeetosColors
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

@Composable
fun SectionCard(title: String? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (title != null) Text(title, style = MaterialTheme.typography.titleSmall)
            content()
        }
    }
}

@Composable
fun Pill(text: String, fg: Color, bg: Color, icon: ImageVector? = null) {
    Row(
        Modifier.background(bg, RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { Icon(icon, null, tint = fg, modifier = Modifier.size(12.dp)); Spacer(Modifier.width(3.dp)) }
        Text(text, color = fg, style = MaterialTheme.typography.labelSmall)
    }
}

/** Shows where an AI result was produced — only from the SDK-reported source. */
@Composable
fun InferencePill(source: InferenceSourceLabel?) {
    when (source) {
        InferenceSourceLabel.ON_DEVICE -> Pill("On this device", MeetosColors.Device, MeetosColors.DeviceSoft, Icons.Outlined.Memory)
        InferenceSourceLabel.IN_CLOUD -> Pill("In the cloud", MeetosColors.Cloud, MeetosColors.CloudSoft, Icons.Outlined.Cloud)
        InferenceSourceLabel.CLOUD_FALLBACK -> Pill("Cloud fallback", MeetosColors.Warning, MeetosColors.WarningSoft, Icons.Outlined.CloudSync)
        null -> {}
    }
}

@Composable
fun StatusPill(status: CommitmentStatus) {
    val (fg, bg) = when (status) {
        CommitmentStatus.COMPLETED -> MeetosColors.Success to Color(0xFFE3F3EA)
        CommitmentStatus.BLOCKED -> MeetosColors.Warning to MeetosColors.WarningSoft
        CommitmentStatus.IN_PROGRESS -> MeetosColors.Cloud to MeetosColors.CloudSoft
        else -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
    }
    Pill(status.label, fg, bg)
}

@Composable
fun EvidenceQuote(e: Evidence, showMeeting: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(10.dp),
    ) {
        Icon(Icons.Outlined.FormatQuote, null, tint = MeetosColors.Accent, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Column {
            Text(
                (e.speaker?.let { "$it: " } ?: "") + e.quote,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (showMeeting && e.meetingTitle != null) {
                Text("from ${e.meetingTitle}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier) =
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)

@Composable
fun Strong(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)

object Fmt {
    private val day = SimpleDateFormat("MMM d", Locale.getDefault())
    private val full = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
    fun date(ms: Long?) = ms?.let { day.format(Date(it)) } ?: "—"
    fun fullDate(ms: Long?) = ms?.let { full.format(Date(it)) } ?: "—"
    fun due(ms: Long?, now: Long = System.currentTimeMillis()): String {
        if (ms == null) return "No deadline"
        val startToday = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0) }.timeInMillis
        val days = Math.floorDiv(ms - startToday, TimeUnit.DAYS.toMillis(1))
        return when {
            ms < now && days < 0 -> "${-days} day${if (days == -1L) "" else "s"} overdue"
            days == 0L -> "Due today"
            days == 1L -> "Due tomorrow"
            else -> "Due ${date(ms)}"
        }
    }
}
